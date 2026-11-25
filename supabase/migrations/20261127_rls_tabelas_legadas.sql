-- Liga o RLS nas 7 tabelas antigas do public que ficaram expostas à chave anon (advisor: rls_disabled_in_public).
-- Sem políticas de propósito: nega tudo a anon e authenticated. O app acessa o banco só no servidor,
-- com a service role (app/lib/supabase.ts), que ignora o RLS. Mesmo padrão das demais tabelas.
-- Só aditiva: sem force row level security, sem drop, delete, truncate ou alteração de coluna.
-- Pode rodar de novo sem efeito colateral.

alter table public."HistoricoItem"  enable row level security;
alter table public."Cliente"        enable row level security;
alter table public."KanbanCard"     enable row level security;
alter table public."PropostaCustom" enable row level security;
alter table public."Tracking"       enable row level security;
alter table public."AppConfig"      enable row level security;
alter table public."Contador"       enable row level security;
