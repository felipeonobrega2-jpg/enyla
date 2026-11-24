# Decisões do Felipe

O que o Felipe decidiu, com data e porquê. Quando duas decisões discordam, vale a de data mais recente. No mesmo dia, vale a que está mais acima: a lista é de cima para baixo, da última escrita para a primeira. As oito abaixo são de 23/11/2026 e foram tomadas juntas.

Diretores propõem. Estas decisões é que mandam no que se constrói.

## Como acrescentar uma decisão nova

1. Escreva a decisão **no topo da lista**, acima das anteriores, neste arquivo.
2. Use o título `## AAAA-MM-DD — assunto`, com a data em que o Felipe decidiu.
3. Diga o que ficou decidido e o **porquê**. Sem porquê, não entra.
4. Se a decisão mudar um item da fila, atualize [docs/fila.md](fila.md) no mesmo pull request.
5. Não apague decisão antiga. Ela fica embaixo, para se saber o que valeu antes.

## 23/11/2026 — orçar Offset é do Felipe

**Decisão.** Orçar Offset é do Felipe, até ele terminar de treinar o agente de orçamentos.

**Porquê.** O Offset ainda depende do julgamento dele. Agente nenhum orça Offset no lugar dele.

## 23/11/2026 — ordem das cinco ferramentas da diretoria

**Decisão.** A ordem é por impacto em venda e em caixa. Meta Ads e Detectar orçamento até 30/11/2026. As cinco ferramentas até 11/12/2026. Cada uma é testada com um caso real antes de liberar.

**Porquê.** Venda e caixa vêm primeiro. Ferramenta que não passou por um caso real não entra na operação.

## 23/11/2026 — coordenação entre o Diego e o Claude Code

**Decisão.** A coordenação do Diego (CTO, agentes na nuvem) com o Claude Code do Felipe é pelo repositório: [docs/fila.md](fila.md), este arquivo e `CLAUDE.md`. Em conflito, o trabalho do Felipe com o Claude Code tem prioridade.

**Porquê.** Os dois constroem o mesmo código. Sem uma fila no repositório, um desfaz o que o outro fez. O Felipe está na frente quando os dois pegam a mesma coisa.

## 23/11/2026 — o que não se constrói sem Aprovo

**Decisão.** Sem Aprovo prévio do Felipe não se constrói código que manda mensagem a cliente sem o Aprovo, mexe em cobrança ou pagamento, apaga dados, ou mexe em chaves e acessos.

**Porquê.** Isso fala com cliente, mexe em dinheiro ou abre a porta do sistema. Erro aqui não se desfaz com um revert simples.

## 23/11/2026 — o que dá para construir na hora, constrói

**Decisão.** O que dá para construir na hora é construído na hora. A rotina da madrugada fica para o que sobrar.

**Porquê.** Esperar a madrugada atrasa o que já está decidido e cabe agora. A madrugada é o resto, não a fila principal.

## 23/11/2026 — código entra por pull request pequeno

**Decisão.** O código é construído por agentes de código na nuvem. Pull request pequeno, aprovado por build e testes, é juntado na main sem esperar o Felipe. Um pull request por mudança, para poder desfazer. No máximo 3 pull requests juntados por vez.

**Porquê.** Esperar o Felipe para juntar o que já passou no build e nos testes segura a main. Um pull request por mudança deixa desfazer uma coisa sem levar as outras. Três por vez evita juntar um bolo que ninguém consegue separar.

## 23/11/2026 — cada diretor tem computador próprio na nuvem

**Decisão.** Cada diretor tem computador próprio na nuvem, 24 horas.

**Porquê.** O diretor precisa ler a empresa e trabalhar a área dele o dia inteiro, sem dividir máquina e sem desligar no fim do expediente.

## 23/11/2026 — diretores gerem, funcionários executam

**Decisão.** Diretores gerem. A execução é de funcionários e de agentes.

**Porquê.** Diretor que executa vira gargalo e mistura a decisão com a tarefa. Quem decide não é quem manda a mensagem nem quem mexe no pedido.
