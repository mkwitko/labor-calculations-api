import { describe, expect, it } from 'vitest'
import type { LaborCalculationInputV3 } from '@/@types/labor-calculation-v3'
import { calculateLaborV3 } from './labor-calculation-v3'

const round = (v: number) => Math.round(v * 100) / 100

describe('labor-calculation-v3 (court document validation)', () => {
  const courtInput: LaborCalculationInputV3 = {
    clientName: 'Reclamante',
    startDate: new Date('2024-12-04'),
    endDate: new Date('2025-11-14'),
    lastSalary: 2881.72,
    baseSalary: 2474.51,
    unpaid13ths: 0,
    vacationCount: 0,
    vacationVencidasCount: 0,
    priorNoticeWorked: false,
    extraHours: 0,
    nightHours: 0,
    insalubrityLevel: 0,
    dangerousWork: false,
    lastThreeSalariesAvg: 2881.72,
    terminationType: 'sem_justa_causa',
    applyArt477Fine: true,
    filingDate: new Date('2025-09-18'),
    liquidationDate: new Date('2026-03-31'),
    nightAdditionalPercent: 20,
    satRate: 0.03,
    employerInssRate: 0.2,
    honorariosRate: 0.15,
    irpfDependents: 0,
  }

  it('calculates aviso prévio indenizado correctly', () => {
    const result = calculateLaborV3(courtInput)
    expect(result.priorNoticeValue).toBeGreaterThan(0)
    expect(result.priorNoticeValue).toBeCloseTo(round((2881.72 / 30) * 30), 1)
  })

  it('calculates 13º salário proportional with aviso projection', () => {
    const result = calculateLaborV3(courtInput)
    expect(result.thirteenthSalaryValue).toBeGreaterThan(0)
    // 11 avos: Jan–Nov 2025 (calendar year, ≥15-day rule). Dec 2025 projected end = day 14 < 15 → excluded.
    expect(result.thirteenthSalaryValue).toBeCloseTo(
      round((2881.72 / 12) * 11),
      0,
    )
  })

  it('calculates férias proporcionais + 1/3', () => {
    const result = calculateLaborV3(courtInput)
    expect(result.vacationValue).toBeGreaterThan(0)
  })

  it('calculates Art. 477 fine using lastSalary', () => {
    const result = calculateLaborV3(courtInput)
    expect(result.art477FineValue).toBe(2881.72)
  })

  it('calculates FGTS with month-by-month approach', () => {
    const result = calculateLaborV3(courtInput)
    expect(result.fgtsValue).toBeGreaterThan(0)
    expect(result.fgtsDetail.monthlyEntries.length).toBeGreaterThanOrEqual(11)
    expect(result.fgtsDetail.totalDeposit).toBeGreaterThan(0)
    expect(result.fgtsDetail.totalCorrected).toBeGreaterThanOrEqual(
      result.fgtsDetail.totalDeposit,
    )
  })

  it('calculates 40% FGTS fine on corrected total', () => {
    const result = calculateLaborV3(courtInput)
    expect(result.fgtsFineValue).toBeGreaterThan(0)
    expect(result.fgtsFineValue).toBeCloseTo(
      round(result.fgtsDetail.fineValue),
      1,
    )
  })

  it('applies monetary correction to all verbs', () => {
    const result = calculateLaborV3(courtInput)
    expect(result.correction.thirteenthSalary.corrected).toBeGreaterThanOrEqual(
      result.thirteenthSalaryValue,
    )
    expect(result.correction.priorNotice.corrected).toBeGreaterThanOrEqual(
      result.priorNoticeValue,
    )
    expect(result.correction.vacation.corrected).toBeGreaterThanOrEqual(
      result.vacationValue,
    )
  })

  it('calculates juros de mora', () => {
    const result = calculateLaborV3(courtInput)
    expect(result.interest.total).toBeGreaterThan(0)
    expect(result.interest.thirteenthSalary).toBeGreaterThan(0)
    expect(result.interest.priorNotice).toBeGreaterThan(0)
  })

  it('calculates INSS employee discount', () => {
    const result = calculateLaborV3(courtInput)
    expect(result.inssEmployee).toBeGreaterThan(0)
    expect(result.inssEmployee).toBeLessThanOrEqual(951.63)
  })

  it('calculates INSS employer + SAT', () => {
    const result = calculateLaborV3(courtInput)
    expect(result.inssEmployer).toBeGreaterThan(0)
    expect(result.satRat).toBeGreaterThan(0)
  })

  it('calculates IRPF', () => {
    const result = calculateLaborV3(courtInput)
    expect(result.irpf).toBeGreaterThanOrEqual(0)
  })

  it('calculates custas judiciais', () => {
    const result = calculateLaborV3(courtInput)
    expect(result.custasJudiciais).toBeGreaterThan(0)
  })

  it('calculates honorários sucumbência with IRPF deduction', () => {
    const result = calculateLaborV3(courtInput)
    expect(result.honorariosSucumbencia).toBeGreaterThan(0)
    expect(result.honorariosIrpf).toBeGreaterThan(0)
    expect(result.honorariosLiquidos).toBeLessThan(result.honorariosSucumbencia)
  })

  it('bruto devido reclamante > total bruto', () => {
    const result = calculateLaborV3(courtInput)
    expect(result.brutoDevidoReclamante).toBeGreaterThan(0)
  })

  it('liquido devido reclamante = bruto - descontos', () => {
    const result = calculateLaborV3(courtInput)
    expect(result.liquidoDevidoReclamante).toBeCloseTo(
      round(result.brutoDevidoReclamante - result.totalDescontos),
      1,
    )
  })

  it('total devido reclamado includes everything', () => {
    const result = calculateLaborV3(courtInput)
    expect(result.totalDevidoReclamado).toBeGreaterThan(
      result.liquidoDevidoReclamante,
    )
  })

  it('verbas detalhadas has all 7 entries', () => {
    const result = calculateLaborV3(courtInput)
    expect(result.verbasDetalhadas).toHaveLength(7)
    for (const v of result.verbasDetalhadas) {
      expect(v.name).toBeTruthy()
      expect(v.total).toBeGreaterThanOrEqual(v.bruto)
    }
  })
})

