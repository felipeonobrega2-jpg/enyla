-- Termos de Parceria (issue #256): texto versionado e registro do aceite. Só aditiva: não altera nem apaga nada.
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem duplicar.
-- Para publicar o texto final (sem deploy): insira uma linha nova com versao nova, rascunho = false e vigente_desde = now().
-- A página /parceiros/termos mostra a linha mais recente com vigente_desde <= agora.

create table if not exists termos_parceria (
  versao        text primary key,
  texto         text not null,
  rascunho      boolean not null default true,
  vigente_desde timestamptz not null default now(),
  criado_em     timestamptz not null default now()
);

insert into termos_parceria (versao, texto, rascunho, vigente_desde) values (
  'rascunho-1',
  'RASCUNHO: texto provisório, sem valor jurídico. O texto final virá da ENYLA e do jurídico.' || E'\n\n' ||
  '1. Não contato com clientes. A parceira não pode contatar, direta ou indiretamente, nenhum cliente da ENYLA que conheça por meio dos pedidos recebidos, por 24 (vinte e quatro) meses após o último serviço prestado à ENYLA.' || E'\n\n' ||
  '2. Multa. O descumprimento desta cláusula sujeita a parceira a multa, cujo valor será definido no texto final.',
  true, now()
) on conflict (versao) do nothing;

-- Um registro por aceite (o cadastro em si fica no AppConfig). Guarda a versão que a parceira viu.
create table if not exists parceiros_termos_aceites (
  id                 bigint generated always as identity primary key,
  cadastro_id        text not null,
  documento          text,
  termos_versao      text not null,
  termos_aceitos_em  timestamptz not null default now(),
  ip                 text,
  user_agent         text
);
create index if not exists parceiros_termos_aceites_cadastro on parceiros_termos_aceites (cadastro_id);

-- Só o servidor (chave de serviço) acessa.
alter table termos_parceria enable row level security;
alter table parceiros_termos_aceites enable row level security;
