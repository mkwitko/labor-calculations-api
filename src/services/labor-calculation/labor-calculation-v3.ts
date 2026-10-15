import type {
  CorrectedVerb,
  LaborCalculationInputV3,
  LaborCalculationResultV3,
  SalaryEntry,
} from '@/@types/labor-calculation-v3'
import { env } from '@/env'
import {
  calculateCustasJudiciais,
  calculateHonorariosSucumbencia,
} from './court-costs-calculator'
import { calculateCustomVerbas } from './custom-verbas-calculator'
import {
  calculateAvisoPrevioDays,
  count13thAvos,
  countVacationAvos,
  countWorkedMonths,
  monthRangeKey,
  projectEndDate,
  round,
  toMonthRange,
} from './date-utils'
import { calculateFgtsMonthly } from './fgts-calculator'
import type { IndexTable } from './index-table'
import { calculateAdc58InterestRate, defaultIndexTable } from './index-table'
import { calculateInssEmployee, calculateInssEmployer } from './inss-calculator'
import { calculateIrpfAcumulado } from './irpf-calculator'
import { correctMonthlyValues, correctValue } from './monetary-correction'
import { filterMonthEntries, getPrescricaoCutoffKey } from './prescription'
import { calculateSalaryDifference } from './salary-difference-calculator'
import { buildDefaultSalaryHistory, zeroCorrected } from './v3-helpers'

/**
 * Versão do algoritmo, gravada em `LaborCalculation.engineVersion` junto com o
 * resultado. Bumpar sempre que a conta mudar — é o que permite explicar, depois,
 * por que um recálculo deu diferente. A convenção de nunca mutar uma versão
 * publicada continua valendo: mudança de algoritmo vira arquivo novo.
 */
export const V3_ENGINE_VERSION = '3.2.0'

