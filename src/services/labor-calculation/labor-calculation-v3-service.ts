import { prisma } from 'prisma/prisma'
import type { LaborCalculationInput } from '@/@types/labor-calculation'
import type {
  CustomVerbaInput,
  LaborCalculationInputV3,
  LaborCalculationResultV3,
  SalaryDifferenceInput,
} from '@/@types/labor-calculation-v3'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { requireOrganizationId } from '@/lib/tenant-context'
import { diffFields, recordAudit } from '@/services/audit/audit-log'
import type { TenantActor } from '@/services/tenant/actor'
import { calculationVisibility } from '@/services/tenant/visibility'
import { loadSnapshotTable, resolveIndexTable } from './index-snapshot'
import { calculateLaborV3, V3_ENGINE_VERSION } from './labor-calculation-v3'

type V3CreateInput = LaborCalculationInput & {
  clientId?: string
  salaryHistory?: { month: string; baseSalary: number; lastSalary: number }[]
  unpaidSalaries?: { month: string; daysWorked: number }[]
  filingDate?: Date
  liquidationDate?: Date
  nightAdditionalPercent?: number
  satRate?: number
  employerInssRate?: number
  honorariosRate?: number
  irpfDependents?: number
  applyArt467?: boolean
  applyPrescricaoQuinquenal?: boolean
  salaryDifference?: SalaryDifferenceInput
  customVerbas?: CustomVerbaInput[]
  intervalIntrajornadaHours?: number
  transferAdditionalMonths?: number
  applyDsrOnExtra?: boolean
  stabilityMonths?: number
  fgtsAlreadyDeposited?: number
  amountsAlreadyPaid?: number
}

export type ResolvedRates = {
  satRate: number
  employerInssRate: number
  honorariosRate: number
}

export type ComputedOpts = {
  nightAdditionalPercent: number
  irpfDependents: number
  filingDate?: Date | null
  liquidationDate?: Date | null
}

function pctToDecimal(value: number | undefined): number | undefined {
  if (value === undefined) return undefined
  return value / 100
}

export function buildFgtsRows(v3Result: LaborCalculationResultV3) {
  return v3Result.fgtsDetail.monthlyEntries.map((e) => ({
    month: new Date(`${e.month}-01`),
    base: e.base,
    aliquot: e.aliquot,
    deposit: e.deposit,
    corrected: e.corrected,
    correctionAmount: e.correctionAmount,
    interest: e.interest,
    total: e.total,
  }))
}

/**
 * Memória de cálculo persistida. O motor já emite a decomposição por verba;
 * gravá-la é o que permite reemitir o demonstrativo sem recalcular — e
 * recalcular é exatamente o que se quer evitar num cálculo fechado.
 */
export function buildVerbaLineRows(v3Result: LaborCalculationResultV3) {
  return v3Result.verbasDetalhadas.map((v, index) => ({
    order: index,
    name: v.name,
    legalRef: v.legalRef ?? null,
    bruto: v.bruto,
    corrigido: v.corrigido,
    juros: v.juros,
    total: v.total,
  }))
}

function buildSalaryDifferenceRows(v3Result: LaborCalculationResultV3) {
  return (v3Result.salaryDifferenceDetail?.monthlyEntries ?? []).map((e) => ({
    month: new Date(`${e.month}-01`),
    due: e.due,
    received: e.received,
    diff: e.diff,
    corrected: e.corrected,
    correctionAmount: e.correctionAmount,
    interest: e.interest,
    total: e.total,
  }))
}

function buildSalaryDifferencePeriodRows(
  salaryDifference: SalaryDifferenceInput | undefined,
) {
  return (salaryDifference?.periods ?? []).map((p) => ({
    startMonth: new Date(`${p.startMonth}-01`),
    endMonth: new Date(`${p.endMonth}-01`),
    dueSalary: p.dueSalary,
    receivedSalary: p.receivedSalary ?? null,
  }))
}

function buildCustomVerbaRows(
  customVerbas: CustomVerbaInput[] | undefined,
  v3Result: LaborCalculationResultV3,
) {
  return (customVerbas ?? []).map((verba, i) => {
    const detail = v3Result.customVerbasDetail[i]
    return {
      name: verba.name,
      monthlyValue: verba.monthlyValue,
      startMonth: new Date(`${verba.startMonth}-01`),
      endMonth: new Date(`${verba.endMonth}-01`),
      nature: verba.nature,
      brutoValue: detail?.bruto ?? 0,
      correctedValue: detail?.corrigido ?? 0,
      interestValue: detail?.juros ?? 0,
      totalValue: detail?.total ?? 0,
    }
  })
}

function monthKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function computeCorrectionTotal(v3Result: LaborCalculationResultV3): number {
  const { salaryMonths, ...correctionRest } = v3Result.correction
  let total = 0
  for (const cv of Object.values(
    correctionRest as Record<string, { correctionAmount: number }>,
  )) {
    total += cv.correctionAmount
  }
  for (const cv of Object.values(salaryMonths)) {
    total += cv.correctionAmount
  }
  return Math.round(total * 100) / 100
}

export function buildComputedFields(
  v3Result: LaborCalculationResultV3,
  rates: ResolvedRates,
  opts: ComputedOpts,
) {
  return {
    priorNoticeValue: v3Result.priorNoticeValue,
    thirteenthSalaryValue: v3Result.thirteenthSalaryValue,
    vacationValue: v3Result.vacationValue,
    fgtsValue: v3Result.fgtsValue,
    fgtsFineValue: v3Result.fgtsFineValue,
    unemploymentInsuranceValue: v3Result.unemploymentInsuranceValue,
    extraHoursValue: v3Result.extraHoursValue,
    nightAdditionalValue: v3Result.nightAdditionalValue,
    insalubrityValue: v3Result.insalubrityValue,
    dangerousWorkValue: v3Result.dangerousWorkValue,
    art477FineValue: v3Result.art477FineValue,
    totalValue: v3Result.totalValue,
    reflexo13thValue: v3Result.reflexo13thValue,
    reflexoVacationValue: v3Result.reflexoVacationValue,
    reflexoFGTSValue: v3Result.reflexoFGTSValue,
    reflexoMultaFGTSValue: v3Result.reflexoMultaFGTSValue,
    doubleVacationValue: v3Result.doubleVacationValue,
    nightAdditionalPercent: opts.nightAdditionalPercent,
    satRate: rates.satRate,
    employerInssRate: rates.employerInssRate,
    honorariosRate: rates.honorariosRate,
    irpfDependents: opts.irpfDependents,
    filingDate: opts.filingDate ?? null,
    liquidationDate: opts.liquidationDate ?? null,
    saldoSalarioValue: v3Result.saldoSalarioValue,
    correctionTotal: computeCorrectionTotal(v3Result),
    interestTotal: v3Result.interest.total,
    inssEmployeeValue: v3Result.inssEmployee,
    inssEmployerValue: v3Result.inssEmployer,
    satRatValue: v3Result.satRat,
    irpfValue: v3Result.irpf,
    custasJudiciaisValue: v3Result.custasJudiciais,
    honorariosSucumbenciaValue: v3Result.honorariosSucumbencia,
    honorariosIrpfValue: v3Result.honorariosIrpf,
    honorariosLiquidosValue: v3Result.honorariosLiquidos,
    brutoDevidoReclamante: v3Result.brutoDevidoReclamante,
    totalDescontos: v3Result.totalDescontos,
    liquidoDevidoReclamante: v3Result.liquidoDevidoReclamante,
    totalDevidoReclamado: v3Result.totalDevidoReclamado,
    percentualRemuneratorio: v3Result.percentualRemuneratorio,
    art467Value: v3Result.art467Value,
    salaryDifferenceValue: v3Result.salaryDifferenceValue,
    salaryDifferenceReflexosValue: v3Result.salaryDifferenceReflexosValue,
    outrasVerbasValue: v3Result.outrasVerbasValue,
    customVerbasReflexosValue: v3Result.customVerbasReflexosValue,
    intervalIntrajornadaValue: v3Result.intervalIntrajornadaValue,
    transferAdditionalValue: v3Result.transferAdditionalValue,
    dsrValue: v3Result.dsrValue,
    stabilityValue: v3Result.stabilityValue,
    deductionsValue: v3Result.deductionsValue,
    prescricaoCutoff: v3Result.prescricao
      ? new Date(`${v3Result.prescricao.cutoffMonth}-01`)
      : null,
  }
}

const PRISMA_INCLUDE = {
  fgtsEntries: true,
  verbaLines: { orderBy: { order: 'asc' } },
  salaryHistory: true,
  unpaidSalaries: true,
  salaryDifferencePeriods: true,
  salaryDifferenceEntries: true,
  customVerbas: true,
} as const

