-- Widen numeric precision so cumulative factors and TR keep full precision.
ALTER TABLE "MonetaryIndex"
  ALTER COLUMN "ipcaE" SET DATA TYPE DECIMAL(18,8),
  ALTER COLUMN "ipcaECumulative" SET DATA TYPE DECIMAL(18,8),
  ALTER COLUMN "selic" SET DATA TYPE DECIMAL(18,8),
  ALTER COLUMN "selicCumulative" SET DATA TYPE DECIMAL(18,8),
  ALTER COLUMN "trd" SET DATA TYPE DECIMAL(18,8);

-- Track the row origin (auto-synced from Banco Central vs manual admin edit).
ALTER TABLE "MonetaryIndex" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';

-- Auditing.
ALTER TABLE "MonetaryIndex" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