describe('labor-calculation-v3 (com_justa_causa)', () => {
  const input: LaborCalculationInputV3 = {
    clientName: 'Test',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2025-06-30'),
    lastSalary: 3000,
    baseSalary: 2500,
    unpaid13ths: 0,
    vacationCount: 0,
    vacationVencidasCount: 1,
    priorNoticeWorked: true,
    extraHours: 0,
    nightHours: 0,
    insalubrityLevel: 0,
    dangerousWork: false,
    lastThreeSalariesAvg: 3000,
    terminationType: 'com_justa_causa',
    applyArt477Fine: false,
  }

  it('no aviso prévio for com_justa_causa', () => {
    const result = calculateLaborV3(input)
    expect(result.priorNoticeValue).toBe(0)
  })

  it('no 13th for com_justa_causa', () => {
    const result = calculateLaborV3(input)
    expect(result.thirteenthSalaryValue).toBe(0)
  })

  it('no FGTS for com_justa_causa', () => {
    const result = calculateLaborV3(input)
    expect(result.fgtsValue).toBe(0)
    expect(result.fgtsFineValue).toBe(0)
  })

  it('no FGTS fine for com_justa_causa', () => {
    const result = calculateLaborV3(input)
    expect(result.fgtsFineValue).toBe(0)
  })
})

describe('labor-calculation-v3 (rescisao_indireta)', () => {
  const input: LaborCalculationInputV3 = {
    clientName: 'Test',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2025-06-30'),
    lastSalary: 3000,
    baseSalary: 2500,
    unpaid13ths: 0,
    vacationCount: 0,
    vacationVencidasCount: 0,
    priorNoticeWorked: false,
    extraHours: 0,
    nightHours: 0,
    insalubrityLevel: 0,
    dangerousWork: false,
    lastThreeSalariesAvg: 3000,
    terminationType: 'rescisao_indireta',
    applyArt477Fine: true,
  }

  it('rescisao_indireta gets same benefits as sem_justa_causa', () => {
    const result = calculateLaborV3(input)
    expect(result.priorNoticeValue).toBeGreaterThan(0)
    expect(result.thirteenthSalaryValue).toBeGreaterThan(0)
    expect(result.fgtsFineValue).toBeGreaterThan(0)
    expect(result.unemploymentInsuranceValue).toBeGreaterThan(0)
  })
})

