-- AlterTable
ALTER TABLE "LaborCalculation" ADD COLUMN     "intervalIntrajornadaHours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "intervalIntrajornadaValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "transferAdditionalMonths" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "transferAdditionalValue" DECIMAL(10,2) NOT NULL DEFAULT 0;

