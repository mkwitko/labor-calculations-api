import { app } from '@/app'
import { adminSupportRoutes } from '@/http/controllers/admin/support-inbox'
import { supportRoutes } from '@/http/controllers/support/support'
import { getPublicFunnelRoute } from './http/controllers/admin/get-public-funnel'
import { createAgendaEvent } from './http/controllers/agenda-event/create-agenda-event'
import { deleteAgendaEvent } from './http/controllers/agenda-event/delete-agenda-event'
import { listAgendaEvents } from './http/controllers/agenda-event/list-agenda-events'
import { updateAgendaEvent } from './http/controllers/agenda-event/update-agenda-event'
import { createApiKey } from './http/controllers/api-key/create-api-key'
import { getApiUsage } from './http/controllers/api-key/get-api-usage'
import { listApiKeys } from './http/controllers/api-key/list-api-keys'
import { revokeApiKey } from './http/controllers/api-key/revoke-api-key'
import { createV1Calculation } from './http/controllers/api-v1/create-v1-calculation'
import { getV1Calculation } from './http/controllers/api-v1/get-v1-calculation'
import { openapiV1 } from './http/controllers/api-v1/openapi-v1'
import { checkAuth } from './http/controllers/auth/check-auth'
import { refreshToken } from './http/controllers/auth/refresh-token'
import { signIn } from './http/controllers/auth/sign-in'
import { signOut } from './http/controllers/auth/sign-out'
import { switchOrganization } from './http/controllers/auth/switch-organization'
import { batchAssessmentRoutes } from './http/controllers/batch-assessment/batch-assessment'
import { createCheckout } from './http/controllers/billing/create-checkout'
import { createPortalSession } from './http/controllers/billing/create-portal-session'
import { getSubscription } from './http/controllers/billing/get-subscription'
import { listBillingPlans } from './http/controllers/billing/list-plans'
import { stripeWebhook } from './http/controllers/billing/webhook'
import { approveDocument } from './http/controllers/case/approve-document'
import { caseFinanceRoutes } from './http/controllers/case/case-finance'
import { caseMovementsRoutes } from './http/controllers/case/case-movements'
import { casePartiesRoutes } from './http/controllers/case/case-parties'
import { caseTasksRoutes } from './http/controllers/case/case-tasks'
import { createCase } from './http/controllers/case/create-case'
import { createDocumentRequirement } from './http/controllers/case/create-document-requirement'
import { deleteCase } from './http/controllers/case/delete-case'
import { deleteDocumentRequirement } from './http/controllers/case/delete-document-requirement'
import { getCase } from './http/controllers/case/get-case'
import { getCaseTimeline } from './http/controllers/case/get-case-timeline'
import { getDocumentRequirements } from './http/controllers/case/get-document-requirements'
import { linkCalculationToCase } from './http/controllers/case/link-calculation'
import { listCases } from './http/controllers/case/list-cases'
import { rejectDocument } from './http/controllers/case/reject-document'
import { restoreCase } from './http/controllers/case/restore-case'
import { unlinkCalculationFromCase } from './http/controllers/case/unlink-calculation'
import { updateCase } from './http/controllers/case/update-case'
import { updateDocumentRequirement } from './http/controllers/case/update-document-requirement'
import { createClient } from './http/controllers/client/create-client'
import { createPortalInvite } from './http/controllers/client/create-portal-invite'
import { deleteClient } from './http/controllers/client/delete-client'
import { getClient } from './http/controllers/client/get-client'
import { listClients } from './http/controllers/client/list-clients'
import { updateClient } from './http/controllers/client/update-client'
import {
  acceptPortalInvite,
  getPortalInvite,
  linkPortalInvite,
} from './http/controllers/client-portal/accept-invite'
import { acceptSettlement } from './http/controllers/client-portal/accept-settlement'
import { changeClientPassword } from './http/controllers/client-portal/change-password'
import { checkClientAuth } from './http/controllers/client-portal/check-auth'
import { confirmDocumentUpload } from './http/controllers/client-portal/confirm-document-upload'
import { createClientMessage } from './http/controllers/client-portal/create-client-message'
import { createClientMessageAttachment } from './http/controllers/client-portal/create-client-message-attachment'
import { getDocumentDownloadUrl } from './http/controllers/client-portal/download-document'
import { forgotPassword } from './http/controllers/client-portal/forgot-password'
import { getClientCalculation } from './http/controllers/client-portal/get-calculation'
import { getClientCase } from './http/controllers/client-portal/get-case'
import { getCaseDeadlines } from './http/controllers/client-portal/get-case-deadlines'
import { getCaseHearings } from './http/controllers/client-portal/get-case-hearings'
import { getClientMessageUploadUrl } from './http/controllers/client-portal/get-client-message-upload-url'
import { getClientUnreadMessageCount } from './http/controllers/client-portal/get-client-unread-message-count'
import { getClientDashboard } from './http/controllers/client-portal/get-dashboard'
import { getDocumentUploadUrl } from './http/controllers/client-portal/get-document-upload-url'
import { getClientDocuments } from './http/controllers/client-portal/get-documents'
import { getClientNotifications } from './http/controllers/client-portal/get-notifications'
import { getClientSettlements } from './http/controllers/client-portal/get-settlements'
import { getClientTimeline } from './http/controllers/client-portal/get-timeline'
import { listClientCalculations } from './http/controllers/client-portal/list-calculations'
import { listClientCases } from './http/controllers/client-portal/list-cases'
import { listClientMessages } from './http/controllers/client-portal/list-client-messages'
import { markAllNotificationsAsRead } from './http/controllers/client-portal/mark-all-notifications-as-read'
import { markClientMessagesRead } from './http/controllers/client-portal/mark-client-messages-read'
import { markNotificationAsRead } from './http/controllers/client-portal/mark-notification-as-read'
import { rejectSettlement } from './http/controllers/client-portal/reject-settlement'
import { resetPassword } from './http/controllers/client-portal/reset-password'
import { signInClient } from './http/controllers/client-portal/sign-in'
import { signOutClient } from './http/controllers/client-portal/sign-out'
import { streamClientCaseEvents } from './http/controllers/client-portal/stream-client-case-events'
import { switchClientOrganization } from './http/controllers/client-portal/switch-organization'
import { getNextAction } from './http/controllers/dashboard/get-next-action'
import { calculateDeadline } from './http/controllers/deadline/calculate-deadline'
import { createDeadline } from './http/controllers/deadline/create-deadline'
import { deleteDeadline } from './http/controllers/deadline/delete-deadline'
import { listAllDeadlines } from './http/controllers/deadline/list-all-deadlines'
import { listDeadlines } from './http/controllers/deadline/list-deadlines'
import { updateDeadline } from './http/controllers/deadline/update-deadline'
import { confirmDocumentUpload as confirmDocumentUploadLawyer } from './http/controllers/document/confirm-document-upload'
import { deleteDocument } from './http/controllers/document/delete-document'
import { listDocuments } from './http/controllers/document/list-documents'
import { uploadDocumentUrl } from './http/controllers/document/upload-document-url'
import { createDocumentTemplate } from './http/controllers/document-template/create-document-template'
import { deleteDocumentTemplate } from './http/controllers/document-template/delete-document-template'
import { downloadDocumentTemplate } from './http/controllers/document-template/download-document-template'
import { duplicateDocumentTemplate } from './http/controllers/document-template/duplicate-document-template'
import { generateDocument } from './http/controllers/document-template/generate-document'
import { generateDocumentComposableController } from './http/controllers/document-template/generate-document-composable'
import { getDocumentTemplate } from './http/controllers/document-template/get-document-template'
import { listDocumentTemplates } from './http/controllers/document-template/list-document-templates'
import { listPlaceholders } from './http/controllers/document-template/list-placeholders'
import { updateDocumentTemplate } from './http/controllers/document-template/update-document-template'
import { uploadDocumentTemplateFile } from './http/controllers/document-template/upload-document-template-file'
import { validateDocumentTemplate } from './http/controllers/document-template/validate-document-template'
import { createHearing } from './http/controllers/hearing/create-hearing'
import { deleteHearing } from './http/controllers/hearing/delete-hearing'
import { listAllHearings } from './http/controllers/hearing/list-all-hearings'
import { listHearings } from './http/controllers/hearing/list-hearings'
import { updateHearing } from './http/controllers/hearing/update-hearing'
import { googleCalendarRoutes } from './http/controllers/integration/google-calendar'
import { createLaborCalculation } from './http/controllers/labor-calculation/create-labor-calculation'
import { createLaborCalculationV3 } from './http/controllers/labor-calculation/create-labor-calculation-v3'
import { deleteLaborCalculation } from './http/controllers/labor-calculation/delete-labor-calculation'
import { getActionItems } from './http/controllers/labor-calculation/get-action-items'
import { getCalculationAudit } from './http/controllers/labor-calculation/get-calculation-audit'
import { getFinanceSummary } from './http/controllers/labor-calculation/get-finance-summary'
import { getLaborCalculation } from './http/controllers/labor-calculation/get-labor-calculation'
import { getLaborCalculationStats } from './http/controllers/labor-calculation/get-labor-calculation-stats'
import { getSharedCalculation } from './http/controllers/labor-calculation/get-shared-calculation'
import { listLaborCalculations } from './http/controllers/labor-calculation/list-labor-calculations'
import { reindexLaborCalculationRoute } from './http/controllers/labor-calculation/reindex-labor-calculation'
import { restoreLaborCalculation } from './http/controllers/labor-calculation/restore-labor-calculation'
import { shareLaborCalculation } from './http/controllers/labor-calculation/share-labor-calculation'
import { simulateScenariosController } from './http/controllers/labor-calculation/simulate-scenarios'
import { updateLaborCalculation } from './http/controllers/labor-calculation/update-labor-calculation'
import { updateLaborCalculationStatus } from './http/controllers/labor-calculation/update-labor-calculation-status'
import { updateLaborCalculationV3 } from './http/controllers/labor-calculation/update-labor-calculation-v3'
import { createMessage } from './http/controllers/message/create-message'
import { createMessageAttachment } from './http/controllers/message/create-message-attachment'
import { getMessageUploadUrl } from './http/controllers/message/get-message-upload-url'
import { getUnreadMessageCount } from './http/controllers/message/get-unread-message-count'
import { listMessages } from './http/controllers/message/list-messages'
import { markMessagesRead } from './http/controllers/message/mark-messages-read'
import { streamCaseEvents } from './http/controllers/message/stream-case-events'
import { monetaryIndexRoutes } from './http/controllers/monetary-index/monetary-index'
import { createNote } from './http/controllers/note/create-note'
import { deleteNote } from './http/controllers/note/delete-note'
import { listNotes } from './http/controllers/note/list-notes'
import { updateNote } from './http/controllers/note/update-note'
import { acceptInviteRoutes } from './http/controllers/organization/accept-invite'
import { inviteRoutes } from './http/controllers/organization/invites'
import { listOrganizations } from './http/controllers/organization/list-organizations'
import { memberRoutes } from './http/controllers/organization/members'
import { organizationPlan } from './http/controllers/organization/plan'
import { transferOwnership } from './http/controllers/organization/transfer-ownership'
import { claimPublicCalculationRoute } from './http/controllers/public-calculation/claim-public-calculation'
import { createOvertimeCalculationRoute } from './http/controllers/public-calculation/create-overtime-calculation'
import { createPublicCalculationRoute } from './http/controllers/public-calculation/create-public-calculation'
import { createVacationAnd13thCalculationRoute } from './http/controllers/public-calculation/create-vacation-13th-calculation'
import { getPublicCalculationRoute } from './http/controllers/public-calculation/get-public-calculation'
import { updatePublicContactRoute } from './http/controllers/public-calculation/update-public-contact'
import { getReferralSummary } from './http/controllers/referral/get-referral-summary'
import { resolveReferralCode } from './http/controllers/referral/resolve-referral-code'
import { sendReferralInvite } from './http/controllers/referral/send-referral-invite'
import { createSettlement } from './http/controllers/settlement/create-settlement'
import { deleteSettlement } from './http/controllers/settlement/delete-settlement'
import { getSettlement } from './http/controllers/settlement/get-settlement'
import { listSettlements } from './http/controllers/settlement/list-settlements'
import { settlementInstallmentsRoutes } from './http/controllers/settlement/settlement-installments'
import { settlementSimulation } from './http/controllers/settlement/settlement-simulation'
import { updateSettlement } from './http/controllers/settlement/update-settlement'
import { createUser } from './http/controllers/user/create-user'
import { deleteUser } from './http/controllers/user/delete-user'
import { getAuthenticatedUser } from './http/controllers/user/get-authenticated-user'
import { getOnboardingStatus } from './http/controllers/user/get-onboarding-status'
import { getUserPrefs } from './http/controllers/user/get-user-prefs'
import { updateUser } from './http/controllers/user/update-user'
import { updateUserPrefs } from './http/controllers/user/update-user-prefs'
import { uploadBrandingUrl } from './http/controllers/user/upload-branding-url'
import { getWidgetBrandingRoute } from './http/controllers/widget/get-widget-branding'
import {
  claimWidgetCalculationRoute,
  listWidgetCalculationsRoute,
} from './http/controllers/widget/widget-calculations'
import { widgetSettingsRoutes } from './http/controllers/widget/widget-settings'

