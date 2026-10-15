-- AlterTable
ALTER TABLE "PublicCalculation" ADD COLUMN "perspective" TEXT NOT NULL DEFAULT 'trabalhador';

-- CreateIndex
CREATE INDEX "PublicCalculation_perspective_idx" ON "PublicCalculation"("perspective");
