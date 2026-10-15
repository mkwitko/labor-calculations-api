// Shared human-readable labels for hearing/deadline kinds, used by the
// reminder emails and the Google Calendar sync so both stay in sync.

export const HEARING_KIND_LABELS: Record<string, string> = {
  inicial: 'Audiência Inicial',
  conciliacao: 'Audiência de Conciliação',
  instrucao: 'Audiência de Instrução',
  julgamento: 'Audiência de Julgamento',
  outra: 'Audiência',
}

export const DEADLINE_KIND_LABELS: Record<string, string> = {
  contestacao: 'Prazo — Contestação',
  recurso_ordinario: 'Prazo — Recurso Ordinário',
  embargos: 'Prazo — Embargos',
  outros: 'Prazo',
}

/**
 * Fase do processo em linguagem simples, para o cliente. O advogado vê o termo
 * jurídico no app (`pages/protected/cases/utils/case-phase.ts` no front); quem
 * lê uma notificação do portal, não.
 */
export const CLIENT_PHASE_LABELS: Record<string, string> = {
  pre_judicial: 'Preparação',
  distribuido: 'Processo iniciado',
  conhecimento: 'Em análise',
  recurso: 'Recurso',
  execucao: 'Execução',
  encerrado: 'Encerrado',
}

export function getHearingKindLabel(kind: string): string {
  return HEARING_KIND_LABELS[kind] ?? 'Audiência'
}

export function getClientPhaseLabel(phase: string): string {
  return CLIENT_PHASE_LABELS[phase] ?? phase
}

export function getDeadlineKindLabel(
  kind: string,
  customLabel?: string | null,
): string {
  if (customLabel) return customLabel
  return DEADLINE_KIND_LABELS[kind] ?? 'Prazo'
}
