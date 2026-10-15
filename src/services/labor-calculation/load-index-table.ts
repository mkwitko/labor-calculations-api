import { prisma } from 'prisma/prisma'
import {
  createIndexTable,
  DEFAULT_IPCA_E_DATA,
  type IndexEntry,
  type IndexTable,
} from './index-table'

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// Builds the correction index table from the DB (MonetaryIndex), merged over
// the hardcoded defaults so DB rows take precedence. With no DB rows the result
// equals defaultIndexTable — preserving current behavior. This lets the office
// keep IPCA-E/SELIC/TR up to date without a code change.
export async function loadIndexTable(): Promise<IndexTable> {
  const rows = await prisma.monetaryIndex.findMany()
  const byMonth = new Map<string, IndexEntry>()

  for (const e of DEFAULT_IPCA_E_DATA) byMonth.set(e.month, e)

  for (const r of rows) {
    const month = monthKey(r.month)
    byMonth.set(month, {
      month,
      ipcaE: Number(r.ipcaE),
      ipcaECumulative: Number(r.ipcaECumulative),
      selic: Number(r.selic),
      selicCumulative: Number(r.selicCumulative),
      trd: Number(r.trd),
    })
  }

  return createIndexTable([...byMonth.values()])
}
