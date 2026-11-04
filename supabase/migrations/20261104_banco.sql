-- Extrato do banco (Pluggy / Meu Pluggy). Fica separado dos lançamentos: cada transação só vira (ou se liga a)
-- um lançamento quando você aprova ou quando uma regra sua manda.
create table if not exists banco_transacoes (
  id                text primary key,            -- id da transação na Pluggy
  conta_id          text not null,
  conta_nome        text,
  data              date not null,
  valor             numeric not null,            -- sempre positivo
  tipo              text not null,               -- entrada | saida
  descricao         text not null default '',
  contraparte_nome  text,
  contraparte_doc   text,
  categoria_pluggy  text,
  estado            text not null default 'pendente',   -- pendente | vinculada | criada | ignorada
  lancamento_ids    text[] not null default '{}',
  sugestao          jsonb,
  historico         jsonb not null default '[]',
  bruto             jsonb,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
create index if not exists banco_transacoes_estado on banco_transacoes (estado);
create index if not exists banco_transacoes_data on banco_transacoes (data desc);
