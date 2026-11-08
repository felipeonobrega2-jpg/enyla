-- Módulo Caixaria: cadastro de facas (tela "Facas" na área Caixaria do sistema).
-- O site caixaria.com lê esta tabela: faca confirmada troca as medidas e os lugares por chapa da caixa,
-- e caixa marcada fora do site some da loja. Rodar uma vez no SQL Editor do Supabase.

create table if not exists caixaria_facas (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,          -- como a produção chama a faca (ex.: F-012)
  nome          text not null,
  tipo          text not null default 'simples', -- simples | fundo-automatico | tampa-aviao
  frente_mm     numeric(7,1) not null check (frente_mm > 0),   -- medidas internas da caixa montada
  lateral_mm    numeric(7,1) not null check (lateral_mm > 0),
  altura_mm     numeric(7,1) not null check (altura_mm > 0),
  lugares       int check (lugares > 0),        -- caixas por chapa 66x48 na faca real; vazio = calcular
  planificacao  text,                           -- "312 x 228 mm", quando veio do DXF
  produto_slug  text unique,                    -- caixa do site que usa esta faca (vazio = faca só interna)
  tem_faca      boolean not null default true,  -- false = a caixa do site não tem faca de verdade
  no_site       boolean not null default true,  -- false = não vender no site
  obs           text not null default '',
  criada_em     timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

-- Só o servidor acessa (chave de serviço), no sistema e no site
alter table caixaria_facas enable row level security;
