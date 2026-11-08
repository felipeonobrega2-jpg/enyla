-- Módulo Caixaria: chapas compartilhadas (painel "Chapas" na área Caixaria do sistema).
-- Tabelas próprias da Caixaria, separadas da ENYLA. Os pedidos do site já ficam em caixaria_pedidos.
-- Rodar uma vez no SQL Editor do Supabase.

create table if not exists caixaria_chapas (
  id              uuid primary key default gen_random_uuid(),
  numero          bigint generated always as identity unique,   -- "Chapa 12"
  modelo          text not null,             -- slug da caixa no site (faca)
  modelo_nome     text not null,
  acabamento      text not null,             -- laminacao-fosca | laminacao-brilho
  expressa        boolean not null default false,   -- chapa exclusiva de um pedido expresso
  lugares         int not null check (lugares > 0), -- caixas desse modelo por chapa; cada lugar = 1.000 un
  formato         text not null,             -- 66x48
  rodada          numeric(12,2) not null,    -- custo fixo da chapa inteira (impressão + papel + laminação + corte)
  colagem_por_mil numeric(12,2) not null,
  status          text not null default 'aberta',   -- aberta | producao | pronta
  criada_em       timestamptz not null default now(),
  fechada_em      timestamptz,
  pronta_em       timestamptz
);
create index if not exists caixaria_chapas_status on caixaria_chapas (status, criada_em desc);

-- O que ocupa cada chapa: item de pedido do site, trabalho da ENYLA ou estoque de similares
create table if not exists caixaria_chapa_lugares (
  id               uuid primary key default gen_random_uuid(),
  chapa_id         uuid not null references caixaria_chapas(id) on delete cascade,
  tipo             text not null,            -- cliente | enyla | estoque
  lugares          int not null check (lugares > 0),
  descricao        text not null default '',
  pedido_id        uuid references caixaria_pedidos(id),
  pedido_numero    text,
  item_idx         int,
  parte            int not null default 0,   -- pedido maior que uma chapa: 0, 1, 2...
  cliente          text,
  telefone         text,
  marca            text,
  receita          numeric(12,2),
  frete            numeric(12,2),            -- frete embutido (ofertas do Google)
  arte             numeric(12,2),
  pago_em          timestamptz,
  arte_aprovada_em timestamptz,
  criado_em        timestamptz not null default now()
);
-- Um item de pedido nunca entra duas vezes (NULL não conflita: lugares da ENYLA/estoque ficam livres)
create unique index if not exists caixaria_chapa_lugares_item on caixaria_chapa_lugares (pedido_id, item_idx, parte);
create index if not exists caixaria_chapa_lugares_chapa on caixaria_chapa_lugares (chapa_id);

-- Só o servidor acessa (chave de serviço)
alter table caixaria_chapas enable row level security;
alter table caixaria_chapa_lugares enable row level security;
