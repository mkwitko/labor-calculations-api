import { prisma } from 'prisma/prisma'

export type ApiCalculationView = {
  id: string
  engineVersion: string | null
  indexSnapshotHash: string | null
  totals: {
    brutoDevidoReclamante: string
    liquidoDevidoReclamante: string
  }
  verbas: Array<{
    name: string
    legalRef: string | null
    bruto: string
    corrigido: string
    juros: string
    total: string
  }>
}

/**
 * A resposta pública do cálculo. `engineVersion` e `indexSnapshotHash` são o
 * produto: sem eles o cliente recebe um número que ninguém consegue reconferir.
 *
 * Os dois são nuláveis no schema porque cálculo anterior à Frente 1 não tem
 * procedência — pela API isso não acontece, já que todo cálculo nasce agora,
 * mas o tipo acompanha o banco em vez de mentir.
 */
export async function buildApiCalculationView(
  calculationId: string,
): Promise<ApiCalculationView | null> {
  const calculation = await prisma.laborCalculation.findFirst({
    where: { id: calculationId, deletedAt: null },
    select: {
      id: true,
      engineVersion: true,
      indexSnapshot: { select: { hash: true } },
      brutoDevidoReclamante: true,
      liquidoDevidoReclamante: true,
      verbaLines: {
        orderBy: { order: 'asc' },
        select: {
          name: true,
          legalRef: true,
          bruto: true,
          corrigido: true,
          juros: true,
          total: true,
        },
      },
    },
  })

  if (!calculation) return null

  return {
    id: calculation.id,
    engineVersion: calculation.engineVersion,
    indexSnapshotHash: calculation.indexSnapshot?.hash ?? null,
    totals: {
      brutoDevidoReclamante: String(calculation.brutoDevidoReclamante),
      liquidoDevidoReclamante: String(calculation.liquidoDevidoReclamante),
    },
    verbas: calculation.verbaLines.map((line) => ({
      name: line.name,
      legalRef: line.legalRef,
      bruto: String(line.bruto),
      corrigido: String(line.corrigido),
      juros: String(line.juros),
      total: String(line.total),
    })),
  }
}
