import { systemPrisma } from 'prisma/prisma'
import { ConflictException } from '@/http/exceptions/conflict-exception'
import {
  listPlans,
  loadCatalog,
  type Plan,
  type PlanCode,
  type PlanInterval,
  type PlansPort,
  planByCode,
  planByPriceId,
  smallestPlanFor,
} from './list-plans'
import { isBillableStatus } from './subscription-status'

/**
 * Quem cabe no escritório.
 *
 * O teto é do plano, e o plano vem do Stripe. Aqui mora só a pergunta que o
 * produto faz: **cabe mais uma pessoa?** — e ela é respondida antes de o convite
 * sair, não no aceite. Descobrir o estouro no aceite seria tarde: o convidado já
 * clicou no link e leva um erro que não é dele.
 */

export type CurrentPlan = {
  plan: Plan
  /** `null` enquanto a organização está em trial, sem assinatura. */
  interval: PlanInterval | null
  /** Veio da assinatura no Stripe, e não da escolha guardada no banco. */
  fromSubscription: boolean
}

/**
 * O plano corrente: a assinatura quando existe, a escolha guardada quando a
 * organização ainda está em trial.
 *
 * A assinatura ganha da coluna de propósito — ela é o que o cliente paga. Se as
 * duas divergirem, cobrar por uma e liberar teto pela outra é o pior dos dois
 * mundos.
 */
export async function currentPlan(
  organizationId: string,
  port?: PlansPort,
): Promise<CurrentPlan | null> {
  const organization = await systemPrisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      planCode: true,
      subscription: { select: { priceId: true, status: true } },
    },
  })

  if (!organization) return null

  const subscription = organization.subscription

  if (subscription?.priceId && isBillableStatus(subscription.status)) {
    const found = await planByPriceId(subscription.priceId, port)

    if (found) {
      return {
        plan: found.plan,
        interval: found.interval,
        fromSubscription: true,
      }
    }
  }

  const stored = await planByCode(organization.planCode as PlanCode, port)

  if (stored) {
    return { plan: stored, interval: null, fromSubscription: false }
  }

  // Plano guardado que sumiu do Stripe (arquivado, renomeado) não pode deixar a
  // organização sem teto nenhum: cai no menor plano publicado, que é o mais
  // restritivo — errar para baixo é recuperável, errar para cima entrega de
  // graça.
  const plans = await listPlans(port)

  return plans.length > 0
    ? { plan: plans[0], interval: null, fromSubscription: false }
    : null
}

/**
 * Quantas vagas o plano já tem comprometidas: membros ativos **mais convites
 * pendentes**.
 *
 * Contar só membros deixaria mandar dez convites num plano de cinco e o teto
 * estourar no aceite — momento em que recusar é pior, porque a promessa já foi
 * feita a alguém de fora.
 */
export async function countOccupiedSeats(
  organizationId: string,
  now: Date = new Date(),
): Promise<{ members: number; pendingInvites: number; occupied: number }> {
  const [members, pendingInvites] = await Promise.all([
    systemPrisma.membership.count({
      where: { organizationId, deletedAt: null },
    }),
    systemPrisma.invite.count({
      where: { organizationId, status: 'pending', expiresAt: { gt: now } },
    }),
  ])

  return { members, pendingInvites, occupied: members + pendingInvites }
}

export type PlanOccupancy = {
  plan: Plan
  members: number
  pendingInvites: number
  occupied: number
  maxMembers: number
  remaining: number
  /**
   * Se passar do teto é possível pagando por cabeça. Depende do plano **e** de
   * o preço do excedente existir: plano que promete excedente sem preço
   * configurado entregaria gente de graça.
   */
  allowsExtraMembers: boolean
  /** Pessoas acima do teto — o que vira quantidade do item de excedente. */
  extraMembers: number
}

