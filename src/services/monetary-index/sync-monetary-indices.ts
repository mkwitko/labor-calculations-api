import { systemPrisma as prisma } from 'prisma/prisma'

// Banco Central "Sistema Gerenciador de Séries Temporais" (SGS) — public,
// no auth. Monthly series used by the labor correction engine:
//   433  → IPCA, variação mensal (%). The engine's `ipcaE` column was built
//          from this series (validated vs the TRT-12 PDF: 2024-01=0.42,
//          02=0.83, 03=0.16 match série 433, not IPCA-15/7478).
//   4390 → Selic acumulada no mês (% a.m.)
//   7811 → TR (Taxa Referencial), variação mensal (%)
const SGS = {
  ipcaE: 433,
  selic: 4390,
  trd: 7811,
} as const

// Correction base month (matches the engine's DEFAULT table): cumulative = 1.
const BASE_MONTH = '2024-01'
const BASE_START = '01/01/2024'

type SgsPoint = { data: string; valor: string }

function toMonthKey(ddmmyyyy: string): string {
  // BCB returns dd/mm/yyyy; monthly series are stamped on day 01.
  const [, mm, yyyy] = ddmmyyyy.split('/')
  return `${yyyy}-${mm}`
}

async function fetchSeries(code: number): Promise<Map<string, number>> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${BASE_START}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`BCB SGS ${code} responded ${res.status}`)
  }
  const points = (await res.json()) as SgsPoint[]
  const map = new Map<string, number>()
  for (const p of points) {
    const value = Number(p.valor)
    if (Number.isFinite(value)) map.set(toMonthKey(p.data), value)
  }
  return map
}

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8
}

export type SyncResult = {
  monthsUpserted: number
  skippedManual: number
  latestMonth: string | null
}

// Pulls official indices from Banco Central and rebuilds the global
// MonetaryIndex table. Cumulative factors are chained from BASE_MONTH so they
// stay internally consistent. Rows an admin edited by hand (source='manual')
// are never overwritten.
export async function syncMonetaryIndices(): Promise<SyncResult> {
  const [ipca, selic, trd] = await Promise.all([
    fetchSeries(SGS.ipcaE),
    fetchSeries(SGS.selic),
    fetchSeries(SGS.trd),
  ])

  // Contiguous months from BASE where every series has data.
  const months: string[] = []
  const [baseYear, baseMonth] = BASE_MONTH.split('-').map(Number)
  let y = baseYear
  let m = baseMonth
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    if (!(ipca.has(key) && selic.has(key) && trd.has(key))) break
    months.push(key)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }

  const manualMonths = new Set(
    (
      await prisma.monetaryIndex.findMany({
        where: { source: 'manual' },
        select: { month: true },
      })
    ).map(
      (r) =>
        `${r.month.getUTCFullYear()}-${String(r.month.getUTCMonth() + 1).padStart(2, '0')}`,
    ),
  )

  let ipcaCum = 1
  let selicCum = 1
  let monthsUpserted = 0
  let skippedManual = 0

  for (let i = 0; i < months.length; i++) {
    const month = months[i]
    if (i > 0) {
      const prev = months[i - 1]
      ipcaCum *= 1 + (ipca.get(prev) ?? 0) / 100
      selicCum *= 1 + (selic.get(prev) ?? 0) / 100
    }

    if (manualMonths.has(month)) {
      skippedManual += 1
      continue
    }

    const date = new Date(`${month}-01T00:00:00.000Z`)
    const data = {
      ipcaE: ipca.get(month) ?? 0,
      ipcaECumulative: round8(ipcaCum),
      selic: selic.get(month) ?? 0,
      selicCumulative: round8(selicCum),
      trd: trd.get(month) ?? 0,
      source: 'bcb',
    }
    await prisma.monetaryIndex.upsert({
      where: { month: date },
      create: { month: date, ...data },
      update: data,
    })
    monthsUpserted += 1
  }

  return {
    monthsUpserted,
    skippedManual,
    latestMonth: months.at(-1) ?? null,
  }
}