describe('labor-calculation-v3 (with salary history)', () => {
  it('uses salary history for FGTS when provided', () => {
    const input: LaborCalculationInputV3 = {
      clientName: 'Test',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-03-31'),
      lastSalary: 3000,
      baseSalary: 2500,
      unpaid13ths: 0,
      vacationCount: 0,
      vacationVencidasCount: 0,
      priorNoticeWorked: false,
      extraHours: 0,
      nightHours: 0,
      insalubrityLevel: 0,
      dangerousWork: false,
      lastThreeSalariesAvg: 3000,
      terminationType: 'sem_justa_causa',
      applyArt477Fine: false,
      salaryHistory: [
        { month: '2025-01', baseSalary: 2500, lastSalary: 2800 },
        { month: '2025-02', baseSalary: 2500, lastSalary: 2900 },
        { month: '2025-03', baseSalary: 2500, lastSalary: 3000 },
      ],
    }
    const result = calculateLaborV3(input)
    expect(result.fgtsDetail.monthlyEntries.length).toBeGreaterThanOrEqual(3)
    expect(result.fgtsDetail.monthlyEntries[0].base).toBe(2800)
    // The 2025-03 entry merges the regular salary, 13th, and aviso prévio FGTS bases,
    // so base >= 3000.
    const marchEntry = result.fgtsDetail.monthlyEntries.find(
      (e) => e.month === '2025-03',
    )
    expect(marchEntry?.base).toBeGreaterThanOrEqual(3000)
  })
})

describe('labor-calculation-v3 (with unpaid salaries)', () => {
  it('calculates saldo de salário', () => {
    const input: LaborCalculationInputV3 = {
      clientName: 'Test',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-03-14'),
      lastSalary: 3000,
      baseSalary: 2500,
      unpaid13ths: 0,
      vacationCount: 0,
      vacationVencidasCount: 0,
      priorNoticeWorked: false,
      extraHours: 0,
      nightHours: 0,
      insalubrityLevel: 0,
      dangerousWork: false,
      lastThreeSalariesAvg: 3000,
      terminationType: 'sem_justa_causa',
      applyArt477Fine: false,
      unpaidSalaries: [{ month: '2025-03', daysWorked: 14 }],
    }
    const result = calculateLaborV3(input)
    expect(result.saldoSalarioValue).toBeGreaterThan(0)
    const daily = round(3000 / 30)
    expect(result.saldoSalarioValue).toBeCloseTo(round(daily * 14), 1)
  })
})

// Precision tests pinned to TRT-12 court document (process 0001198-34.2025.5.12.0003).
// Any regression in these values = wrong calculation law.
describe('labor-calculation-v3 (PDF precision — TRT-12)', () => {
  const pdfInput: LaborCalculationInputV3 = {
    clientName: 'Reclamante',
    startDate: new Date('2024-12-04'),
    endDate: new Date('2025-11-14'),
    lastSalary: 2881.72,
    baseSalary: 2474.51,
    unpaid13ths: 0,
    vacationCount: 0,
    vacationVencidasCount: 0,
    priorNoticeWorked: false,
    extraHours: 0,
    nightHours: 0,
    insalubrityLevel: 0,
    dangerousWork: false,
    lastThreeSalariesAvg: 2881.72,
    terminationType: 'sem_justa_causa',
    applyArt477Fine: true,
    filingDate: new Date('2025-09-18'),
    liquidationDate: new Date('2026-03-31'),
    nightAdditionalPercent: 20,
    satRate: 0.03,
    employerInssRate: 0.2,
    honorariosRate: 0.15,
    irpfDependents: 0,
    unpaidSalaries: [
      { month: '2025-08', daysWorked: 30 },
      { month: '2025-09', daysWorked: 15 },
      { month: '2025-10', daysWorked: 30 },
      { month: '2025-11', daysWorked: 15 },
    ],
  }

  it('13th salary = 11 avos (2641.58) — calendar year, ≥15-day rule', () => {
    const result = calculateLaborV3(pdfInput)
    expect(result.thirteenthSalaryValue).toBeCloseTo(2641.58, 0)
  })

  it('vacation proportional = 12 avos (3842.29) — aquisitive period, ≥15-day rule', () => {
    const result = calculateLaborV3(pdfInput)
    const vacationBase = 2881.72 + 2881.72 / 3
    expect(result.vacationValue).toBeCloseTo(round((vacationBase / 12) * 12), 0)
  })

  it('FGTS fine base = totalCorrected (excludes ADC 58 interest)', () => {
    const result = calculateLaborV3(pdfInput)
    expect(result.fgtsDetail.fineBase).toBeCloseTo(
      result.fgtsDetail.totalCorrected,
      1,
    )
  })
})

