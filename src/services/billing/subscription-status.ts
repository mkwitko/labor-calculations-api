import { systemPrisma } from 'prisma/prisma'

/**
 * Status de assinatura em que ainda existe cobrança para mexer.
 *
 * `past_due` e `unpaid` entram: a assinatura está viva no Stripe, só está
 * devendo — trocar de plano ali é legítimo. `canceled`, `incomplete_expired` e
 * afins ficam fora, porque o Stripe recusa qualquer alteração nelas.
 */
const BILLABLE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid'])

export function isBillableStatus(status: string): boolean {
  return BILLABLE_STATUSES.has(status)
}

/**
 * Acerta o status local quando o Stripe discorda dele.
 *
 * O status no banco é cópia: chega por webhook, e webhook perdido (ou ambiente
 * sem webhook configurado) deixa a linha dizendo `active` para uma assinatura
 * que o Stripe já cancelou. Quem consultou o Stripe agora sabe a verdade e a
 * grava, senão a tela de plano continua batendo num 503 até alguém mexer no
 * banco à mão.
 *
 * Best-effort de propósito: é conserto de cópia, não o efeito que o chamador
 * pediu, e falhar aqui não deve derrubar a resposta.
 */
export async function reconcileSubscriptionStatus(
  organizationId: string,
  status: string,
): Promise<void> {
  try {
    await systemPrisma.subscription.updateMany({
      where: { organizationId, status: { not: status } },
      data: { status },
    })
  } catch {
    // Silêncio: o chamador já tem o status remoto em mãos e decide com ele.
  }
}
