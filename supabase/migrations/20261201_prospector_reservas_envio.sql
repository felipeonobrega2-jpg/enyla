-- Prospector: trava de idempotência do envio. Um prospecto + um canal + uma campanha = um envio só.
-- Só aditiva (create if not exists). Pode rodar de novo. Rodar ANTES de ligar o envio de e-mail desta versão:
-- sem a tabela o e-mail não sai (falha fechada, para nunca mandar em dobro).
-- A campanha é o passo (primeiro_contato, lembrete): o assunto A/B não entra na chave.
create table if not exists prospector_reservas_envio (
  id bigserial primary key,
  prospecto_id bigint not null,
  canal text not null check (canal in ('whatsapp', 'email')),
  campanha text not null,
  criada_em timestamptz not null default now(),
  constraint prospector_reservas_envio_unico unique (prospecto_id, canal, campanha)
);

-- Cada tentativa barrada (duplicada ou falha ao reservar) fica registrada.
create table if not exists prospector_envios_barrados (
  id bigserial primary key,
  prospecto_id bigint not null,
  canal text not null,
  campanha text not null,
  motivo text not null,
  em timestamptz not null default now()
);

alter table prospector_reservas_envio enable row level security;
alter table prospector_envios_barrados enable row level security;
