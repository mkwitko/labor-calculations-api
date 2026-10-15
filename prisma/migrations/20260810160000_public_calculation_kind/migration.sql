-- Qual calculadora gerou o registro: "rescisao" (wizard de sete passos),
-- "horas_extras" ou "ferias_13". Aditiva: o default preserva as linhas que já
-- existem, todas nascidas do wizard de rescisão.
ALTER TABLE "PublicCalculation" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'rescisao';

CREATE INDEX "PublicCalculation_kind_createdAt_idx" ON "PublicCalculation"("kind", "createdAt");
