-- Marca Caixaria → Cartuxo (09/11/2026): as tabelas passam a se chamar cartuxo_*.
-- Sem parar o site: renomeia e cria "atalhos" (views) com os nomes antigos, para o código que ainda está no ar
-- continuar funcionando até o código novo publicar. Depois rodar 20261109_cartuxo_limpar.sql.
-- Rodar uma vez no SQL Editor do Supabase.

begin;

alter table caixaria_pedidos      rename to cartuxo_pedidos;
alter table caixaria_chapas       rename to cartuxo_chapas;
alter table caixaria_chapa_lugares rename to cartuxo_chapa_lugares;
alter table caixaria_facas        rename to cartuxo_facas;
alter table caixaria_config       rename to cartuxo_config;

-- Restrições e índices com o prefixo antigo
do $$
declare r record;
begin
  for r in select c.conname, c.conrelid::regclass::text as t from pg_constraint c
           where c.conname like 'caixaria\_%' and c.conrelid::regclass::text like 'cartuxo\_%' loop
    execute format('alter table %s rename constraint %I to %I', r.t, r.conname, replace(r.conname, 'caixaria_', 'cartuxo_'));
  end loop;
  for r in select indexname from pg_indexes
           where schemaname = 'public' and indexname like 'caixaria\_%' and tablename like 'cartuxo\_%' loop
    execute format('alter index %I rename to %I', r.indexname, replace(r.indexname, 'caixaria_', 'cartuxo_'));
  end loop;
end $$;

-- Atalhos temporários com os nomes antigos. security_invoker: valem as mesmas regras (RLS) das tabelas,
-- ou seja, continuam fechados para o público; só o servidor (chave de serviço) acessa.
create view caixaria_pedidos       with (security_invoker = true) as select * from cartuxo_pedidos;
create view caixaria_chapas        with (security_invoker = true) as select * from cartuxo_chapas;
create view caixaria_chapa_lugares with (security_invoker = true) as select * from cartuxo_chapa_lugares;
create view caixaria_facas         with (security_invoker = true) as select * from cartuxo_facas;
create view caixaria_config        with (security_invoker = true) as select * from cartuxo_config;
revoke all on caixaria_pedidos, caixaria_chapas, caixaria_chapa_lugares, caixaria_facas, caixaria_config from anon, authenticated;

commit;

notify pgrst, 'reload schema';
