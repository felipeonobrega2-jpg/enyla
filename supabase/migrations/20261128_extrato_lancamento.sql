-- Extrato OFX importado no painel (Santander PJ) para o CFO conciliar. Só aditiva; não rodar antes do merge.
-- Dedupe por (conta, fitId): reimportar o mesmo período não duplica. Nada aqui altera despesas ou recebimentos.
create table if not exists "extratoLancamento" (
  id             uuid primary key default gen_random_uuid(),
  data           date not null,
  valor          numeric(14,2) not null check (valor >= 0),   -- sempre positivo; o sentido está em tipo
  tipo           text not null check (tipo in ('credito','debito')),
  descricao      text not null default '',
  "fitId"        text not null,
  conta          text not null,
  "arquivoOrigem" text,
  "importadoEm"  timestamptz not null default now(),
  unique (conta, "fitId")
);
create index if not exists "extratoLancamento_data" on "extratoLancamento" (data desc);
-- Mesmo padrão das demais tabelas: RLS ligado, sem políticas (o app acessa só no servidor, com a service role).
alter table "extratoLancamento" enable row level security;
