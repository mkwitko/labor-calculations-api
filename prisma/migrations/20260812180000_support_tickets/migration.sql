-- Suporte e sugestões: o canal entre o escritório e o LexLaboral.
--
-- Um modelo só para dúvida, problema e sugestão — os três têm a mesma forma
-- (alguém escreve, alguém responde, o assunto anda até acabar). O chamado é da
-- organização, não da pessoa: quem abriu pode sair do escritório no meio da
-- conversa e o chamado continua sendo do escritório.
CREATE TYPE "SupportKind" AS ENUM ('duvida', 'problema', 'sugestao');

CREATE TYPE "SupportStatus" AS ENUM (
  'aberto',
  'em_analise',
  'aguardando_usuario',
  'planejado',
  'em_desenvolvimento',
  'concluido',
  'recusado'
);

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "kind" "SupportKind" NOT NULL,
  "status" "SupportStatus" NOT NULL DEFAULT 'aberto',
  "subject" TEXT NOT NULL,
  "context" JSONB,
  "userId" TEXT,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),

  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportMessage" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "fromStaff" BOOLEAN NOT NULL DEFAULT false,
  "userId" TEXT,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readByUserAt" TIMESTAMP(3),
  "readByStaffAt" TIMESTAMP(3),

  CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- Fila do escritório e fila do atendimento: as duas ordenadas pela última fala.
CREATE INDEX "SupportTicket_organizationId_lastMessageAt_idx" ON "SupportTicket"("organizationId", "lastMessageAt");
CREATE INDEX "SupportTicket_status_lastMessageAt_idx" ON "SupportTicket"("status", "lastMessageAt");
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");
CREATE INDEX "SupportMessage_organizationId_idx" ON "SupportMessage"("organizationId");

-- Autor sai para NULL quando a pessoa é removida: o chamado sobrevive a quem o
-- abriu. Mensagem morre junto com o chamado, que é o dono da conversa.
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