// ─── New verbas: equiparação/desvio, outras verbas, art. 467, prescrição ──────

const baseNewVerbasInput: LaborCalculationInputV3 = {
  clientName: 'Test',
  startDate: new Date('2024-12-04'),
  endDate: new Date('2025-11-14'),
  lastSalary: 2881.72,
  baseSalary: 2474.51,
  unpaid13ths: 0,
  vacationCount: 0,
  vacationVencidasCount: 0,
  priorNoticeWorked: false,
  extraHours: 0,
  nightHours: 0,
  insalubrityLevel: 0,
  dangerousWork: false,
  lastThreeSalariesAvg: 2881.72,
  terminationType: 'sem_justa_causa',
  applyArt477Fine: true,
  filingDate: new Date('2025-09-18'),
  liquidationDate: new Date('2026-03-31'),
}

describe('labor-calculation-v3 (salary difference — equiparação/desvio)', () => {
  const diffInput: LaborCalculationInputV3 = {
    ...baseNewVerbasInput,
    salaryDifference: {
      type: 'equiparacao',
      paradigmName: 'Paradigma',
      applyReflexos: true,
      periods: [
        { startMonth: '2025-01', endMonth: '2025-06', dueSalary: 3381.72 },
      ],
    },
  }

  it('computes the nominal difference month by month', () => {
    const result = calculateLaborV3(diffInput)
    // 6 months × (3381.72 − 2881.72) = 3000
    expect(result.salaryDifferenceValue).toBe(3000)
    expect(result.salaryDifferenceDetail?.monthlyEntries).toHaveLength(6)
    expect(result.correction.salaryDifference.corrected).toBeGreaterThanOrEqual(
      3000,
    )
    expect(result.interest.salaryDifference).toBeGreaterThan(0)
  })

  it('increases FGTS exactly by the difference deposits (A/B comparison)', () => {
    const withDiff = calculateLaborV3(diffInput)
    const without = calculateLaborV3(baseNewVerbasInput)
    // deposit delta per month = round((salary+diff)×8%) − round(salary×8%)
    const expectedDelta = round(
      6 * (round(3381.72 * 0.08) - round(2881.72 * 0.08)),
    )
    expect(
      round(withDiff.fgtsDetail.totalDeposit - without.fgtsDetail.totalDeposit),
    ).toBeCloseTo(expectedDelta, 1)
    // 40% fine grows accordingly (over corrected balance)
    expect(withDiff.fgtsFineValue).toBeGreaterThan(without.fgtsFineValue)
  })

  it('generates reflexos on 13º, férias and aviso prévio', () => {
    const result = calculateLaborV3(diffInput)
    const detail = result.salaryDifferenceDetail
    expect(detail?.reflexo13).toBeGreaterThan(0)
    expect(detail?.reflexoVacation).toBeGreaterThan(0)
    expect(detail?.reflexoAviso).toBeGreaterThan(0)
    expect(result.salaryDifferenceReflexosValue).toBeCloseTo(
      round(
        (detail?.reflexo13 ?? 0) +
          (detail?.reflexoVacation ?? 0) +
          (detail?.reflexoAviso ?? 0),
      ),
      1,
    )
  })

  it('raises INSS and IRPF (salary nature)', () => {
    const withDiff = calculateLaborV3(diffInput)
    const without = calculateLaborV3(baseNewVerbasInput)
    expect(withDiff.inssEmployee).toBeGreaterThan(without.inssEmployee)
    expect(withDiff.irpf).toBeGreaterThanOrEqual(without.irpf)
  })

  it('labels the verba by type', () => {
    const equiparacao = calculateLaborV3(diffInput)
    expect(
      equiparacao.verbasDetalhadas.some(
        (v) => v.name === 'Diferenças Salariais (Equiparação Art. 461)',
      ),
    ).toBe(true)
    const desvio = calculateLaborV3({
      ...diffInput,
      salaryDifference: {
        ...diffInput.salaryDifference!,
        type: 'desvio_funcao',
      },
    })
    expect(
      desvio.verbasDetalhadas.some(
        (v) => v.name === 'Diferenças Salariais (Desvio de Função)',
      ),
    ).toBe(true)
  })

  it('skips reflexos when applyReflexos is false', () => {
    const result = calculateLaborV3({
      ...diffInput,
      salaryDifference: {
        ...diffInput.salaryDifference!,
        applyReflexos: false,
      },
    })
    expect(result.salaryDifferenceReflexosValue).toBe(0)
    expect(result.salaryDifferenceValue).toBe(3000)
  })
})

