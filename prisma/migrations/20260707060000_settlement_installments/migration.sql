-- CreateTable
CREATE TABLE "SettlementInstallment" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SettlementInstallment_settlementId_idx" ON "SettlementInstallment"("settlementId");

-- CreateIndex
CREATE INDEX "SettlementInstallment_dueDate_idx" ON "SettlementInstallment"("dueDate");

-- AddForeignKey
ALTER TABLE "SettlementInstallment" ADD CONSTRAINT "SettlementInstallment_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

