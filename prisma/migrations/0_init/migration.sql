-- CreateEnum
CREATE TYPE "TerminationType" AS ENUM ('sem_justa_causa', 'com_justa_causa', 'pedido_demissao', 'rescisao_indireta');

-- CreateEnum
CREATE TYPE "CalculationStatus" AS ENUM ('em_andamento', 'proposta_enviada', 'acordo_fechado', 'ajuizado');

-- CreateEnum
CREATE TYPE "SettlementFeeType" AS ENUM ('percentage', 'fixed');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('negotiating', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "CasePhase" AS ENUM ('pre_judicial', 'distribuido', 'conhecimento', 'recurso', 'execucao', 'encerrado');

-- CreateEnum
CREATE TYPE "HearingKind" AS ENUM ('inicial', 'conciliacao', 'instrucao', 'julgamento', 'outra');

-- CreateEnum
CREATE TYPE "DeadlineKind" AS ENUM ('contestacao', 'recurso_ordinario', 'embargos', 'outros');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('ctps', 'holerite', 'contrato', 'comprovante', 'outros');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('case_created', 'case_phase_changed', 'calc_linked', 'calc_unlinked', 'settlement_updated', 'doc_uploaded', 'doc_deleted', 'hearing_created', 'deadline_created', 'deadline_done', 'note_created', 'note_updated', 'note_deleted');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('pendente', 'enviado', 'aprovado', 'rejeitado');

-- CreateEnum
CREATE TYPE "DocumentTemplateType" AS ENUM ('parecer_tecnico', 'peticao_inicial', 'proposta_acordo', 'notificacao_extrajudicial', 'danos_morais', 'aviso_previo_indenizado', 'horas_extras_adicionais', 'fgts_e_multa', 'recurso_ordinario', 'contestacao', 'rescisao_indireta', 'termo_quitacao', 'customizado');

-- CreateEnum
CREATE TYPE "TimelineEventType" AS ENUM ('processo_iniciado', 'status_atualizado', 'audiencia_marcada', 'documento_enviado', 'documento_aprovado', 'documento_rejeitado', 'proposta_acordo', 'calculo_atualizado', 'sentenca_publicada', 'custom');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('timeline_event', 'document_rejected', 'settlement_received', 'hearing_scheduled', 'document_due_soon');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "mail" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "officeName" TEXT,
    "oabNumber" TEXT NOT NULL,
    "phone" TEXT,
    "logoUrl" TEXT,
    "address" TEXT,
    "website" TEXT,
    "bio" TEXT,
    "remindD3" BOOLEAN NOT NULL DEFAULT true,
    "remindD1" BOOLEAN NOT NULL DEFAULT true,
    "brandPrimaryColor" TEXT DEFAULT '#7e14ff',
    "letterheadUrl" TEXT,
    "stripeCustomerId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "mail" TEXT,
    "phone" TEXT,
    "password" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "userId" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborCalculation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "caseId" TEXT,
    "clientName" TEXT NOT NULL,
    "clientDocument" TEXT,
    "observations" TEXT,
    "calculationVersion" TEXT NOT NULL,
    "terminationType" "TerminationType" NOT NULL,
    "status" "CalculationStatus" NOT NULL DEFAULT 'em_andamento',
    "shareCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "lastSalary" DECIMAL(10,2) NOT NULL,
    "baseSalary" DECIMAL(10,2) NOT NULL,
    "unpaid13ths" INTEGER NOT NULL,
    "vacationCount" INTEGER NOT NULL,
    "vacationVencidasCount" INTEGER NOT NULL DEFAULT 0,
    "priorNoticeWorked" BOOLEAN NOT NULL,
    "priorNoticeDate" TIMESTAMP(3),
    "extraHours" DECIMAL(10,2) NOT NULL,
    "nightHours" DECIMAL(10,2) NOT NULL,
    "insalubrityLevel" INTEGER NOT NULL,
    "dangerousWork" BOOLEAN NOT NULL,
    "applyArt477Fine" BOOLEAN NOT NULL DEFAULT false,
    "lastThreeSalariesAvg" DECIMAL(10,2) NOT NULL,
    "nightAdditionalPercent" INTEGER NOT NULL DEFAULT 20,
    "satRate" DECIMAL(10,2) NOT NULL DEFAULT 0.03,
    "employerInssRate" DECIMAL(10,2) NOT NULL DEFAULT 0.20,
    "honorariosRate" DECIMAL(10,2) NOT NULL DEFAULT 0.15,
    "irpfDependents" INTEGER NOT NULL DEFAULT 0,
    "filingDate" TIMESTAMP(3),
    "liquidationDate" TIMESTAMP(3),
    "priorNoticeValue" DECIMAL(10,2) NOT NULL,
    "thirteenthSalaryValue" DECIMAL(10,2) NOT NULL,
    "vacationValue" DECIMAL(10,2) NOT NULL,
    "fgtsValue" DECIMAL(10,2) NOT NULL,
    "fgtsFineValue" DECIMAL(10,2) NOT NULL,
    "unemploymentInsuranceValue" DECIMAL(10,2) NOT NULL,
    "extraHoursValue" DECIMAL(10,2) NOT NULL,
    "nightAdditionalValue" DECIMAL(10,2) NOT NULL,
    "insalubrityValue" DECIMAL(10,2) NOT NULL,
    "dangerousWorkValue" DECIMAL(10,2) NOT NULL,
    "art477FineValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalValue" DECIMAL(10,2) NOT NULL,
    "reflexo13thValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reflexoVacationValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reflexoFGTSValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reflexoMultaFGTSValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "doubleVacationValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "saldoSalarioValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "correctionTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "interestTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "inssEmployeeValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "inssEmployerValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "satRatValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "irpfValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "custasJudiciaisValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "honorariosSucumbenciaValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "honorariosIrpfValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "honorariosLiquidosValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "brutoDevidoReclamante" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalDescontos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "liquidoDevidoReclamante" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalDevidoReclamado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "percentualRemuneratorio" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "LaborCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FgtsMonthlyEntry" (
    "id" TEXT NOT NULL,
    "laborCalculationId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "base" DOUBLE PRECISION NOT NULL,
    "aliquot" DOUBLE PRECISION NOT NULL,
    "deposit" DOUBLE PRECISION NOT NULL,
    "corrected" DOUBLE PRECISION NOT NULL,
    "correctionAmount" DOUBLE PRECISION NOT NULL,
    "interest" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FgtsMonthlyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryHistory" (
    "id" TEXT NOT NULL,
    "laborCalculationId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "baseSalary" DOUBLE PRECISION NOT NULL,
    "lastSalary" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnpaidSalary" (
    "id" TEXT NOT NULL,
    "laborCalculationId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "daysWorked" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnpaidSalary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "laborCalculationId" TEXT NOT NULL,
    "agreementRate" DECIMAL(10,2) NOT NULL,
    "feeType" "SettlementFeeType" NOT NULL DEFAULT 'percentage',
    "feeValue" DECIMAL(10,2) NOT NULL,
    "agreementValue" DECIMAL(10,2) NOT NULL,
    "feeAmount" DECIMAL(10,2) NOT NULL,
    "netToClient" DECIMAL(10,2) NOT NULL,
    "estimatedTime" TEXT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'negotiating',
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonetaryIndex" (
    "id" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "ipcaE" DECIMAL(10,2) NOT NULL,
    "ipcaECumulative" DECIMAL(10,2) NOT NULL,
    "selic" DECIMAL(10,2) NOT NULL,
    "selicCumulative" DECIMAL(10,2) NOT NULL,
    "trd" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonetaryIndex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "sessionId" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "userId" TEXT,
    "userAgent" TEXT,
    "requestBody" TEXT,
    "responseBody" TEXT,
    "responseTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "title" TEXT NOT NULL,
    "processNumber" TEXT,
    "court" TEXT,
    "vara" TEXT,
    "phase" "CasePhase" NOT NULL DEFAULT 'pre_judicial',
    "observations" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hearing" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "kind" "HearingKind" NOT NULL,
    "location" TEXT,
    "link" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hearing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deadline" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "kind" "DeadlineKind" NOT NULL,
    "customLabel" TEXT,
    "doneAt" TIMESTAMP(3),
    "autoCalculatedFromHearingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRequirement" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "customName" TEXT,
    "description" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pendente',
    "documentId" TEXT,
    "rejectionReason" TEXT,
    "dueDate" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "items" JSONB NOT NULL,
    "type" "DocumentTemplateType" NOT NULL DEFAULT 'customizado',
    "fileKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "TimelineEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "responsible" TEXT,
    "nextSteps" TEXT,
    "attachments" TEXT[],
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientNotification" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_document_key" ON "User"("document");

-- CreateIndex
CREATE UNIQUE INDEX "User_mail_key" ON "User"("mail");

-- CreateIndex
CREATE UNIQUE INDEX "User_oabNumber_key" ON "User"("oabNumber");

-- CreateIndex
CREATE INDEX "Client_userId_idx" ON "Client"("userId");

-- CreateIndex
CREATE INDEX "Client_userId_document_idx" ON "Client"("userId", "document");

-- CreateIndex
CREATE INDEX "Client_mail_idx" ON "Client"("mail");

-- CreateIndex
CREATE INDEX "LaborCalculation_userId_idx" ON "LaborCalculation"("userId");

-- CreateIndex
CREATE INDEX "LaborCalculation_shareCode_idx" ON "LaborCalculation"("shareCode");

-- CreateIndex
CREATE INDEX "LaborCalculation_userId_status_idx" ON "LaborCalculation"("userId", "status");

-- CreateIndex
CREATE INDEX "LaborCalculation_userId_createdAt_idx" ON "LaborCalculation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LaborCalculation_caseId_idx" ON "LaborCalculation"("caseId");

-- CreateIndex
CREATE INDEX "FgtsMonthlyEntry_laborCalculationId_idx" ON "FgtsMonthlyEntry"("laborCalculationId");

-- CreateIndex
CREATE UNIQUE INDEX "FgtsMonthlyEntry_laborCalculationId_month_key" ON "FgtsMonthlyEntry"("laborCalculationId", "month");

-- CreateIndex
CREATE INDEX "SalaryHistory_laborCalculationId_idx" ON "SalaryHistory"("laborCalculationId");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryHistory_laborCalculationId_month_key" ON "SalaryHistory"("laborCalculationId", "month");

-- CreateIndex
CREATE INDEX "UnpaidSalary_laborCalculationId_idx" ON "UnpaidSalary"("laborCalculationId");

-- CreateIndex
CREATE UNIQUE INDEX "UnpaidSalary_laborCalculationId_month_key" ON "UnpaidSalary"("laborCalculationId", "month");

-- CreateIndex
CREATE INDEX "Settlement_laborCalculationId_idx" ON "Settlement"("laborCalculationId");

-- CreateIndex
CREATE INDEX "Settlement_laborCalculationId_status_idx" ON "Settlement"("laborCalculationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MonetaryIndex_month_key" ON "MonetaryIndex"("month");

-- CreateIndex
CREATE INDEX "RequestLog_userId_idx" ON "RequestLog"("userId");

-- CreateIndex
CREATE INDEX "RequestLog_sessionId_idx" ON "RequestLog"("sessionId");

-- CreateIndex
CREATE INDEX "RequestLog_statusCode_idx" ON "RequestLog"("statusCode");

-- CreateIndex
CREATE INDEX "RequestLog_createdAt_idx" ON "RequestLog"("createdAt");

-- CreateIndex
CREATE INDEX "RequestLog_userId_createdAt_idx" ON "RequestLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestLog_createdAt_statusCode_idx" ON "RequestLog"("createdAt", "statusCode");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_family_idx" ON "RefreshToken"("family");

-- CreateIndex
CREATE INDEX "RefreshToken_tokenHash_idx" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "Case_userId_idx" ON "Case"("userId");

-- CreateIndex
CREATE INDEX "Case_userId_phase_idx" ON "Case"("userId", "phase");

-- CreateIndex
CREATE INDEX "Case_userId_createdAt_idx" ON "Case"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Case_processNumber_idx" ON "Case"("processNumber");

-- CreateIndex
CREATE INDEX "Hearing_caseId_idx" ON "Hearing"("caseId");

-- CreateIndex
CREATE INDEX "Hearing_scheduledAt_idx" ON "Hearing"("scheduledAt");

-- CreateIndex
CREATE INDEX "Document_caseId_idx" ON "Document"("caseId");

-- CreateIndex
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");

-- CreateIndex
CREATE INDEX "Deadline_caseId_idx" ON "Deadline"("caseId");

-- CreateIndex
CREATE INDEX "Deadline_dueAt_idx" ON "Deadline"("dueAt");

-- CreateIndex
CREATE INDEX "Note_caseId_idx" ON "Note"("caseId");

-- CreateIndex
CREATE INDEX "Note_caseId_createdAt_idx" ON "Note"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_caseId_idx" ON "Activity"("caseId");

-- CreateIndex
CREATE INDEX "Activity_caseId_createdAt_idx" ON "Activity"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentRequirement_documentId_key" ON "DocumentRequirement"("documentId");

-- CreateIndex
CREATE INDEX "DocumentRequirement_caseId_status_idx" ON "DocumentRequirement"("caseId", "status");

-- CreateIndex
CREATE INDEX "DocumentRequirement_caseId_order_idx" ON "DocumentRequirement"("caseId", "order");

-- CreateIndex
CREATE INDEX "DocumentTemplate_userId_idx" ON "DocumentTemplate"("userId");

-- CreateIndex
CREATE INDEX "DocumentTemplate_isSystem_idx" ON "DocumentTemplate"("isSystem");

-- CreateIndex
CREATE INDEX "DocumentTemplate_type_idx" ON "DocumentTemplate"("type");

-- CreateIndex
CREATE INDEX "TimelineEvent_caseId_date_idx" ON "TimelineEvent"("caseId", "date");

-- CreateIndex
CREATE INDEX "TimelineEvent_caseId_isVisible_idx" ON "TimelineEvent"("caseId", "isVisible");

-- CreateIndex
CREATE INDEX "ClientNotification_clientId_isRead_idx" ON "ClientNotification"("clientId", "isRead");

-- CreateIndex
CREATE INDEX "ClientNotification_createdAt_idx" ON "ClientNotification"("createdAt");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborCalculation" ADD CONSTRAINT "LaborCalculation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborCalculation" ADD CONSTRAINT "LaborCalculation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborCalculation" ADD CONSTRAINT "LaborCalculation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FgtsMonthlyEntry" ADD CONSTRAINT "FgtsMonthlyEntry_laborCalculationId_fkey" FOREIGN KEY ("laborCalculationId") REFERENCES "LaborCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryHistory" ADD CONSTRAINT "SalaryHistory_laborCalculationId_fkey" FOREIGN KEY ("laborCalculationId") REFERENCES "LaborCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnpaidSalary" ADD CONSTRAINT "UnpaidSalary_laborCalculationId_fkey" FOREIGN KEY ("laborCalculationId") REFERENCES "LaborCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_laborCalculationId_fkey" FOREIGN KEY ("laborCalculationId") REFERENCES "LaborCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_autoCalculatedFromHearingId_fkey" FOREIGN KEY ("autoCalculatedFromHearingId") REFERENCES "Hearing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequirement" ADD CONSTRAINT "DocumentRequirement_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequirement" ADD CONSTRAINT "DocumentRequirement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNotification" ADD CONSTRAINT "ClientNotification_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

