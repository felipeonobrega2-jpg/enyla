# Usuários e perfil diretor (issue #214)

Há dois papéis: **admin** (tudo, mais a tela de usuários e os bloqueios) e **diretor** (acesso total ao sistema, com 7 bloqueios que o admin liga quando quiser). A senha única de hoje (`ADMIN_PASSWORD_HASH`) continua entrando como **admin**: no login, deixe o campo "Usuário" em branco.

## 1. Rodar a migration (uma vez)

O SQL deste repositório não sobe sozinho. Abra o SQL Editor do Supabase, cole `supabase/migrations/20261129_usuarios_acesso.sql` e rode. É aditiva (cria as tabelas `Usuario` e `AuditoriaDiretor`, RLS ligado, nenhum usuário ou senha) e pode rodar de novo sem efeito.

**O app quebra antes da migration? Não.** O app lê essas tabelas pelo cliente do Supabase (não pelo Prisma Client). Sem as tabelas, a senha única segue entrando como admin e tudo funciona como antes; só o login por usuário não acha ninguém e a tela `/admin/usuarios` avisa que falta rodar o SQL. Um diretor já logado, sem a tabela, recebe erro 503 ("não foi possível conferir a permissão") em vez de passar sem guarda.

## 2. Criar um usuário com papel diretor

1. Entre como admin (senha única, campo Usuário em branco).
2. Abra `/admin/usuarios`.
3. Em "Novo usuário", preencha nome (ex.: Rafael), usuário (ex.: `rafael`, minúsculas), senha (mínimo 10 caracteres) e papel **diretor**. Clique em "Criar usuário".
4. Passe usuário e senha ao diretor por um canal seguro. Ele entra em `/login` com o usuário e a senha.
5. Para tirar o acesso: "desativar" na mesma tela (vale em até 20 segundos, mesmo com a sessão aberta). Usuário não é apagado.

Nenhum usuário ou senha existe no código ou na migration.

## 3. Os 7 bloqueios (todos desligados por padrão)

Na mesma tela, seção "Bloqueios do perfil diretor". Marcar a caixa liga o bloqueio na hora (sem deploy); o servidor passa a responder **403** com mensagem clara ao diretor. Desmarcar libera de novo. Admin nunca é barrado.

| Bloqueio | O que barra para o diretor |
| --- | --- |
| `apagar` | qualquer `DELETE` e rotas de apagar/excluir/remover |
| `financeiro` | escrita em lançamentos, gastos, caixa, ações do banco, Asaas/InfinitePay; mudar contas, gastos fixos e categorias na configuração |
| `cobranca` | escrita em Asaas, InfinitePay e Pix link |
| `preco` | custos e chapas do Cartuxo; custos, multiplicadores e materiais na configuração |
| `configuracao` | chaves (Gemini, Groq, acesso externo, token da Meta), WhatsApp (configurar, QR, destino), `apiKey`. Usuários e papéis são **sempre** só do admin |
| `mensagem_externa` | envio direto ao WhatsApp (enviar, enviar-cliente, reativação, atender) e `prospector/enviar` |
| `meta` | escrita em `/api/meta` e campanha digital (leitura liberada) |

A configuração (`POST /api/config`) é salva inteira pela tela, então ali só conta o que **mudou** em relação ao salvo.

## 4. Auditoria

Toda escrita liberada de um diretor grava em `AuditoriaDiretor`: quem, quando, método e rota, **antes** e **depois**. Para `kanban`, `clientes`, `lancamentos` e `historico` com id na rota, o "antes" é a linha lida antes da escrita. Na configuração, só os campos de preço, chave e financeiro que mudaram (a chave de API vira "(definida)"). Nas demais rotas o "depois" é o corpo enviado e o "antes" fica vazio. As últimas 100 aparecem em `/admin/usuarios`.
