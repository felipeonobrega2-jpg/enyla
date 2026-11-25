-- Fila de respostas por e-mail aos prospectos (ação responder_prospecto da porta externa).
-- Só aditiva: cria a tabela nova. Não apaga nem altera nada existente. Rodar uma vez no SQL Editor do Supabase; pode rodar de novo.
-- RLS ligada e sem políticas: o app usa a service key (como nas outras tabelas).

create table if not exists emails_saida_fila (
  id bigint generated always as identity primary key,
  prospecto_id bigint not null,
  para text not null,
  assunto text not null,
  texto text not null,
  diretor text not null,
  status text not null default 'na_fila' check (status in ('na_fila', 'enviado', 'falhou')),
  tentativas integer not null default 0,
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  resend_id text
);

create index if not exists emails_saida_fila_status_criado on emails_saida_fila (status, criado_em);
create index if not exists emails_saida_fila_enviado_em on emails_saida_fila (enviado_em);

alter table emails_saida_fila enable row level security;
