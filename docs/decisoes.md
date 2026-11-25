# Decisões do Felipe

O que o Felipe decidiu, com data e porquê. Quando duas decisões discordam, vale a de data mais recente. No mesmo dia, vale a que está mais acima: a lista é de cima para baixo, da última escrita para a primeira. As dez abaixo são de 23/11/2026. As duas do topo têm hora (America/Sao_Paulo); as oito de baixo foram tomadas juntas, antes delas.

Diretores propõem. Estas decisões é que mandam no que se constrói.

## Como acrescentar uma decisão nova

1. Escreva a decisão **no topo da lista**, acima das anteriores, neste arquivo.
2. Use o título `## AAAA-MM-DD — assunto`, com a data em que o Felipe decidiu.
3. Diga o que ficou decidido e o **porquê**. Sem porquê, não entra.
4. Se a decisão mudar um item da fila, atualize [docs/fila.md](fila.md) no mesmo pull request.
5. Não apague decisão antiga. Ela fica embaixo, para se saber o que valeu antes.

## 24/11/2026 07:07 — texto do Prospector: sem opt-out e sem link no primeiro contato

**Decisão.** Horário: 24/11/2026 07:07 (America/Sao_Paulo). Esta decisão **substitui** a de 23/11/2026 sobre o texto do Prospector (22:27 e 22:40: "opt-out e link `/parceiros`" em toda mensagem).
- O primeiro contato vai **sem** linha de opt-out e **sem** link.
- O link de `/parceiros` vai **só para quem responder sim**.
- O lembrete é **único**, depois de 3 dias, e também vai sem opt-out e sem link.
- Quem responde não fica com `opt_out`: a cadência só para. Só a recusa explícita vira `opt_out`.

Os demais limites de 23/11 seguem: até 10 abordagens por dia, de segunda a sexta. O prazo do lembrete passa de 4 para 3 dias.

**Porquê.** Mensagem curta, sem link e sem rodapé de descadastro, soa como conversa e não como disparo em massa; o link só faz sentido para quem já mostrou interesse. Responder não é recusar, então só a recusa explícita tira o prospecto da lista.

## 2026-11-24 — CMO lê as campanhas pela porta

**Decisão.** O Felipe liberou a CMO (Lívia) a ler as campanhas da Meta Ads pela porta externa e, à parte, a ligar/pausar e ajustar a verba de campanha existente, com no máximo 20% por ajuste e teto de R$ 200 por dia por campanha. O primeiro pull request entrega só a leitura; ligar, pausar e ajustar verba vêm em outro.

**Porquê.** A CMO precisa ver as campanhas por conta própria, pelo caminho gratuito (Graph API direto). Leitura e escrita entram separadas para poder desfazer uma sem a outra.

## 23/11/2026 22:40 — envio automático do Prospector e código do Diego pelo Claude Code

**Decisão.** Horário: 23/11/2026 22:40 (America/Sao_Paulo). O envio do Prospector de Parceiros será automático, dentro dos limites aprovados às 22:27 (até 10 abordagens por dia, de segunda a sexta, um lembrete após 4 dias, opt-out e link `/parceiros`). **[Texto de mensagem, lembrete e opt-out substituídos em 24/11/2026 07:07: ver a decisão do topo. Não voltar atrás.]** Todo código do Diego passa a ser construído pelo Claude Code via GitHub Action (`@claude`), não mais por agentes de nuvem.

**Porquê.** Dentro de limites fixos e com opt-out, a abordagem não precisa de um clique do Felipe por mensagem. Construir pelo Claude Code no próprio repositório deixa cada mudança num pull request visível, com o CI, no mesmo caminho do trabalho do Felipe.

## 23/11/2026 22:27 — Prospector de Parceiros aprovado

**Decisão.** Horário: 23/11/2026 22:27 (America/Sao_Paulo). O Felipe aprovou o Prospector de Parceiros: raio no estado de SP inteiro, com nota pela distância de Barueri; todos os serviços; dados gratuitos da Receita por CNAE; até 10 abordagens por dia, de segunda a sexta; um lembrete após 4 dias; opt-out e link `/parceiros` **[em toda mensagem: substituído em 24/11/2026 07:07, ver a decisão do topo; lembrete agora após 3 dias]**; funil na tela Fornecedores; aprovação de parceiro com o Felipe. Isso responde à pergunta de processo da revisão: o item 8 da [fila](fila.md) está aprovado.

