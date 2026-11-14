-- Registro do agente fora do AppConfig. O registro, os ids das mensagens do agente e a trava "mensagem já tratada"
-- eram listas dentro da configuração (~200 KB lidos e regravados a cada mensagem): com volume, isso sufocava o banco
-- e duas gravações ao mesmo tempo podiam se atropelar. Agora cada evento é uma linha.
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem duplicar.

create table if not exists agente_registro (
  id      bigint generated always as identity primary key,
  em      timestamptz not null,
  jid     text not null,
  nome    text,
  perfil  text,
  enviou  boolean not null default false,
  texto   text,
  motivo  text,
  passo   text,
  ids     text[] not null default '{}'
);
create index if not exists agente_registro_em on agente_registro (em desc);
create index if not exists agente_registro_jid on agente_registro (jid, em desc);
-- Mesmo evento não entra duas vezes (cópia do registro antigo rodada de novo)
create unique index if not exists agente_registro_unico on agente_registro (jid, em, motivo);

create table if not exists agente_mensagens (       -- mensagens que o agente mandou (para separar das suas)
  id  text primary key,
  em  timestamptz not null default now()
);
create index if not exists agente_mensagens_em on agente_mensagens (em desc);

create table if not exists agente_tratadas (        -- mensagem do lead já pega por uma execução (só uma responde)
  id  text primary key,
  em  timestamptz not null default now()
);

alter table agente_registro  enable row level security;
alter table agente_mensagens enable row level security;
alter table agente_tratadas  enable row level security;

-- Copia o que já está na configuração
insert into agente_registro (em, jid, nome, perfil, enviou, texto, motivo, passo, ids)
select (r->>'em')::timestamptz, r->>'jid', r->>'nome', r->>'perfil', coalesce((r->>'enviou')::boolean, false), r->>'texto', r->>'motivo', r->>'passo',
       coalesce(array(select jsonb_array_elements_text(r->'ids')), '{}')
from "AppConfig", jsonb_array_elements(coalesce(data::jsonb->'agenteLog', '[]'::jsonb)) r
where id = 1 and r->>'em' is not null and r->>'jid' is not null
on conflict do nothing;

insert into agente_mensagens (id)
select x from "AppConfig", jsonb_array_elements_text(coalesce(data::jsonb->'agenteIds', '[]'::jsonb)) x where id = 1
on conflict do nothing;

insert into agente_tratadas (id)
select x from "AppConfig", jsonb_array_elements_text(coalesce(data::jsonb->'agenteTratadas', '[]'::jsonb)) x where id = 1
on conflict do nothing;
