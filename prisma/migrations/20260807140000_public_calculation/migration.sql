-- CreateTable
CREATE TABLE "PublicCalculation" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "input" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "indexSnapshotId" TEXT,
    "source" TEXT NOT NULL,
    "referrerHost" TEXT,
    "invitedEmail" TEXT,
    "invitedAt" TIMESTAMP(3),
    "claimedByOrganizationId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "clientId" TEXT,
    "laborCalculationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicCalculation_tokenHash_key" ON "PublicCalculation"("tokenHash");

-- CreateIndex
CREATE INDEX "PublicCalculation_email_idx" ON "PublicCalculation"("email");

-- CreateIndex
CREATE INDEX "PublicCalculation_claimedByOrganizationId_idx" ON "PublicCalculation"("claimedByOrganizationId");

-- CreateIndex
CREATE INDEX "PublicCalculation_expiresAt_idx" ON "PublicCalculation"("expiresAt");
