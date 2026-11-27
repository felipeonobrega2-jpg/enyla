-- Prospector: trava de idempotência no envio (issue #249). Aditiva: só cria tabelas novas.
-- Um destino + uma campanha + um canal = um envio só. A reserva é um insert antes do envio; quem não inseriu não envia.
create table if not exists prospector_envios_idem (
  id bigserial primary key,
  prospecto_id bigint not null,
  canal text not null,
  campanha text not null,
  criado_em timestamptz not null default now(),
  unique (prospecto_id, canal, campanha)
);
-- Idempotency-Key da porta externa: mesma chave em 24 h devolve a resposta da primeira chamada.
create table if not exists porta_idempotencia (
  chave text primary key,
  status int,
  resposta jsonb,
  criado_em timestamptz not null default now()
);
alter table prospector_envios_idem enable row level security;
alter table porta_idempotencia enable row level security;
