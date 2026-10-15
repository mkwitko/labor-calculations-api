import { prisma } from 'prisma/prisma'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { recordAudit } from '@/services/audit/audit-log'
import type { TenantActor } from '@/services/tenant/actor'
import { calculationVisibility } from '@/services/tenant/visibility'
import { resolveIndexTable } from './index-snapshot'
import { calculateLaborV3, V3_ENGINE_VERSION } from './labor-calculation-v3'
import {
  buildComputedFields,
  buildFgtsRows,
  buildVerbaLineRows,
} from './labor-calculation-v3-service'
import { buildV3InputFromStored } from './stored-input'

/**
 * Reindexação: o único caminho pelo qual um cálculo fechado muda de valor sem
 * que um input mude.
 *
 * O create congela a tabela de índices e o update reusa o congelado, então
 * IPCA-E/SELIC/TR atualizados não alcançam cálculos antigos — de propósito.
 * Quando o usuário quiser adotar os índices novos (tipicamente antes de
 * protocolar, ou depois de uma atualização do BCB), ele pede aqui, vê o
 * impacto antes e confirma. Sem `confirm`, nada é gravado.
 */

export type VerbaDelta = {
  name: string
  from: number
  to: number
  delta: number
}

export type ReindexResult = {
  applied: boolean
  engineVersion: { from: string | null; to: string }
  indexSnapshot: {
    fromId: string | null
    toId: string
    fromHash: string | null
    toHash: string
    unchanged: boolean
  }
  totals: {
    totalValue: { from: number; to: number; delta: number }
    brutoDevidoReclamante: { from: number; to: number; delta: number }
    liquidoDevidoReclamante: { from: number; to: number; delta: number }
    totalDevidoReclamado: { from: number; to: number; delta: number }
  }
  verbas: VerbaDelta[]
}

const INCLUDE = {
  salaryHistory: true,
  unpaidSalaries: true,
  salaryDifferencePeriods: true,
  customVerbas: true,
  verbaLines: true,
  indexSnapshot: { select: { hash: true } },
} as const

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function delta(from: number, to: number) {
  return { from, to, delta: round(to - from) }
}

export async function reindexLaborCalculation(
  actor: TenantActor,
  id: string,
  confirm: boolean,
): Promise<ReindexResult> {
  const existing = await prisma.laborCalculation.findFirst({
    where: { id, ...calculationVisibility(actor), deletedAt: null },
    include: INCLUDE,
  })
  if (!existing) throw new ResourceNotFoundException('Cálculo não encontrado')

  const input = buildV3InputFromStored(existing)
  const { table, snapshotId, hash } = await resolveIndexTable()
  const recomputed = calculateLaborV3(input, table)

  const verbaLineRows = buildVerbaLineRows(recomputed)
  const previousByName = new Map(
    existing.verbaLines.map((l) => [l.name, Number(l.total)]),
  )
  const verbas: VerbaDelta[] = verbaLineRows.map((line) => {
    const from = previousByName.get(line.name) ?? 0
    return {
      name: line.name,
      from,
      to: line.total,
      delta: round(line.total - from),
    }
  })

  const result: ReindexResult = {
    applied: confirm,
    engineVersion: { from: existing.engineVersion, to: V3_ENGINE_VERSION },
    indexSnapshot: {
      fromId: existing.indexSnapshotId,
      toId: snapshotId,
      fromHash: existing.indexSnapshot?.hash ?? null,
      toHash: hash,
      unchanged: existing.indexSnapshotId === snapshotId,
    },
    totals: {
      totalValue: delta(Number(existing.totalValue), recomputed.totalValue),
      brutoDevidoReclamante: delta(
        Number(existing.brutoDevidoReclamante),
        recomputed.brutoDevidoReclamante,
      ),
      liquidoDevidoReclamante: delta(
        Number(existing.liquidoDevidoReclamante),
        recomputed.liquidoDevidoReclamante,
      ),
      totalDevidoReclamado: delta(
        Number(existing.totalDevidoReclamado),
        recomputed.totalDevidoReclamado,
      ),
    },
    verbas,
  }

  if (!confirm) return result

  await prisma.laborCalculation.update({
    where: { id },
    data: {
      ...buildComputedFields(
        recomputed,
        {
          satRate: Number(existing.satRate),
          employerInssRate: Number(existing.employerInssRate),
          honorariosRate: Number(existing.honorariosRate),
        },
        {
          nightAdditionalPercent: existing.nightAdditionalPercent,
          irpfDependents: existing.irpfDependents,
          filingDate: existing.filingDate,
          liquidationDate: existing.liquidationDate,
        },
      ),
      indexSnapshotId: snapshotId,
      engineVersion: V3_ENGINE_VERSION,
      indexesUpdatedAt: new Date(),
      fgtsEntries: { deleteMany: {}, create: buildFgtsRows(recomputed) },
      verbaLines: { deleteMany: {}, create: verbaLineRows },
    },
  })

  // Reindexar é o único jeito de um cálculo fechado mudar de valor sem input
  // novo. Registra os dois totais e os dois hashes: é a pergunta que aparece
  // quando alguém compara o laudo de ontem com o de hoje.
  await recordAudit({
    entityType: 'LaborCalculation',
    entityId: id,
    action: 'reindex',
    userId: actor.userId,
    changes: {
      totalValue: {
        from: result.totals.totalValue.from,
        to: result.totals.totalValue.to,
      },
      indexSnapshotHash: {
        from: result.indexSnapshot.fromHash,
        to: result.indexSnapshot.toHash,
      },
      engineVersion: {
        from: result.engineVersion.from,
        to: result.engineVersion.to,
      },
    },
  })

  return result
}
