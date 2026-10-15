-- CreateEnum
CREATE TYPE "SalaryDifferenceType" AS ENUM ('equiparacao', 'desvio_funcao');

-- CreateEnum
CREATE TYPE "CustomVerbaNature" AS ENUM ('indenizatoria', 'salarial');

-- AlterTable
ALTER TABLE "LaborCalculation" ADD COLUMN     "applyArt467" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "applyPrescricaoQuinquenal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "art467Value" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "customVerbasReflexosValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "outrasVerbasValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paradigmName" TEXT,
ADD COLUMN     "prescricaoCutoff" TIMESTAMP(3),
ADD COLUMN     "salaryDifferenceApplyReflexos" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "salaryDifferenceReflexosValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "salaryDifferenceType" "SalaryDifferenceType",
ADD COLUMN     "salaryDifferenceValue" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SalaryDifferencePeriod" (
    "id" TEXT NOT NULL,
    "laborCalculationId" TEXT NOT NULL,
    "startMonth" TIMESTAMP(3) NOT NULL,
    "endMonth" TIMESTAMP(3) NOT NULL,
    "dueSalary" DOUBLE PRECISION NOT NULL,
    "receivedSalary" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryDifferencePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryDifferenceEntry" (
    "id" TEXT NOT NULL,
    "laborCalculationId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "due" DOUBLE PRECISION NOT NULL,
    "received" DOUBLE PRECISION NOT NULL,
    "diff" DOUBLE PRECISION NOT NULL,
    "corrected" DOUBLE PRECISION NOT NULL,
    "correctionAmount" DOUBLE PRECISION NOT NULL,
    "interest" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryDifferenceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomVerba" (
    "id" TEXT NOT NULL,
    "laborCalculationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyValue" DOUBLE PRECISION NOT NULL,
    "startMonth" TIMESTAMP(3) NOT NULL,
    "endMonth" TIMESTAMP(3) NOT NULL,
    "nature" "CustomVerbaNature" NOT NULL DEFAULT 'indenizatoria',
    "brutoValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "correctedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interestValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomVerba_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalaryDifferencePeriod_laborCalculationId_idx" ON "SalaryDifferencePeriod"("laborCalculationId");

-- CreateIndex
CREATE INDEX "SalaryDifferenceEntry_laborCalculationId_idx" ON "SalaryDifferenceEntry"("laborCalculationId");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryDifferenceEntry_laborCalculationId_month_key" ON "SalaryDifferenceEntry"("laborCalculationId", "month");

-- CreateIndex
CREATE INDEX "CustomVerba_laborCalculationId_idx" ON "CustomVerba"("laborCalculationId");

-- AddForeignKey
ALTER TABLE "SalaryDifferencePeriod" ADD CONSTRAINT "SalaryDifferencePeriod_laborCalculationId_fkey" FOREIGN KEY ("laborCalculationId") REFERENCES "LaborCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryDifferenceEntry" ADD CONSTRAINT "SalaryDifferenceEntry_laborCalculationId_fkey" FOREIGN KEY ("laborCalculationId") REFERENCES "LaborCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomVerba" ADD CONSTRAINT "CustomVerba_laborCalculationId_fkey" FOREIGN KEY ("laborCalculationId") REFERENCES "LaborCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
