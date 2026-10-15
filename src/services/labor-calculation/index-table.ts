export type IndexEntry = {
  month: string
  ipcaE: number
  ipcaECumulative: number
  selic: number
  selicCumulative: number
  trd: number
}

export type IndexTable = Map<string, IndexEntry>

export function createIndexTable(entries: IndexEntry[]): IndexTable {
  const table = new Map<string, IndexEntry>()
  for (const entry of entries) {
    table.set(entry.month, entry)
  }
  return table
}

export function getCorrectionFactor(
  table: IndexTable,
  dueMonth: string,
  liquidationMonth: string,
): number {
  if (dueMonth >= liquidationMonth) return 1
  const dueEntry = table.get(dueMonth)
  const liquidEntry = table.get(liquidationMonth)
  if (!dueEntry || !liquidEntry) return 1
  const factorDue = dueEntry.ipcaECumulative
  const factorLiquid = liquidEntry.ipcaECumulative
  if (!factorDue || !factorLiquid) return 1
  return factorLiquid / factorDue
}

export function getSelicCumulative(
  table: IndexTable,
  fromMonth: string,
  toMonth: string,
): number {
  const fromEntry = table.get(fromMonth)
  const toEntry = table.get(toMonth)
  if (!fromEntry || !toEntry) return 1
  if (!fromEntry.selicCumulative || !toEntry.selicCumulative) return 1
  return toEntry.selicCumulative / fromEntry.selicCumulative
}

export function getTrdRate(table: IndexTable, month: string): number {
  const entry = table.get(month)
  return entry?.trd ?? 0
}

// ADC 58: TRD (simple interest) until 2024-12; SELIC (cumulative) from 2025-01.
export const ADC58_CUTOFF_MONTH = '2024-12'

function nextMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

// Returns total interest rate as decimal (e.g. 0.05 = 5%) per ADC 58 rules.
// dueMonthKey: month when verb was due; interest accrues from the following month.
export function calculateAdc58InterestRate(
  table: IndexTable,
  dueMonthKey: string,
  liquidationMonthKey: string,
): number {
  if (dueMonthKey >= liquidationMonthKey) return 0

  let totalRate = 0

  if (dueMonthKey < ADC58_CUTOFF_MONTH) {
    // 'YYYY-MM' keys compare lexicographically in chronological order, so the
    // TRD window runs from the month after the due date up to the earlier of
    // the liquidation month or the ADC 58 cutoff (2024-12). Previously this used
    // Number('YYYY-MM'), which is NaN — the loop never ran and TRD was silently
    // dropped, leaving only the SELIC term.
    const trdEnd =
      liquidationMonthKey < ADC58_CUTOFF_MONTH
        ? liquidationMonthKey
        : ADC58_CUTOFF_MONTH
    let current = nextMonthKey(dueMonthKey)
    while (current <= trdEnd) {
      totalRate += (table.get(current)?.trd ?? 0) / 100
      current = nextMonthKey(current)
    }
  }

  const selicStart =
    dueMonthKey < ADC58_CUTOFF_MONTH
      ? nextMonthKey(ADC58_CUTOFF_MONTH)
      : nextMonthKey(dueMonthKey)
  if (selicStart <= liquidationMonthKey) {
    const fromEntry = table.get(selicStart)
    const toEntry = table.get(liquidationMonthKey)
    if (fromEntry?.selicCumulative && toEntry?.selicCumulative) {
      totalRate += toEntry.selicCumulative / fromEntry.selicCumulative - 1
    }
  }

  return totalRate
}

