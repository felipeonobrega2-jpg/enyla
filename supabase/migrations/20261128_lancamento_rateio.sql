-- Rateio de despesa por lote (porta externa, acao=lancar_despesa). Só aditiva; não rodar antes do merge.
-- rateioGrupoId liga as fatias (uma linha por lote) de uma mesma despesa; criadoPor guarda o diretor que lançou.
ALTER TABLE "LancamentoFinanceiro" ADD COLUMN IF NOT EXISTS "rateioGrupoId" TEXT, ADD COLUMN IF NOT EXISTS "criadoPor" TEXT;
