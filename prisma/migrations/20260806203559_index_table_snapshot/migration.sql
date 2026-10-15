-- AlterTable
ALTER TABLE "LaborCalculation" ADD COLUMN     "engineVersion" TEXT,
ADD COLUMN     "indexSnapshotId" TEXT,
ADD COLUMN     "indexesUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "IndexTableSnapshot" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "entries" JSONB NOT NULL,
    "entryCount" INTEGER NOT NULL,
    "minMonth" TEXT NOT NULL,
    "maxMonth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexTableSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IndexTableSnapshot_hash_key" ON "IndexTableSnapshot"("hash");

-- CreateIndex
CREATE INDEX "IndexTableSnapshot_createdAt_idx" ON "IndexTableSnapshot"("createdAt");

-- CreateIndex
CREATE INDEX "LaborCalculation_indexSnapshotId_idx" ON "LaborCalculation"("indexSnapshotId");

-- AddForeignKey
ALTER TABLE "LaborCalculation" ADD CONSTRAINT "LaborCalculation_indexSnapshotId_fkey" FOREIGN KEY ("indexSnapshotId") REFERENCES "IndexTableSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
