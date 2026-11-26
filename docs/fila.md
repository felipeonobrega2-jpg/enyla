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
| 2 | Detectar orçamento já enviado e lead perdido | CCO (aprovada) | 2 | 30/11/2026 | Claude Code | não | https://github.com/felipeonobrega2-jpg/enyla/pull/55 (na main) |
| 3 | Diretor aciona Atendente e Follow-up por lead | CCO (aprovada) | 3 | 11/12/2026 | Claude Code | sim | https://github.com/felipeonobrega2-jpg/enyla/pull/56 (aberto, esperando o Aprovo) |
| 4 | Status "aguardando pagamento" no pedido | COO (aprovada) | 4 (junto com o 5) | 11/12/2026 | Claude Code | sim | https://github.com/felipeonobrega2-jpg/enyla/pull/57 (na main) |
| 5 | Dispensar pendência com motivo | COO (aprovada) | 4 (junto com o 4) | 11/12/2026 | Claude Code | não | https://github.com/felipeonobrega2-jpg/enyla/pull/58 (na main) |
| 6 | Enviar pedido de ferramenta ao Claude Code | CTO | depois das 5 | depois do item 5 | livre | sim | |
| 7 | Integração com o Claude Code / vaga Desenvolvedor de ferramentas | CTO | depois das 5 | depois do item 5 | livre | sim | |
| 8 | Prospector de Parceiros (base, nota e funil) | operação | esta leva | — | Diego | aprovado 23/11/2026 22:27 | https://github.com/felipeonobrega2-jpg/enyla/pull/2 (na main) |
| 9 | Prospector: importador gratuito dos dados abertos de CNPJ | operação | esta leva | — | Diego | não | (PR do importador, issue #6) |
| 10 | Porta externa: ação gasto_fixo para o CFO | CFO | — | — | Claude Code | não | (PR da issue #10) |
| 11 | Porta externa: leitura ao vivo da Meta Ads para a CMO (`?o=meta_ads`) | CMO | — | — | Claude Code | liberado pelo Felipe em 24/11/2026 | https://github.com/felipeonobrega2-jpg/enyla/pull/25 |
| 12 | Porta externa: CMO liga, pausa e ajusta verba diária de campanha existente (`acao=meta_ads`) | CMO | — | — | Claude Code | liberado pelo Felipe em 24/11/2026 (7h33–7h34) | (PR da issue #29) |
| 13 | Prospector: envio automático (primeiro contato e lembrete) | operação | esta leva | — | Diego | sim (o Felipe aprova o merge; chave `prospector_envio_ativo` nasce desligada) | (PR da issue #11) |
| 14 | Porta externa: leitura financeira (`?o=financeiro`) para o CFO | CFO | — | — | Claude Code | não | (PR da issue #24) |
| 15 | Porta externa: verba do conjunto (ABO) na leitura e no ajuste (`acao=meta_ads`, `conjuntoId`) | CMO | — | — | Claude Code | liberado pelo Felipe em 24/11/2026 (mesmas regras por conjunto) | (PR da issue #32) |
| 16 | Porta externa: escrita financeira do CFO (`acao=lancamento`, `conciliacao`, `categoria`) | CFO | — | — | Claude Code | liberado pelo Felipe em 24/11/2026, 7h31 ("Libera para o Otávio") | (PR da issue #35) |
| 17 | Porta externa: leitura financeira ignora lançamentos estornados (`incluirEstornados`) | CFO | — | — | Claude Code | pedido do Felipe na issue #41 | (PR da issue #41) |
| 18 | Cadastro de parceiros: cenário-exemplo e preço de referência por serviço | Felipe | — | — | Claude Code | pedido pelo Felipe em 24/11/2026 | (PR da issue #36) |
| 19 | Porta externa: code 100 da Meta na escrita não vira "não achou" (`erroGraph`) | CMO | — | — | Claude Code | não (correção de erro) | (PR da issue #43) |
| 20 | Agente: segurar saudação automática do WhatsApp Business do lead e não contar como resposta | COO | — | — | Claude Code | aprovado pelo Felipe em 24/11/2026, 8:38 ("Aprovo as mudanças do Rafael") | https://github.com/felipeonobrega2-jpg/enyla/pull/54 |
| 21 | Referência interna da laminação fosca: R$ 450,00 | Felipe | — | — | Claude Code | não (o Felipe já confirmou o valor) | #63 (issue #62) |
| 22 | Correção: R$ 450 é do verniz UV total; laminação fosca volta a R$ 765,28 (regra do sistema) | Felipe | — | — | Claude Code | não (o Felipe corrigiu o destino do R$ 450; a fosca veio do cadastro e do motor) | (PR da issue #66) |
| 23 | Detectar orçamento enviado pelo Felipe e lead perdido com motivo (porta: `acao=lead`, CCO e COO). Follow-up só para leads que já são do agente | CCO | 2 | 30/11/2026 | Claude Code | não | https://github.com/felipeonobrega2-jpg/enyla/pull/55 (na main, b590a1f) |
| 24 | CCO e CMO acionam Atendente, Follow-up e Reativação por lead (só envia com o Aprovo) | CCO/CMO | 3 | 11/12/2026 | Claude Code | sim (esperando o Aprovo do Felipe) | https://github.com/felipeonobrega2-jpg/enyla/pull/56 (aberto) |
| 25 | Pedido "aguardando pagamento do cliente" (para o relógio de atraso; `acao=pedido`, COO e CFO) | COO | 4 | 11/12/2026 | Claude Code | não | https://github.com/felipeonobrega2-jpg/enyla/pull/57 (na main, 296d13d) |
| 26 | Dispensar pendência com motivo, sem apagar (`dispensar_pendencia` / `reabrir_pendencia`) | COO | 4 | 11/12/2026 | Claude Code | não | https://github.com/felipeonobrega2-jpg/enyla/pull/58 (na main, 3cf9093) |
| 27 | Meta Ads: aviso de campanha parada | CMO | — | — | Claude Code | não | https://github.com/felipeonobrega2-jpg/enyla/pull/59 (na main, 58c0574) |
| 28 | Porta externa: data de entrada em cada etapa da produção | COO | — | — | Claude Code | não | https://github.com/felipeonobrega2-jpg/enyla/pull/60 (na main, 95cc331) |
| 29 | Porta externa: funil e custo por MQL por campanha para a CMO | CMO | — | — | Claude Code | não | https://github.com/felipeonobrega2-jpg/enyla/pull/61 (na main, 88ad864) |
| 30 | Porta externa: diretor põe tarefa no "Depende de você" do Felipe (`acao=tarefa_felipe`) | CFO | — | — | Claude Code | não | https://github.com/felipeonobrega2-jpg/enyla/pull/65 (na main, 6311505) |
| 31 | Medidor de IA por tipo de token e origem | CTO (custo de IA) | esta leva | — | Diego | não | https://github.com/felipeonobrega2-jpg/enyla/pull/21 (na main) |
| 32 | Follow-up confere a cota da hora antes de chamar a IA | CTO (custo de IA) | esta leva | — | Diego | não | https://github.com/felipeonobrega2-jpg/enyla/pull/22 (na main) |
| 33 | WhatsApp: sugestão só ao clicar em "Gerar sugestão" | CTO (custo de IA) | esta leva | — | Diego | liberado pelo Felipe em 24/11/2026 | https://github.com/felipeonobrega2-jpg/enyla/pull/23 (na main) |
| 34 | Classificação inline só com mensagem nova do cliente (migração aditiva `classificacao_guardada` aplicada em produção em 24/11/2026) | CTO (custo de IA) | esta leva | — | Diego | não | https://github.com/felipeonobrega2-jpg/enyla/pull/28 (na main) |
| 35 | Script de comparação do classificador Opus × Sonnet × Haiku (só leitura, não executado) | CTO (custo de IA) | esta leva | — | Diego | não | https://github.com/felipeonobrega2-jpg/enyla/pull/30 (na main) |
| 36 | Script de comparação do follow-up Opus × Sonnet (só leitura, não executado) | CTO (custo de IA) | esta leva | — | Diego | liberado pelo Felipe em 24/11/2026 | https://github.com/felipeonobrega2-jpg/enyla/pull/37 (na main) |
| 37 | Prospector: importador não trava quando a BrasilAPI falha (grava com os dados do arquivo, `falhasCadastro`) | operação | — | — | Claude Code | não (correção de erro) | (PR da issue #88) |
| 38 | Atendente não responde sozinha a gráficas do Prospector | operação | — | — | Claude Code | não | (PR da issue #34) |
| 39 | Prospector: janela de envio 8h–20h (seg-sex), cron `0 11-22 * * 1-5` | Felipe (decisão 24/11/2026, 17:56) | — | — | Claude Code | não | (PR da issue #99) |
| 40 | Atendente: não dizer «segue o orçamento» sem link ou PDF real de proposta existente | Felipe | — | — | Claude Code | **NÃO JUNTAR sem o Aprovo do Felipe** (mexe na fala do Atendente com cliente) | (PR da issue #104) |
| 41 | Porta: ordem a lead sai direto pelo agente; cliente A/B/C e indefinido seguem no Aprovo; `cancelar_ordem`; nível na leitura (`?o=perto`, detalhe comercial) | Felipe (regra de 25/11/2026, 7h51, confirmada 8h10) | — | — | Claude Code | **NÃO JUNTAR sem revisão do CTO** (mexe na trava que protege os clientes A, B e C) | (PR da issue #108) |
| 42 | Prospector: e-mail sem teto diário; WhatsApp com teto de 10 por dia; limite técnico por execução; pausa e retry 429 na Resend | Felipe (decisão 25/11/2026, 8h28) | — | — | Claude Code | não | (PR da issue #112) |
| 43 | Atendente: aceitar caixa de medicamento e de qualquer marca; quem nunca comprou é lead (nível) | Felipe (decisão 25/11/2026, 8h29) | — | — | Claude Code | não (ordem do Felipe) | (PR da issue #114) |
| 44 | Porta externa: leitura de parceiros (`?o=parceiros` e `?o=detalhe&area=parceiros`): cadastros de /parceiros e respostas do Prospector, só leitura, CCO e CMO | CCO | hoje | — | Claude Code | não | (PR da issue #144) |
| 45 | WhatsApp: busca acha "Alisson" em "Allison" (sem acento, sem letra dobrada, por telefone) e acha conversas antigas fora das 1.000 da lista | Felipe | — | — | Claude Code | não (correção de erro) | https://github.com/felipeonobrega2-jpg/enyla/pull/149 |

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

**Status:** Claude Code. **Aprovo:** não. **PR:** https://github.com/felipeonobrega2-jpg/enyla/pull/55 (na main). Pedido do CCO, já aprovada. Prioridade 2. Prazo 30/11/2026. Construção automática.

**O que já existe.** O funil do WhatsApp (`app/lib/funilWhatsapp.ts`) marca "Orçamento enviado" quando o cliente ligado tem orçamento aberto no sistema (coluna 0) e "Perdido" depois de 14 dias sem o cliente falar, ou à mão. `app/lib/metaMql.ts` pergunta se o MQL recebeu PDF, preço no texto ou orçamento no sistema (`estadoDoMql`). Isso não lê o histórico para cravar que foi o Felipe quem orçou, nem passa o lead ao Follow-up, nem grava perdido com motivo.

**O que falta.** Ler o histórico do WhatsApp e marcar "orçado pelo Felipe" quando ele mandou preço ou PDF. Passar esse lead ao Follow-up. Marcar "perdido com motivo" sem apagar o lead. Não envia mensagem.

**Critério de aceite.** Conversa em que o Felipe mandou preço ou PDF fica "orçado pelo Felipe" e entra no Follow-up. Conversa perdida ganha motivo e o lead continua no sistema, com o histórico. Nenhuma mensagem sai para o cliente.

**Como testar.** Caso real, antes de liberar: uma conversa em que o Felipe já mandou PDF ou preço (R$) é marcada sem ninguém digitar. Uma conversa só com orçamento aberto no sistema continua no funil como hoje. Um lead marcado perdido com motivo ainda aparece na busca e o histórico do WhatsApp segue lá. `tests/funilWhatsapp.test.ts` e `tests/metaMql.test.ts` continuam passando, mais o teste novo desta regra.

## 3. Diretor aciona Atendente e Follow-up por lead

**Status:** Claude Code. **Aprovo:** sim. **PR:** https://github.com/felipeonobrega2-jpg/enyla/pull/56 (aberto, esperando o Aprovo). Pedido do CCO, já aprovada. Prioridade 3. Prazo 11/12/2026.

Precisa do Aprovo porque manda mensagem a cliente. A mensagem só sai com o Aprovo do Felipe, no molde de `ordenar_funcionario`.

**O que já existe.** `ordenar_funcionario` (`app/lib/conversaDiretor.ts`, `app/lib/funcionariosServidor.ts`) faz o funcionário escrever a mensagem de um cliente. Ela fica com status "aguardando" e só segue depois do Aprovo. Hoje os funcionários contratados para isso são Pós-venda (`posvenda`) e Cobrança (`cobranca`), em `app/lib/rh.ts`. O Atendente (`app/lib/atendenteServidor.ts`) e o Follow-up (rotina `followup` em `app/lib/agendador.ts`) existem, mas o diretor não os aciona por lead por essa porta.

**O que falta.** O diretor poder acionar o Atendente e o Follow-up para um lead, do mesmo jeito: a mensagem é escrita e espera o Aprovo. Sem Aprovo, não envia.

**Critério de aceite.** Uma ordem do diretor para o Atendente ou para o Follow-up, em um lead, gera a mensagem e para no Aprovo. Nada é enviado ao WhatsApp do cliente antes do Aprovo. Pós-venda e Cobrança continuam como já estão.

**Como testar.** Caso real, antes de liberar: o diretor pede o Follow-up de um lead conhecido. A mensagem aparece para o Felipe aprovar e o cliente não recebe nada enquanto o Aprovo não acontece. Repetir com o Atendente. Recusar o Aprovo não envia.

## 4. Status "aguardando pagamento" no pedido

**Status:** Claude Code. **Aprovo:** sim. **PR:** https://github.com/felipeonobrega2-jpg/enyla/pull/57 (na main). Pedido do COO, já aprovada. Prioridade 4, junto com o item 5. Prazo 11/12/2026.

Precisa do Aprovo porque o critério de atraso fica ligado a pagamento.

**O que já existe.** Na expedição, o texto do prazo já diz "pronto · aguardando pagamento" quando ainda há valor a receber (`prazoDoPedido` em `app/lib/pendencias.ts`). Isso é rótulo de tela, não um status do pedido. O relógio de atraso segue, e o Vigia (`app/lib/vigiaServidor.ts`, a cada 5 minutos) não é silenciado por esse texto.

**O que falta.** Um status "aguardando pagamento" no pedido. Enquanto estiver marcado, o relógio de atraso para e o Vigia fica em silêncio para esse pedido. Não é baixa de cobrança: não quita, não apaga lançamento e não mexe no valor a receber.

**Critério de aceite.** Pedido marcado não conta como atrasado e o Vigia não cobra nem avisa por causa dele. Ao desmarcar, o relógio volta. O financeiro do pedido permanece igual.

**Como testar.** Caso real, antes de liberar: marcar um pedido que estaria atrasado. Ele sai da lista de atraso e o Vigia não fala dele. O valor a receber e os lançamentos continuam os mesmos. Desmarcar devolve o pedido ao relógio. Só construir depois do Aprovo do critério.

## 5. Dispensar pendência com motivo

**Status:** Claude Code. **Aprovo:** não. **PR:** https://github.com/felipeonobrega2-jpg/enyla/pull/58 (na main). Pedido do COO, já aprovada. Prioridade 4, junto com o item 4. Prazo 11/12/2026. Construção automática.

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

## 13. Prospector: envio automático (primeiro contato e lembrete)

**Status:** Diego (no mesmo PR da issue #11). **Aprovo:** o Felipe aprova o merge; o texto já está aprovado. **PR:** (PR da issue #11)

**O que entra.** Qualificação, primeiro contato e um lembrete por WhatsApp (Evolution) e e-mail (Resend), rota `/api/prospector/enviar`, cron `0 11-22 * * 1-5`, migração aditiva das etapas `respondeu` e `encerrado_sem_resposta`. Detalhes e textos finais em [docs/prospector.md](prospector.md).

**Regras.** Até 10 primeiros contatos por dia, segunda a sexta, 8h–20h America (decisão de 24/11/2026)/Sao_Paulo (a rota recusa fora disso). Lembrete único 3 dias depois; depois encerra. Resposta para a cadência; recusa vira `opt_out`. Nenhuma resposta automática nova.

**Chave.** `prospector_envio_ativo` nasce desligada e este PR não a liga. Antes de ligar: rodar a migração no Supabase e conferir o Gmail do Felipe (resposta de e-mail não é lida pelo sistema).

## 14. Porta externa: leitura financeira para o CFO

**Status:** Claude Code. **PR:** o PR da issue #24. Não junta sozinho.

`GET /api/externo?o=financeiro`, só com a chave do CFO (as outras recebem 403). Só leitura: receber, pagar, banco, saldos, gastos, margem e depende. Sem `contraparte_doc` nem `bruto`, e sem dados pessoais de cliente além de nome e valor. Não escreve nada financeiro; a ação `gasto_fixo` segue como está.

## 15. Porta externa: verba do conjunto (ABO) na leitura e no ajuste

**Status:** Claude Code. **Aprovo:** o Felipe liberou ligar, pausar e ajustar verba de campanha existente em 24/11/2026; as mesmas regras valem por conjunto. **PR:** o PR da issue #32. Não junta sozinho.

Os `conjuntos` de `GET ?o=meta_ads` passam a trazer `verbaDiaria` e `verbaTotal` em reais (ou `null`, em CBO). `POST acao=meta_ads` aceita `conjuntoId` no lugar de `campanhaId` (nunca os dois) para ligar, pausar e ajustar a verba diária do conjunto: no máximo 20% e teto de R$ 200 por conjunto (recusa, não corta). Conjunto CBO em `ajustar_verba`: 400, a verba está na campanha, use `campanhaId`. Registro em `metaAdsAcoes` com `conjuntoId` e `conjuntoNome`. Não cria nada e não entrega o aviso de campanha parada (item 1).

## 16. Porta externa: escrita financeira para o CFO

**Status:** Claude Code. **Aprovo:** o Felipe liberou em 24/11/2026, 7h31 ("Libera para o Otávio"). **PR:** o PR da issue #35. Não junta sozinho.

`POST /api/externo` com `acao` = `lancamento` (criar, editar, desativar, estornar; inclui contas a pagar), `conciliacao` (vincular, vincularVarios, atualizar, criar, ignorar e um desfazer lógico) ou `categoria` (criar, editar, desativar; `ativa?: boolean` em `CategoriaFinanceira`), só com a chave do CFO (as outras recebem 403). Cada sucesso grava a conversa e `alteradoPor:"cfo"`/`alteradoEm`.

**Não faz.** Não paga nem cobra, não muda preço, não mexe em chaves, não apaga nada de vez: desativar/estornar marcam `estornadoEm`/`estornadoPor`, e o `desfazer` da conciliação estorna os lançamentos criados em vez de apagá-los (o `desfazer` de `aplicar()` não é exposto). Sem `contraparte_doc` nem `bruto` na resposta.

**Migração (só depois do merge, aditiva).** `supabase/migrations/20261126_lancamento_estorno.sql` acrescenta `estornadoEm` e `estornadoPor` em `LancamentoFinanceiro`. Enquanto não rodar, o estorno grava só a marca em `obs`. A leitura financeira ainda não filtra lançamentos estornados: item a combinar.

## 17. Porta externa: leitura financeira ignora lançamentos estornados

**Status:** Claude Code. **PR:** o PR da issue #41. Não junta sozinho. Sem migração nova (a `20261126_lancamento_estorno.sql` já rodou em 24/11/2026, 8h37).

`GET ?o=financeiro` passa a excluir lançamentos com `estornadoEm` preenchido (desativados e estornados) de resumo, `receber`, `pagar`, `gastos` e `margem`. `&incluirEstornados=1|true|sim` traz todos de volta; outro valor dá 400. A resposta traz `incluirEstornados`. `banco`, `saldos` e `depende` não mudam. A escrita (`estornarLogico`) já grava `estornadoEm`/`estornadoPor` e `obs`, com fallback só em `obs`; `LancamentoFinanceiro` ganhou os dois campos opcionais. Não mexe em chaves nem em pagamento/cobrança.

## 18. Cadastro de parceiros: cenário-exemplo e preço de referência por serviço

**Status:** Claude Code. **Pedido:** o Felipe, em 24/11/2026. **PR:** o PR da issue #36 (#39). Não junta sozinho.

Config editável `cenariosParceiros` no AppConfig (padrão no código; a equipe edita na tela Fornecedores). `/parceiros` mostra o enunciado e pede o preço de cada exemplo; impressão (offset e digital) não tem cenário e pede formato da máquina, acerto e milheiro; laminação tem quatro cenários e arte pede preço por arte e pacote de 3. A tela Fornecedores compara com a referência interna e mostra média, mínimo e máximo dos parceiros por cenário. A referência e esses números nunca vão ao parceiro. Sem migração SQL (tudo no JSON da config). Pendente: o Felipe confirmar a referência da laminação fosca (R$ 765,28) e o preço do Ronaldo para brilho, soft touch e dois lados.

## 19. Porta externa: erro da Meta na escrita (code 100) deixa de virar "não achou"

**Status:** Claude Code. **PR:** o PR da issue #43. Não junta sozinho.

Em `erroGraph`, code 100 na escrita (`POST /{id}`) não vira mais 404 `CAMPANHA_NAO_ENCONTRADA`: com `error_subcode` 33, "Unsupported post request", permissão ou `ads_management` responde 403 (`SEM_ADS_MANAGEMENT`); senão 400 (`PARAMETRO_INVALIDO`). O `erro` e o `motivo` do registro trazem a message e o subcode da Meta, sem o token. Na leitura, code 100 segue 404. Regras (só CMO, 20%, teto R$ 200) e `conjuntoId` inalterados.

## 20. Agente: segurar saudação automática do WhatsApp Business do lead

**Status:** Claude Code. **Aprovo:** aprovado pelo Felipe em 24/11/2026, 8:38. **PR:** #54 (issue #45). Pedido do COO.

**O que muda.** Quando a última mensagem do lead é saudação automática do WhatsApp Business ("agradecemos seu contato", "em breve retornaremos"), o agente não chama a IA, não envia nada ao lead e avisa só o Felipe no formato "Segurei a resposta". Essa mensagem não avança `ultima_recebida_at` e não limpa F1/F2/F3, então o follow-up segue no tempo certo.

**Limite duro.** Só segura ou reduz envios a cliente. Nada novo é enviado. Sem agente, rotina, fila, migração ou mudança de cobrança/chave.

## 21. Referência interna da laminação fosca: R$ 450,00

**Status:** Claude Code. **Aprovo:** não (o Felipe já confirmou o valor em 24/11/2026). **PR:** #63 (issue #62). Não junta sozinho.

Em `CENARIOS_PADRAO`, a referência interna de `laminacao-fosca` (Ronaldo Osasco) passa de R$ 765,28 (calculado, não confirmado) para R$ 450,00, o mesmo do verniz. Nada muda no que o parceiro vê em `/parceiros`. Sem migração.

## 22. Correção: R$ 450 é do verniz UV total; laminação fosca volta a R$ 765,28

**Status:** Claude Code. **Aprovo:** não (o Felipe corrigiu o destino do R$ 450; a fosca veio do cadastro e do motor). **PR:** o PR da issue #66. Não junta sozinho.

O R$ 450,00 confirmado pelo Felipe é do verniz UV total (3.000 folhas 48 × 44 cm), não da fosca; o #63 aplicou na fosca por engano. Verniz segue R$ 450,00. A fosca volta a R$ 765,28, com origem no sistema: `AppConfig.producao.fornecedores`, Ronaldo Osasco, laminação `por_m2`, acerto 100 + Fosca 1,05/m²; `cobrar` (`app/lib/producao.ts`) dá 100 + 1,05 × 633,6 m² = 765,28. Nada muda em `/parceiros`. Sem migração.

## 23. Detectar orçamento enviado pelo Felipe e lead perdido com motivo

**Status:** Claude Code. **Aprovo:** não. **PR:** https://github.com/felipeonobrega2-jpg/enyla/pull/55 (na main, b590a1f). Pedido do CCO.

**O que faz.** Porta `acao=lead` para o CCO e o COO: detecta orçamento enviado pelo Felipe e marca lead perdido com motivo. O Follow-up só atende leads que já são do agente. É o mesmo pedido do item 2.

## 24. CCO e CMO acionam Atendente, Follow-up e Reativação por lead (só envia com o Aprovo)

**Status:** Claude Code. **Aprovo:** sim (esperando o Aprovo do Felipe). **PR:** https://github.com/felipeonobrega2-jpg/enyla/pull/56 (aberto). Pedido do CCO/CMO.

**O que faz.** CCO e CMO acionam Atendente, Follow-up e Reativação por lead. A mensagem só sai com o Aprovo do Felipe. É o mesmo pedido do item 3. Não se junta enquanto o Felipe não aprovar.

## 25. Pedido "aguardando pagamento do cliente"

**Status:** Claude Code. **Aprovo:** não. **PR:** https://github.com/felipeonobrega2-jpg/enyla/pull/57 (na main, 296d13d). Pedido do COO.

**O que faz.** Marca o pedido como "aguardando pagamento do cliente", o que para o relógio de atraso. Porta `acao=pedido`, COO e CFO. É o mesmo pedido do item 4.

## 26. Dispensar pendência com motivo, sem apagar

**Status:** Claude Code. **Aprovo:** não. **PR:** https://github.com/felipeonobrega2-jpg/enyla/pull/58 (na main, 3cf9093). Pedido do COO.

**O que faz.** `dispensar_pendencia` e `reabrir_pendencia`: dispensa uma pendência com motivo, sem apagar, e permite reabrir. É o mesmo pedido do item 5.

## 27. Meta Ads: aviso de campanha parada

**Status:** Claude Code. **Aprovo:** não. **PR:** https://github.com/felipeonobrega2-jpg/enyla/pull/59 (na main, 58c0574). Pedido do CMO.

**O que faz.** Meta Ads: aviso de campanha parada. Não recarrega, não mexe em verba nem em campanha.

## 28. Porta externa: data de entrada em cada etapa da produção

**Status:** Claude Code. **Aprovo:** não. **PR:** https://github.com/felipeonobrega2-jpg/enyla/pull/60 (na main, 95cc331). Pedido do COO.

**O que faz.** A porta externa passa a trazer a data de entrada em cada etapa da produção.

## 29. Porta externa: funil e custo por MQL por campanha para a CMO

**Status:** Claude Code. **Aprovo:** não. **PR:** https://github.com/felipeonobrega2-jpg/enyla/pull/61 (na main, 88ad864). Pedido do CMO.

**O que faz.** A porta externa traz o funil e o custo por MQL por campanha para a CMO.

## 30. Porta externa: diretor põe tarefa no "Depende de você" do Felipe

**Status:** Claude Code. **Aprovo:** não. **PR:** https://github.com/felipeonobrega2-jpg/enyla/pull/65 (na main, 6311505). Pedido do CFO.

**O que faz.** `acao=tarefa_felipe`: o diretor põe uma tarefa no "Depende de você" do Felipe.

## 31. Cadastro de parceiros: experiência guiada por serviço e exemplos no padrão do sistema

**Status:** Claude Code. **Aprovo:** não (o Felipe pediu a correção). **PR:** aberto pela issue #73, não juntar (o Felipe junta em lote).

**O que faz.** Em `/parceiros` o parceiro marca o que faz e só então o preço daquilo aparece e é exigido: laminação (fosca, brilho, soft touch, dois lados), verniz (UV total) e hot stamping (dourado). O que não foi marcado não aparece, não é obrigatório e o preço não é gravado. Preço e nome dos fornecedores nossos seguem só na tela interna. Sem migração, sem preço nem unidade novos.

## Custo de IA (24/11/2026)

Objetivo: reduzir os tokens gastos com IA sem perder eficácia. Os itens 31 a 36 registram os PRs dessa frente.
Os dois scripts de comparação (classificador e follow-up) só rodam com autorização do Felipe, porque gastam tokens.
Nenhuma troca de modelo entra sem o Diego revisar o resultado da comparação.
O Felipe autorizou rodar os dois scripts em 24/11/2026, 8h33 (cerca de R$ 120).
| 43 | Porta externa: ação `mover_card` para avançar etapa de produção (só avança, 1→2..8, motivo obrigatório) | Felipe | — | — | Claude Code | não | (PR da issue #137) |
| 44 | Prospector: teto diário de e-mail (`PROSPECTOR_TETO_EMAIL_DIA`, padrão 80) e respeito à cota da Resend | Felipe (issue #136) | urgente | — | Claude Code | não | (PR da issue #136) |
| 46 | Despesa em vários lotes: perguntar se o valor é o total (ratear por quantidade ou igual) ou o custo de cada lote, com prévia por lote. Não mexe em lançamentos antigos | Felipe | — | — | Claude Code | não | (PR da issue #161) |
| 47 | Página `/d/[id]`: datas em pt-BR (previsão de entrega) e fuso de Brasília; parte (a) da issue #205 (a parte (b), helper + doc + CI, vem em outro PR) | Felipe | urgente | — | Claude Code | não (só formatação) | (PR da issue #205) |

## 44. Porta externa: leitura de parceiros

**Status:** Claude Code. **Aprovo:** não. **PR:** issue #144. Só leitura, sem migração.

`GET /api/externo?o=parceiros` e `?o=detalhe&area=parceiros` (mesmo conteúdo; só chaves do CCO e da CMO, as outras recebem 403). `cadastros`: até 100, mais novos primeiro (`id`, `nome`, `empresa`, `data`, `origem` prospector/direto, `status`, `etapaProspector`, e-mail mascarado `ma***@dominio.com`, telefone `***1234`). Nunca documento nem endereço. `respostas`: prospectos na etapa `respondeu` e, se a tabela `prospectos_emails_recebidos` (#132) existir, as últimas 50 respostas com os 300 primeiros caracteres; sem a tabela, só pela etapa, sem erro. `funil`: contagem por etapa. Código em `app/lib/parceirosExterno.ts`; testes em `tests/parceirosExterno.test.ts`.
