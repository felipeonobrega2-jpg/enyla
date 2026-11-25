# Registro único do Felipe (`registro_felipe`)

Tabela só do servidor (RLS ligado, sem política). Migração aditiva: `supabase/migrations/20261128_registro_felipe.sql`.

## Captura (rotina `registroFelipe`, dentro do vigia, a cada 5 min)
- **WhatsApp:** `whatsapp_mensagens` com `from_me`, id sem `3EB0` e fora de `agente_mensagens`. Só lê o banco.
- **GitHub (API pública, sem token, no máximo 2 chamadas a cada 15 min):** `issues` e `issues/comments` com `since`. Do Felipe = `user.login == "felipeonobrega2-jpg"` e `performed_via_github_app == null` (os diretores usam a mesma conta pelo app Cursor).
- **Diretoria:** o que o Felipe escreve ao diretor (`tipo: ordem`) e `relatar` / `guardar_conhecimento` com `marca: "decisao_felipe"` (`tipo: decisao`).
- **Resumo por lead:** só quando há mensagem nova do Felipe naquele jid; uma chamada de IA por lead (até 3 por rodada), grava `promessa` ou `decisao`.
- `ref_externa` é único: o que já foi capturado não duplica.

## Leitura (`/api/externo`, todas as chaves)
- `?o=decisoes&desde=&fonte=&area=&pagina=` — 30 itens inteiros por página, `proxima` é `null` na última.
- `?o=decisoes&jid=` — resumo do lead + últimas mensagens do Felipe.
- `?o=conhecimento` traz `decisoesRecentesDoFelipe` (7 dias, só `decisao`).
- Telefone: só os 4 últimos dígitos.

Sem a tabela (migração não aplicada), a rotina avisa "tabela registro_felipe ainda não existe" e o resto do sistema segue igual.
