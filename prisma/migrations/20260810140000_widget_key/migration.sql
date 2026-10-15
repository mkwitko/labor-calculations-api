-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "widgetKey" TEXT;

-- AlterTable
ALTER TABLE "PublicCalculation" ADD COLUMN     "widgetOrganizationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_widgetKey_key" ON "Organization"("widgetKey");

-- CreateIndex
CREATE INDEX "PublicCalculation_widgetOrganizationId_createdAt_idx" ON "PublicCalculation"("widgetOrganizationId", "createdAt");
