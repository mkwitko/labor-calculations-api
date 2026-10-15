-- Chave de teste: calcula, não cobra.
CREATE TYPE "ApiKeyMode" AS ENUM ('live', 'test');

ALTER TABLE "ApiKey"
  ADD COLUMN "mode" "ApiKeyMode" NOT NULL DEFAULT 'live';