describe('labor-calculation-v3 (outras verbas customizadas)', () => {
  it('indenizatória: principal + correction + interest only, INSS unchanged', () => {
    const result = calculateLaborV3({
      ...baseNewVerbasInput,
      customVerbas: [
        {
          name: 'Vale-transporte não pago',
          monthlyValue: 200,
          startMonth: '2025-01',
          endMonth: '2025-05',
          nature: 'indenizatoria',
        },
      ],
    })
    const base = calculateLaborV3(baseNewVerbasInput)
    expect(result.outrasVerbasValue).toBe(1000)
    expect(result.customVerbasDetail).toHaveLength(1)
    expect(result.customVerbasReflexosValue).toBe(0)
    expect(result.inssEmployee).toBe(base.inssEmployee)
    expect(result.fgtsDetail.totalDeposit).toBe(base.fgtsDetail.totalDeposit)
    expect(
      result.verbasDetalhadas.some(
        (v) => v.name === 'Outras Verbas — Vale-transporte não pago',
      ),
    ).toBe(true)
  })

  it('salarial: feeds FGTS, INSS and generates reflexos', () => {
    const result = calculateLaborV3({
      ...baseNewVerbasInput,
      customVerbas: [
        {
          name: 'Comissões',
          monthlyValue: 400,
          startMonth: '2025-01',
          endMonth: '2025-06',
          nature: 'salarial',
        },
      ],
    })
    const base = calculateLaborV3(baseNewVerbasInput)
    expect(result.outrasVerbasValue).toBe(2400)
    expect(result.fgtsDetail.totalDeposit).toBeGreaterThan(
      base.fgtsDetail.totalDeposit,
    )
    expect(result.inssEmployee).toBeGreaterThan(base.inssEmployee)
    expect(result.customVerbasReflexosValue).toBeGreaterThan(0)
    expect(
      result.verbasDetalhadas.some(
        (v) => v.name === 'Reflexos de Outras Verbas',
      ),
    ).toBe(true)
  })

  it('multiple verbas produce one line each', () => {
    const result = calculateLaborV3({
      ...baseNewVerbasInput,
      customVerbas: [
        {
          name: 'Verba A',
          monthlyValue: 100,
          startMonth: '2025-01',
          endMonth: '2025-02',
          nature: 'indenizatoria',
        },
        {
          name: 'Verba B',
          monthlyValue: 50,
          startMonth: '2025-03',
          endMonth: '2025-04',
          nature: 'indenizatoria',
        },
      ],
    })
    expect(result.customVerbasDetail).toHaveLength(2)
    expect(
      result.verbasDetalhadas.filter((v) =>
        v.name.startsWith('Outras Verbas —'),
      ),
    ).toHaveLength(2)
  })
})

describe('labor-calculation-v3 (art. 467 CLT)', () => {
  it('is zero by default', () => {
    const result = calculateLaborV3(baseNewVerbasInput)
    expect(result.art467Value).toBe(0)
    expect(
      result.verbasDetalhadas.some((v) => v.name === 'Multa Art. 467 CLT'),
    ).toBe(false)
  })

  it('adds exactly 50% over corrected férias + 13º + aviso + multa 40%', () => {
    const result = calculateLaborV3({
      ...baseNewVerbasInput,
      applyArt467: true,
    })
    const expected = round(
      0.5 *
        (result.correction.vacation.corrected +
          result.correction.thirteenthSalary.corrected +
          result.correction.priorNotice.corrected +
          result.correction.fgtsFine.corrected),
    )
    expect(result.art467Value).toBeCloseTo(expected, 1)
    const line = result.verbasDetalhadas.find(
      (v) => v.name === 'Multa Art. 467 CLT',
    )
    expect(line?.juros).toBe(0)
    expect(line?.corrigido).toBe(result.art467Value)
    expect(result.correction.art467.correctionFactor).toBe(1)
  })

  it('does not change INSS or IRPF (indenizatória)', () => {
    const withFine = calculateLaborV3({
      ...baseNewVerbasInput,
      applyArt467: true,
    })
    const without = calculateLaborV3(baseNewVerbasInput)
    expect(withFine.inssEmployee).toBe(without.inssEmployee)
    expect(withFine.irpf).toBe(without.irpf)
  })

  it('shrinks with com_justa_causa (13º/aviso/multa 40% zeroed)', () => {
    const semJusta = calculateLaborV3({
      ...baseNewVerbasInput,
      applyArt467: true,
    })
    const comJusta = calculateLaborV3({
      ...baseNewVerbasInput,
      terminationType: 'com_justa_causa',
      applyArt467: true,
    })
    expect(comJusta.art467Value).toBeLessThan(semJusta.art467Value)
  })
})

