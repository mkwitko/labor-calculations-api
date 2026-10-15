import { systemPrisma } from 'prisma/prisma'
import { syncReferralTier } from './tier-engine'

/**
 * Indicação entre pessoas que dividem escritório não conta. Sem essa regra, um
 * escritório indica os próprios associados e sobe de nível com dinheiro que já
 * era dele.
 *
 * A economia do ataque já é negativa — para levar um sócio ao Diamante (60%),
 * oito associados teriam de manter organizações pessoais pagas: custo `8P` para
 * economizar `4,8P`. Mas a regra fecha o caminho barato, e o cálculo do spec
 * depende do preço atual: se houver promoção anual agressiva, ele muda.
 */
export async function sharesOrganization(
  a: string,
  b: string,
): Promise<boolean> {
  const organizationsOfA = await systemPrisma.membership.findMany({
    where: { userId: a, deletedAt: null },
    select: { organizationId: true },
  })

  if (organizationsOfA.length === 0) return false

  const shared = await systemPrisma.membership.count({
    where: {
      userId: b,
      deletedAt: null,
      organizationId: { in: organizationsOfA.map((m) => m.organizationId) },
    },
  })

  return shared > 0
}

/**
 * Rebaixa a indicação **já qualificada** de quem passou a dividir organização
 * com quem o indicou. Chamado no aceite de convite: sem isso, "indica primeiro,
 * contrata depois" contorna a regra que `qualifyReferralForReferee` aplica no
 * momento do pagamento.
 */
export async function demoteReferralIfSharedOrganization(
  refereeId: string,
  at: Date,
): Promise<boolean> {
  const referral = await systemPrisma.referral.findUnique({
    where: { refereeId },
    select: { id: true, referrerId: true, status: true },
  })

  if (!referral || referral.status !== 'qualified') return false

  if (!(await sharesOrganization(referral.referrerId, refereeId))) return false

  await systemPrisma.referral.update({
    where: { id: referral.id },
    data: { status: 'lost', lostAt: at },
  })

  await syncReferralTier(referral.referrerId)

  return true
}
