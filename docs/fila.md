# Fila de construção

Fila única, compartilhada entre o Diego (CTO, código construído pelo Claude Code via GitHub Action `@claude`) e o Felipe com o Claude Code. O trabalho entra por aqui. Quem não está nesta fila não começa.

## Regras

1. Quem pega um item marca o status **antes** de começar, neste arquivo, no mesmo pull request do trabalho. Os status são só estes: **livre**, **Diego**, **Claude Code**.
2. Cada item tem prioridade, se precisa do Aprovo do Felipe, e o link do pull request. Sem pull request aberto, o link fica vazio.
3. Um item por pull request. O pull request entra na main com o CI verde (testes e build). Não se commita direto na main.
4. Em conflito, o trabalho do Felipe com o Claude Code tem prioridade. O Diego larga o item, devolve o status para **Claude Code** e não mexe nos mesmos arquivos.
5. Item com **Aprovo: sim** não se constrói enquanto o Felipe não aprovar o que está escrito na seção do item. Construção automática (Aprovo: não) pode seguir, dentro do que a seção manda.
6. A decisão mais recente em [docs/decisoes.md](decisoes.md) vale mais que esta fila, se as duas discordarem.

## Tabela

| # | Item | Quem pediu | Prioridade | Prazo | Status | Aprovo | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | CI e coordenação | CTO | — | — | Diego | não | https://github.com/felipeonobrega2-jpg/enyla/pull/1 |
| 1 | Conexão com a Meta Ads | CMO | 1 | 30/11/2026 | livre | sim | |
| 2 | Detectar orçamento já enviado e lead perdido | CCO (aprovada) | 2 | 30/11/2026 | livre | não | |
| 3 | Diretor aciona Atendente e Follow-up por lead | CCO (aprovada) | 3 | 11/12/2026 | livre | sim | |
| 4 | Status "aguardando pagamento" no pedido | COO (aprovada) | 4 (junto com o 5) | 11/12/2026 | livre | sim | |
| 5 | Dispensar pendência com motivo | COO (aprovada) | 4 (junto com o 4) | 11/12/2026 | livre | não | |
| 6 | Enviar pedido de ferramenta ao Claude Code | CTO | depois das 5 | depois do item 5 | livre | sim | |
| 7 | Integração com o Claude Code / vaga Desenvolvedor de ferramentas | CTO | depois das 5 | depois do item 5 | livre | sim | |
| 8 | Prospector de Parceiros (base, nota e funil) | operação | esta leva | — | Diego | aprovado 23/11/2026 22:27 | https://github.com/felipeonobrega2-jpg/enyla/pull/2 (na main) |
| 9 | Prospector: importador gratuito dos dados abertos de CNPJ | operação | esta leva | — | Diego | não | (PR do importador, issue #6) |
| 10 | Porta externa: ação gasto_fixo para o CFO | CFO | — | — | Claude Code | não | (PR da issue #10) |
| 11 | Porta externa: leitura ao vivo da Meta Ads para a CMO (`?o=meta_ads`) | CMO | — | — | Claude Code | liberado pelo Felipe em 24/11/2026 | https://github.com/felipeonobrega2-jpg/enyla/pull/25 |
| 12 | Porta externa: CMO liga, pausa e ajusta verba diária de campanha existente (`acao=meta_ads`) | CMO | — | — | Claude Code | liberado pelo Felipe em 24/11/2026 (7h33–7h34) | (PR da issue #29) |

Os prazos dos itens 3, 4 e 5 vêm da decisão de 23/11/2026: as cinco ferramentas da diretoria até 11/12/2026. Os itens 1 e 2 vencem antes, em 30/11/2026.

## 0. CI e coordenação

**Status:** Diego. **Aprovo:** aprovado pelo Felipe em 23/11/2026 22:27 (ver `docs/decisoes.md`). **PR:** https://github.com/felipeonobrega2-jpg/enyla/pull/1

**O que já existe.** O `package.json` tem `lint` (`eslint`), `test` (`vitest run`) e `build` (`vitest run && next build`). Há 98 arquivos em `tests/`. Não há script de typecheck. O build não depende de variável de ambiente: o cliente do Supabase em `app/lib/supabase.ts` só é criado no primeiro uso.

**O que falta.** Nada além deste pull request: o workflow em `.github/workflows/ci.yml`, esta fila, `docs/decisoes.md` e a seção de coordenação no `CLAUDE.md`.

**Critério de aceite.** O check de CI deste pull request fica verde. O lint roda e não bloqueia, porque a main já falha nele por erros anteriores. Testes e build passam. Nenhum código de produto, dado, chave, segredo, variável de ambiente ou configuração de deploy muda.

**Como testar.** No pull request, o job "Lint, testes e build" termina verde. No computador: `npm ci`, `npm test` e `npm run build`. O `npm run lint` hoje termina com erro; isso é o comportamento antigo, e o CI deixa esse passo passar.

## 1. Conexão com a Meta Ads

**Status:** livre. **Aprovo:** sim. **PR:** vazio. Pedido do CMO. Prioridade 1. Prazo 30/11/2026.

O Aprovo ainda espera a aprovação na tela e o acesso da conta de anúncios. Sem isso, não se constrói.

**O que já existe.** A tela Campanhas (`app/components/MetaAdsView.tsx`, aba `meta`) mostra as campanhas. `app/lib/gastos.ts` acompanha o gasto de anúncios da conta (saldo, média e alerta de saldo baixo). `app/lib/metaSaldo.ts` lê o saldo e avisa quando a conta está parada ou o saldo acaba (menos de 2 dias ou menos de R$ 100). A rotina do token da Meta roda às 8h (Brasília): `vercel.json` chama `/api/meta/cron-refresh` às 11h UTC. O retorno por campanha (`app/lib/retornoCampanhas.ts`) junta cliente, venda e margem. Nada disso avisa quando uma campanha específica para de gastar.

**O que falta.** Aviso quando uma campanha específica para de gastar. Não recarrega nada: não adiciona saldo, não mexe em verba, não publica e não altera campanha.

**Critério de aceite.** Com uma campanha que gastava e passou a gastar zero, o sistema avisa qual campanha parou. O saldo da conta e as campanhas continuam iguais ao que estavam. Sem o Aprovo do Felipe (tela e acesso da conta), o item permanece livre.

**Como testar.** Caso real, antes de liberar: uma campanha ativa que para de gastar aparece no aviso, com o nome dela. Uma campanha que segue gastando não entra no aviso. Conferir na tela Campanhas que nenhum valor foi recarregado. Os testes atuais de saldo (`tests/metaSaldo.test.ts`, `tests/gastos.test.ts`) continuam passando.

## 2. Detectar orçamento já enviado e lead perdido

**Status:** livre. **Aprovo:** não. **PR:** vazio. Pedido do CCO, já aprovada. Prioridade 2. Prazo 30/11/2026. Construção automática.

**O que já existe.** O funil do WhatsApp (`app/lib/funilWhatsapp.ts`) marca "Orçamento enviado" quando o cliente ligado tem orçamento aberto no sistema (coluna 0) e "Perdido" depois de 14 dias sem o cliente falar, ou à mão. `app/lib/metaMql.ts` pergunta se o MQL recebeu PDF, preço no texto ou orçamento no sistema (`estadoDoMql`). Isso não lê o histórico para cravar que foi o Felipe quem orçou, nem passa o lead ao Follow-up, nem grava perdido com motivo.

**O que falta.** Ler o histórico do WhatsApp e marcar "orçado pelo Felipe" quando ele mandou preço ou PDF. Passar esse lead ao Follow-up. Marcar "perdido com motivo" sem apagar o lead. Não envia mensagem.

**Critério de aceite.** Conversa em que o Felipe mandou preço ou PDF fica "orçado pelo Felipe" e entra no Follow-up. Conversa perdida ganha motivo e o lead continua no sistema, com o histórico. Nenhuma mensagem sai para o cliente.

**Como testar.** Caso real, antes de liberar: uma conversa em que o Felipe já mandou PDF ou preço (R$) é marcada sem ninguém digitar. Uma conversa só com orçamento aberto no sistema continua no funil como hoje. Um lead marcado perdido com motivo ainda aparece na busca e o histórico do WhatsApp segue lá. `tests/funilWhatsapp.test.ts` e `tests/metaMql.test.ts` continuam passando, mais o teste novo desta regra.

## 3. Diretor aciona Atendente e Follow-up por lead

**Status:** livre. **Aprovo:** sim. **PR:** vazio. Pedido do CCO, já aprovada. Prioridade 3. Prazo 11/12/2026.

Precisa do Aprovo porque manda mensagem a cliente. A mensagem só sai com o Aprovo do Felipe, no molde de `ordenar_funcionario`.

**O que já existe.** `ordenar_funcionario` (`app/lib/conversaDiretor.ts`, `app/lib/funcionariosServidor.ts`) faz o funcionário escrever a mensagem de um cliente. Ela fica com status "aguardando" e só segue depois do Aprovo. Hoje os funcionários contratados para isso são Pós-venda (`posvenda`) e Cobrança (`cobranca`), em `app/lib/rh.ts`. O Atendente (`app/lib/atendenteServidor.ts`) e o Follow-up (rotina `followup` em `app/lib/agendador.ts`) existem, mas o diretor não os aciona por lead por essa porta.

**O que falta.** O diretor poder acionar o Atendente e o Follow-up para um lead, do mesmo jeito: a mensagem é escrita e espera o Aprovo. Sem Aprovo, não envia.

**Critério de aceite.** Uma ordem do diretor para o Atendente ou para o Follow-up, em um lead, gera a mensagem e para no Aprovo. Nada é enviado ao WhatsApp do cliente antes do Aprovo. Pós-venda e Cobrança continuam como já estão.

**Como testar.** Caso real, antes de liberar: o diretor pede o Follow-up de um lead conhecido. A mensagem aparece para o Felipe aprovar e o cliente não recebe nada enquanto o Aprovo não acontece. Repetir com o Atendente. Recusar o Aprovo não envia.

## 4. Status "aguardando pagamento" no pedido

**Status:** livre. **Aprovo:** sim. **PR:** vazio. Pedido do COO, já aprovada. Prioridade 4, junto com o item 5. Prazo 11/12/2026.

Precisa do Aprovo porque o critério de atraso fica ligado a pagamento.

**O que já existe.** Na expedição, o texto do prazo já diz "pronto · aguardando pagamento" quando ainda há valor a receber (`prazoDoPedido` em `app/lib/pendencias.ts`). Isso é rótulo de tela, não um status do pedido. O relógio de atraso segue, e o Vigia (`app/lib/vigiaServidor.ts`, a cada 5 minutos) não é silenciado por esse texto.

**O que falta.** Um status "aguardando pagamento" no pedido. Enquanto estiver marcado, o relógio de atraso para e o Vigia fica em silêncio para esse pedido. Não é baixa de cobrança: não quita, não apaga lançamento e não mexe no valor a receber.

**Critério de aceite.** Pedido marcado não conta como atrasado e o Vigia não cobra nem avisa por causa dele. Ao desmarcar, o relógio volta. O financeiro do pedido permanece igual.

**Como testar.** Caso real, antes de liberar: marcar um pedido que estaria atrasado. Ele sai da lista de atraso e o Vigia não fala dele. O valor a receber e os lançamentos continuam os mesmos. Desmarcar devolve o pedido ao relógio. Só construir depois do Aprovo do critério.

## 5. Dispensar pendência com motivo

**Status:** livre. **Aprovo:** não. **PR:** vazio. Pedido do COO, já aprovada. Prioridade 4, junto com o item 4. Prazo 11/12/2026. Construção automática.

**O que já existe.** `/api/perto` aceita `acao: "dispensar"` (`app/api/perto/route.ts`). Isso tira uma sugestão da lista "Perto de você" e não volta a sugerir aquele contato. É outra lista. Não dispensa pendência de decisão nem do Vigia, e não pede motivo.

**O que falta.** Dispensar uma pendência de decisão ou do Vigia com motivo registrado. O histórico fica. A pendência não volta a aparecer.

**Critério de aceite.** A pendência some da lista aberta, o motivo fica gravado junto do histórico, e uma nova rodada do Vigia não a recoloca. Nada é apagado.

**Como testar.** Caso real, antes de liberar: dispensar uma pendência com um motivo escrito. Ela não está mais na lista. O motivo aparece no histórico. Rodar o Vigia de novo (ou esperar a rodada) e confirmar que ela não voltou. A lista "Perto de você" não muda. `tests/perto.test.ts` continua passando.

## 6. Enviar pedido de ferramenta ao Claude Code

**Status:** livre. **Aprovo:** sim. **PR:** vazio. Pedido do CTO. Prioridade: depois dos itens 1 a 5.

Precisa do Aprovo por causa dos acessos.

**O que já existe.** O diretor pede ferramenta com `pedir_ferramenta` (nome, para quê, motivo). O pedido entra na lista do CTO e espera o Felipe aprovar (`app/lib/conversaDiretor.ts`). Não há envio desse pedido ao Claude Code.

**O que falta.** Levar o pedido já aprovado ao Claude Code, para ele construir. Sem o Aprovo dos acessos, não se conecta nada.

**Critério de aceite.** Um pedido de ferramenta aprovado pelo Felipe chega ao Claude Code com nome, para quê e motivo. Pedido ainda não aprovado não sai. Nenhuma chave nova é criada neste item sem o Aprovo.

**Como testar.** Caso real, antes de liberar: um pedido aprovado aparece para o Claude Code abrir o trabalho na fila. Um pedido só "pedida" não aparece. Conferir que nenhum acesso foi gravado no repositório.

## 7. Integração com o Claude Code / vaga Desenvolvedor de ferramentas

**Status:** livre. **Aprovo:** sim. **PR:** vazio. Pedido do CTO. Prioridade: depois dos itens 1 a 5.

Precisa do Aprovo por causa de chaves, acessos e da contratação.

**O que já existe.** `pedir_contratacao` manda o RH desenhar a vaga e espera o Felipe contratar (`app/lib/rh.ts`, `app/lib/rhServidor.ts`). A coordenação deste repositório está em `docs/fila.md`, `docs/decisoes.md` e `CLAUDE.md`. Não existe a vaga "Desenvolvedor de ferramentas" nem a integração que a coloca para trabalhar com o Claude Code.

**O que falta.** A integração e a vaga. Contratação e chaves só com o Aprovo do Felipe.

**Critério de aceite.** A vaga existe no quadro só depois que o Felipe contratar. O desenvolvedor de ferramentas entra pelo mesmo caminho do Claude Code (fila, decisões, pull request, CI). Nenhuma chave fica no repositório.

**Como testar.** Caso real, antes de liberar: com a vaga ainda não contratada, ninguém executa por ela. Depois do Aprovo e da contratação, um item da fila pode ser marcado **Claude Code** e sair em pull request com o CI verde, sem chave commitada.

## 8. Prospector de Parceiros (base, nota e funil)

**Status:** Diego. **Aprovo:** aprovado pelo Felipe em 23/11/2026 22:27 (ver `docs/decisoes.md`). **PR:** https://github.com/felipeonobrega2-jpg/enyla/pull/2. Pedido da operação. Esta leva. Não entra na frente dos itens 1 a 7: é outra frente, e não manda mensagem, não mexe em cobrança, não apaga dado e não cria chave.

**O que já existe.** O cadastro público em `/parceiros` e a aprovação na tela Fornecedores (`CadastrosParceirosCard`). A aprovação continua com o Felipe, do jeito que está.

**O que falta neste item.** A tabela `prospectos_parceiros`, a nota de 0 a 100, o mapeamento de CNAE e o bloco só leitura na tela Fornecedores. O desenho completo, inclusive o que fica para depois, está em `docs/prospector.md`. A coleta dos dados abertos da Receita é o item 9. A abordagem (e-mail e WhatsApp) não é este item. A abordagem precisa de Aprovo do Felipe e não se constrói aqui.

**Critério de aceite.** A migração só cria a tabela nova. A nota, o CNAE, a distância e o funil têm teste. A tela mostra a contagem e as qualificadas, sem botão de envio. Cadastro em `/parceiros` com o mesmo CNPJ só registra no histórico do prospecto (`cadastro recebido (aguardando aprovação do Felipe)`); a etapa vai para `cadastrou` quando o Felipe aprova o cadastro, sem mudar o resto do cadastro. Quem marcou "não quero receber" não volta.

**Como testar.** `npm test` cobre `tests/prospector.test.ts`. Na tela Fornecedores, o bloco aparece embaixo dos cadastros. Sem a tabela no Supabase, o bloco pede para rodar o SQL e a aprovação de parceiro segue igual.

## 9. Prospector: importador gratuito dos dados abertos de CNPJ

**Status:** Diego. **Aprovo:** não (só lê dados públicos e grava na tabela que já existe em produção, com RLS e zero linhas). **PR:** o PR desta issue (#6). Não junta sozinho.

**O que já existe.** A tabela `prospectos_parceiros` (já criada em produção), `notaDoProspect` e `CNAES_PROSPECTO` em `app/lib/prospector.ts`.

**O que entra.** Importador em fluxo dos dados abertos da Receita, UF = SP, situação ativa e os CNAEs da tabela, com cursor e teto por execução. Rota `/api/prospector/importar` com a autenticação dos outros crons. Detalhes em `docs/prospector.md`.

**Critério de aceite.** Idempotente por CNPJ. Não reabre `descartado` nem `opt_out`, não volta etapa, não apaga. Nenhuma mensagem sai. Sem secret novo. A importação não é disparada em produção por este PR.

**Como testar.** `npm test` cobre `tests/prospectorImportador.test.ts`. Depois do merge, chamar a rota uma vez com o Bearer do `CRON_SECRET` e conferir as linhas em `prospectos_parceiros`.

## 11. Porta externa: leitura ao vivo da Meta Ads

**Status:** Claude Code. **Aprovo:** o Felipe liberou a Lívia (CMO) em 24/11/2026. **PR:** https://github.com/felipeonobrega2-jpg/enyla/pull/25

`GET /api/externo?o=meta_ads`, só com a chave da CMO (as outras recebem 403). Só leitura na Graph API: conta, campanhas, conjuntos e anúncios, hoje/7/30 dias, cache de 3 minutos. Não liga, não pausa, não ajusta verba. Não entrega o aviso de campanha parada: o item 1 continua livre.

## 12. Porta externa: escrita limitada da CMO na Meta Ads

**Status:** Claude Code. **Aprovo:** o Felipe liberou a Lívia (CMO) em 24/11/2026, 7h33–7h34. **PR:** o PR da issue #29. Não junta sozinho.

`POST /api/externo` com `{ acao: "meta_ads", operacao: "ligar" | "pausar" | "ajustar_verba", campanhaId, verbaDiaria }`, só com a chave da CMO (as outras recebem 403). Só campanha que já existe na conta configurada. Mudança de verba de no máximo 20% sobre a atual e nunca acima de R$ 200 por campanha: fora disso, 400 e nada muda (não corta). Cada ação e cada recusa fica em `dados_sistema` (coleção `metaAdsAcoes`) com diretor, hora, antes e depois. Criar campanha, conjunto ou anúncio e publicar continuam com o Felipe. Não entrega o aviso de campanha parada (item 1).