export async function createLaborCalculationV3Service(
  userId: string,
  input: V3CreateInput,
  /**
   * Snapshot de índices a reusar em vez de resolver os correntes. Serve à
   * importação de um cálculo público: o advogado precisa ver o mesmo número que
   * o cliente viu, senão a conversa começa com dois valores diferentes.
   */
  options?: { indexSnapshotId?: string },
) {
  const {
    clientId,
    salaryHistory,
    unpaidSalaries,
    filingDate,
    liquidationDate,
    nightAdditionalPercent,
    satRate,
    employerInssRate,
    honorariosRate,
    irpfDependents,
    applyArt467,
    applyPrescricaoQuinquenal,
    salaryDifference,
    customVerbas,
    ...baseInput
  } = input

  const rates: ResolvedRates = {
    satRate: pctToDecimal(satRate) ?? 0.03,
    employerInssRate: pctToDecimal(employerInssRate) ?? 0.2,
    honorariosRate: pctToDecimal(honorariosRate) ?? 0.15,
  }

  const v3Input: LaborCalculationInputV3 = {
    ...baseInput,
    salaryHistory,
    unpaidSalaries,
    filingDate,
    liquidationDate,
    nightAdditionalPercent,
    ...rates,
    irpfDependents,
    applyArt467,
    applyPrescricaoQuinquenal,
    salaryDifference,
    customVerbas,
  }

  // Congela a tabela de índices usada. Sem isso, uma edição futura recalcularia
  // com os índices vigentes naquele dia e o total mudaria sozinho.
  const { table, snapshotId } = options?.indexSnapshotId
    ? {
        table: await loadSnapshotTable(options.indexSnapshotId),
        snapshotId: options.indexSnapshotId,
      }
    : await resolveIndexTable()

  const v3Result = calculateLaborV3(v3Input, table)
  const fgtsRows = buildFgtsRows(v3Result)
  const verbaLineRows = buildVerbaLineRows(v3Result)
  const computed = buildComputedFields(v3Result, rates, {
    nightAdditionalPercent: nightAdditionalPercent ?? 20,
    irpfDependents: irpfDependents ?? 0,
    filingDate,
    liquidationDate,
  })

  const salaryHistoryCreate = salaryHistory?.map((s) => ({
    month: new Date(`${s.month}-01`),
    baseSalary: s.baseSalary,
    lastSalary: s.lastSalary,
  }))

  const unpaidSalariesCreate = unpaidSalaries?.map((u) => ({
    month: new Date(`${u.month}-01`),
    daysWorked: u.daysWorked,
  }))

  const created = await prisma.laborCalculation.create({
    data: {
      userId,
      organizationId: requireOrganizationId(),
      // clientId stored after migration runs + prisma generate
      ...(clientId ? { clientId } : {}),
      clientName: baseInput.clientName,
      clientDocument: baseInput.clientDocument ?? null,
      observations: baseInput.observations ?? null,
      calculationVersion: 'v3',
      indexSnapshotId: snapshotId,
      engineVersion: V3_ENGINE_VERSION,
      terminationType: baseInput.terminationType,
      status: 'em_andamento',
      startDate: baseInput.startDate,
      endDate: baseInput.endDate,
      lastSalary: baseInput.lastSalary,
      baseSalary: baseInput.baseSalary,
      unpaid13ths: baseInput.unpaid13ths,
      vacationCount: baseInput.vacationCount,
      vacationVencidasCount: baseInput.vacationVencidasCount,
      priorNoticeWorked: baseInput.priorNoticeWorked,
      priorNoticeDate: baseInput.priorNoticeDate ?? null,
      extraHours: baseInput.extraHours,
      nightHours: baseInput.nightHours,
      insalubrityLevel: baseInput.insalubrityLevel,
      dangerousWork: baseInput.dangerousWork,
      applyArt477Fine: baseInput.applyArt477Fine,
      lastThreeSalariesAvg: baseInput.lastThreeSalariesAvg,
      applyArt467: applyArt467 ?? false,
      applyPrescricaoQuinquenal: applyPrescricaoQuinquenal ?? false,
      salaryDifferenceType: salaryDifference?.type ?? null,
      paradigmName: salaryDifference?.paradigmName ?? null,
      salaryDifferenceApplyReflexos: salaryDifference?.applyReflexos ?? true,
      intervalIntrajornadaHours: input.intervalIntrajornadaHours ?? 0,
      transferAdditionalMonths: input.transferAdditionalMonths ?? 0,
      applyDsrOnExtra: input.applyDsrOnExtra ?? false,
      stabilityMonths: input.stabilityMonths ?? 0,
      fgtsAlreadyDeposited: input.fgtsAlreadyDeposited ?? 0,
      amountsAlreadyPaid: input.amountsAlreadyPaid ?? 0,
      ...computed,
      fgtsEntries: { create: fgtsRows },
      verbaLines: { create: verbaLineRows },
      salaryHistory: salaryHistoryCreate
        ? { create: salaryHistoryCreate }
        : undefined,
      unpaidSalaries: unpaidSalariesCreate
        ? { create: unpaidSalariesCreate }
        : undefined,
      salaryDifferencePeriods: salaryDifference
        ? { create: buildSalaryDifferencePeriodRows(salaryDifference) }
        : undefined,
      salaryDifferenceEntries: salaryDifference
        ? { create: buildSalaryDifferenceRows(v3Result) }
        : undefined,
      customVerbas: customVerbas
        ? { create: buildCustomVerbaRows(customVerbas, v3Result) }
        : undefined,
    },
    include: PRISMA_INCLUDE,
  })

  await recordAudit({
    entityType: 'LaborCalculation',
    entityId: created.id,
    action: 'create',
    userId,
  })

  return created
}

