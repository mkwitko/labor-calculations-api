/**
 * Modelos cujas linhas pertencem a uma organização. Toda operação raiz sobre
 * eles recebe `organizationId` injetado pela extension de tenant.
 *
 * Modelo novo precisa entrar aqui ou em NON_TENANT_MODELS — o teste de DMMF
 * falha enquanto a decisão não for tomada.
 */
export const TENANT_MODELS: ReadonlySet<string> = new Set([
  'Case',
  'Client',
  'LaborCalculation',
  'DocumentTemplate',
  'DocumentTemplateVersion',
  'AgendaEvent',
  'Settlement',
  'SettlementInstallment',
  'DocumentRequirement',
  'Deadline',
  'Hearing',
  'Document',
  'Note',
  'ClientNotification',
  'ClientAccessToken',
  'CaseTask',
  'CaseParty',
  'BatchAssessment',
  'CaseMovement',
  'TimelineEvent',
  'Activity',
  'FeeAgreement',
  'AuditLog',
  'Message',
  'MessageAttachment',
  'ApiKey',
  'ApiUsage',
  'SupportTicket',
  'SupportMessage',
  'SupportAttachment',
])

/**
 * Modelos deliberadamente fora do escopo de organização, com o motivo.
 */
export const NON_TENANT_MODELS: ReadonlySet<string> = new Set([
  'User', // pessoa, pode pertencer a várias organizações
  'Organization',
  'Membership',
  'Invite',
  'Referral', // relação entre pessoas
  'RefreshToken', // sessão da pessoa
  'GoogleIntegration', // OAuth da pessoa
  'SignatureRequest', // gov.br da pessoa
  'MonetaryIndex', // global
  'IndexTableSnapshot', // global, compartilhado entre organizações
  'Subscription', // da organização, escrito por webhook em contexto de sistema
  'SalaryHistory', // filhos de LaborCalculation, nunca consultados como raiz
  'UnpaidSalary',
  'FgtsMonthlyEntry',
  'CalculationVerbaLine',
  'SalaryDifferencePeriod',
  'SalaryDifferenceEntry',
  'CustomVerba',
  'BatchAssessmentRow', // filho de BatchAssessment, nunca consultado como raiz
  'PublicCalculation', // de quem não tem conta; vira tenant só ao ser reivindicado
])

export function isTenantModel(model: string | undefined): boolean {
  return model != null && TENANT_MODELS.has(model)
}
