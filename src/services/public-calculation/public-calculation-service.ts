import { randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { systemPrisma } from 'prisma/prisma'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { resolveIndexTable } from '@/services/labor-calculation/index-snapshot'
import { calculateLaborV3 } from '@/services/labor-calculation/labor-calculation-v3'
import { hashInviteToken } from '@/services/tenant/invite-token'
import { MS_PER_DAY } from '@/utils/constants'
import { answersToInput, type PublicAnswers } from './answers-to-input'
import { buildEmployerResult, type EmployerResult } from './employer-result'
import { buildPublicResult, type PublicResult } from './public-result'

/** Quem está perguntando: o motor é o mesmo, muda a leitura do resultado. */
export type Perspective = 'trabalhador' | 'empresa'

/** Qual calculadora gerou o registro. Espelha o default do schema. */
export type PublicCalculationKind = 'rescisao' | 'horas_extras' | 'ferias_13'

/**
 * O resultado guardado. O bloco `employer` só existe na perspectiva de empresa
 * — a tela do trabalhador nunca o lê, e `result` é Json, então ele entra sem
 * migração.
 */
export type StoredResult = PublicResult & { employer?: EmployerResult }

/**
 * Noventa dias: prazo confortável para quem calculou hoje voltar com um
 * advogado, e curto o bastante para não guardar contato de estranho por anos.
 */
const TTL_MS = 90 * MS_PER_DAY

const ENGINE_VERSION = 'v3'

export async function createPublicCalculation(params: {
  answers: PublicAnswers
  source: string
  referrerHost?: string
  perspective?: Perspective
  /**
   * Organização dona do widget que hospedou o wizard, já validada pela chave.
   * Ausente no cálculo feito no nosso próprio site.
   */
  widgetOrganizationId?: string
}): Promise<{ token: string; result: StoredResult }> {
  const perspective = params.perspective ?? 'trabalhador'
  const input = answersToInput(params.answers)
  const { table, snapshotId } = await resolveIndexTable()
  const result = calculateLaborV3(input, table)
  const publicResult: StoredResult =
    perspective === 'empresa'
      ? { ...buildPublicResult(result), employer: buildEmployerResult(result) }
      : buildPublicResult(result)

  const token = randomBytes(32).toString('base64url')

  await systemPrisma.publicCalculation.create({
    data: {
      tokenHash: hashInviteToken(token),
      input: input as unknown as Prisma.InputJsonValue,
      result: publicResult as unknown as Prisma.InputJsonValue,
      engineVersion: ENGINE_VERSION,
      indexSnapshotId: snapshotId,
      source: params.source,
      perspective,
      referrerHost: params.referrerHost ?? null,
      widgetOrganizationId: params.widgetOrganizationId ?? null,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  })

  return { token, result: publicResult }
}

/**
 * Um cálculo expirado é indistinguível de um inexistente para quem tem o link:
 * responder 404 nos dois casos não conta nada a quem sorteou token.
 */
async function findByToken(token: string) {
  const row = await systemPrisma.publicCalculation.findUnique({
    where: { tokenHash: hashInviteToken(token) },
  })

  if (!row || row.expiresAt <= new Date()) {
    throw new ResourceNotFoundException('Cálculo não encontrado ou expirado')
  }

  return row
}

export async function getPublicCalculationByToken(token: string): Promise<{
  result: StoredResult
  kind: PublicCalculationKind
  perspective: Perspective
  createdAt: Date
  hasContact: boolean
  claimed: boolean
}> {
  const row = await findByToken(token)

  return {
    result: row.result as unknown as StoredResult,
    // Qual calculadora gerou o resultado. A tela pública escolhe por aqui entre
    // a leitura de rescisão e a de verba isolada.
    kind: row.kind as PublicCalculationKind,
    perspective: row.perspective as Perspective,
    createdAt: row.createdAt,
    // O contato nunca sai daqui — a tela só precisa saber se já foi dado, para
    // não pedir de novo.
    hasContact: Boolean(row.email || row.phone),
    // Só o fato, nunca qual organização importou: quem tem o link não precisa
    // saber com qual escritório o dono do cálculo foi falar.
    claimed: Boolean(row.claimedByOrganizationId),
  }
}

export async function savePublicContact(
  token: string,
  contact: { name?: string; email?: string; phone?: string },
): Promise<void> {
  const row = await findByToken(token)

  await systemPrisma.publicCalculation.update({
    where: { id: row.id },
    data: {
      // Contato em texto puro, como o PII de `Client`. O controle de LGPD aqui
      // é o expurgo automático em 90 dias, não a cifra: `encrypt()` deste repo
      // devolve null quando `ADMIN_ENCRYPTION_KEY` falta, e perder o contato em
      // silêncio é pior do que guardá-lo em claro. A Fase 2 precisa deste
      // e-mail legível para casar o consumidor com o advogado.
      name: contact.name ?? row.name,
      email: contact.email ?? row.email,
      phone: contact.phone ?? row.phone,
    },
  })
}
