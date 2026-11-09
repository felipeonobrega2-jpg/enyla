-- Módulo Caixaria: configuração própria (tela "Custos" na área Caixaria do sistema).
-- Separada do AppConfig da ENYLA. O site caixaria.com lê a chave "custos" para calcular os preços.
-- Rodar uma vez no SQL Editor do Supabase.

create table if not exists caixaria_config (
  chave         text primary key,                 -- "custos"
  dados         jsonb not null default '{}'::jsonb,
  atualizada_em timestamptz not null default now()
);

-- Só o servidor acessa (chave de serviço), no sistema e no site
alter table caixaria_config enable row level security;
