-- Funil de conversas do WhatsApp.
--   ultima_recebida_at / ultima_enviada_at: quem está esperando resposta, quem esfriou (mantidas por gravarLote)
--   status_lead: etapa escolhida à mão no funil (novo, conversa, orcamento, negociando, pedido, perdido);
--     ultima_classificacao_at: quando foi escolhida. Os valores antigos (quente/morno/frio…) nunca foram usados.
alter table whatsapp_conversas add column if not exists ultima_recebida_at timestamptz;
alter table whatsapp_conversas add column if not exists ultima_enviada_at timestamptz;
alter table whatsapp_conversas drop constraint if exists whatsapp_conversas_status_lead_check;
alter table whatsapp_conversas alter column status_lead drop default;
update whatsapp_conversas set status_lead = null, ultima_classificacao_at = null;
