-- Conversa do caso entre escritório e cliente do portal. Aditiva: nenhuma
-- tabela existente muda de forma. `Note` continua onde está e passa a ser
-- exclusivamente interna (as rotas de nota do portal saem em migration/commit
-- próprio).

CREATE TYPE "MessageAuthorKind" AS ENUM ('lawyer', 'client');

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'message_received';

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorKind" "MessageAuthorKind" NOT NULL,
    "userId" TEXT,
    "clientId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "readByClientAt" TIMESTAMP(3),
    "readByLawyerAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Message_caseId_createdAt_idx" ON "Message"("caseId", "createdAt");
CREATE INDEX "Message_caseId_readByLawyerAt_idx" ON "Message"("caseId", "readByLawyerAt");
CREATE INDEX "Message_caseId_readByClientAt_idx" ON "Message"("caseId", "readByClientAt");
CREATE INDEX "Message_organizationId_idx" ON "Message"("organizationId");
CREATE UNIQUE INDEX "MessageAttachment_documentId_key" ON "MessageAttachment"("documentId");
CREATE INDEX "MessageAttachment_messageId_idx" ON "MessageAttachment"("messageId");
CREATE INDEX "MessageAttachment_organizationId_idx" ON "MessageAttachment"("organizationId");

ALTER TABLE "Message" ADD CONSTRAINT "Message_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
