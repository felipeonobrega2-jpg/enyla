-- Perfis de acesso (issue #214): usuários com papel admin ou diretor e auditoria das alterações do diretor.
-- Só aditiva: cria duas tabelas novas. Não altera nem apaga nada existente. Pode rodar de novo sem efeito colateral.
-- NÃO cria usuário nem senha: o admin cria pela tela /admin/usuarios (a senha única atual segue entrando como admin).
-- RLS ligado e sem políticas, como as demais tabelas: o app acessa só no servidor, com a service role.

create table if not exists public."Usuario" (
  "id"        text primary key,
  "nome"      text not null,
  "usuario"   text not null unique,
  "senhaHash" text not null,
  "papel"     text not null check ("papel" in ('admin', 'diretor')),
  "ativo"     boolean not null default true,
  "criadoEm"  text not null
);

create table if not exists public."AuditoriaDiretor" (
  "id"      text primary key,
  "em"      text not null,
  "usuario" text not null,
  "papel"   text not null,
  "metodo"  text not null,
  "caminho" text not null,
  "antes"   jsonb,
  "depois"  jsonb
);
create index if not exists "AuditoriaDiretor_em_idx" on public."AuditoriaDiretor" ("em" desc);

alter table public."Usuario"          enable row level security;
alter table public."AuditoriaDiretor" enable row level security;