export async function updateLaborCalculationV3Service(
  actor: TenantActor,
  id: string,
  input: Omit<Partial<V3CreateInput>, 'salaryDifference'> & {
    salaryDifference?: SalaryDifferenceInput | null
  },
) {
  const existing = await prisma.laborCalculation.findFirst({
    where: { id, ...calculationVisibility(actor) },
    include: {
      salaryHistory: true,
      unpaidSalaries: true,
      salaryDifferencePeriods: true,
      customVerbas: true,
    },
  })

  if (!existing) throw new ResourceNotFoundException()

  const {
    salaryHistory,
    unpaidSalaries,
    filingDate,
    liquidationDate,
    nightAdditionalPercent,
    satRate,
    employerInssRate,
    honorariosRate,
    irpfDependents,
    applyArt467,
    applyPrescricaoQuinquenal,
    salaryDifference,
    customVerbas,
    ...baseInput
  } = input

  // undefined = keep stored value; null = clear the salary difference
  const existingSalaryDifference: SalaryDifferenceInput | undefined =
    existing.salaryDifferenceType && existing.salaryDifferencePeriods.length > 0
      ? {
          type: existing.salaryDifferenceType,
          paradigmName: existing.paradigmName ?? undefined,
          applyReflexos: existing.salaryDifferenceApplyReflexos,
          periods: existing.salaryDifferencePeriods.map((p) => ({
            startMonth: monthKeyFromDate(p.startMonth),
            endMonth: monthKeyFromDate(p.endMonth),
            dueSalary: p.dueSalary,
            receivedSalary: p.receivedSalary ?? undefined,
          })),
        }
      : undefined
  const resolvedSalaryDifference =
    salaryDifference === null
      ? undefined
      : (salaryDifference ?? existingSalaryDifference)

  const resolvedCustomVerbas =
    customVerbas ??
    existing.customVerbas.map((v) => ({
      name: v.name,
      monthlyValue: v.monthlyValue,
      startMonth: monthKeyFromDate(v.startMonth),
      endMonth: monthKeyFromDate(v.endMonth),
      nature: v.nature,
    }))

  const mergedInput: LaborCalculationInput = {
    clientName: baseInput.clientName ?? existing.clientName,
    clientId: baseInput.clientId ?? existing.clientId ?? undefined,
    clientDocument:
      baseInput.clientDocument ?? existing.clientDocument ?? undefined,
    observations: baseInput.observations ?? existing.observations ?? undefined,
    startDate: baseInput.startDate ?? existing.startDate ?? new Date(),
    endDate: baseInput.endDate ?? existing.endDate ?? new Date(),
    lastSalary: baseInput.lastSalary ?? Number(existing.lastSalary),
    baseSalary: baseInput.baseSalary ?? Number(existing.baseSalary),
    unpaid13ths: baseInput.unpaid13ths ?? existing.unpaid13ths,
    vacationCount: baseInput.vacationCount ?? existing.vacationCount,
    vacationVencidasCount:
      baseInput.vacationVencidasCount ?? existing.vacationVencidasCount,
    priorNoticeWorked:
      baseInput.priorNoticeWorked ?? existing.priorNoticeWorked ?? false,
    priorNoticeDate:
      baseInput.priorNoticeDate ?? existing.priorNoticeDate ?? undefined,
    extraHours: baseInput.extraHours ?? Number(existing.extraHours),
    nightHours: baseInput.nightHours ?? Number(existing.nightHours),
    insalubrityLevel: (baseInput.insalubrityLevel ??
      existing.insalubrityLevel ??
      0) as 0 | 10 | 20 | 40,
    dangerousWork: baseInput.dangerousWork ?? existing.dangerousWork ?? false,
    lastThreeSalariesAvg:
      baseInput.lastThreeSalariesAvg ?? Number(existing.lastThreeSalariesAvg),
    terminationType: (baseInput.terminationType ??
      existing.terminationType) as LaborCalculationInput['terminationType'],
    applyArt477Fine:
      baseInput.applyArt477Fine ?? existing.applyArt477Fine ?? false,
  }

  const rates: ResolvedRates = {
    satRate: pctToDecimal(satRate) ?? Number(existing.satRate) ?? 0.03,
    employerInssRate:
      pctToDecimal(employerInssRate) ??
      Number(existing.employerInssRate) ??
      0.2,
    honorariosRate:
      pctToDecimal(honorariosRate) ?? Number(existing.honorariosRate) ?? 0.15,
  }

  const resolvedNightPct =
    nightAdditionalPercent ?? existing.nightAdditionalPercent ?? 20
  const resolvedIrpfDeps = irpfDependents ?? existing.irpfDependents

  const v3Input: LaborCalculationInputV3 = {
    ...mergedInput,
    salaryHistory:
      salaryHistory ??
      existing.salaryHistory.map((s) => ({
        month: `${s.month.getFullYear()}-${String(s.month.getMonth() + 1).padStart(2, '0')}`,
        baseSalary: s.baseSalary,
        lastSalary: s.lastSalary,
      })),
    unpaidSalaries:
      unpaidSalaries ??
      existing.unpaidSalaries.map((u) => ({
        month: `${u.month.getFullYear()}-${String(u.month.getMonth() + 1).padStart(2, '0')}`,
        daysWorked: u.daysWorked,
      })),
    filingDate: filingDate ?? existing.filingDate ?? undefined,
    liquidationDate: liquidationDate ?? existing.liquidationDate ?? undefined,
    nightAdditionalPercent: resolvedNightPct,
    ...rates,
    irpfDependents: resolvedIrpfDeps,
    applyArt467: applyArt467 ?? existing.applyArt467,
    applyPrescricaoQuinquenal:
      applyPrescricaoQuinquenal ?? existing.applyPrescricaoQuinquenal,
    salaryDifference: resolvedSalaryDifference,
    customVerbas: resolvedCustomVerbas,
    intervalIntrajornadaHours:
      input.intervalIntrajornadaHours ?? existing.intervalIntrajornadaHours,
    transferAdditionalMonths:
      input.transferAdditionalMonths ?? existing.transferAdditionalMonths,
    applyDsrOnExtra: input.applyDsrOnExtra ?? existing.applyDsrOnExtra,
    stabilityMonths: input.stabilityMonths ?? existing.stabilityMonths,
    fgtsAlreadyDeposited:
      input.fgtsAlreadyDeposited ?? Number(existing.fgtsAlreadyDeposited),
    amountsAlreadyPaid:
      input.amountsAlreadyPaid ?? Number(existing.amountsAlreadyPaid),
  }

  // Reusa a tabela congelada no create. Editar um campo qualquer não pode mexer
  // no total: mudar índices é ato explícito, pelo endpoint de reindexação.
  // Cálculo legado (anterior ao rastreio) adota a tabela vigente e passa a
  // gravá-la — é a única vez em que o total pode se mover numa edição.
  const { table, snapshotId } = existing.indexSnapshotId
    ? {
        table: await loadSnapshotTable(existing.indexSnapshotId),
        snapshotId: existing.indexSnapshotId,
      }
    : await resolveIndexTable()

  const v3Result = calculateLaborV3(v3Input, table)
  const fgtsRows = buildFgtsRows(v3Result)
  const verbaLineRows = buildVerbaLineRows(v3Result)
  const computed = buildComputedFields(v3Result, rates, {
    nightAdditionalPercent: resolvedNightPct,
    irpfDependents: resolvedIrpfDeps,
    filingDate: filingDate ?? existing.filingDate,
    liquidationDate: liquidationDate ?? existing.liquidationDate,
  })

  const updated = await prisma.laborCalculation.update({
    where: { id },
    data: {
      clientName: mergedInput.clientName,
      clientId: mergedInput.clientId,
      clientDocument: mergedInput.clientDocument ?? null,
      observations: mergedInput.observations ?? null,
      terminationType: mergedInput.terminationType,
      calculationVersion: 'v3' as const,
      indexSnapshotId: snapshotId,
      engineVersion: V3_ENGINE_VERSION,
      startDate: mergedInput.startDate,
      endDate: mergedInput.endDate,
      lastSalary: mergedInput.lastSalary,
      baseSalary: mergedInput.baseSalary,
      unpaid13ths: mergedInput.unpaid13ths,
      vacationCount: mergedInput.vacationCount,
      vacationVencidasCount: mergedInput.vacationVencidasCount,
      priorNoticeWorked: mergedInput.priorNoticeWorked,
      priorNoticeDate: mergedInput.priorNoticeDate ?? null,
      extraHours: mergedInput.extraHours,
      nightHours: mergedInput.nightHours,
      insalubrityLevel: mergedInput.insalubrityLevel,
      dangerousWork: mergedInput.dangerousWork,
      applyArt477Fine: mergedInput.applyArt477Fine,
      lastThreeSalariesAvg: mergedInput.lastThreeSalariesAvg,
      applyArt467: applyArt467 ?? existing.applyArt467,
      applyPrescricaoQuinquenal:
        applyPrescricaoQuinquenal ?? existing.applyPrescricaoQuinquenal,
      salaryDifferenceType: resolvedSalaryDifference?.type ?? null,
      paradigmName: resolvedSalaryDifference?.paradigmName ?? null,
      salaryDifferenceApplyReflexos:
        resolvedSalaryDifference?.applyReflexos ?? true,
      intervalIntrajornadaHours:
        input.intervalIntrajornadaHours ?? existing.intervalIntrajornadaHours,
      transferAdditionalMonths:
        input.transferAdditionalMonths ?? existing.transferAdditionalMonths,
      applyDsrOnExtra: input.applyDsrOnExtra ?? existing.applyDsrOnExtra,
      stabilityMonths: input.stabilityMonths ?? existing.stabilityMonths,
      fgtsAlreadyDeposited:
        input.fgtsAlreadyDeposited ?? Number(existing.fgtsAlreadyDeposited),
      amountsAlreadyPaid:
        input.amountsAlreadyPaid ?? Number(existing.amountsAlreadyPaid),
      ...computed,
      fgtsEntries: { deleteMany: {}, create: fgtsRows },
      verbaLines: { deleteMany: {}, create: verbaLineRows },
      salaryHistory: salaryHistory
        ? {
            deleteMany: {},
            create: salaryHistory.map((s) => ({
              month: new Date(`${s.month}-01`),
              baseSalary: s.baseSalary,
              lastSalary: s.lastSalary,
            })),
          }
        : undefined,
      unpaidSalaries: unpaidSalaries
        ? {
            deleteMany: {},
            create: unpaidSalaries.map((u) => ({
              month: new Date(`${u.month}-01`),
              daysWorked: u.daysWorked,
            })),
          }
        : undefined,
      salaryDifferencePeriods: {
        deleteMany: {},
        create: buildSalaryDifferencePeriodRows(resolvedSalaryDifference),
      },
      salaryDifferenceEntries: {
        deleteMany: {},
        create: buildSalaryDifferenceRows(v3Result),
      },
      customVerbas: {
        deleteMany: {},
        create: buildCustomVerbaRows(resolvedCustomVerbas, v3Result),
      },
    },
    include: PRISMA_INCLUDE,
  })

  await recordAudit({
    entityType: 'LaborCalculation',
    entityId: id,
    action: 'update',
    userId: actor.userId,
    changes: diffFields(existing, updated),
  })

  return updated
}
