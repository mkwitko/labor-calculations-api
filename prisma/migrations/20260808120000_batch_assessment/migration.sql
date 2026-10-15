-- CreateTable
CREATE TABLE "BatchAssessment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "indexSnapshotId" TEXT,
    "engineVersion" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "severanceCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "exposure" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gap" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BatchAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchAssessmentRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "severanceCost" DECIMAL(14,2),
    "exposure" DECIMAL(14,2),
    "gap" DECIMAL(14,2),
    "error" TEXT,

    CONSTRAINT "BatchAssessmentRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BatchAssessment_organizationId_createdAt_idx" ON "BatchAssessment"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "BatchAssessment_clientId_idx" ON "BatchAssessment"("clientId");

-- CreateIndex
CREATE INDEX "BatchAssessmentRow_batchId_order_idx" ON "BatchAssessmentRow"("batchId", "order");

-- AddForeignKey
ALTER TABLE "BatchAssessment" ADD CONSTRAINT "BatchAssessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchAssessment" ADD CONSTRAINT "BatchAssessment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchAssessment" ADD CONSTRAINT "BatchAssessment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchAssessmentRow" ADD CONSTRAINT "BatchAssessmentRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BatchAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
