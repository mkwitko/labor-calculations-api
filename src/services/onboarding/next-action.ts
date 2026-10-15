import { prisma } from 'prisma/prisma'
import type { TenantActor } from '@/services/tenant/actor'
import {
  calculationVisibility,
  caseRelationVisibility,
} from '@/services/tenant/visibility'
import { ONBOARDING_STEP_COPY, onboardingStatusFor } from './onboarding-status'

export type NextActionPhase = 'setup' | 'attention' | 'resume' | 'idle'

export type NextAction = {
  phase: NextActionPhase
  title: string
  hint: string
  to: string
  progress?: { completed: number; total: number }
}

/** Trabalho tocado até este número de dias atrás ainda vale como "retomar". */
const RESUME_WINDOW_DAYS = 14

/**
 * A única próxima ação do usuário, decidida no servidor por precedência. O
 * cartão do painel não escolhe nada: um leigo diante de três sugestões volta a
 * não saber o que fazer.
 */
export async function resolveNextAction(
  actor: TenantActor,
): Promise<NextAction> {
  const setup = await setupAction(actor)
  if (setup) return setup

  const attention = await attentionAction(actor)
  if (attention) return attention

  const resume = await resumeAction(actor)
  if (resume) return resume

  return {
    phase: 'idle',
    title: 'Faça um cálculo',
    hint: 'Liquidação completa com correção monetária, juros e descontos',
    to: '/calculations/new',
  }
}

async function setupAction(actor: TenantActor): Promise<NextAction | null> {
  const status = await onboardingStatusFor(
    actor.userId,
    actor.organizationId,
    actor.role,
  )
  if (!status.nextStep) return null

  const copy = ONBOARDING_STEP_COPY[status.nextStep]

  return {
    phase: 'setup',
    title: copy.title,
    hint: copy.hint,
    to: copy.to,
    progress: { completed: status.completedCount, total: status.totalCount },
  }
}

/**
 * Um item nomeado, não um contador — o contador é trabalho do ActionInbox, que
 * fica logo abaixo no painel. Ordem de urgência: prazo vencido, acordo
 * respondido, documento aguardando aprovação, tarefa aberta.
 *
 * Toda consulta passa por `caseRelationVisibility`: apontar para um caso que o
 * papel não enxerga vazaria dado entre papéis.
 */
async function attentionAction(actor: TenantActor): Promise<NextAction | null> {
  const visibleCase = caseRelationVisibility(actor)

  const overdue = await prisma.deadline.findFirst({
    where: { doneAt: null, dueAt: { lt: new Date() }, case: visibleCase },
    orderBy: { dueAt: 'asc' },
    select: { caseId: true, case: { select: { title: true } } },
  })
  if (overdue) {
    return {
      phase: 'attention',
      title: `Prazo vencido no caso ${overdue.case.title}`,
      hint: 'Um prazo passou da data e ainda está aberto',
      to: `/cases/${overdue.caseId}/prazos`,
    }
  }

  const settlement = await prisma.settlement.findFirst({
    where: {
      status: { in: ['accepted', 'rejected'] },
      laborCalculation: { case: visibleCase },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      laborCalculation: {
        select: { caseId: true, case: { select: { title: true } } },
      },
    },
  })
  if (settlement?.laborCalculation.caseId) {
    return {
      phase: 'attention',
      title: 'O cliente respondeu a proposta de acordo',
      hint: `Caso ${settlement.laborCalculation.case?.title ?? ''}`.trim(),
      to: `/cases/${settlement.laborCalculation.caseId}/numeros`,
    }
  }

  const doc = await prisma.documentRequirement.findFirst({
    where: { status: 'enviado', case: visibleCase },
    orderBy: { updatedAt: 'desc' },
    select: { caseId: true, case: { select: { title: true } } },
  })
  if (doc) {
    return {
      phase: 'attention',
      title: 'Documento do cliente aguardando sua aprovação',
      hint: `Caso ${doc.case.title}`,
      to: `/cases/${doc.caseId}/autos`,
    }
  }

  const task = await prisma.caseTask.findFirst({
    where: {
      status: { in: ['pendente', 'em_andamento'] },
      case: visibleCase,
    },
    orderBy: { createdAt: 'asc' },
    select: { caseId: true, case: { select: { title: true } } },
  })
  if (task) {
    return {
      phase: 'attention',
      title: `Tarefa aberta no caso ${task.case.title}`,
      hint: 'Há trabalho interno pendente neste processo',
      to: `/cases/${task.caseId}/prazos`,
    }
  }

  return null
}

/**
 * Não existe rascunho neste produto — nem no banco nem no front. O que dá para
 * retomar é trabalho salvo e recente: o `updatedAt` de cálculo e de caso.
 */
async function resumeAction(actor: TenantActor): Promise<NextAction | null> {
  const since = new Date()
  since.setDate(since.getDate() - RESUME_WINDOW_DAYS)

  const [calc, visibleCase] = await Promise.all([
    prisma.laborCalculation.findFirst({
      where: {
        deletedAt: null,
        updatedAt: { gte: since },
        ...calculationVisibility(actor),
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, clientName: true, updatedAt: true },
    }),
    // `caseRelationVisibility` em vez de `caseVisibility`: ele já traz
    // `deletedAt: null`, que é exatamente o que falta aqui.
    prisma.case.findFirst({
      where: {
        updatedAt: { gte: since },
        ...caseRelationVisibility(actor),
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, updatedAt: true },
    }),
  ])

  if (calc && (!visibleCase || calc.updatedAt >= visibleCase.updatedAt)) {
    return {
      phase: 'resume',
      title: `Retome o cálculo de ${calc.clientName}`,
      hint: 'Você trabalhou nele recentemente',
      to: `/calculations/${calc.id}`,
    }
  }

  if (visibleCase) {
    return {
      phase: 'resume',
      title: `Retome o caso ${visibleCase.title}`,
      hint: 'Você trabalhou nele recentemente',
      to: `/cases/${visibleCase.id}`,
    }
  }

  return null
}
