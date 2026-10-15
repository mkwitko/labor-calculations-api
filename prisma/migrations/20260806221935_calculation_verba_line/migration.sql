-- CreateTable
CREATE TABLE "CalculationVerbaLine" (
    "id" TEXT NOT NULL,
    "laborCalculationId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "legalRef" TEXT,
    "bruto" DECIMAL(12,2) NOT NULL,
    "corrigido" DECIMAL(12,2) NOT NULL,
    "juros" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalculationVerbaLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalculationVerbaLine_laborCalculationId_idx" ON "CalculationVerbaLine"("laborCalculationId");

-- CreateIndex
CREATE UNIQUE INDEX "CalculationVerbaLine_laborCalculationId_order_key" ON "CalculationVerbaLine"("laborCalculationId", "order");

-- AddForeignKey
ALTER TABLE "CalculationVerbaLine" ADD CONSTRAINT "CalculationVerbaLine_laborCalculationId_fkey" FOREIGN KEY ("laborCalculationId") REFERENCES "LaborCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