export async function planOccupancy(
  organizationId: string,
  port?: PlansPort,
): Promise<PlanOccupancy | null> {
  const current = await currentPlan(organizationId, port)

  if (!current) return null

  const counts = await countOccupiedSeats(organizationId)
  const catalog = await loadCatalog(port)

  const hasExtraPrice =
    catalog.extraMember.monthly !== null || catalog.extraMember.yearly !== null

  return {
    plan: current.plan,
    ...counts,
    maxMembers: current.plan.maxMembers,
    remaining: Math.max(0, current.plan.maxMembers - counts.occupied),
    allowsExtraMembers: current.plan.allowsExtraMembers && hasExtraPrice,
    extraMembers: Math.max(0, counts.members - current.plan.maxMembers),
  }
}

/**
 * Barra o convite que estouraria o teto, com 409 e o caminho de saída na
 * mensagem.
 *
 * **Bloqueia, não sobe o plano sozinho.** Fatura que cresce sem alguém ter
 * clicado em nada vira reclamação de cobrança, e o dono do escritório é quem
 * decide gastar mais.
 *
 * Stripe fora do ar deixa `planOccupancy` nulo — e aí o convite **passa**. Um
 * escritório não pode parar de trabalhar porque o meio de pagamento está
 * instável; o teto é regra comercial, não de segurança, e a próxima chamada
 * reconcilia.
 */
export async function assertCanAddMember(
  organizationId: string,
  port?: PlansPort,
): Promise<void> {
  const occupancy = await planOccupancy(organizationId, port).catch(() => null)

  if (!occupancy || occupancy.remaining > 0) return

  // Nos planos maiores o teto é macio: quem passa dele entra como advogado
  // adicional, cobrado por cabeça. Escritório grande não pode ficar de fora do
  // produto só porque cresceu.
  if (occupancy.allowsExtraMembers) return

  const next = await smallestPlanFor(occupancy.occupied + 1, port).catch(
    () => null,
  )

  const suggestion =
    next && next.code !== occupancy.plan.code
      ? ` Para incluir mais pessoas, mude para o plano ${next.name}.`
      : ' Fale com a gente para um plano sob medida.'

  throw new ConflictException(
    `O plano ${occupancy.plan.name} comporta ${occupancy.maxMembers} ` +
      `${occupancy.maxMembers === 1 ? 'pessoa' : 'pessoas'} e todas as vagas ` +
      `já estão ocupadas (${occupancy.members} no escritório, ` +
      `${occupancy.pendingInvites} com convite pendente).${suggestion}`,
  )
}

/**
 * O aceite tem um teto diferente do convite: aqui o convite que está sendo
 * aceito **já conta** como vaga ocupada, então comparar `occupied` recusaria o
 * último convite legítimo. O que importa é quantas pessoas ficam dentro do
 * escritório depois do aceite.
 *
 * A checagem existe mesmo assim porque entre o envio e o aceite alguém pode ter
 * entrado por outro caminho, e nesse intervalo o teto pode ter estourado.
 */
export async function assertCanAcceptInvite(
  organizationId: string,
  port?: PlansPort,
): Promise<void> {
  const current = await currentPlan(organizationId, port).catch(() => null)

  if (!current) return

  if (current.plan.allowsExtraMembers) return

  const { members } = await countOccupiedSeats(organizationId)

  if (members < current.plan.maxMembers) return

  throw new ConflictException(
    `O escritório atingiu o limite de ${current.plan.maxMembers} ` +
      `${current.plan.maxMembers === 1 ? 'pessoa' : 'pessoas'} do plano ` +
      `${current.plan.name}. Peça a quem administra para mudar de plano.`,
  )
}

/**
 * Descer de plano não pode expulsar ninguém: quem sai do escritório é decisão de
 * gestão, não efeito colateral de uma troca de assinatura.
 */
export async function assertPlanFitsMembers(
  organizationId: string,
  target: Plan,
): Promise<void> {
  // Plano com excedente comporta qualquer tamanho: o que passa do teto vira
  // advogado adicional na fatura, não motivo para recusar a troca.
  if (target.allowsExtraMembers) return

  const { members } = await countOccupiedSeats(organizationId)

  if (members <= target.maxMembers) return

  throw new ConflictException(
    `O plano ${target.name} comporta ${target.maxMembers} ` +
      `${target.maxMembers === 1 ? 'pessoa' : 'pessoas'}, e o escritório tem ` +
      `${members}. Remova quem não vai continuar antes de mudar de plano.`,
  )
}
