import type { Prisma } from '@prisma/client'
import { prisma, systemPrisma } from 'prisma/prisma'
import { BadRequestException } from '@/http/exceptions/bad-request-exception'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { UnprocessableEntityException } from '@/http/exceptions/unprocessable-entity-exception'
import { requireOrganizationId } from '@/lib/tenant-context'
import {
  loadSnapshotTable,
  resolveIndexTable,
} from '@/services/labor-calculation/index-snapshot'
import { calculateLaborV3 } from '@/services/labor-calculation/labor-calculation-v3'
import {
  answersToInput,
  type PublicAnswers,
} from '@/services/public-calculation/answers-to-input'
import {
  buildEmployerBreakdown,
  buildEmployerResult,
} from '@/services/public-calculation/employer-result'

/** Linha do arquivo, já normalizada pelo browser. */
export type BatchRowInput = PublicAnswers & { reference: string }

/**
 * Teto por requisição. Cada linha roda o motor inteiro; sem limite, um arquivo
 * de folha grande seguraria a conexão calculando por minutos. Arquivo maior
 * entra em partes, contra o mesmo lote.
 */
export const MAX_ROWS_PER_REQUEST = 300

/**
 * Teto por lote. Acima disso a resposta honesta é processamento em segundo
 * plano, que é outro projeto.
 */
export const MAX_ROWS_PER_BATCH = 5_000

const ENGINE_VERSION = 'v3'

type ComputedRow = {
  order: number
  reference: string
  input: Prisma.InputJsonValue
  severanceCost: number | null
  exposure: number | null
  gap: number | null
  error: string | null
}

/**
 * Calcula uma linha. Linha ruim vira registro com `error` em vez de derrubar o
 * arquivo: uma folha de duzentas pessoas com três linhas problemáticas precisa
 * produzir o relatório das cento e noventa e sete.
 */
function computeRow(
  row: BatchRowInput,
  order: number,
  table: Awaited<ReturnType<typeof resolveIndexTable>>['table'],
): ComputedRow {
  const base = {
    order,
    reference: row.reference,
    input: row as unknown as Prisma.InputJsonValue,
  }

  try {
    const input = answersToInput(row)

    if (Number.isNaN(input.startDate.getTime())) {
      throw new Error('Data de admissão inválida')
    }
    if (Number.isNaN(input.endDate.getTime())) {
      throw new Error('Data de desligamento inválida')
    }
    if (input.endDate < input.startDate) {
      throw new Error('Desligamento anterior à admissão')
    }
    if (!(input.lastSalary > 0)) {
      throw new Error('Remuneração precisa ser maior que zero')
    }

    const employer = buildEmployerResult(calculateLaborV3(input, table))

    return {
      ...base,
      severanceCost: employer.severanceCost,
      exposure: employer.exposure,
      gap: employer.gap,
      error: null,
    }
  } catch (error) {
    return {
      ...base,
      severanceCost: null,
      exposure: null,
      gap: null,
      error: error instanceof Error ? error.message : 'Linha inválida',
    }
  }
}

/**
 * Recalcula os totais a partir das linhas gravadas. Somar no banco em vez de
 * acumular em memória é o que mantém o total certo quando o arquivo chega em
 * partes — e quando uma parte é reenviada.
 */
async function refreshTotals(batchId: string) {
  const [aggregate, failedCount, rowCount] = await Promise.all([
    systemPrisma.batchAssessmentRow.aggregate({
      where: { batchId, error: null },
      _sum: { severanceCost: true, exposure: true, gap: true },
    }),
    systemPrisma.batchAssessmentRow.count({
      where: { batchId, error: { not: null } },
    }),
    systemPrisma.batchAssessmentRow.count({ where: { batchId } }),
  ])

  return prisma.batchAssessment.update({
    where: { id: batchId },
    data: {
      rowCount,
      failedCount,
      severanceCost: aggregate._sum.severanceCost ?? 0,
      exposure: aggregate._sum.exposure ?? 0,
      gap: aggregate._sum.gap ?? 0,
    },
  })
}

export async function createBatchAssessment(params: {
  userId: string
  name: string
  clientId?: string
  rows: BatchRowInput[]
}) {
  if (params.rows.length === 0) {
    throw new BadRequestException('Envie ao menos uma linha')
  }
  if (params.rows.length > MAX_ROWS_PER_REQUEST) {
    throw new BadRequestException(
      `Envie no máximo ${MAX_ROWS_PER_REQUEST} linhas por vez`,
    )
  }

  const { table, snapshotId } = await resolveIndexTable()

  const batch = await prisma.batchAssessment.create({
    data: {
      name: params.name,
      userId: params.userId,
      organizationId: requireOrganizationId(),
      clientId: params.clientId ?? null,
      indexSnapshotId: snapshotId,
      engineVersion: ENGINE_VERSION,
    },
  })

  const computed = params.rows.map((row, index) =>
    computeRow(row, index, table),
  )

  await systemPrisma.batchAssessmentRow.createMany({
    data: computed.map((row) => ({ ...row, batchId: batch.id })),
  })

  return refreshTotals(batch.id)
}

