import { systemPrisma } from 'prisma/prisma'
import { env } from '@/env'
import { sendEmail } from '@/services/email'
import { emailTemplates } from '@/services/email/templates'
import { ONBOARDING_STEP_COPY, onboardingStatusFor } from './onboarding-status'

/**
 * Porta de e-mail injetável. O alias de teste deste repo duplica instância de
 * módulo, então `vi.mock` não é confiável aqui — o teste passa um coletor.
 */
export type NudgeMailPort = (params: {
  to: string
  subject: string
  html: string
}) => Promise<void>

type Result = { d1: number; d3: number; skipped: number }

/**
 * Janela de dois dias por nudge: um dia de cron que não rodou é absorvido na
 * execução seguinte, sem precisar de backfill.
 */
const D1_WINDOW = { min: 1, max: 2 }
const D3_WINDOW = { min: 3, max: 4 }

function daysSince(from: Date, now: Date): number {
  const ms = now.getTime() - from.getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

/**
 * Dois e-mails de retomada para quem criou conta e não chegou ao primeiro
 * resultado. Roda no cron diário; `systemPrisma` porque é contexto de sistema,
 * sem organização no escopo.
 */
export async function sendOnboardingNudges(
  mail: NudgeMailPort = sendEmail,
  now: Date = new Date(),
): Promise<Result> {
  const oldest = new Date(now)
  oldest.setDate(oldest.getDate() - (D3_WINDOW.max + 1))

  const candidates = await systemPrisma.user.findMany({
    where: {
      deletedAt: null,
      onbNudgeOptOut: false,
      createdAt: { gte: oldest },
      OR: [{ onbNudgeD1SentAt: null }, { onbNudgeD3SentAt: null }],
    },
    select: {
      id: true,
      name: true,
      mail: true,
      createdAt: true,
      onbNudgeD1SentAt: true,
      onbNudgeD3SentAt: true,
      memberships: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { organizationId: true, role: true },
      },
    },
  })

  const result: Result = { d1: 0, d3: 0, skipped: 0 }

  for (const user of candidates) {
    const age = daysSince(user.createdAt, now)

    const isD1 =
      !user.onbNudgeD1SentAt && age >= D1_WINDOW.min && age <= D1_WINDOW.max
    const isD3 =
      !user.onbNudgeD3SentAt && age >= D3_WINDOW.min && age <= D3_WINDOW.max

    if (!isD1 && !isD3) continue

    const membership = user.memberships[0]
    if (!membership) continue

    const { organizationId } = membership

    // O papel entra no cálculo: quem não pode gravar o logotipo do escritório
    // não deve receber e-mail cobrando isso.
    const status = await onboardingStatusFor(
      user.id,
      organizationId,
      membership.role,
    )
    const field = isD1 ? 'onbNudgeD1SentAt' : 'onbNudgeD3SentAt'

    // Checklist fechado: marca como resolvido sem mandar, para que o e-mail
    // nunca dispare depois que a pessoa já se resolveu sozinha.
    if (!status.nextStep) {
      await markSent(user.id, field, now)
      result.skipped += 1
      continue
    }

    const step = ONBOARDING_STEP_COPY[status.nextStep]
    const content = isD1
      ? emailTemplates.onboardingNudgeD1({
          userName: user.name,
          stepTitle: step.title,
          stepUrl: `${env.CLIENT_URL}${step.to}`,
          unsubscribeUrl: `${env.CLIENT_URL}/settings`,
        })
      : emailTemplates.onboardingNudgeD3({
          userName: user.name,
          stepTitle: step.title,
          stepUrl: `${env.CLIENT_URL}${step.to}`,
          helpUrl: `${env.CLIENT_URL}/ajuda`,
          exampleUrl: `${env.CLIENT_URL}/ajuda/exemplo`,
          unsubscribeUrl: `${env.CLIENT_URL}/settings`,
        })

    await mail({ to: user.mail, subject: content.subject, html: content.html })
    await markSent(user.id, field, now)

    if (isD1) result.d1 += 1
    else result.d3 += 1
  }

  return result
}

/**
 * Um usuário que atravessou a janela do D+1 sem receber nada tem o campo do
 * D+1 fechado junto com o do D+3 — senão ele ficaria nulo para sempre e a
 * consulta de candidatos carregaria a conta em toda execução.
 */
async function markSent(
  userId: string,
  field: 'onbNudgeD1SentAt' | 'onbNudgeD3SentAt',
  at: Date,
): Promise<void> {
  // Ramos explícitos em vez de chave computada: `{ [field]: at }` alarga o tipo
  // e o client do Prisma recusa o objeto.
  const data =
    field === 'onbNudgeD1SentAt'
      ? { onbNudgeD1SentAt: at }
      : { onbNudgeD3SentAt: at, onbNudgeD1SentAt: at }

  await systemPrisma.user.update({ where: { id: userId }, data })
}
