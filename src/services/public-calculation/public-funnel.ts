import { systemPrisma } from 'prisma/prisma'
import { MS_PER_DAY } from '@/utils/constants'

export type FunnelSourceRow = {
  source: string
  created: number
  withContact: number
  claimed: number
}

export type FunnelPerspectiveRow = {
  perspective: string
  created: number
  withContact: number
  claimed: number
}

export type PublicFunnel = {
  range: { days: number; since: Date }
  totals: {
    created: number
    withContact: number
    claimed: number
    contactRate: number
    claimRate: number
  }
  bySource: FunnelSourceRow[]
  byPerspective: FunnelPerspectiveRow[]
  daily: { date: string; created: number; claimed: number }[]
  medianHoursToClaim: number | null
}

/** Deixou qualquer forma de contato — nome sozinho já ajuda o advogado. */
const HAS_CONTACT = {
  OR: [
    { name: { not: null } },
    { email: { not: null } },
    { phone: { not: null } },
  ],
}

function rate(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole
}

/**
 * O funil público, atravessando organizações.
 *
 * Tudo aqui é `systemPrisma` de propósito: a extension de tenant escoparia os
 * números à organização de quem consultou, e a pergunta é justamente quantas
 * pessoas de fora entraram e quantos escritórios diferentes as reivindicaram.
 */
export async function getPublicFunnel(days: number): Promise<PublicFunnel> {
  const since = new Date(Date.now() - days * MS_PER_DAY)
  const window = { createdAt: { gte: since } }

  const [created, withContact, claimed] = await Promise.all([
    systemPrisma.publicCalculation.count({ where: window }),
    systemPrisma.publicCalculation.count({
      where: { ...window, ...HAS_CONTACT },
    }),
    systemPrisma.publicCalculation.count({
      where: { ...window, claimedByOrganizationId: { not: null } },
    }),
  ])

  const [createdBySource, contactBySource, claimedBySource] = await Promise.all(
    [
      systemPrisma.publicCalculation.groupBy({
        by: ['source'],
        where: window,
        _count: { _all: true },
      }),
      systemPrisma.publicCalculation.groupBy({
        by: ['source'],
        where: { ...window, ...HAS_CONTACT },
        _count: { _all: true },
      }),
      systemPrisma.publicCalculation.groupBy({
        by: ['source'],
        where: { ...window, claimedByOrganizationId: { not: null } },
        _count: { _all: true },
      }),
    ],
  )

  const countOf = (
    rows: { source: string; _count: { _all: number } }[],
    source: string,
  ) => rows.find((row) => row.source === source)?._count._all ?? 0

  const bySource: FunnelSourceRow[] = createdBySource
    .map((row) => ({
      source: row.source,
      created: row._count._all,
      withContact: countOf(contactBySource, row.source),
      claimed: countOf(claimedBySource, row.source),
    }))
    .sort((a, b) => b.created - a.created)

  // Trabalhador e empresa entram pelo mesmo endpoint; sem esta quebra, um pico
  // de cálculos não diz de qual público veio.
  const [createdByPerspective, contactByPerspective, claimedByPerspective] =
    await Promise.all([
      systemPrisma.publicCalculation.groupBy({
        by: ['perspective'],
        where: window,
        _count: { _all: true },
      }),
      systemPrisma.publicCalculation.groupBy({
        by: ['perspective'],
        where: { ...window, ...HAS_CONTACT },
        _count: { _all: true },
      }),
      systemPrisma.publicCalculation.groupBy({
        by: ['perspective'],
        where: { ...window, claimedByOrganizationId: { not: null } },
        _count: { _all: true },
      }),
    ])

  const countByPerspective = (
    rows: { perspective: string; _count: { _all: number } }[],
    perspective: string,
  ) => rows.find((row) => row.perspective === perspective)?._count._all ?? 0

  const byPerspective: FunnelPerspectiveRow[] = createdByPerspective
    .map((row) => ({
      perspective: row.perspective,
      created: row._count._all,
      withContact: countByPerspective(contactByPerspective, row.perspective),
      claimed: countByPerspective(claimedByPerspective, row.perspective),
    }))
    .sort((a, b) => b.created - a.created)

  const dailyRows = await systemPrisma.$queryRaw<
    { date: Date; created: bigint; claimed: bigint }[]
  >`
    SELECT date_trunc('day', "createdAt") AS date,
           count(*) AS created,
           count("claimedByOrganizationId") AS claimed
    FROM "PublicCalculation"
    WHERE "createdAt" >= ${since}
    GROUP BY 1
    ORDER BY 1
  `

  // Mediana, não média: um cálculo reivindicado três meses depois puxaria a
  // média inteira e esconderia o comportamento típico.
  const medianRows = await systemPrisma.$queryRaw<{ hours: number | null }[]>`
    SELECT percentile_cont(0.5) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM ("claimedAt" - "createdAt")) / 3600
           ) AS hours
    FROM "PublicCalculation"
    WHERE "createdAt" >= ${since} AND "claimedAt" IS NOT NULL
  `

  return {
    range: { days, since },
    totals: {
      created,
      withContact,
      claimed,
      contactRate: rate(withContact, created),
      claimRate: rate(claimed, created),
    },
    bySource,
    byPerspective,
    daily: dailyRows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      created: Number(row.created),
      claimed: Number(row.claimed),
    })),
    medianHoursToClaim:
      medianRows[0]?.hours === null || medianRows[0]?.hours === undefined
        ? null
        : Number(medianRows[0].hours),
  }
}
