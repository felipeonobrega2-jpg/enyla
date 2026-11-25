-- Prospector: respostas de e-mail (Resend, evento email.received) guardadas como conversa do prospecto.
-- Só aditiva: cria uma tabela nova. Não apaga nem altera dado existente.
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo.
-- email_id é único: o mesmo evento da Resend (retry) não grava nem muda etapa duas vezes.
create table if not exists prospectos_emails_recebidos (
  id bigserial primary key,
  email_id text not null unique,
  prospecto_id bigint references prospectos_parceiros(id),
  de text not null,
  para text,
  assunto text,
  corpo text,
  recebido_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists prospectos_emails_recebidos_prospecto on prospectos_emails_recebidos (prospecto_id);
alter table prospectos_emails_recebidos enable row level security;