describe('labor-calculation-v3 (prescrição quinquenal)', () => {
  const longContractInput: LaborCalculationInputV3 = {
    ...baseNewVerbasInput,
    startDate: new Date('2018-03-01'),
    endDate: new Date('2025-11-14'),
    filingDate: new Date('2025-09-18'),
  }

  it('is off by default (full FGTS history)', () => {
    const result = calculateLaborV3(longContractInput)
    expect(result.prescricao).toBeUndefined()
    expect(result.fgtsDetail.monthlyEntries[0].month).toBe('2018-03')
  })

  it('cuts FGTS months before filingDate − 5 years', () => {
    const result = calculateLaborV3({
      ...longContractInput,
      applyPrescricaoQuinquenal: true,
    })
    // filing 2025-09 → cutoff 2020-09
    expect(result.prescricao?.applied).toBe(true)
    expect(result.prescricao?.cutoffMonth).toBe('2020-09')
    expect(result.fgtsDetail.monthlyEntries[0].month).toBe('2020-09')
    // 2018-03 .. 2020-08 = 30 months cut
    expect(result.prescricao?.monthsCut).toBe(30)
    const full = calculateLaborV3(longContractInput)
    expect(result.fgtsDetail.totalDeposit).toBeLessThan(
      full.fgtsDetail.totalDeposit,
    )
  })

  it('falls back to liquidationDate when filingDate is absent', () => {
    const result = calculateLaborV3({
      ...longContractInput,
      filingDate: undefined,
      applyPrescricaoQuinquenal: true,
    })
    // liquidation 2026-03 → cutoff 2021-03
    expect(result.prescricao?.cutoffMonth).toBe('2021-03')
    expect(result.fgtsDetail.monthlyEntries[0].month).toBe('2021-03')
  })

  it('also cuts salary difference and custom verbas months', () => {
    const result = calculateLaborV3({
      ...longContractInput,
      applyPrescricaoQuinquenal: true,
      salaryDifference: {
        type: 'equiparacao',
        applyReflexos: false,
        periods: [
          { startMonth: '2019-01', endMonth: '2021-12', dueSalary: 3381.72 },
        ],
      },
      customVerbas: [
        {
          name: 'Adicional',
          monthlyValue: 100,
          startMonth: '2019-01',
          endMonth: '2021-12',
          nature: 'indenizatoria',
        },
      ],
    })
    // only 2020-09 .. 2021-12 = 16 months survive
    expect(result.salaryDifferenceDetail?.monthlyEntries[0].month).toBe(
      '2020-09',
    )
    expect(result.salaryDifferenceDetail?.monthlyEntries).toHaveLength(16)
    expect(result.customVerbasDetail[0].monthlyEntries[0].month).toBe('2020-09')
    expect(result.customVerbasDetail[0].monthlyEntries).toHaveLength(16)
    expect(result.outrasVerbasValue).toBe(1600)
  })
})

