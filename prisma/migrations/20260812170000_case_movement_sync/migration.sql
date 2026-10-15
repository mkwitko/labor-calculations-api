-- Sincronização periódica de andamentos com o DataJud (CNJ).
--
-- `lastMovementSyncAt` marca quando o caso foi consultado pela última vez. Sem
-- ela o cron não teria como rodar em rodízio: consultaria os mesmos casos toda
-- noite e os do fim da fila nunca chegariam a ser vistos — e a API pública do
-- CNJ tem limite de requisições, então varrer tudo de uma vez não é opção.
ALTER TABLE "Case" ADD COLUMN "lastMovementSyncAt" TIMESTAMP(3);

-- Ordem de atendimento do cron: quem nunca foi sincronizado primeiro (NULLS
-- FIRST), depois o mais antigo.
CREATE INDEX "Case_lastMovementSyncAt_idx" ON "Case"("lastMovementSyncAt");
