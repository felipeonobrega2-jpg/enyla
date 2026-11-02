-- Corridas da Lalamove chamadas pelo sistema (uma linha por corrida). Atualizada pelo webhook e ao abrir o pedido.
create table if not exists fretes (
  order_id       text primary key,
  quotation_id   text,
  pedido_numero  text,
  card_id        text,
  lote_id        text,
  cliente        text,
  status         text not null default 'ASSIGNING_DRIVER',
  share_link     text,
  valor          numeric not null default 0,
  cobrar_cliente boolean not null default false,
  retirada       jsonb,
  entrega        jsonb,
  motorista      jsonb,
  veiculo        text,
  lancamentos    text[] not null default '{}',
  ambiente       text not null default 'sandbox',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists fretes_pedido on fretes (pedido_numero);
create index if not exists fretes_card on fretes (card_id);
create index if not exists fretes_lote on fretes (lote_id);

-- Várias paradas por corrida (página Entregas): [{ nome, texto, lat, lng }] na ordem da rota
alter table fretes add column if not exists paradas jsonb;
alter table fretes add column if not exists descricao text;
