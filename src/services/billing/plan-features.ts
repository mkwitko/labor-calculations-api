import { PaymentRequiredException } from '@/http/exceptions/payment-required-exception'
import {
  type Plan,
  type PlanCode,
  type PlansPort,
  planByCode,
} from './list-plans'
import { currentPlan } from './plan-access'

/**
 * O que cada plano libera além do teto de pessoas.
 *
 * O teto vem do Stripe porque é inseparável do preço. O **empacotamento** não:
 * "passivo em lote a partir do Escritório" é decisão de produto, não um número
 * que o financeiro muda no painel. Fica aqui, em código, com o `rank` (esse sim
 * do Stripe) resolvendo a ordem — assim renomear ou reordenar plano lá não
 * silencia o gate aqui.
 *
 * Sem isto, o plano só limitava quantas pessoas cabiam: quem assinava o Solo
 * usava passivo em lote e emitia chave de API igual a quem paga o Max, e a
 * tabela de preços anunciava uma diferença que o servidor não cobrava.
 */
export type PlanFeature = 'batch_assessment' | 'public_api'

const FEATURE_MIN_PLAN: Record<PlanFeature, PlanCode> = {
  batch_assessment: 'escritorio',
  public_api: 'max',
}

const FEATURE_LABELS: Record<PlanFeature, string> = {
  batch_assessment: 'A avaliação de passivo em lote',
  public_api: 'A API pública',
}

export type FeatureAccess = {
  allowed: boolean
  /** Plano mínimo que libera o recurso, para a mensagem e para a tela. */
  requiredPlan: PlanCode
  requiredPlanName: string | null
}

function accessFor(
  feature: PlanFeature,
  current: Plan | null,
  required: Plan | null,
  inTrial: boolean,
): FeatureAccess {
  const requiredPlan = FEATURE_MIN_PLAN[feature]
  const requiredPlanName = required?.name ?? null

  // Catálogo ilegível (Stripe fora do ar) não pode trancar o produto: mesma
  // escolha do teto de pessoas, onde o convite passa quando o Stripe cai.
  // Empacotamento é regra comercial, não de segurança.
  if (!current || !required) {
    return { allowed: true, requiredPlan, requiredPlanName }
  }

  // Teste gratuito abre tudo, de propósito: é justo o escritório grande —
  // aquele que quer testar o lote — que precisa ver o recurso antes de assinar.
  // A janela é curta e `requireSubscription` fecha a escrita quando ela acaba.
  if (inTrial) {
    return { allowed: true, requiredPlan, requiredPlanName }
  }

  return {
    allowed: current.rank >= required.rank,
    requiredPlan,
    requiredPlanName,
  }
}

/** Se a organização tem direito ao recurso, sem lançar. */
export async function checkPlanFeature(
  organizationId: string,
  feature: PlanFeature,
  port?: PlansPort,
): Promise<FeatureAccess> {
  const [current, required] = await Promise.all([
    currentPlan(organizationId, port),
    planByCode(FEATURE_MIN_PLAN[feature], port),
  ])

  return accessFor(
    feature,
    current?.plan ?? null,
    required ?? null,
    current != null && !current.fromSubscription,
  )
}

/** O mesmo, para a rota: 402 com o caminho da assinatura na mensagem. */
export async function assertPlanFeature(
  organizationId: string,
  feature: PlanFeature,
  port?: PlansPort,
): Promise<void> {
  const access = await checkPlanFeature(organizationId, feature, port)

  if (access.allowed) return

  const planName = access.requiredPlanName ?? access.requiredPlan

  throw new PaymentRequiredException(
    `${FEATURE_LABELS[feature]} está disponível a partir do plano ${planName}. Troque de plano em Assinatura para liberar.`,
  )
}

/** Todos os recursos de uma vez — a tela usa isto para não oferecer o que não tem. */
export async function listPlanFeatures(
  organizationId: string,
  port?: PlansPort,
): Promise<Record<PlanFeature, FeatureAccess>> {
  const features = Object.keys(FEATURE_MIN_PLAN) as PlanFeature[]

  const entries = await Promise.all(
    features.map(
      async (feature) =>
        [
          feature,
          await checkPlanFeature(organizationId, feature, port),
        ] as const,
    ),
  )

  return Object.fromEntries(entries) as Record<PlanFeature, FeatureAccess>
}
