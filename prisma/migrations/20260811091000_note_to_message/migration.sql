-- Nota escrita pelo cliente (clientId preenchido) era o único canal que ele
-- tinha; vira mensagem para não sumir da vista de ninguém. Nota do advogado
-- (clientId nulo) fica onde está e deixa de ser alcançável pelo portal — era
-- exatamente o que ele não devia ver.
--
-- `id` derivado do id da nota: rodar duas vezes não duplica.
INSERT INTO "Message" (
  "id", "caseId", "authorKind", "clientId", "body", "createdAt",
  "readByClientAt", "organizationId"
)
SELECT
  'mignote_' || n."id",
  n."caseId",
  'client'::"MessageAuthorKind",
  n."clientId",
  n."body",
  n."createdAt",
  n."createdAt",
  n."organizationId"
FROM "Note" n
WHERE n."clientId" IS NOT NULL
  AND n."deletedAt" IS NULL
ON CONFLICT ("id") DO NOTHING;