describe('labor-calculation-v3 (integrated: equiparação + prescrição + 467)', () => {
  it('combines all new verbas coherently', () => {
    const result = calculateLaborV3({
      ...baseNewVerbasInput,
      startDate: new Date('2018-03-01'),
      applyPrescricaoQuinquenal: true,
      applyArt467: true,
      salaryDifference: {
        type: 'equiparacao',
        applyReflexos: true,
        periods: [
          { startMonth: '2019-01', endMonth: '2025-11', dueSalary: 3381.72 },
        ],
      },
      customVerbas: [
        {
          name: 'Comissões',
          monthlyValue: 300,
          startMonth: '2024-01',
          endMonth: '2025-06',
          nature: 'salarial',
        },
      ],
    })
    // prescription cut applies to the diff: 2020-09..2025-11 = 63 months
    expect(result.salaryDifferenceDetail?.monthlyEntries).toHaveLength(63)
    expect(result.salaryDifferenceValue).toBe(round(63 * 500))
    expect(result.outrasVerbasValue).toBe(round(18 * 300))
    expect(result.art467Value).toBeGreaterThan(0)
    // bruto contains every new verba (sanity: strictly greater than base scenario)
    const base = calculateLaborV3({
      ...baseNewVerbasInput,
      startDate: new Date('2018-03-01'),
    })
    expect(result.brutoDevidoReclamante).toBeGreaterThan(
      base.brutoDevidoReclamante,
    )
    // totalValue (nominal) includes principal + reflexos + art 467
    expect(result.totalValue).toBeGreaterThan(base.totalValue)
  })
})

describe('labor-calculation-v3 (intervalo intrajornada + transferência)', () => {
  it('computes intervalo intrajornada (art. 71 §4) as indenizatória', () => {
    const result = calculateLaborV3({
      ...baseNewVerbasInput,
      intervalIntrajornadaHours: 20,
    })
    // hourlyRate = lastSalary/220; value = 20 × hourly × 1.5 × totalMonths
    expect(result.intervalIntrajornadaValue).toBeGreaterThan(0)
    expect(
      result.verbasDetalhadas.some((v) =>
        v.name.startsWith('Intervalo Intrajornada'),
      ),
    ).toBe(true)
    // indenizatória: não muda INSS
    const base = calculateLaborV3(baseNewVerbasInput)
    expect(result.inssEmployee).toBe(base.inssEmployee)
  })

  it('computes adicional de transferência (25% base × meses)', () => {
    const result = calculateLaborV3({
      ...baseNewVerbasInput,
      transferAdditionalMonths: 4,
    })
    expect(result.transferAdditionalValue).toBeCloseTo(
      round(2474.51 * 0.25 * 4),
      1,
    )
  })

  it('is zero by default', () => {
    const result = calculateLaborV3(baseNewVerbasInput)
    expect(result.intervalIntrajornadaValue).toBe(0)
    expect(result.transferAdditionalValue).toBe(0)
  })
})

describe('labor-calculation-v3 (DSR, estabilidade, abatimentos)', () => {
  it('DSR sobre horas extras (Súm. 172) quando ativado', () => {
    const withExtra: LaborCalculationInputV3 = {
      ...baseNewVerbasInput,
      extraHours: 40,
      applyDsrOnExtra: true,
    }
    const result = calculateLaborV3(withExtra)
    expect(result.dsrValue).toBeGreaterThan(0)
    const noDsr = calculateLaborV3({ ...withExtra, applyDsrOnExtra: false })
    expect(noDsr.dsrValue).toBe(0)
  })

  it('estabilidade indenizada soma salários + 13 + férias + FGTS', () => {
    const result = calculateLaborV3({
      ...baseNewVerbasInput,
      stabilityMonths: 5,
    })
    // > salários puros (inclui reflexos)
    expect(result.stabilityValue).toBeGreaterThan(2881.72 * 5)
  })

  it('abatimentos reduzem bruto e total', () => {
    const base = calculateLaborV3(baseNewVerbasInput)
    const withDed = calculateLaborV3({
      ...baseNewVerbasInput,
      fgtsAlreadyDeposited: 1000,
      amountsAlreadyPaid: 500,
    })
    expect(withDed.deductionsValue).toBe(1500)
    expect(withDed.brutoDevidoReclamante).toBeCloseTo(
      round(base.brutoDevidoReclamante - 1500),
      1,
    )
    expect(withDed.totalValue).toBeCloseTo(round(base.totalValue - 1500), 1)
  })

  it('tudo zerado por padrão', () => {
    const result = calculateLaborV3(baseNewVerbasInput)
    expect(result.dsrValue).toBe(0)
    expect(result.stabilityValue).toBe(0)
    expect(result.deductionsValue).toBe(0)
  })
})
