import { systemPrisma } from 'prisma/prisma'
import type { StoredResult } from '@/services/public-calculation/public-calculation-service'

export type WidgetCalculationSummary = {
  id: string
  /** "rescisao", "horas_extras" ou "ferias_13" — qual calculadora gerou. */
  kind: string
  perspective: string
  /** Faixa do resultado: o que já se prova e o total com o que depende de prova. */
  floor: number
  ceiling: number
  name: string | null
  email: string | null
  phone: string | null
  /** Host do site que hospedava o widget, como o loader reportou. */
  hostSite: string | null
  createdAt: Date
  expiresAt: Date
  claimed: boolean
}

/**
 * O que veio do widget do escritório, mais novo primeiro.
 *
 * `PublicCalculation` é não-tenant (nasce de quem não tem conta), então o filtro
 * por organização é explícito — a extension não injeta nada aqui.
 *
 * Os já importados continuam na lista, marcados: sumir com a linha depois do
 * clique faria a pessoa achar que perdeu o cálculo. Expirados saem, porque o
 * botão de importar já não funcionaria.
 */
export async function listWidgetCalculations(
  organizationId: string,
): Promise<WidgetCalculationSummary[]> {
  const rows = await systemPrisma.publicCalculation.findMany({
    where: {
      widgetOrganizationId: organizationId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      kind: true,
      perspective: true,
      result: true,
      name: true,
      email: true,
      phone: true,
      referrerHost: true,
      createdAt: true,
      expiresAt: true,
      claimedByOrganizationId: true,
    },
  })

  return rows.map((row) => {
    const result = row.result as unknown as StoredResult

    return {
      id: row.id,
      kind: row.kind,
      perspective: row.perspective,
      floor: result.floor,
      ceiling: result.ceiling,
      name: row.name,
      email: row.email,
      phone: row.phone,
      hostSite: row.referrerHost,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      claimed: Boolean(row.claimedByOrganizationId),
    }
  })
}
