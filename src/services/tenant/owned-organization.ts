import { systemPrisma } from 'prisma/prisma'

/**
 * `findOwnedOrganization` and `findOrganizationOwner` read the same rule from
 * opposite ends — person → the organization they own, versus organization →
 * the person who owns it. Both fix the tie-break as `role: 'owner'`,
 * `deletedAt: null`, oldest membership first (`orderBy: { createdAt: 'asc' }`).
 * A change to how "owner of record" is decided has to move in both, or the
 * two directions of the rule drift apart.
 */

/**
 * A organização em que a pessoa é `owner`, mais antiga primeiro. É onde caem
 * os efeitos financeiros do programa de indicação: o customer do Stripe e a
 * assinatura pertencem à organização, mas quem indica é gente.
 */
export async function findOwnedOrganization(userId: string): Promise<{
  id: string
  stripeCustomerId: string | null
  subscription: { stripeSubscriptionId: string; status: string } | null
} | null> {
  const membership = await systemPrisma.membership.findFirst({
    where: { userId, role: 'owner', deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: {
      organization: {
        select: {
          id: true,
          stripeCustomerId: true,
          subscription: {
            select: { stripeSubscriptionId: true, status: true },
          },
        },
      },
    },
  })

  return membership?.organization ?? null
}

/**
 * A pessoa que é `owner` de uma organização, mais antiga primeiro. É a
 * pessoa entre a qual e o referrer corre o programa de indicação — o
 * customer do Stripe fica na organização, mas o efeito do webhook
 * (qualificar ou perder a indicação) recai sobre quem a possui.
 */
export async function findOrganizationOwner(
  organizationId: string,
): Promise<{ userId: string } | null> {
  const owner = await systemPrisma.membership.findFirst({
    where: { organizationId, role: 'owner', deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { userId: true },
  })

  return owner ? { userId: owner.userId } : null
}
