import type { OrgRole } from '@prisma/client'
import { systemPrisma } from 'prisma/prisma'
import { brandingForOrganization } from '@/services/tenant/organization-branding'

export type OnboardingStep = 'client' | 'calculation' | 'case' | 'profile'

export type OnboardingStatus = {
  profileComplete: boolean
  hasClient: boolean
  hasCase: boolean
  hasCalculation: boolean
  completedCount: number
  totalCount: number
  allDone: boolean
  /** Primeiro passo aberto, na ordem de `STEP_ORDER`. */
  nextStep: OnboardingStep | null
}

/**
 * Cliente vem primeiro porque o wizard de cálculo exige `clientId`
 * (`requiredString('Selecione um cliente')` em
 * labor-calculation-common-schema.ts) e o passo 1 do formulário só oferece
 * seleção de cliente existente. Cálculo em segundo porque é o produto. Caso e
 * perfil descem: nenhum dos dois bloqueia o cálculo.
 */
const STEP_ORDER: readonly OnboardingStep[] = [
  'client',
  'calculation',
  'case',
  'profile',
]

/** Rótulo e destino de cada passo. Consumido pelo cartão e pelo e-mail. */
export const ONBOARDING_STEP_COPY: Record<
  OnboardingStep,
  { title: string; hint: string; to: string }
> = {
  client: {
    title: 'Cadastre o primeiro cliente',
    hint: 'O reclamante da sua causa — o cálculo precisa dele',
    to: '/clients/new',
  },
  calculation: {
    title: 'Faça o primeiro cálculo',
    hint: 'Liquidação trabalhista com correção, juros e verbas',
    to: '/calculations/new',
  },
  case: {
    title: 'Abra o primeiro caso',
    hint: 'O processo que reúne cálculos, documentos e agenda',
    to: '/cases/new',
  },
  profile: {
    title: 'Complete o perfil do escritório',
    // Diz exatamente o que fecha o passo. A dica antiga listava "nome, OAB,
    // logo e cor da marca", mas nome e cor não contam — quem preenchia os dois
    // e salvava via o passo continuar aberto sem entender por quê.
    hint: 'Falta o número da OAB e o logotipo — é o que assina os documentos',
    to: '/profile',
  },
}

/**
 * `systemPrisma` com `organizationId` explícito em todo `where`, e não o client
 * com a extension de tenant: o cron de nudge roda fora de contexto de
 * organização e precisa do mesmo cálculo. Passar o client como parâmetro não
 * resolveria — o client estendido não é atribuível a `PrismaClient`.
 */
export async function onboardingStatusFor(
  userId: string,
  organizationId: string,
  role?: OrgRole,
): Promise<OnboardingStatus> {
  const [user, branding, clientCount, caseCount, calcCount] = await Promise.all(
    [
      systemPrisma.user.findUnique({
        where: { id: userId },
        select: { oabNumber: true },
      }),
      brandingForOrganization(organizationId),
      systemPrisma.client.count({
        where: { userId, organizationId, deletedAt: null },
      }),
      systemPrisma.case.count({
        where: { assignedToId: userId, organizationId, deletedAt: null },
      }),
      systemPrisma.laborCalculation.count({
        where: { userId, organizationId, deletedAt: null },
      }),
    ],
  )

  // Checa logoUrl, não officeName: Organization.name nunca é nulo (todo
  // cadastro gera um, "Carteira de <nome>", na falta de um informado), então
  // checar contra ele seria sempre verdadeiro e o passo sumiria do checklist.
  //
  // O logotipo é da organização e só titular e sócio podem gravá-lo
  // (`assertRole` em `update-user.ts`). Cobrar isso de quem não pode fazer
  // deixaria o passo aberto para sempre, e o nudge por e-mail insistindo numa
  // tarefa impossível — para esses papéis, basta a própria OAB.
  const canManageBranding =
    role === undefined || role === 'owner' || role === 'admin'

  const profileComplete = canManageBranding
    ? Boolean(branding?.logoUrl && user?.oabNumber)
    : Boolean(user?.oabNumber)
  const hasClient = clientCount > 0
  const hasCase = caseCount > 0
  const hasCalculation = calcCount > 0

  const done: Record<OnboardingStep, boolean> = {
    client: hasClient,
    calculation: hasCalculation,
    case: hasCase,
    profile: profileComplete,
  }

  const completedCount = STEP_ORDER.filter((step) => done[step]).length
  const nextStep = STEP_ORDER.find((step) => !done[step]) ?? null

  return {
    profileComplete,
    hasClient,
    hasCase,
    hasCalculation,
    completedCount,
    totalCount: STEP_ORDER.length,
    allDone: completedCount === STEP_ORDER.length,
    nextStep,
  }
}