export async function appendBatchRows(params: {
  batchId: string
  rows: BatchRowInput[]
}) {
  if (params.rows.length > MAX_ROWS_PER_REQUEST) {
    throw new BadRequestException(
      `Envie no máximo ${MAX_ROWS_PER_REQUEST} linhas por vez`,
    )
  }

  // Pelo client com escopo: lote de outra organização simplesmente não existe
  // daqui, e o 404 sai naturalmente.
  const batch = await prisma.batchAssessment.findFirst({
    where: { id: params.batchId, deletedAt: null },
  })

  if (!batch) {
    throw new ResourceNotFoundException('Avaliação não encontrada')
  }

  const existing = await systemPrisma.batchAssessmentRow.count({
    where: { batchId: batch.id },
  })

  if (existing + params.rows.length > MAX_ROWS_PER_BATCH) {
    throw new BadRequestException(
      `Uma avaliação comporta no máximo ${MAX_ROWS_PER_BATCH} linhas`,
    )
  }

  // O snapshot é do lote: as partes seguintes têm que usar a mesma tabela da
  // primeira, senão as linhas deixam de ser comparáveis entre si.
  const table = batch.indexSnapshotId
    ? await loadSnapshotTable(batch.indexSnapshotId)
    : (await resolveIndexTable()).table

  const computed = params.rows.map((row, index) =>
    computeRow(row, existing + index, table),
  )

  await systemPrisma.batchAssessmentRow.createMany({
    data: computed.map((row) => ({ ...row, batchId: batch.id })),
  })

  return refreshTotals(batch.id)
}

export async function listBatchAssessments() {
  return prisma.batchAssessment.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { client: { select: { id: true, name: true } } },
  })
}

export async function getBatchAssessment(id: string) {
  const batch = await prisma.batchAssessment.findFirst({
    where: { id, deletedAt: null },
    include: { client: { select: { id: true, name: true } } },
  })

  if (!batch) {
    throw new ResourceNotFoundException('Avaliação não encontrada')
  }

  // Maior exposição primeiro: é a ordem em que o escritório vai agir. Linha com
  // erro fica no fim, com `exposure` nulo.
  const rows = await systemPrisma.batchAssessmentRow.findMany({
    where: { batchId: batch.id },
    orderBy: [{ exposure: { sort: 'desc', nulls: 'last' } }, { order: 'asc' }],
  })

  return { batch, rows }
}

/**
 * Demonstrativo de uma linha, recomputado na hora com a MESMA tabela do lote
 * (snapshot). Nada é gravado: `input` + snapshot tornam o recomputo
 * determinístico, e guardar a memória de até 5.000 linhas seria storage à toa.
 */
export async function getBatchRowBreakdown(params: {
  batchId: string
  rowId: string
}) {
  const batch = await prisma.batchAssessment.findFirst({
    where: { id: params.batchId, deletedAt: null },
  })
  if (!batch) {
    throw new ResourceNotFoundException('Avaliação não encontrada')
  }

  const row = await systemPrisma.batchAssessmentRow.findFirst({
    where: { id: params.rowId, batchId: batch.id },
  })
  if (!row) {
    throw new ResourceNotFoundException('Linha não encontrada')
  }
  if (row.error) {
    throw new UnprocessableEntityException(row.error)
  }

  const table = batch.indexSnapshotId
    ? await loadSnapshotTable(batch.indexSnapshotId)
    : (await resolveIndexTable()).table

  const input = answersToInput(row.input as unknown as BatchRowInput)
  const breakdown = buildEmployerBreakdown(calculateLaborV3(input, table))

  return {
    reference: row.reference,
    severanceCost: breakdown.severanceCost,
    exposure: breakdown.exposure,
    gap: breakdown.gap,
    employerCharges: breakdown.employerCharges,
    litigationExtras: breakdown.litigationExtras,
    verbas: breakdown.verbas,
  }
}

export async function deleteBatchAssessment(id: string) {
  const batch = await prisma.batchAssessment.findFirst({
    where: { id, deletedAt: null },
  })

  if (!batch) {
    throw new ResourceNotFoundException('Avaliação não encontrada')
  }

  await prisma.batchAssessment.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
}