export default function Routing() {
  // Auth
  app.register(checkAuth)
  app.register(refreshToken)
  app.register(signIn)
  app.register(signOut)
  app.register(switchOrganization)

  // Organizations
  app.register(listOrganizations)
  app.register(memberRoutes)
  app.register(inviteRoutes)
  app.register(acceptInviteRoutes)
  app.register(transferOwnership)
  app.register(organizationPlan)

  // Users
  app.register(createUser)
  app.register(deleteUser)
  app.register(getAuthenticatedUser)
  app.register(updateUser)
  app.register(getUserPrefs)
  app.register(getOnboardingStatus)
  app.register(updateUserPrefs)
  app.register(uploadBrandingUrl)

  // Billing
  app.register(createCheckout)
  app.register(createPortalSession)
  app.register(getSubscription)
  app.register(listBillingPlans)
  app.register(stripeWebhook)

  // Referral
  app.register(getReferralSummary)
  app.register(sendReferralInvite)
  app.register(resolveReferralCode)

  // Clients
  app.register(createClient)
  app.register(createPortalInvite)
  app.register(deleteClient)
  app.register(getClient)
  app.register(listClients)
  app.register(updateClient)

  // Cases
  app.register(createCase)
  app.register(listCases)
  app.register(getCase)
  app.register(updateCase)
  app.register(deleteCase)
  app.register(restoreCase)
  app.register(linkCalculationToCase)
  app.register(unlinkCalculationFromCase)
  app.register(getCaseTimeline)
  app.register(casePartiesRoutes)
  app.register(caseTasksRoutes)
  app.register(caseMovementsRoutes)
  app.register(caseFinanceRoutes)
  app.register(googleCalendarRoutes)
  app.register(createAgendaEvent)
  app.register(listAgendaEvents)
  app.register(updateAgendaEvent)
  app.register(deleteAgendaEvent)
  app.register(monetaryIndexRoutes)
  app.register(getDocumentRequirements)
  app.register(createDocumentRequirement)
  app.register(updateDocumentRequirement)
  app.register(deleteDocumentRequirement)
  app.register(approveDocument)
  app.register(rejectDocument)

  // Labor Calculations
  app.register(createLaborCalculation)
  app.register(createLaborCalculationV3)
  app.register(listLaborCalculations)
  app.register(getLaborCalculation)
  app.register(getLaborCalculationStats)
  app.register(getActionItems)
  app.register(getNextAction)
  app.register(getFinanceSummary)
  app.register(settlementInstallmentsRoutes)
  app.register(simulateScenariosController)
  app.register(reindexLaborCalculationRoute)
  app.register(getCalculationAudit)
  app.register(updateLaborCalculation)
  app.register(updateLaborCalculationV3)
  app.register(updateLaborCalculationStatus)
  app.register(deleteLaborCalculation)
  app.register(restoreLaborCalculation)
  app.register(shareLaborCalculation)
  app.register(getSharedCalculation)
  app.register(generateDocument)

  // Calculadora pública: sem auth, sem organização, sem assinatura.
  app.register(createPublicCalculationRoute)
  app.register(createOvertimeCalculationRoute)
  app.register(createVacationAnd13thCalculationRoute)
  app.register(getPublicCalculationRoute)
  app.register(updatePublicContactRoute)
  app.register(claimPublicCalculationRoute)

  // Widget embutível: a rota de marca é pública (quem lê é visitante do site do
  // escritório); as outras três são do escritório dono da chave.
  app.register(getWidgetBrandingRoute)
  app.register(widgetSettingsRoutes)
  app.register(listWidgetCalculationsRoute)
  app.register(claimWidgetCalculationRoute)

  // Canal de suporte e sugestões do escritório.
  app.register(supportRoutes)

  // Painel do dono do produto — atravessa organizações, gateado por isAdmin.
  app.register(getPublicFunnelRoute)
  app.register(adminSupportRoutes)

  // Passivo trabalhista em lote
  app.register(batchAssessmentRoutes)

  // Settlements
  app.register(createSettlement)
  app.register(listSettlements)
  app.register(getSettlement)
  app.register(updateSettlement)
  app.register(deleteSettlement)
  app.register(settlementSimulation)

  // Hearings
  app.register(createHearing)
  app.register(listHearings)
  app.register(listAllHearings)
  app.register(updateHearing)
  app.register(deleteHearing)

  // Deadlines
  app.register(createDeadline)
  app.register(calculateDeadline)
  app.register(listDeadlines)
  app.register(listAllDeadlines)
  app.register(updateDeadline)
  app.register(deleteDeadline)

  // Notes
  app.register(createNote)
  app.register(listNotes)
  app.register(updateNote)
  app.register(deleteNote)

  // Mensagens — o canal com o cliente. Nota é interna; mensagem é o que sai
  // para o portal.
  // API pública medida. Namespace versionado: o app pode mudar as rotas dele
  // sem quebrar contrato com integrador.
  app.register(createV1Calculation)
  app.register(getV1Calculation)
  app.register(openapiV1)
  app.register(createApiKey)
  app.register(listApiKeys)
  app.register(getApiUsage)
  app.register(revokeApiKey)

  app.register(listMessages)
  app.register(createMessage)
  app.register(markMessagesRead)
  app.register(getUnreadMessageCount)
  app.register(getMessageUploadUrl)
  app.register(createMessageAttachment)
  app.register(streamCaseEvents)

  // Documents
  app.register(uploadDocumentUrl)
  app.register(confirmDocumentUploadLawyer)
  app.register(listDocuments)
  app.register(deleteDocument)

  // Document Templates
  app.register(createDocumentTemplate)
  app.register(listDocumentTemplates)
  app.register(getDocumentTemplate)
  app.register(updateDocumentTemplate)
  app.register(deleteDocumentTemplate)
  app.register(uploadDocumentTemplateFile)
  app.register(downloadDocumentTemplate)
  app.register(duplicateDocumentTemplate)
  app.register(validateDocumentTemplate)
  app.register(listPlaceholders)
  app.register(generateDocumentComposableController)

  // Client Portal
  app.register(signInClient)
  app.register(signOutClient)
  app.register(checkClientAuth)
  app.register(switchClientOrganization)
  app.register(changeClientPassword)
  app.register(forgotPassword)
  app.register(resetPassword)
  app.register(getPortalInvite)
  app.register(acceptPortalInvite)
  app.register(linkPortalInvite)
  app.register(getClientDashboard)
  app.register(listClientCases)
  app.register(getClientCase)
  app.register(getClientTimeline)
  app.register(getClientDocuments)
  app.register(getDocumentUploadUrl)
  app.register(confirmDocumentUpload)
  app.register(getDocumentDownloadUrl)
  app.register(getClientNotifications)
  app.register(markNotificationAsRead)
  app.register(markAllNotificationsAsRead)
  app.register(getClientSettlements)
  app.register(acceptSettlement)
  app.register(rejectSettlement)
  app.register(listClientCalculations)
  app.register(getClientCalculation)
  app.register(getCaseHearings)
  app.register(getCaseDeadlines)
  app.register(listClientMessages)
  app.register(createClientMessage)
  app.register(markClientMessagesRead)
  app.register(getClientUnreadMessageCount)
  app.register(getClientMessageUploadUrl)
  app.register(createClientMessageAttachment)
  app.register(streamClientCaseEvents)

  // Admin
}
