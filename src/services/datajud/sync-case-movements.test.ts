import { systemPrisma } from 'prisma/prisma'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { DataJudMovement } from '@/services/datajud/datajud-service'
import { runCaseMovementSync } from '@/services/datajud/sync-case-movements'
import { cleanDatabase, createTestUser } from '@/tests/helpers/db'

afterAll(async () => {
  await systemPrisma.$disconnect()
})

beforeEach(async () => {
  await cleanDatabase()
})

const TRT2 = '2000456-41.2023.5.02.0999'
const CIVEL = '1000123-35.2024.8.26.0100'

function movement(
  externalId: string,
  description = 'Juntada de petição',
): DataJudMovement {
  return {
    externalId,
    date: new Date('2026-08-10T12:00:00Z'),
    code: '11383',
    description,
  }
}

/** Caso ativo numa organização em teste gratuito (o default de `createTestUser`). */
async function caseWith(processNumber: string | null) {
  const { user, organization } = await createTestUser()

  const created = await systemPrisma.case.create({
    data: {
      title: 'Reclamação trabalhista',
      assignedToId: user.id,
      organizationId: organization.id,
      processNumber,
    },
    select: { id: true },
  })

  return { caseId: created.id, organization, user }
}

const noDelay = { delayMs: 0 }

describe('runCaseMovementSync', () => {
  it('importa os andamentos novos e marca o caso como sincronizado', async () => {
    const { caseId } = await caseWith(TRT2)

    const result = await runCaseMovementSync({
      ...noDelay,
      fetchMovements: async () => [movement('a'), movement('b')],
    })

    expect(result).toMatchObject({ checked: 1, imported: 2, failed: 0 })

    const stored = await systemPrisma.caseMovement.findMany({
      where: { caseId },
      select: { source: true, externalId: true },
    })

    expect(stored).toHaveLength(2)
    expect(stored.every((row) => row.source === 'datajud')).toBe(true)

    const updated = await systemPrisma.case.findUniqueOrThrow({
      where: { id: caseId },
      select: { lastMovementSyncAt: true },
    })

    expect(updated.lastMovementSyncAt).not.toBeNull()
  })

  it('não duplica o que já está gravado', async () => {
    const { caseId } = await caseWith(TRT2)

    await runCaseMovementSync({
      ...noDelay,
      fetchMovements: async () => [movement('a')],
    })

    const second = await runCaseMovementSync({
      ...noDelay,
      fetchMovements: async () => [movement('a'), movement('b')],
    })

    // Só o que é novo conta — é isso que decide se o advogado recebe e-mail.
    expect(second.imported).toBe(1)
    expect(await systemPrisma.caseMovement.count({ where: { caseId } })).toBe(2)
  })

  it('ignora caso sem número, fechado ou de outra Justiça', async () => {
    await caseWith(null)
    await caseWith(CIVEL)

    const { caseId } = await caseWith(TRT2)
    await systemPrisma.case.update({
      where: { id: caseId },
      data: { closedAt: new Date() },
    })

    const result = await runCaseMovementSync({
      ...noDelay,
      fetchMovements: async () => [movement('a')],
    })

    expect(result.checked).toBe(0)
    expect(result.imported).toBe(0)
  })

  it('ignora organização cujo teste acabou sem assinatura', async () => {
    const { organization } = await caseWith(TRT2)

    await systemPrisma.organization.update({
      where: { id: organization.id },
      data: { trialEndsAt: new Date(Date.now() - 86_400_000) },
    })

    const result = await runCaseMovementSync({
      ...noDelay,
      fetchMovements: async () => [movement('a')],
    })

    // Consulta ao CNJ é custo: quem parou de pagar não consome a fila.
    expect(result.checked).toBe(0)
  })

  it('atende primeiro quem nunca foi sincronizado e respeita o teto da rodada', async () => {
    const antigo = await caseWith(TRT2)
    await systemPrisma.case.update({
      where: { id: antigo.caseId },
      data: { lastMovementSyncAt: new Date('2020-01-01') },
    })

    const novo = await caseWith(TRT2)

    const visited: string[] = []

    await runCaseMovementSync({
      ...noDelay,
      limit: 1,
      fetchMovements: async (processNumber) => {
        visited.push(processNumber)
        return []
      },
    })

    expect(visited).toHaveLength(1)

    const novoRow = await systemPrisma.case.findUniqueOrThrow({
      where: { id: novo.caseId },
      select: { lastMovementSyncAt: true },
    })

    // O caso nunca sincronizado entra na frente do que já foi visto em 2020.
    expect(novoRow.lastMovementSyncAt).not.toBeNull()
  })

  it('falha de um caso não interrompe a fila e o caso sai do topo', async () => {
    const quebrado = await caseWith(TRT2)
    const bom = await caseWith(TRT2)

    let calls = 0

    const result = await runCaseMovementSync({
      ...noDelay,
      fetchMovements: async () => {
        calls += 1
        if (calls === 1) throw new Error('DataJud respondeu 503')
        return [movement('a')]
      },
    })

    expect(result.checked).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.imported).toBe(1)

    const rows = await systemPrisma.case.findMany({
      where: { id: { in: [quebrado.caseId, bom.caseId] } },
      select: { lastMovementSyncAt: true },
    })

    // Mesmo quem falhou é marcado: senão volta ao topo da fila em toda rodada e
    // segura a vaga de todos os outros.
    expect(rows.every((row) => row.lastMovementSyncAt !== null)).toBe(true)
  })
})