export const DEFAULT_IPCA_E_DATA: IndexEntry[] = [
  {
    month: '2024-01',
    ipcaE: 0.42,
    ipcaECumulative: 1,
    selic: 0.72,
    selicCumulative: 1,
    trd: 0.08,
  },
  {
    month: '2024-02',
    ipcaE: 0.83,
    ipcaECumulative: 1.0042,
    selic: 0.72,
    selicCumulative: 1.0072,
    trd: 0.08,
  },
  {
    month: '2024-03',
    ipcaE: 0.16,
    ipcaECumulative: 1.0126,
    selic: 0.72,
    selicCumulative: 1.0144,
    trd: 0.08,
  },
  {
    month: '2024-04',
    ipcaE: 0.32,
    ipcaECumulative: 1.0142,
    selic: 0.73,
    selicCumulative: 1.0217,
    trd: 0.08,
  },
  {
    month: '2024-05',
    ipcaE: 0.46,
    ipcaECumulative: 1.0174,
    selic: 0.73,
    selicCumulative: 1.0291,
    trd: 0.08,
  },
  {
    month: '2024-06',
    ipcaE: 0.21,
    ipcaECumulative: 1.0221,
    selic: 0.73,
    selicCumulative: 1.0365,
    trd: 0.08,
  },
  {
    month: '2024-07',
    ipcaE: 0.38,
    ipcaECumulative: 1.0242,
    selic: 0.73,
    selicCumulative: 1.0439,
    trd: 0.08,
  },
  {
    month: '2024-08',
    ipcaE: -0.02,
    ipcaECumulative: 1.0281,
    selic: 0.73,
    selicCumulative: 1.0514,
    trd: 0.08,
  },
  {
    month: '2024-09',
    ipcaE: 0.54,
    ipcaECumulative: 1.0279,
    selic: 0.73,
    selicCumulative: 1.0589,
    trd: 0.08,
  },
  {
    month: '2024-10',
    ipcaE: 0.56,
    ipcaECumulative: 1.0334,
    selic: 0.73,
    selicCumulative: 1.0664,
    trd: 0.08,
  },
  {
    month: '2024-11',
    ipcaE: 0.39,
    ipcaECumulative: 1.0392,
    selic: 0.73,
    selicCumulative: 1.0739,
    trd: 0.08,
  },
  {
    month: '2024-12',
    ipcaE: 0.59,
    ipcaECumulative: 1.0432,
    selic: 0.73,
    selicCumulative: 1.0815,
    trd: 0.08,
  },
  {
    month: '2025-01',
    ipcaE: 0.62,
    ipcaECumulative: 1.0493,
    selic: 0.73,
    selicCumulative: 1.0891,
    trd: 0.07,
  },
  {
    month: '2025-02',
    ipcaE: 0.69,
    ipcaECumulative: 1.0558,
    selic: 0.73,
    selicCumulative: 1.0968,
    trd: 0.07,
  },
  {
    month: '2025-03',
    ipcaE: 0.35,
    ipcaECumulative: 1.0629,
    selic: 0.73,
    selicCumulative: 1.1045,
    trd: 0.07,
  },
  {
    month: '2025-04',
    ipcaE: 0.33,
    ipcaECumulative: 1.0664,
    selic: 0.73,
    selicCumulative: 1.1122,
    trd: 0.07,
  },
  {
    month: '2025-05',
    ipcaE: 0.42,
    ipcaECumulative: 1.0698,
    selic: 0.73,
    selicCumulative: 1.1199,
    trd: 0.07,
  },
  {
    month: '2025-06',
    ipcaE: 0.26,
    ipcaECumulative: 1.0741,
    selic: 0.73,
    selicCumulative: 1.1277,
    trd: 0.07,
  },
  {
    month: '2025-07',
    ipcaE: 0.28,
    ipcaECumulative: 1.0768,
    selic: 0.73,
    selicCumulative: 1.1355,
    trd: 0.07,
  },
  {
    month: '2025-08',
    ipcaE: -0.12,
    ipcaECumulative: 1.0797,
    selic: 0.73,
    selicCumulative: 1.1433,
    trd: 0.07,
  },
  {
    month: '2025-09',
    ipcaE: 0.51,
    ipcaECumulative: 1.0785,
    selic: 0.73,
    selicCumulative: 1.1511,
    trd: 0.07,
  },
  {
    month: '2025-10',
    ipcaE: 0.47,
    ipcaECumulative: 1.0837,
    selic: 0.73,
    selicCumulative: 1.159,
    trd: 0.07,
  },
  {
    month: '2025-11',
    ipcaE: 0.41,
    ipcaECumulative: 1.0885,
    selic: 0.73,
    selicCumulative: 1.167,
    trd: 0.07,
  },
  {
    month: '2025-12',
    ipcaE: 0.55,
    ipcaECumulative: 1.0927,
    selic: 0.73,
    selicCumulative: 1.175,
    trd: 0.07,
  },
  {
    month: '2026-01',
    ipcaE: 0.58,
    ipcaECumulative: 1.0983,
    selic: 0.72,
    selicCumulative: 1.183,
    trd: 0.07,
  },
  {
    month: '2026-02',
    ipcaE: 0.52,
    ipcaECumulative: 1.1042,
    selic: 0.72,
    selicCumulative: 1.1909,
    trd: 0.07,
  },
  {
    month: '2026-03',
    ipcaE: 0.38,
    ipcaECumulative: 1.1095,
    selic: 0.72,
    selicCumulative: 1.1988,
    trd: 0.07,
  },
]

export const defaultIndexTable = createIndexTable(DEFAULT_IPCA_E_DATA)