export function calculateLaborV3(
  input: LaborCalculationInputV3,
  table: IndexTable = defaultIndexTable,
): LaborCalculationResultV3 {
  const {
    startDate,
    endDate,
    lastSalary,
    baseSalary,
    vacationVencidasCount,
    applyArt477Fine,
    priorNoticeWorked,
    extraHours,
    nightHours,
    insalubrityLevel,
    dangerousWork,
    lastThreeSalariesAvg,
    terminationType,
    salaryHistory,
    unpaidSalaries,
    liquidationDate,
    nightAdditionalPercent = 20,
    satRate = 0.03,
    employerInssRate = 0.2,
    honorariosRate = 0.15,
    irpfDependents = 0,
    applyArt467 = false,
    applyPrescricaoQuinquenal = false,
    salaryDifference,
    customVerbas,
    filingDate,
  } = input

  // ─── Setup ───────────────────────────────────────────────────────────────────
  const minimumWage = env.MINIMUM_WAGE
  const fgtsRate = env.FGTS_RATE
  const liquidation = liquidationDate ?? new Date()
  const liquidationMonth = toMonthRange(liquidation)
  const endMonth = toMonthRange(endDate)

  // ─── Prescrição Quinquenal (CF Art. 7º, XXIX; STF ARE 709.212) ───────────────
  // Opt-in: prescription is not declared ex officio (Súmula 153 TST) — the
  // lawyer chooses between the full claim and the time-barred scenario.
  // Cutoff base = filing date (fallback: liquidation). Months before
  // (base − 5 years) are dropped from every monthly stream.
  const cutoffKey = applyPrescricaoQuinquenal
    ? getPrescricaoCutoffKey(filingDate ?? liquidation)
    : undefined

  // rescisao_indireta has the same employee rights as sem_justa_causa (CLT Art. 483)
  const isSemJustaCausa =
    terminationType === 'sem_justa_causa' ||
    terminationType === 'rescisao_indireta'
  const isComJustaCausa = terminationType === 'com_justa_causa'

  // ─── Duration & Aviso Prévio ─────────────────────────────────────────────────
  // countWorkedMonths returns fractional months for pro-rata calculations.
  // Lei 12.506/2011: aviso prévio = 30 days + 3 per worked year, capped at 90.
  // projectedEnd extends the contract period by aviso prévio days to compute avos.
  const worked = countWorkedMonths(startDate, endDate)
  const avisoPrevioDays =
    !isComJustaCausa && !priorNoticeWorked
      ? calculateAvisoPrevioDays(worked.years)
      : 0
  const projectedEnd =
    !isComJustaCausa && !priorNoticeWorked
      ? projectEndDate(endDate, worked.years, priorNoticeWorked)
      : endDate
  // ─── Additionals ─────────────────────────────────────────────────────────────
  // CLT Art. 59: overtime at 150% of hourly rate (220 hours/month base).
  // CLT Art. 73: night work additional (default 20%).
  // CLT Art. 192: insalubrity on minimum wage; Art. 193: dangerousness on base salary.
  //
  // ATENÇÃO: `extraHours` e `nightHours` são TOTAIS do período contratual, não
  // médias mensais — as multiplicações abaixo não têm `worked.totalMonths`.
  // Quem parte de uma suposição mensal (ver `answers-to-input.ts`) tem de
  // multiplicar pelos meses antes de montar o input. Compare com
  // `intervalIntrajornadaHours` logo adiante, que é por mês e por isso
  // multiplica.
  const hourlyRate = round(lastSalary / 220)
  const extraHoursValue = round(extraHours * hourlyRate * 1.5)
  const nightAdditionalMultiplier = 1 + nightAdditionalPercent / 100
  const nightAdditionalValue = round(
    nightHours * hourlyRate * nightAdditionalMultiplier,
  )
  const insalubrityValue = round(
    minimumWage * (insalubrityLevel / 100) * worked.totalMonths,
  )
  const dangerousWorkValue = dangerousWork
    ? round(baseSalary * 0.3 * worked.totalMonths)
    : 0

  // ─── Intervalo intrajornada suprimido (CLT Art. 71 §4) ───────────────────────
  // Horas suprimidas pagas com adicional de 50%. Após a Lei 13.467/2017 tem
  // natureza indenizatória (sem reflexos). Valor = horas/mês × hora × 1,5 × meses.
  const intervalIntrajornadaHoursInput = input.intervalIntrajornadaHours ?? 0
  const intervalIntrajornadaValue = round(
    intervalIntrajornadaHoursInput * hourlyRate * 1.5 * worked.totalMonths,
  )

  // ─── Adicional de transferência (CLT Art. 469 §3) ───────────────────────────
  // 25% do salário enquanto durar a transferência provisória. Meses informados.
  const transferAdditionalMonths = input.transferAdditionalMonths ?? 0
  const transferAdditionalValue = round(
    baseSalary * 0.25 * transferAdditionalMonths,
  )

  // ─── DSR sobre horas extras/noturno (Súmula 172 TST) ────────────────────────
  // Repouso semanal remunerado reflexo das horas extras/adicional noturno
  // habituais. Fator ~ (domingos+feriados)/(dias úteis) ≈ 0,1818.
  const DSR_FACTOR = 0.1818
  const dsrValue = input.applyDsrOnExtra
    ? round((extraHoursValue + nightAdditionalValue) * DSR_FACTOR)
    : 0

  // ─── Estabilidade indenizada (gestante/CIPA/acidentária) ────────────────────
  // Salários do período estável + 13º + férias+1/3 + FGTS (8%) sobre os salários.
  // Indenização — sem incidência de INSS/IRPF.
  const stabilityMonths = input.stabilityMonths ?? 0
  const stabilitySalaries = round(lastSalary * stabilityMonths)
  const stabilityValue =
    stabilityMonths > 0
      ? round(
          stabilitySalaries + // salários
            (lastSalary * stabilityMonths) / 12 + // 13º proporcional
            ((lastSalary * stabilityMonths) / 12) * (4 / 3) + // férias + 1/3
            stabilitySalaries * fgtsRate, // FGTS sobre salários
        )
      : 0

  // ─── Abatimentos (FGTS já depositado + verbas já pagas no TRCT) ─────────────
  const deductionsValue = round(
    (input.fgtsAlreadyDeposited ?? 0) + (input.amountsAlreadyPaid ?? 0),
  )

  // ─── Aviso Prévio (indenizado) ───────────────────────────────────────────────
  // When not served in person, the employer pays (lastSalary / 30) * avisoPrevioDays.
  let priorNoticeValue = 0
  if (!isComJustaCausa && !priorNoticeWorked) {
    priorNoticeValue = round((lastSalary / 30) * avisoPrevioDays)
  }

  // ─── 13º Salário ─────────────────────────────────────────────────────────────
  // Calendar-year avos with ≥15-day rule (CLT Art. 130 + TST Súmula 1).
  // com_justa_causa forfeits 13th (CLT Art. 482).
  const avos13th = !isComJustaCausa
    ? count13thAvos(startDate, endDate, projectedEnd)
    : 0
  const thirteenthSalaryValue = round((lastSalary / 12) * avos13th)

  // ─── Férias ──────────────────────────────────────────────────────────────────
  // Férias proporcionais + 1/3 (CLT Art. 148 + CF Art. 7, XVII).
  // Aquisitive-period avos with ≥15-day rule, capped at 12 (CLT Art. 130).
  // doubleVacationValue: férias vencidas = previous full period not taken (paid double at termination).
  const avosVacation = !isComJustaCausa
    ? countVacationAvos(startDate, projectedEnd)
    : 0
  const vacationBase = lastSalary + lastSalary / 3
  const proportionalVacationAvos = avosVacation
  const vacationValueProportional = round(
    (vacationBase / 12) * proportionalVacationAvos,
  )
  const doubleVacationValue = round(vacationVencidasCount * vacationBase)
  const vacationValue = round(vacationValueProportional + doubleVacationValue)

  // ─── Multa Art. 477 CLT ──────────────────────────────────────────────────────
  // Fine equal to lastSalary when employer delays homologação beyond the legal deadline.
  const art477FineValue = applyArt477Fine ? round(lastSalary) : 0

  // Saldo de salário: CLT always divides by 30 regardless of actual month days
  let saldoSalarioValue = 0
  const saldoEntries: { month: string; value: number }[] = []
  const unpaidInRange = filterMonthEntries(unpaidSalaries ?? [], cutoffKey)
  if (unpaidInRange.length > 0) {
    for (const us of unpaidInRange) {
      const daily = round(lastSalary / 30)
      const value = round(daily * us.daysWorked)
      saldoSalarioValue = round(saldoSalarioValue + value)
      saldoEntries.push({ month: us.month, value })
    }
  }

  // ─── FGTS ────────────────────────────────────────────────────────────────────
  // 8% deposit per month on lastSalary. Corrected by IPCA-E, interest by ADC 58.
  // 13th and aviso prévio also incur FGTS but are not separate month entries.
  // com_justa_causa forfeits FGTS and the 40% fine.
  const fullSalaryHist: SalaryEntry[] =
    salaryHistory && salaryHistory.length > 0
      ? salaryHistory
      : buildDefaultSalaryHistory(startDate, endDate, lastSalary, baseSalary)
  const salaryHist = filterMonthEntries(fullSalaryHist, cutoffKey)
  const prescricaoMonthsCut = fullSalaryHist.length - salaryHist.length

  // ─── Diferenças Salariais (Equiparação CLT 461 / Desvio de Função) ──────────
  // Salary nature: feeds FGTS (via effectiveSalaryHist below), INSS, IRPF,
  // plus reflexos on 13º/férias/aviso. Owed regardless of termination type —
  // differences accrued during the contract (unlike termination verbs).
  const contractStartKey = monthRangeKey(toMonthRange(startDate))
  const contractEndKey = monthRangeKey(endMonth)
  const salaryDiffResult =
    salaryDifference && salaryDifference.periods.length > 0
      ? calculateSalaryDifference(
          salaryDifference,
          salaryHist,
          lastSalary,
          table,
          liquidationMonth,
          contractStartKey,
          contractEndKey,
          cutoffKey,
          avos13th,
          proportionalVacationAvos,
          avisoPrevioDays,
        )
      : null

  // ─── Outras Verbas (customizadas) ────────────────────────────────────────────
  const customVerbasResult =
    customVerbas && customVerbas.length > 0
      ? calculateCustomVerbas(customVerbas, table, liquidationMonth, cutoffKey)
      : null

  // FGTS base: salaries + salary differences + custom verbas of salary nature.
  // Incrementing the base (instead of a separate reflexo line) keeps the
  // month-by-month correction/interest exact and avoids double-counting.
  const diffByMonth = salaryDiffResult?.diffByMonth ?? {}
  const customSalarialByMonth = customVerbasResult?.salarialByMonth ?? {}
  const hasFgtsBaseIncrement =
    Object.keys(diffByMonth).length > 0 ||
    Object.keys(customSalarialByMonth).length > 0
  const effectiveSalaryHist: SalaryEntry[] = hasFgtsBaseIncrement
    ? salaryHist.map((s) => ({
        ...s,
        lastSalary: round(
          s.lastSalary +
            (diffByMonth[s.month] ?? 0) +
            (customSalarialByMonth[s.month] ?? 0),
        ),
      }))
    : salaryHist

  const fgtsResult = !isComJustaCausa
    ? calculateFgtsMonthly(
        effectiveSalaryHist,
        fgtsRate,
        table,
        liquidationMonth,
        thirteenthSalaryValue,
        priorNoticeValue,
      )
    : {
        monthlyEntries: [],
        totalDeposit: 0,
        totalCorrected: 0,
        totalInterest: 0,
        totalFgts: 0,
        fineBase: 0,
        fineValue: 0,
        fineCorrected: 0,
      }

  // 40% fine on FGTS (corrected+interest) — only for sem_justa_causa / rescisao_indireta.
  const fgtsFineValue = isSemJustaCausa ? round(fgtsResult.fineValue) : 0
  const fgtsFineCorrected = isSemJustaCausa
    ? round(fgtsResult.fineCorrected)
    : 0

  // ─── Seguro-Desemprego ───────────────────────────────────────────────────────
  // Progressive formula (MTE table 2024). Only for sem_justa_causa / rescisao_indireta.
  let unemploymentInsuranceValue = 0
  if (isSemJustaCausa) {
    if (lastThreeSalariesAvg <= 2222.17) {
      unemploymentInsuranceValue = lastThreeSalariesAvg * 0.8
    } else if (lastThreeSalariesAvg <= 3703.99) {
      unemploymentInsuranceValue =
        (lastThreeSalariesAvg - 2222.17) * 0.5 + 1777.74
    } else {
      unemploymentInsuranceValue = 2518.65
    }
    unemploymentInsuranceValue = round(unemploymentInsuranceValue)
  }

  // ─── Reflexos (Repercussões) ──────────────────────────────────────────────────
  // Overtime/night additional integrate into 13th, vacation, and FGTS (TST Súmula 226).
  // Monthly average of additionals is used as the reflexo base.
  const hoursAdditionalsMonthly =
    worked.totalMonths > 0
      ? round((extraHoursValue + nightAdditionalValue) / worked.totalMonths)
      : 0
  const reflexo13thValue = !isComJustaCausa
    ? round(hoursAdditionalsMonthly * (avos13th / 12))
    : 0
  const paidVacationCount = isComJustaCausa
    ? vacationVencidasCount
    : proportionalVacationAvos
  const reflexoVacationValue = round(
    hoursAdditionalsMonthly * (paidVacationCount / 12) * (4 / 3),
  )
  const reflexoFGTSValue = !isComJustaCausa
    ? round((extraHoursValue + nightAdditionalValue) * fgtsRate)
    : 0
  const reflexoMultaFGTSValue = isSemJustaCausa
    ? round(reflexoFGTSValue * 0.4)
    : 0

  // ─── Monetary Correction (IPCA-E, Súmula 381 TST) ───────────────────────────
  // Correction starts from the month AFTER the verb was due (see correctValue).
  // Termination verbs (aviso, 13th, férias, art477) are due on endDate month.
  // FGTS per-month correction is handled inside calculateFgtsMonthly.
  const correctionPriorNotice =
    priorNoticeValue > 0
      ? correctValue(priorNoticeValue, table, endMonth, liquidationMonth)
      : zeroCorrected(priorNoticeValue)
  const correction13th =
    thirteenthSalaryValue > 0
      ? correctValue(thirteenthSalaryValue, table, endMonth, liquidationMonth)
      : zeroCorrected(thirteenthSalaryValue)
  const correctionVacation =
    vacationValue > 0
      ? correctValue(vacationValue, table, endMonth, liquidationMonth)
      : zeroCorrected(vacationValue)
  const correctionArt477 =
    art477FineValue > 0
      ? correctValue(art477FineValue, table, endMonth, liquidationMonth)
      : zeroCorrected(art477FineValue)

  const correctionSaldoEntries =
    saldoEntries.length > 0
      ? correctMonthlyValues(saldoEntries, table, liquidationMonth)
      : []
  const correctionSaldo: CorrectedVerb =
    saldoSalarioValue > 0
      ? {
          original: saldoSalarioValue,
          correctionFactor:
            correctionSaldoEntries.length > 0
              ? correctionSaldoEntries[correctionSaldoEntries.length - 1]
                  .correctionFactor
              : 1,
          corrected: round(
            correctionSaldoEntries.reduce((s, e) => s + e.corrected, 0),
          ),
          correctionAmount: round(
            correctionSaldoEntries.reduce((s, e) => s + e.correctionAmount, 0),
          ),
        }
      : zeroCorrected(0)

  const salaryMonthEntries: Record<string, CorrectedVerb> = {}
  const salaryMonthValues = salaryHist.map((s) => ({
    month: s.month,
    value: s.lastSalary,
  }))
  const correctedSalaries = correctMonthlyValues(
    salaryMonthValues,
    table,
    liquidationMonth,
  )
  for (const cs of correctedSalaries) {
    salaryMonthEntries[cs.month] = {
      original: cs.original,
      correctionFactor: cs.correctionFactor,
      corrected: cs.corrected,
      correctionAmount: cs.correctionAmount,
    }
  }

  // ─── Interest (ADC 58: TRD until 2024-12, SELIC from 2025-01) ───────────────
  // STF ADC 58 / STJ: simple TRD per month until Dec/2024; SELIC cumulative from Jan/2025.
  // termInterestRate covers the period from endDate to liquidationDate (same for all term verbs).
  // Per-month salary interest uses the individual month as the due date.
  const liquidKey = monthRangeKey(liquidationMonth)
  const endMonthKey = monthRangeKey(endMonth)

  const termInterestRate = calculateAdc58InterestRate(
    table,
    endMonthKey,
    liquidKey,
  )
  const interestPriorNotice = round(
    correctionPriorNotice.corrected * termInterestRate,
  )
  const interest13th = round(correction13th.corrected * termInterestRate)
  const interestVacation = round(
    correctionVacation.corrected * termInterestRate,
  )
  const interestArt477 = round(correctionArt477.corrected * termInterestRate)
  const interestSaldo = round(correctionSaldo.corrected * termInterestRate)
  const interestFgts = round(fgtsResult.totalInterest)
  const interestFgtsFine = round(fgtsFineCorrected * termInterestRate)

  const salaryMonthInterest: Record<string, number> = {}
  for (const cs of correctedSalaries) {
    const rate = calculateAdc58InterestRate(table, cs.month, liquidKey)
    salaryMonthInterest[cs.month] = round(cs.corrected * rate)
  }

  // ─── Diferenças Salariais — agregados, reflexos e juros ─────────────────────
  // Principal is corrected/interest-bearing month by month inside the module.
  // Reflexos (13º/férias/aviso) are termination verbs: due at endDate,
  // corrected from endMonth and subject to termInterestRate.
  const diffDetail = salaryDiffResult?.detail
  const salaryDifferenceValue = diffDetail?.totalDiff ?? 0
  const correctionSalaryDiff: CorrectedVerb =
    diffDetail && diffDetail.totalDiff > 0
      ? {
          original: diffDetail.totalDiff,
          correctionFactor: diffDetail.totalCorrected / diffDetail.totalDiff,
          corrected: diffDetail.totalCorrected,
          correctionAmount: round(
            diffDetail.totalCorrected - diffDetail.totalDiff,
          ),
        }
      : zeroCorrected(0)
  const salaryDifferenceReflexosValue = diffDetail
    ? round(
        diffDetail.reflexo13 +
          diffDetail.reflexoVacation +
          diffDetail.reflexoAviso,
      )
    : 0
  const correctionDiffReflexos =
    salaryDifferenceReflexosValue > 0
      ? correctValue(
          salaryDifferenceReflexosValue,
          table,
          endMonth,
          liquidationMonth,
        )
      : zeroCorrected(0)
  const interestDiffReflexos = round(
    correctionDiffReflexos.corrected * termInterestRate,
  )
  const interestSalaryDifference = round(
    (diffDetail?.totalInterest ?? 0) + interestDiffReflexos,
  )
  // Corrected share of the 13º reflexo — needed for the INSS/IRPF bases below.
  const reflexo13DiffCorrected = round(
    (diffDetail?.reflexo13 ?? 0) * correctionDiffReflexos.correctionFactor,
  )

  // ─── Outras Verbas — agregados, reflexos e juros ─────────────────────────────
  // Salarial-nature verbas generate reflexos on 13º and férias+1/3 by monthly
  // average (Súmula 226 pattern); the FGTS reflexo already flows through the
  // incremented base, so no separate FGTS line here.
  const outrasVerbasValue = customVerbasResult?.totalBruto ?? 0
  const customSalarialAvg = customVerbasResult?.salarialMonthlyAverage ?? 0
  const reflexo13Custom = round(customSalarialAvg * (avos13th / 12))
  const reflexoVacationCustom = round(
    customSalarialAvg * (proportionalVacationAvos / 12) * (4 / 3),
  )
  const customVerbasReflexosValue = round(
    reflexo13Custom + reflexoVacationCustom,
  )
  const correctionCustomReflexos =
    customVerbasReflexosValue > 0
      ? correctValue(
          customVerbasReflexosValue,
          table,
          endMonth,
          liquidationMonth,
        )
      : zeroCorrected(0)
  const interestCustomReflexos = round(
    correctionCustomReflexos.corrected * termInterestRate,
  )
  const interestCustomVerbas = round(
    (customVerbasResult?.totalInterest ?? 0) + interestCustomReflexos,
  )
  const reflexo13CustomCorrected = round(
    reflexo13Custom * correctionCustomReflexos.correctionFactor,
  )
  const customSalarialCorrigido = customVerbasResult
    ? round(
        customVerbasResult.details
          .filter((d) => d.nature === 'salarial')
          .reduce((s, d) => s + d.corrigido, 0),
      )
    : 0

  // ─── Multa Art. 467 CLT ──────────────────────────────────────────────────────
  // 50% over uncontested termination verbs unpaid at the first hearing:
  // férias, 13º, aviso prévio and the 40% FGTS fine. Base = corrected principal
  // WITHOUT interest — same criterion as the 40% fine (fineBase excludes ADC 58
  // interest): correction is recomposition of the principal, interest is a
  // separate accessory award (CLT Art. 883). The fine itself bears no own
  // interest and correction factor 1 (it arises already over updated values).
  // Indenizatória (punitive) — outside INSS/IRPF. com_justa_causa shrinks the
  // base automatically (13º/aviso/multa 40% are already zero).
  const art467Value = applyArt467
    ? round(
        0.5 *
          (correctionVacation.corrected +
            correction13th.corrected +
            correctionPriorNotice.corrected +
            fgtsFineCorrected),
      )
    : 0
  const correctionArt467: CorrectedVerb =
    art467Value > 0
      ? {
          original: art467Value,
          correctionFactor: 1,
          corrected: art467Value,
          correctionAmount: 0,
        }
      : zeroCorrected(0)

  const totalInterest = round(
    interestPriorNotice +
      interest13th +
      interestVacation +
      interestArt477 +
      interestSaldo +
      interestFgts +
      interestFgtsFine +
      interestSalaryDifference +
      interestCustomVerbas,
  )

  // ─── INSS (employee contribution) ────────────────────────────────────────────
  // INSS incides on salary-nature amounts: saldo de salário + 13th salary.
  // Aviso prévio indenizado and férias proporcionais are indenizatórias — not subject to INSS.
  // Progressive table (2025): up to INSS_TETO_2025 cap.
  const inssBases: { month: string; value: number }[] = []
  if (!isComJustaCausa) {
    inssBases.push(
      ...saldoEntries.map((e) => ({ month: e.month, value: e.value })),
    )
    inssBases.push({
      month: monthRangeKey(endMonth),
      value: thirteenthSalaryValue,
    })
  }
  // Salary differences and salarial custom verbas are owed regardless of
  // termination type — their INSS bases enter unconditionally, month by month.
  if (diffDetail) {
    inssBases.push(
      ...diffDetail.monthlyEntries.map((e) => ({
        month: e.month,
        value: e.diff,
      })),
    )
    if (diffDetail.reflexo13 > 0) {
      inssBases.push({
        month: monthRangeKey(endMonth),
        value: diffDetail.reflexo13,
      })
    }
  }
  for (const [month, value] of Object.entries(customSalarialByMonth)) {
    inssBases.push({ month, value })
  }
  if (reflexo13Custom > 0) {
    inssBases.push({ month: monthRangeKey(endMonth), value: reflexo13Custom })
  }
  const inssEmployeeResult = calculateInssEmployee(inssBases)
  const inssEmployeeValue = inssEmployeeResult.total
  const inssEmployerResult = calculateInssEmployer(
    inssBases,
    employerInssRate,
    satRate,
  )

  // ─── IRPF ─────────────────────────────────────────────────────────────────────
  // Art. 12-A Lei 7.713/1988: accumulated income ("rendimentos acumulados") table.
  // Remuneratórias (salary-nature, subject to INSS/IRPF): 13th + saldo + hours additionals.
  // Aviso prévio indenizado is INDENIZATÓRIO — excluded from INSS/IRPF base (TST Súmula 305).
  // Uses corrected values: IRPF incides on the actual corrected amount per rendimentos acumulados.
  const totalRemuneratorio = round(
    correction13th.corrected +
      correctionSaldo.corrected +
      extraHoursValue +
      nightAdditionalValue +
      correctionSalaryDiff.corrected +
      reflexo13DiffCorrected +
      customSalarialCorrigido +
      reflexo13CustomCorrected,
  )
  const irpfResult = calculateIrpfAcumulado(
    totalRemuneratorio,
    inssEmployeeValue,
    irpfDependents,
  )

  // ─── Totals & Financials ─────────────────────────────────────────────────────
  // brutoDevidoReclamante: corrected verbs + interest (all in one line for the court spreadsheet).
  // totalDescontos: deductions from worker (INSS + IRPF).
  // liquidoDevidoReclamante: net the worker actually receives.
  // Honorários and custas are borne by the employer (reclamado), not deducted from worker.
  // percentualRemuneratorio: salary-nature portion of bruto (ex-interest) — used for IRPF bracket.
  // FGTS interest is already in fgtsResult.totalInterest (included in totalInterest below),
  // so use totalCorrected here to avoid double-counting.
  const brutoDevidoReclamante = round(
    correctionPriorNotice.corrected +
      correction13th.corrected +
      correctionVacation.corrected +
      correctionArt477.corrected +
      correctionSaldo.corrected +
      round(fgtsResult.totalCorrected) +
      fgtsFineCorrected +
      extraHoursValue +
      nightAdditionalValue +
      insalubrityValue +
      dangerousWorkValue +
      reflexo13thValue +
      reflexoVacationValue +
      reflexoFGTSValue +
      reflexoMultaFGTSValue +
      correctionSalaryDiff.corrected +
      correctionDiffReflexos.corrected +
      (customVerbasResult?.totalCorrigido ?? 0) +
      correctionCustomReflexos.corrected +
      art467Value +
      intervalIntrajornadaValue +
      transferAdditionalValue +
      dsrValue +
      stabilityValue +
      totalInterest -
      deductionsValue,
  )

  const totalDescontos = round(inssEmployeeValue + irpfResult.taxDue)
  const liquidoDevidoReclamante = round(brutoDevidoReclamante - totalDescontos)

  const honorariosResult = calculateHonorariosSucumbencia(
    brutoDevidoReclamante,
    honorariosRate,
  )

  const subtotalReclamado = round(
    liquidoDevidoReclamante +
      inssEmployerResult.totalEmployer +
      inssEmployerResult.totalSat +
      honorariosResult.honorarios +
      irpfResult.taxDue,
  )

  const custasResult = calculateCustasJudiciais(subtotalReclamado)
  const totalDevidoReclamado = round(subtotalReclamado + custasResult.total)

  // Denominator = brutoDevidoReclamante (corrected + interest), matching court document format.
  const percentualRemuneratorio =
    brutoDevidoReclamante > 0
      ? round((totalRemuneratorio / brutoDevidoReclamante) * 100)
      : 0

  const fgtsValue = round(fgtsResult.totalFgts)

  const totalValue = round(
    priorNoticeValue +
      thirteenthSalaryValue +
      vacationValue +
      fgtsValue +
      fgtsFineValue +
      unemploymentInsuranceValue +
      extraHoursValue +
      nightAdditionalValue +
      insalubrityValue +
      dangerousWorkValue +
      art477FineValue +
      reflexo13thValue +
      reflexoVacationValue +
      reflexoFGTSValue +
      reflexoMultaFGTSValue +
      saldoSalarioValue +
      salaryDifferenceValue +
      salaryDifferenceReflexosValue +
      outrasVerbasValue +
      customVerbasReflexosValue +
      art467Value +
      intervalIntrajornadaValue +
      transferAdditionalValue +
      dsrValue +
      stabilityValue -
      deductionsValue,
  )

  // ─── Memória de cálculo ───────────────────────────────────────────────────────
  // Uma linha por verba, com fundamento. A soma dos `total` fecha com
  // `brutoDevidoReclamante` — é o que sustenta o laudo item a item.
  //
  // A conferência é contra `brutoDevidoReclamante`, e não contra `totalValue`:
  // este último herda do V2 uma mistura de categorias (o FGTS entra já corrigido
  // e com juros, o resto entra bruto) e inclui o seguro-desemprego, que é
  // benefício previdenciário e não dívida do reclamado. Seguro-desemprego, por
  // isso, não vira linha aqui.
  const verbasDetalhadas: LaborCalculationResultV3['verbasDetalhadas'] = [
    {
      name: '13º Salário',
      legalRef: 'CLT art. 7º, VIII / Lei 4.090/1962',
      bruto: thirteenthSalaryValue,
      juros: interest13th,
      corrigido: correction13th.corrected,
      total: round(correction13th.corrected + interest13th),
    },
    {
      name: 'Aviso Prévio',
      legalRef: 'CLT art. 487 / Lei 12.506/2011',
      bruto: priorNoticeValue,
      juros: interestPriorNotice,
      corrigido: correctionPriorNotice.corrected,
      total: round(correctionPriorNotice.corrected + interestPriorNotice),
    },
    {
      name: 'Férias + 1/3',
      legalRef: 'CF art. 7º, XVII / CLT art. 129 e 146',
      bruto: vacationValue,
      juros: interestVacation,
      corrigido: correctionVacation.corrected,
      total: round(correctionVacation.corrected + interestVacation),
    },
    {
      name: 'Multa Art. 477 CLT',
      legalRef: 'CLT art. 477, §8º',
      bruto: art477FineValue,
      juros: interestArt477,
      corrigido: correctionArt477.corrected,
      total: round(correctionArt477.corrected + interestArt477),
    },
    {
      name: 'Saldo de Salário',
      legalRef: 'CLT art. 457 e 462',
      bruto: saldoSalarioValue,
      juros: interestSaldo,
      corrigido: correctionSaldo.corrected,
      total: round(correctionSaldo.corrected + interestSaldo),
    },
    {
      name: 'FGTS 8%',
      legalRef: 'Lei 8.036/1990, art. 15',
      bruto: round(fgtsResult.totalDeposit),
      juros: interestFgts,
      corrigido: round(fgtsResult.totalCorrected),
      total: fgtsResult.totalFgts,
    },
    {
      name: 'Multa FGTS 40%',
      legalRef: 'Lei 8.036/1990, art. 18, §1º',
      bruto: fgtsFineValue,
      juros: interestFgtsFine,
      corrigido: fgtsFineCorrected,
      total: round(fgtsFineCorrected + interestFgtsFine),
    },
  ]

  // Adicionais e seus reflexos. Entram em `brutoDevidoReclamante` sem correção
  // monetária (a base já é do mês da rescisão), então `corrigido` repete o bruto
  // e `juros` é zero — mesmo tratamento das demais verbas não corrigidas.
  const adicionais: {
    value: number
    name: string
    legalRef: string
  }[] = [
    {
      value: extraHoursValue,
      name: 'Horas Extras 50%',
      legalRef: 'CLT art. 59 / CF art. 7º, XVI',
    },
    {
      value: nightAdditionalValue,
      name: `Adicional Noturno ${nightAdditionalPercent}%`,
      legalRef: 'CLT art. 73',
    },
    {
      value: insalubrityValue,
      name: `Adicional de Insalubridade ${insalubrityLevel}%`,
      legalRef: 'CLT art. 192',
    },
    {
      value: dangerousWorkValue,
      name: 'Adicional de Periculosidade 30%',
      legalRef: 'CLT art. 193, §1º',
    },
    {
      value: reflexo13thValue,
      name: 'Reflexos dos Adicionais no 13º',
      legalRef: 'TST Súmula 45 e 264',
    },
    {
      value: reflexoVacationValue,
      name: 'Reflexos dos Adicionais nas Férias + 1/3',
      legalRef: 'TST Súmula 151 e 264',
    },
    {
      value: reflexoFGTSValue,
      name: 'Reflexos dos Adicionais no FGTS',
      legalRef: 'TST Súmula 63',
    },
    {
      value: reflexoMultaFGTSValue,
      name: 'Reflexos dos Adicionais na Multa de 40%',
      legalRef: 'Lei 8.036/1990, art. 18, §1º',
    },
  ]

  for (const adicional of adicionais) {
    if (adicional.value <= 0) continue

    verbasDetalhadas.push({
      name: adicional.name,
      legalRef: adicional.legalRef,
      bruto: adicional.value,
      juros: 0,
      corrigido: adicional.value,
      total: adicional.value,
    })
  }

  if (diffDetail && salaryDifferenceValue > 0) {
    verbasDetalhadas.push({
      name:
        salaryDifference?.type === 'desvio_funcao'
          ? 'Diferenças Salariais (Desvio de Função)'
          : 'Diferenças Salariais (Equiparação Art. 461)',
      legalRef:
        salaryDifference?.type === 'desvio_funcao'
          ? 'CLT art. 460 / TST Súmula 6'
          : 'CLT art. 461',
      bruto: salaryDifferenceValue,
      juros: diffDetail.totalInterest,
      corrigido: diffDetail.totalCorrected,
      total: round(diffDetail.totalCorrected + diffDetail.totalInterest),
    })
    if (salaryDifferenceReflexosValue > 0) {
      verbasDetalhadas.push({
        name: 'Reflexos das Diferenças Salariais',
        legalRef: 'TST Súmula 264',
        bruto: salaryDifferenceReflexosValue,
        juros: interestDiffReflexos,
        corrigido: correctionDiffReflexos.corrected,
        total: round(correctionDiffReflexos.corrected + interestDiffReflexos),
      })
    }
  }

  if (customVerbasResult) {
    for (const detail of customVerbasResult.details) {
      verbasDetalhadas.push({
        name: `Outras Verbas — ${detail.name}`,
        legalRef: 'CLT art. 457, §1º',
        bruto: detail.bruto,
        juros: detail.juros,
        corrigido: detail.corrigido,
        total: detail.total,
      })
    }
    if (customVerbasReflexosValue > 0) {
      verbasDetalhadas.push({
        name: 'Reflexos de Outras Verbas',
        legalRef: 'TST Súmula 264',
        bruto: customVerbasReflexosValue,
        juros: interestCustomReflexos,
        corrigido: correctionCustomReflexos.corrected,
        total: round(
          correctionCustomReflexos.corrected + interestCustomReflexos,
        ),
      })
    }
  }

  if (art467Value > 0) {
    verbasDetalhadas.push({
      name: 'Multa Art. 467 CLT',
      legalRef: 'CLT art. 467',
      bruto: art467Value,
      juros: 0,
      corrigido: art467Value,
      total: art467Value,
    })
  }

  if (intervalIntrajornadaValue > 0) {
    verbasDetalhadas.push({
      name: 'Intervalo Intrajornada (Art. 71 §4)',
      legalRef: 'CLT art. 71, §4º',
      bruto: intervalIntrajornadaValue,
      juros: 0,
      corrigido: intervalIntrajornadaValue,
      total: intervalIntrajornadaValue,
    })
  }

  if (transferAdditionalValue > 0) {
    verbasDetalhadas.push({
      name: 'Adicional de Transferência (Art. 469 §3)',
      legalRef: 'CLT art. 469, §3º',
      bruto: transferAdditionalValue,
      juros: 0,
      corrigido: transferAdditionalValue,
      total: transferAdditionalValue,
    })
  }

  if (dsrValue > 0) {
    verbasDetalhadas.push({
      name: 'DSR sobre Horas Extras (Súm. 172)',
      legalRef: 'TST Súmula 172',
      bruto: dsrValue,
      juros: 0,
      corrigido: dsrValue,
      total: dsrValue,
    })
  }

  if (stabilityValue > 0) {
    verbasDetalhadas.push({
      name: 'Estabilidade Indenizada',
      legalRef: 'TST Súmula 396',
      bruto: stabilityValue,
      juros: 0,
      corrigido: stabilityValue,
      total: stabilityValue,
    })
  }

  if (deductionsValue > 0) {
    verbasDetalhadas.push({
      name: 'Abatimentos (FGTS depositado / verbas pagas)',
      legalRef: 'CLT art. 477, §5º',
      bruto: -deductionsValue,
      juros: 0,
      corrigido: -deductionsValue,
      total: -deductionsValue,
    })
  }

  return {
    priorNoticeValue,
    thirteenthSalaryValue,
    vacationValue,
    fgtsValue,
    fgtsFineValue,
    unemploymentInsuranceValue,
    extraHoursValue,
    nightAdditionalValue,
    insalubrityValue,
    dangerousWorkValue,
    art477FineValue,
    reflexo13thValue,
    reflexoVacationValue,
    reflexoFGTSValue,
    reflexoMultaFGTSValue,
    doubleVacationValue,
    totalValue,
    saldoSalarioValue,
    salaryDifferenceValue,
    salaryDifferenceReflexosValue,
    salaryDifferenceDetail: diffDetail,
    customVerbasDetail: customVerbasResult?.details ?? [],
    outrasVerbasValue,
    customVerbasReflexosValue,
    art467Value,
    intervalIntrajornadaValue,
    transferAdditionalValue,
    dsrValue,
    stabilityValue,
    deductionsValue,
    prescricao: applyPrescricaoQuinquenal
      ? {
          applied: true,
          cutoffMonth: cutoffKey ?? '',
          monthsCut: prescricaoMonthsCut,
        }
      : undefined,
    correction: {
      priorNotice: correctionPriorNotice,
      thirteenthSalary: correction13th,
      vacation: correctionVacation,
      art477Fine: correctionArt477,
      saldoSalario: correctionSaldo,
      salaryMonths: salaryMonthEntries,
      salaryDifference: correctionSalaryDiff,
      art467: correctionArt467,
      fgts: {
        original: round(fgtsResult.totalDeposit),
        correctionFactor:
          fgtsResult.totalCorrected / (fgtsResult.totalDeposit || 1),
        corrected: round(fgtsResult.totalCorrected),
        correctionAmount: round(
          fgtsResult.totalCorrected - fgtsResult.totalDeposit,
        ),
      },
      fgtsFine: {
        original: fgtsFineValue,
        correctionFactor: fgtsFineCorrected / (fgtsFineValue || 1),
        corrected: fgtsFineCorrected,
        correctionAmount: round(fgtsFineCorrected - fgtsFineValue),
      },
    },
    interest: {
      priorNotice: interestPriorNotice,
      thirteenthSalary: interest13th,
      vacation: interestVacation,
      art477Fine: interestArt477,
      saldoSalario: interestSaldo,
      salaryMonths: salaryMonthInterest,
      fgts: interestFgts,
      fgtsFine: interestFgtsFine,
      salaryDifference: interestSalaryDifference,
      customVerbas: interestCustomVerbas,
      total: totalInterest,
    },
    fgtsDetail: fgtsResult,
    inssEmployee: inssEmployeeValue,
    inssEmployer: round(inssEmployerResult.totalEmployer),
    satRat: round(inssEmployerResult.totalSat),
    irpf: irpfResult.taxDue,
    custasJudiciais: custasResult.total,
    honorariosSucumbencia: honorariosResult.honorarios,
    honorariosIrpf: honorariosResult.irpf,
    honorariosLiquidos: honorariosResult.liquido,
    brutoDevidoReclamante,
    totalDescontos,
    liquidoDevidoReclamante,
    totalDevidoReclamado,
    percentualRemuneratorio,
    verbasDetalhadas,
  }
}
