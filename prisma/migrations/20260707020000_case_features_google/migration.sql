-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('verbas_rescisorias', 'horas_extras', 'equiparacao_salarial', 'desvio_funcao', 'danos_morais', 'rescisao_indireta', 'adicional_insalubridade', 'adicional_periculosidade', 'fgts_multa', 'reconhecimento_vinculo', 'outro');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('baixo', 'medio', 'alto');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('reclamante', 'reclamada', 'testemunha', 'paradigma', 'perito', 'advogado_contrario', 'outro');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('pendente', 'em_andamento', 'concluida');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('baixa', 'media', 'alta');

-- CreateEnum
CREATE TYPE "MovementSource" AS ENUM ('manual', 'datajud');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('percentual', 'fixo', 'exito');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "actionType" "ActionType",
ADD COLUMN     "riskLevel" "RiskLevel",
ADD COLUMN     "valorCausa" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Deadline" ADD COLUMN     "googleEventId" TEXT;

-- AlterTable
ALTER TABLE "Hearing" ADD COLUMN     "googleEventId" TEXT;

-- CreateTable
CREATE TABLE "GoogleIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "syncHearings" BOOLEAN NOT NULL DEFAULT true,
    "syncDeadlines" BOOLEAN NOT NULL DEFAULT true,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseParty" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "role" "PartyRole" NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseTask" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'pendente',
    "priority" "TaskPriority" NOT NULL DEFAULT 'media',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseMovement" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "code" TEXT,
    "description" TEXT NOT NULL,
    "source" "MovementSource" NOT NULL DEFAULT 'manual',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeAgreement" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "feeType" "FeeType" NOT NULL DEFAULT 'percentual',
    "percent" DECIMAL(5,2),
    "fixedValue" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleIntegration_userId_key" ON "GoogleIntegration"("userId");

-- CreateIndex
CREATE INDEX "CaseParty_caseId_idx" ON "CaseParty"("caseId");

-- CreateIndex
CREATE INDEX "CaseTask_caseId_idx" ON "CaseTask"("caseId");

-- CreateIndex
CREATE INDEX "CaseTask_caseId_status_idx" ON "CaseTask"("caseId", "status");

-- CreateIndex
CREATE INDEX "CaseMovement_caseId_idx" ON "CaseMovement"("caseId");

-- CreateIndex
CREATE INDEX "CaseMovement_caseId_date_idx" ON "CaseMovement"("caseId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CaseMovement_caseId_externalId_key" ON "CaseMovement"("caseId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeAgreement_caseId_key" ON "FeeAgreement"("caseId");

-- AddForeignKey
ALTER TABLE "GoogleIntegration" ADD CONSTRAINT "GoogleIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseParty" ADD CONSTRAINT "CaseParty_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseTask" ADD CONSTRAINT "CaseTask_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseMovement" ADD CONSTRAINT "CaseMovement_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAgreement" ADD CONSTRAINT "FeeAgreement_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

