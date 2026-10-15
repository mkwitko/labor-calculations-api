import { systemPrisma } from 'prisma/prisma'

/**
 * Cálculo de quem não tem conta guarda contato pessoal em texto puro. Passados
 * os 90 dias, ele sai do banco — a não ser que já tenha virado cliente de um
 * escritório, caso em que a origem do cliente precisa continuar rastreável.
 */
export async function purgeExpiredPublicCalculations(): Promise<number> {
  const { count } = await systemPrisma.publicCalculation.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
      clientId: null,
    },
  })

  return count
}
