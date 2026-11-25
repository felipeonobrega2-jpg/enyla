-- Registro único das decisões e conversas do Felipe (WhatsApp, GitHub, diretoria, vídeo).
-- Só aditiva: cria uma tabela nova. Não apaga nem altera dado existente.
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo.
-- RLS ligado e nenhuma política: só o servidor (service role) lê e grava.
-- ref_externa é único: a mesma mensagem/comentário capturado duas vezes não duplica.
create table if not exists registro_felipe (
  id bigserial primary key,
  em timestamptz not null,
  fonte text not null check (fonte in ('whatsapp', 'github', 'diretoria', 'video')),
  jid text,
  area text,
  tipo text not null check (tipo in ('mensagem', 'decisao', 'promessa', 'ordem')),
  texto text not null,
  link text,
  ref_externa text not null unique,
  criado_em timestamptz not null default now()
);
create index if not exists registro_felipe_em on registro_felipe (em desc);
create index if not exists registro_felipe_jid on registro_felipe (jid, em desc);
alter table registro_felipe enable row level security;
