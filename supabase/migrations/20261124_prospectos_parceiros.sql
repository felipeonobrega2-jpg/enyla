-- Prospector de Parceiros: gráficas candidatas à rede ENYLA (base em Barueri-SP).
-- Só a base, a nota e o funil. Não envia e-mail nem WhatsApp e não mexe em tabela que já existe.
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem duplicar.
-- O desenho está em docs/prospector.md.

create table if not exists prospectos_parceiros (
  id                 bigint generated always as identity primary key,
  cnpj               text not null,
  razao_social       text not null,
  nome_fantasia      text,
  cnae_principal     text,
  cnaes_secundarios  text[] not null default '{}',
  servicos           text[] not null default '{}',   -- offset, digital, corteVinco, colagem, acabamento, hotStamping, cartonagem
  situacao           text,                            -- ATIVA, BAIXADA, SUSPENSA, INAPTA, NULA (ou o código 02 da Receita)
  abertura           date,
  porte              text,                            -- MEI, ME, EPP, DEMAIS (ou 01, 03, 05)
  municipio          text,
  uf                 text,
  cep                text,
  endereco           text,
  latitude           double precision,
  longitude          double precision,
  email              text,                            -- e-mail do cadastro da Receita; este PR não envia nada
  telefone           text,                            -- telefone do cadastro da Receita; este PR não liga nem manda WhatsApp
  fonte              text,
  coletado_em        timestamptz,
  nota               smallint,
  etapa              text not null default 'encontrado',
  historico_etapas   jsonb not null default '[]'::jsonb,  -- [{ "etapa", "em", "motivo"? }]
  opt_out            boolean not null default false,      -- "não quero receber"
  opt_out_em         timestamptz,
  criado_em          timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  constraint prospectos_parceiros_cnpj check (cnpj ~ '^[0-9]{14}$'),
  constraint prospectos_parceiros_etapa check (etapa in ('encontrado', 'qualificado', 'abordado', 'abriu', 'cadastrou', 'descartado')),
  constraint prospectos_parceiros_nota check (nota is null or (nota >= 0 and nota <= 100)),
  constraint prospectos_parceiros_opt_out check (
    (opt_out = false and opt_out_em is null)
    or (opt_out = true and opt_out_em is not null and etapa = 'descartado')
  )
);

create unique index if not exists prospectos_parceiros_cnpj on prospectos_parceiros (cnpj);
create index if not exists prospectos_parceiros_etapa on prospectos_parceiros (etapa) where opt_out = false;

-- Só o servidor (chave de serviço) acessa. Sem política, o anon não lê.
alter table prospectos_parceiros enable row level security;
