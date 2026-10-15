import { systemPrisma } from 'prisma/prisma'

/**
 * `Organization.seats` é projeção de `count(Membership ativos)` — nada mais.
 *
 * Antes dos planos por escritório esse número também era a `quantity` do item da
 * assinatura, e por isso precisava de porta injetável, reconciliação e cron.
 * Agora a assinatura tem quantidade fixa 1 e quem define o que o escritório paga
 * é o plano, então isto voltou a ser um contador: some o Stripe da conta e some
 * a classe inteira de falha silenciosa que vinha junto.
 */

export async function countActiveMembers(
  organizationId: string,
): Promise<number> {
  return systemPrisma.membership.count({
    where: { organizationId, deletedAt: null },
  })
}

/**
 * **Não lança.** Aceitar convite não pode falhar por causa de um contador, e a
 * chamada seguinte converge sozinha — o valor é sempre recalculado do zero,
 * nunca incrementado.
 */
export async function syncMemberCount(
  organizationId: string,
): Promise<{ seats: number }> {
  const seats = await countActiveMembers(organizationId)

  try {
    await systemPrisma.organization.updateMany({
      where: { id: organizationId, seats: { not: seats } },
      data: { seats },
    })
  } catch (error) {
    console.error('syncMemberCount: falha ao gravar contagem de membros', {
      organizationId,
      seats,
      error,
    })
  }

  return { seats }
}
