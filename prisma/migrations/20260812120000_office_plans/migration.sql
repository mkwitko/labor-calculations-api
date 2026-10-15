-- Planos por escritório: a cobrança deixa de ser por assento e passa a ser um
-- plano com teto de pessoas. O código do plano precisa existir antes de haver
-- assinatura (organização em trial ainda não tem uma), por isso mora aqui e não
-- só no Stripe. "solo" é o default porque é onde toda organização nova começa.
ALTER TABLE "Organization" ADD COLUMN "planCode" TEXT NOT NULL DEFAULT 'solo';
