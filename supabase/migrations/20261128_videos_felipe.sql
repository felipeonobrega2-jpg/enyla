-- Vídeos do Felipe → conhecimento vivo: transcrição inteira como fonte, com minutagem, regras e cortes.
-- Só aditiva: cria uma tabela nova. Não apaga nem altera dado existente. Pode rodar de novo.
-- fonte = 'video' e link para a mídia, no mesmo formato do registro único das decisões e conversas do Felipe
-- (a tabela registro_felipe ainda não existe no repositório; quando existir, estas linhas migram para ela).
create table if not exists videos_felipe (
  id bigserial primary key,
  msg_id text not null unique,
  fonte text not null default 'video',
  link text,
  gravado_em timestamptz not null default now(),
  duracao_s numeric,
  transcricao text,
  segmentos jsonb not null default '[]',
  regras jsonb not null default '[]',
  cortes jsonb not null default '[]'
);
alter table videos_felipe enable row level security;