**Porquê.** A rede de parceiros precisa crescer perto de Barueri, onde o frete é menor, sem depender de busca manual. A aprovação de quem entra na rede continua com o Felipe.

## 23/11/2026 — orçar Offset é do Felipe

**Decisão.** Orçar Offset é do Felipe, até ele terminar de treinar o agente de orçamentos.

**Porquê.** O Offset ainda depende do julgamento dele. Agente nenhum orça Offset no lugar dele.

## 23/11/2026 — ordem das cinco ferramentas da diretoria

**Decisão.** A ordem é por impacto em venda e em caixa. Meta Ads e Detectar orçamento até 30/11/2026. As cinco ferramentas até 11/12/2026. Cada uma é testada com um caso real antes de liberar.

**Porquê.** Venda e caixa vêm primeiro. Ferramenta que não passou por um caso real não entra na operação.

## 23/11/2026 — coordenação entre o Diego e o Claude Code

**Decisão.** A coordenação do Diego (CTO, código pelo Claude Code via GitHub Action `@claude`) com o Claude Code do Felipe é pelo repositório: [docs/fila.md](fila.md), este arquivo e `CLAUDE.md`. Em conflito, o trabalho do Felipe com o Claude Code tem prioridade.

**Porquê.** Os dois constroem o mesmo código. Sem uma fila no repositório, um desfaz o que o outro fez. O Felipe está na frente quando os dois pegam a mesma coisa.

## 23/11/2026 — o que não se constrói sem Aprovo

**Decisão.** Sem Aprovo prévio do Felipe não se constrói código que manda mensagem a cliente sem o Aprovo, mexe em cobrança ou pagamento, apaga dados, ou mexe em chaves e acessos.

**Porquê.** Isso fala com cliente, mexe em dinheiro ou abre a porta do sistema. Erro aqui não se desfaz com um revert simples.

## 23/11/2026 — o que dá para construir na hora, constrói

**Decisão.** O que dá para construir na hora é construído na hora. A rotina da madrugada fica para o que sobrar.

**Porquê.** Esperar a madrugada atrasa o que já está decidido e cabe agora. A madrugada é o resto, não a fila principal.

## 23/11/2026 — código entra por pull request pequeno

**Decisão.** O código do Diego é construído pelo Claude Code via GitHub Action (`@claude`), conforme a decisão de 23/11/2026 22:40 (antes, por agentes de código na nuvem). Pull request pequeno, aprovado por build e testes, é juntado na main sem esperar o Felipe. Um pull request por mudança, para poder desfazer. No máximo 3 pull requests juntados por vez.

**Porquê.** Esperar o Felipe para juntar o que já passou no build e nos testes segura a main. Um pull request por mudança deixa desfazer uma coisa sem levar as outras. Três por vez evita juntar um bolo que ninguém consegue separar.

## 23/11/2026 — cada diretor tem computador próprio na nuvem

**Decisão.** Cada diretor tem computador próprio na nuvem, 24 horas.

**Porquê.** O diretor precisa ler a empresa e trabalhar a área dele o dia inteiro, sem dividir máquina e sem desligar no fim do expediente.

## 23/11/2026 — diretores gerem, funcionários executam

**Decisão.** Diretores gerem. A execução é de funcionários e de agentes.

**Porquê.** Diretor que executa vira gargalo e mistura a decisão com a tarefa. Quem decide não é quem manda a mensagem nem quem mexe no pedido.

## 25/11/2026 (~8h33, America/Sao_Paulo) — modelos por chapa antes de orientar a quantidade no Offset

**Decisão.** Antes de orientar a quantidade no Offset, o sistema precisa saber quantos modelos cabem na chapa da faca (campo `modelosPorChapa`). Vale o número salvo (campo ou cavidades da faca); sem ele, estima na máquina do impressor principal (Jerograf, 48 × 45 cm), nunca em 66 × 48. Sem medida, fica desconhecido.

**Porquê.** A faca do perfume de 100 ml com fundo automático cabe 4 modelos na chapa da Jerograf: 1.000 unidades dão 4 artes.
