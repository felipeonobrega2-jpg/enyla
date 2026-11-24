-- Prospector: etapas novas do envio automático (respondeu, encerrado_sem_resposta).
-- Só aditiva: solta e recria a constraint de etapa com os valores novos. Não apaga tabela nem linha e não muda dado gravado.
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo.
-- Não liga o envio: a chave prospector_envio_ativo (AppConfig) não é tocada aqui e começa desligada.
-- A constraint prospectos_parceiros_opt_out (opt_out exige opt_out_em e etapa descartado) continua como estava.

alter table prospectos_parceiros drop constraint if exists prospectos_parceiros_etapa;
alter table prospectos_parceiros add constraint prospectos_parceiros_etapa
  check (etapa in ('encontrado', 'qualificado', 'abordado', 'abriu', 'cadastrou', 'descartado', 'encerrado_sem_resposta', 'respondeu'));
