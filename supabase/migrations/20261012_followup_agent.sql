-- ============================================================
-- Fase 0 — Agente de Follow-up ENYLA
-- Rodar no Supabase SQL Editor (ou via supabase db push)
-- ============================================================

-- ── 1. Ampliar whatsapp_conversas ────────────────────────────

ALTER TABLE whatsapp_conversas
  ADD COLUMN IF NOT EXISTS status_lead TEXT DEFAULT 'novo'
    CHECK (status_lead IN ('novo','quente','morno','frio','morto','negociacao')),
  ADD COLUMN IF NOT EXISTS motivo_classificacao TEXT,
  ADD COLUMN IF NOT EXISTS perfil_hassan TEXT
    CHECK (perfil_hassan IN ('sim','parcial','nao')),
  ADD COLUMN IF NOT EXISTS telefone TEXT,       -- número limpo (ex: "5511999998888")
  ADD COLUMN IF NOT EXISTS campanha TEXT,        -- origem Meta Ads, se rastreável no jid/nome
  ADD COLUMN IF NOT EXISTS kanban_card_id TEXT,  -- ref ao KanbanCard quando virar pedido
  ADD COLUMN IF NOT EXISTS ultima_classificacao_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proxima_acao TEXT;    -- sugestão livre: "Perguntar prazo"

-- índice para filtragem rápida por status (agente usa bastante)
CREATE INDEX IF NOT EXISTS idx_wa_conversas_status_lead
  ON whatsapp_conversas(status_lead);

CREATE INDEX IF NOT EXISTS idx_wa_conversas_ultima_at
  ON whatsapp_conversas(ultima_at DESC);

-- ── 2. Criar quick_replies ───────────────────────────────────

CREATE TABLE IF NOT EXISTS quick_replies (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  atalho      TEXT UNIQUE NOT NULL,          -- ex: '/m1', '/orcamento', '/followup'
  quando_usar TEXT NOT NULL,                 -- instrução para o agente: "quando o lead perguntou preço"
  corpo       TEXT,                          -- texto com {{nome}} como variável; NULL se só imagem
  tem_anexo   BOOLEAN NOT NULL DEFAULT false,
  ativa       BOOLEAN NOT NULL DEFAULT true,
  ordem       INTEGER NOT NULL DEFAULT 0,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- seed com exemplos (ajuste os textos conforme sua voz de marca)
INSERT INTO quick_replies (atalho, quando_usar, corpo, tem_anexo, ordem) VALUES
  ('/m1',   'Primeiro contato após o lead mandar qualquer mensagem inicial',
   'Olá, {{nome}}! 👋 Aqui é da Enyla Embalagens. Vi sua mensagem e já vou te ajudar. Você está buscando embalagens para qual produto?',
   false, 1),
  ('/m2',   'Lead pediu orçamento ou perguntou preço',
   'Ótimo, {{nome}}! Para eu preparar um orçamento preciso, me informe: dimensões da caixa (L×A×P), quantidade aproximada e o material/impressão desejado.',
   false, 2),
  ('/m3',   'Lead sumiu depois de receber o orçamento (follow-up morno)',
   'Oi {{nome}}, tudo bem? Queria saber se o orçamento que enviei atendeu sua expectativa. Posso ajustar quantidade ou acabamento se precisar. 😊',
   false, 3),
  ('/m4',   'Lead frio — sem resposta há mais de 7 dias',
   'Olá {{nome}}! Passando pra saber se ainda tem interesse nas embalagens. Temos novidades em materiais que podem te interessar.',
   false, 4),
  ('/m5',   'Lead confirmou pedido e vai fazer o pagamento (quente/negociação)',
   'Perfeito, {{nome}}! Vou preparar o contrato e os dados de pagamento. Confirma o endereço de entrega?',
   false, 5)
ON CONFLICT (atalho) DO NOTHING;

-- ── 3. Garantir que a RPC incrementar_nao_lidas existe ───────
-- (deve já existir, mas recria com IF NOT EXISTS para segurança)

CREATE OR REPLACE FUNCTION incrementar_nao_lidas(p_jid TEXT)
RETURNS void AS $$
  UPDATE whatsapp_conversas
  SET nao_lidas = nao_lidas + 1
  WHERE jid = p_jid;
$$ LANGUAGE sql;
