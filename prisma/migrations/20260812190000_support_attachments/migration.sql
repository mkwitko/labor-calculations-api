-- Anexo no suporte: print da tela, vídeo do erro, PDF de fatura.
--
-- Tabela própria em vez de `Document` porque documento pertence a um caso e
-- aparece na pasta do cliente — print de suporte não é peça do processo. Só a
-- chave do R2 é persistida; a URL de leitura é assinada a cada requisição.
CREATE TYPE "SupportScanStatus" AS ENUM ('pending', 'clean', 'infected', 'skipped');

CREATE TABLE "SupportAttachment" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "fileKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "scanStatus" "SupportScanStatus" NOT NULL DEFAULT 'pending',
  "scanDetail" TEXT,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupportAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportAttachment_messageId_idx" ON "SupportAttachment"("messageId");
CREATE INDEX "SupportAttachment_organizationId_idx" ON "SupportAttachment"("organizationId");

ALTER TABLE "SupportAttachment"
  ADD CONSTRAINT "SupportAttachment_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "SupportMessage"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportAttachment"
  ADD CONSTRAINT "SupportAttachment_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
