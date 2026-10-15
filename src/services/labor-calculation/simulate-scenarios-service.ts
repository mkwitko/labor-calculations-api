import { prisma } from 'prisma/prisma'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import type { TenantActor } from '@/services/tenant/actor'
import { calculationVisibility } from '@/services/tenant/visibility'
import { loadSnapshotTable, resolveIndexTable } from './index-snapshot'
import { calculateLaborV3 } from './labor-calculation-v3'
import {
  buildV3InputFromStored,
  type StoredInputOverrides,
} from './stored-input'

export type ScenarioResult = {
  label: string
  totalValue: number
  brutoDevidoReclamante: number
  liquidoDevidoReclamante: number
  totalDevidoReclamado: number
}

// Reconstructs the v3 input from a stored calculation and recomputes, applying
// optional overrides — WITHOUT persisting. Used for scenario comparison.
async function simulateOne(
  calcId: string,
  actor: TenantActor,
  overrides: StoredInputOverrides,
): Promise<Omit<ScenarioResult, 'label'>> {
  const c = await prisma.laborCalculation.findFirst({
    where: { id: calcId, ...calculationVisibility(actor), deletedAt: null },
    include: {
      salaryHistory: true,
      unpaidSalaries: true,
      salaryDifferencePeriods: true,
      customVerbas: true,
    },
  })
  if (!c) throw new ResourceNotFoundException('Cálculo não encontrado')

  const input = buildV3InputFromStored(c, overrides)

  // Mesma tabela congelada do cálculo. Com os índices vigentes, o cenário
  // "atual" divergiria do total já salvo e a comparação perderia sentido.
  const table = c.indexSnapshotId
    ? await loadSnapshotTable(c.indexSnapshotId)
    : (await resolveIndexTable()).table
  const r = calculateLaborV3(input, table)
  return {
    totalValue: r.totalValue,
    brutoDevidoReclamante: r.brutoDevidoReclamante,
    liquidoDevidoReclamante: r.liquidoDevidoReclamante,
    totalDevidoReclamado: r.totalDevidoReclamado,
  }
}

// Compares the current calculation against variants (without prescription /
// without art. 467), all recomputed live from the stored inputs.
export async function simulateScenarios(
  calcId: string,
  actor: TenantActor,
): Promise<ScenarioResult[]> {
  const [current, noPrescricao, noArt467] = await Promise.all([
    simulateOne(calcId, actor, {}),
    simulateOne(calcId, actor, { applyPrescricaoQuinquenal: false }),
    simulateOne(calcId, actor, { applyArt467: false }),
  ])
  return [
    { label: 'Cenário atual', ...current },
    { label: 'Sem prescrição quinquenal', ...noPrescricao },
    { label: 'Sem multa Art. 467', ...noArt467 },
  ]
}
