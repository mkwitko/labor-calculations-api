import type { FastifyReply, FastifyRequest } from 'fastify'
import { systemPrisma } from 'prisma/prisma'
import { PaymentRequiredException } from '@/http/exceptions/payment-required-exception'
import { UnauthorizedException } from '@/http/exceptions/unauthorized-exception'

/**
 * Dias de tolerância depois do fim do ciclo pago enquanto a assinatura está
 * `past_due`. O Stripe ainda está tentando cobrar o cartão nesse intervalo, e
 * bloquear na primeira falha de cobrança tira o acesso de quem só trocou de
 * cartão.
 */
const PAST_DUE_GRACE_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Status do Stripe em que a organização escreve sem ressalva. */
const ACTIVE_STATUSES = new Set(['active', 'trialing'])

/**
 * `Organization` e `Subscription` são não-tenant (`lib/tenant-models.ts`): a
 * extension não injeta nada neles, então o `where` leva o id explícito e o
 * client é o `systemPrisma`.
 */
export async function assertActiveSubscription(
  organizationId: string,
): Promise<void> {
  const organization = await systemPrisma.organization.findUnique({
    where: { id: organizationId },
    select: { trialEndsAt: true, subscription: true },
  })

  if (!organization) {
    throw new UnauthorizedException('Organização não encontrada')
  }

  const { subscription } = organization

  // Sem espelho local, o estado é o teste gratuito da própria organização. É a
  // mesma ordem de precedência de `GET /billing/subscription`: quando existe
  // linha de assinatura, ela é a fonte da verdade e `trialEndsAt` não conta.
  if (!subscription) {
    if (organization.trialEndsAt && organization.trialEndsAt > new Date()) {
      return
    }

    throw new PaymentRequiredException(
      'Seu período de teste terminou. Assine para continuar criando e editando.',
    )
  }

  if (ACTIVE_STATUSES.has(subscription.status)) {
    return
  }

  if (subscription.status === 'past_due') {
    const deadline = subscription.currentPeriodEnd
      ? new Date(
          subscription.currentPeriodEnd.getTime() +
            PAST_DUE_GRACE_DAYS * MS_PER_DAY,
        )
      : null

    // Sem `currentPeriodEnd` não há como medir a tolerância; liberar é o lado
    // seguro do erro, porque a cobrança ainda está em retentativa no Stripe.
    if (!deadline || deadline > new Date()) {
      return
    }

    throw new PaymentRequiredException(
      'O pagamento da sua assinatura não foi confirmado. Atualize a forma de pagamento para continuar.',
    )
  }

  throw new PaymentRequiredException()
}

/**
 * Gate de assinatura para rotas de **escrita**. Roda depois de `auth` na mesma
 * lista de preHandlers — é `auth` quem popula `request.tenant`.
 *
 * Leitura fica deliberadamente fora: quem parou de pagar continua enxergando os
 * próprios dados (cálculos, casos, documentos) e consegue exportá-los. O que o
 * bloqueio tira é a capacidade de produzir coisa nova.
 */
export async function requireSubscription(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (!request.tenant) {
    throw new UnauthorizedException()
  }

  await assertActiveSubscription(request.tenant.organizationId)
}
