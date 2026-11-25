-- Estorno lógico de lançamentos (porta externa, acao=lancamento/conciliacao). Só aditiva; não rodar antes do merge.
ALTER TABLE "LancamentoFinanceiro" ADD COLUMN IF NOT EXISTS "estornadoEm" TEXT, ADD COLUMN IF NOT EXISTS "estornadoPor" TEXT;
