-- Termos de Parceria (issue #256). Aditiva: só cria tabelas e insere linhas. Nada é apagado nem alterado. Pode rodar de novo.
-- termos_parceria: texto versionado. O texto final entra inserindo uma linha nova (versão maior, rascunho = false),
-- sem deploy. Vale a de maior vigente_desde que já começou.
create table if not exists termos_parceria (
  versao        text primary key,
  texto         text not null,
  rascunho      boolean not null default true,
  vigente_desde timestamptz not null default now(),
  criado_em     timestamptz not null default now()
);

insert into termos_parceria (versao, rascunho, texto) values ('rascunho-1', true,
'RASCUNHO. Texto provisório, sem valor jurídico. O texto final vem do Felipe e do jurídico.

1. Clientes encaminhados. A parceira não contatará nem atenderá diretamente, de forma direta ou indireta, por 24 meses após o último serviço prestado, os clientes que a ENYLA lhe encaminhar por meio dos pedidos.

2. Clientes próprios. A parceira segue livre para atender os clientes que já são dela.

3. Dados do cliente. A ordem de serviço traz apenas o código do pedido ENYLA e o necessário para executar o serviço. Qualquer dado de cliente que chegar à parceira por outro meio não pode ser usado para contato fora da ENYLA.

4. Multa. O descumprimento sujeita a parceira a multa de valor a definir.')
on conflict (versao) do nothing;

-- Um registro por cadastro de parceira. token identifica a parceira no link /parceiros/termos?aceite=1&token=...
-- status: pendente_termos (ainda não aceitou) ou aceito.
create table if not exists termos_parceria_aceites (
  cadastro_id        text primary key,
  token              text not null unique,
  status             text not null default 'pendente_termos' check (status in ('pendente_termos', 'aceito')),
  termos_versao      text references termos_parceria (versao),
  termos_aceitos_em  timestamptz,
  ip                 text,
  user_agent         text,
  criado_em          timestamptz not null default now()
);
alter table termos_parceria enable row level security;
alter table termos_parceria_aceites enable row level security;

-- Parceiras já cadastradas ficam pendentes (não envia mensagem nenhuma a elas).
insert into termos_parceria_aceites (cadastro_id, token)
select c->>'id', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
from "AppConfig", jsonb_array_elements(coalesce(data::jsonb->'cadastrosParceiros', '[]'::jsonb)) c
where id = 1 and c->>'id' is not null
on conflict (cadastro_id) do nothing;
