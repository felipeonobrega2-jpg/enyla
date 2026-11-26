-- Termos de Parceria ENYLA: registro versionado do texto e do aceite. Só aditiva: nada é apagado nem alterado.
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem duplicar.
-- O texto final (com revisão jurídica) entra como NOVA linha em termos_parceria (versao nova, vigente_desde);
-- vale a mais recente já em vigor. Sem nenhuma linha, o sistema usa o rascunho 0.3 que está no código.

create table if not exists termos_parceria (
  versao         text primary key,
  texto          text not null,                       -- uma cláusula por linha; "{lista de tipos de serviço do formulário}" vira a lista do /parceiros
  vigente_desde  timestamptz not null default now(),
  rascunho       boolean not null default true,
  criado_em      timestamptz not null default now()
);
alter table termos_parceria enable row level security;

-- Aceites (cadastro de /parceiros ou fornecedor já em operação). Uma linha por aceite, nunca apagada.
create table if not exists termos_aceites (
  id          bigint generated always as identity primary key,
  origem      text not null check (origem in ('parceiros', 'fornecedor', 'prospecto')),
  referencia  text not null,                           -- id do cadastro (PAR-...) ou do fornecedor
  versao      text not null,
  aceito_em   timestamptz not null default now(),
  ip          text,
  user_agent  text
);
create index if not exists termos_aceites_ref on termos_aceites (origem, referencia);
alter table termos_aceites enable row level security;

-- Prospectos que já viraram cadastro: o aceite também fica na linha do prospecto
alter table prospectos_parceiros add column if not exists termos_versao text;
alter table prospectos_parceiros add column if not exists termos_aceitos_em timestamptz;
alter table prospectos_parceiros add column if not exists termos_ip text;
alter table prospectos_parceiros add column if not exists termos_user_agent text;
