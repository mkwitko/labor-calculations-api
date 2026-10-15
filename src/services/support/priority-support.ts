import {
  listPlans,
  type PlanCode,
  type PlansPort,
} from '@/services/billing/list-plans'

/**
 * Quem entra na frente da fila do suporte.
 *
 * Deriva do plano, e não de uma flag: assinou o Escritório, virou prioritário
 * na mesma hora: uma caixa a marcar à mão é uma caixa que alguém esquece de
 * marcar, e o escritório descobre que pagou por um atendimento que não recebeu.
 *
 * O corte usa o `rank` do Stripe (mesma fonte do teto e do preço) para renomear
 * ou reordenar plano lá não silenciar a regra aqui — o mesmo raciocínio de
 * `billing/plan-features.ts`.
 */
const PRIORITY_MIN_PLAN: PlanCode = 'escritorio'

/**
 * Fila de até 200 chamados: uma leitura do catálogo (cache de 10 minutos)
 * resolve todos. Ler o plano corrente organização por organização custaria uma
 * consulta por linha para mudar um selo.
 *
 * O preço disso é usar `Organization.planCode` como referência — em trial ele é
 * a intenção, não a assinatura. Errar para mais aqui atende alguém antes da
 * hora; errar para menos deixaria quem paga esperando.
 */
export async function priorityPlanCodes(
  port?: PlansPort,
): Promise<Set<string>> {
  const plans = await listPlans(port)
  const required = plans.find((plan) => plan.code === PRIORITY_MIN_PLAN)

  // Catálogo ilegível não pode inventar prioridade: ninguém é prioritário até o
  // Stripe voltar, e a fila continua ordenada por data.
  if (!required) return new Set()

  return new Set(
    plans.filter((plan) => plan.rank >= required.rank).map((plan) => plan.code),
  )
}

export async function isPriorityPlan(
  planCode: string,
  port?: PlansPort,
): Promise<boolean> {
  return (await priorityPlanCodes(port)).has(planCode)
}
