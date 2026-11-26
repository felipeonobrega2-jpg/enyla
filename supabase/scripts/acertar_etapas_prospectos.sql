-- Acerto único das etapas do funil do Prospector (26/11/2026). Rodar no SQL Editor do Supabase.
-- Só anda para frente e só grava no histórico: não apaga linha, não mexe em opt-out, descartado, cadastrou nem em outros campos.
--   1) quem recebeu WhatsApp nosso (from_me) desde a data abaixo e ainda está em encontrado/qualificado -> abordado
--   2) quem respondeu (mensagem recebida) desde a data abaixo e está em encontrado/qualificado/abordado/encerrado_sem_resposta -> respondeu
-- O casamento é pelo telefone: últimos 8 dígitos do número do jid contra o do prospecto (vale com e sem o 9 e com e sem 55).
-- Para só ver quem seria alterado, troque "update ... set" por "select" nos dois blocos (ou rode dentro de begin; ... rollback;).

begin;

with desde as (select '2026-11-26 00:00:00-03'::timestamptz as d)
update prospectos_parceiros p
set etapa = 'abordado',
    historico_etapas = p.historico_etapas || jsonb_build_array(jsonb_build_object('etapa', 'abordado', 'em', now(), 'motivo', 'acerto: já tinha recebido WhatsApp da ENYLA')),
    atualizado_em = now()
from desde
where p.opt_out = false
  and p.etapa in ('encontrado', 'qualificado')
  and length(regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g')) >= 10
  and exists (
    select 1 from whatsapp_mensagens m
    where m.from_me = true and m.jid like '%@s.whatsapp.net' and m.ts::timestamptz >= desde.d
      and right(regexp_replace(split_part(m.jid, '@', 1), '\D', '', 'g'), 8) = right(regexp_replace(p.telefone, '\D', '', 'g'), 8)
  );

with desde as (select '2026-11-26 00:00:00-03'::timestamptz as d)
update prospectos_parceiros p
set etapa = 'respondeu',
    historico_etapas = p.historico_etapas || jsonb_build_array(jsonb_build_object('etapa', 'respondeu', 'em', now(), 'motivo', 'acerto: respondeu no WhatsApp antes do registro automático')),
    atualizado_em = now()
from desde
where p.opt_out = false
  and p.etapa in ('encontrado', 'qualificado', 'abordado', 'encerrado_sem_resposta')
  and length(regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g')) >= 10
  and exists (
    select 1 from whatsapp_mensagens m
    where m.from_me = false and m.jid like '%@s.whatsapp.net' and m.ts::timestamptz >= desde.d
      and right(regexp_replace(split_part(m.jid, '@', 1), '\D', '', 'g'), 8) = right(regexp_replace(p.telefone, '\D', '', 'g'), 8)
  );

-- Confira o resultado e troque por "commit;" se estiver certo
select etapa, count(*) from prospectos_parceiros group by etapa order by etapa;
rollback;
