import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { systemPrisma } from 'prisma/prisma'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import {
  createIndexTable,
  type IndexEntry,
  type IndexTable,
} from './index-table'
import { loadIndexTable } from './load-index-table'

/**
 * Procedência do cálculo.
 *
 * `MonetaryIndex` é global e mutável — é o que permite o escritório manter
 * IPCA-E/SELIC/TR em dia. O efeito colateral é que recalcular um cálculo já
 * salvo produziria outro total, sem que ninguém tivesse mudado um input. O
 * snapshot congela a tabela usada para que o cálculo seja reproduzível, e a
 * mudança de índices passe a ser um ato explícito (ver reindexação).
 *
 * Snapshots são deduplicados por hash: milhares de cálculos que usam a mesma
 * tabela apontam para uma linha só.
 */

// Casas suficientes para os fatores acumulados (Decimal(18,8) no banco) sem
// carregar ruído de ponto flutuante para dentro do hash.
const SCALE = 8

function canonicalize(entries: IndexEntry[]): string {
  return entries
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((e) =>
      [
        e.month,
        e.ipcaE.toFixed(SCALE),
        e.ipcaECumulative.toFixed(SCALE),
        e.selic.toFixed(SCALE),
        e.selicCumulative.toFixed(SCALE),
        e.trd.toFixed(SCALE),
      ].join('|'),
    )
    .join('\n')
}

/**
 * Identidade da tabela de índices. Insensível à ordem das entradas e à
 * representação do número; sensível a qualquer mudança de valor ou de elenco
 * de meses.
 */
export function hashIndexTable(entries: IndexEntry[]): string {
  return createHash('sha256').update(canonicalize(entries)).digest('hex')
}

function toEntries(table: IndexTable): IndexEntry[] {
  return [...table.values()].sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * Carrega a tabela vigente e garante que exista um snapshot dela.
 * Usar no create de um cálculo — nunca no update, que deve reusar o snapshot
 * já gravado (é o que impede a edição de mexer no total).
 */
export async function resolveIndexTable(): Promise<{
  table: IndexTable
  snapshotId: string
  hash: string
}> {
  const table = await loadIndexTable()
  const entries = toEntries(table)
  const hash = hashIndexTable(entries)

  const data = {
    hash,
    entries: entries as unknown as Prisma.InputJsonValue,
    entryCount: entries.length,
    minMonth: entries[0]?.month ?? '',
    maxMonth: entries[entries.length - 1]?.month ?? '',
  }

  try {
    const snapshot = await systemPrisma.indexTableSnapshot.upsert({
      where: { hash },
      create: data,
      update: {},
    })
    return { table, snapshotId: snapshot.id, hash }
  } catch (error) {
    // Duas resoluções concorrentes da mesma tabela: o upsert perde a corrida
    // entre o SELECT e o INSERT e estoura unique violation. A linha que o outro
    // gravou é exatamente a que queríamos.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await systemPrisma.indexTableSnapshot.findUniqueOrThrow({
        where: { hash },
      })
      return { table, snapshotId: existing.id, hash }
    }
    throw error
  }
}

/**
 * Reidrata a tabela congelada de um cálculo. O resultado é idêntico ao que o
 * motor consumiu na primeira vez, independente do estado atual de
 * `MonetaryIndex`.
 */
export async function loadSnapshotTable(
  snapshotId: string,
): Promise<IndexTable> {
  const snapshot = await systemPrisma.indexTableSnapshot.findUnique({
    where: { id: snapshotId },
  })

  if (!snapshot) {
    throw new ResourceNotFoundException(
      'Snapshot de índices monetários não encontrado',
    )
  }

  return createIndexTable(snapshot.entries as unknown as IndexEntry[])
}
