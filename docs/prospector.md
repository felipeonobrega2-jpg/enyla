# Prospector de Parceiros

A ENYLA fica em Barueri-SP. O prospector acha gráficas paulistas, dá uma nota e acompanha o funil até o cadastro em [/parceiros](https://app.enyla.com.br/parceiros). A base, a nota e o importador não mandam mensagem; o envio automático é a última seção e começa desligado.

## Esta parte — base, nota e funil

É o que este pull request entrega.

**Base.** A tabela `prospectos_parceiros` guarda o CNPJ (único), a razão social, o nome fantasia, o CNAE principal e os secundários, os serviços inferidos, a situação cadastral, a data de abertura, o porte, o município, a UF, o CEP, o endereço, latitude e longitude opcionais, o e-mail e o telefone do cadastro, a fonte, a data da coleta, a nota, a etapa e o histórico de etapas. O campo "não quero receber" é `opt_out`, com data em `opt_out_em`.

A migração é só aditiva: `supabase/migrations/20261124_prospectos_parceiros.sql`. Neste repositório o SQL não sobe sozinho. O Felipe roda o arquivo uma vez no SQL Editor do Supabase. Pode rodar de novo sem duplicar. A tabela já foi criada em produção (RLS ligado). Se ela sumir, a tela avisa e a aprovação de parceiro segue como está.

**Nota.** Função pura `notaDoProspect`, de 0 a 100. Os pesos ficam num lugar só: `PESOS_NOTA` em `app/lib/prospector.ts`.

| Fatia | Teto | Como entra |
| --- | --- | --- |
| Distância até Barueri | 40 | O maior peso, por causa do frete. Ao lado vale 40. Cai com meia-vida de 80 km e não desce de 20% (8 pontos) dentro de SP. |
| Serviços | 35 | Cartonagem 12, corte e vinco 9, colagem 8, offset 8, acabamento 4, hot stamping 3, digital 3. Os quatro primeiros, juntos, já enchem os 35. |
| Tempo de empresa | 15 | 10 anos ou mais = 15; 5 anos = 12; 2 anos = 8; menos de 2 = 2; sem data = 5. |
| Porte | 10 | Demais 10, EPP 8, ME 5, MEI 2, sem porte = 4. Código da Receita: 05, 03, 01. |

Fora de SP a nota é 0. Situação diferente de ativa (palavra "ativa" ou código 02) também zera. O estado de SP inteiro entra: o interior pontua menos, não some.

A distância usa a coordenada do prospecto quando existe. Sem ela, usa a sede do município, numa tabela embutida dos 645 municípios de SP (`app/lib/municipiosSp.ts`). A fonte é pública e gratuita: a compilação [kelvins/Municipios-Brasileiros](https://github.com/kelvins/Municipios-Brasileiros), a partir dos códigos e coordenadas do IBGE. Não chama API paga. Sem coordenada e sem município na tabela, a fatia de frete fica no piso.

**CNAE.** Mapeamento em `CNAES_PROSPECTO`. Fonte: IBGE, CNAE-Subclasses 2.3, conferida em 24/11/2026 na API `https://servicodados.ibge.gov.br/api/v2/cnae/subclasses/{codigo}`.

| Código | Atividade | Serviço inferido |
| --- | --- | --- |
| 1813-0/01 | Impressão de material para uso publicitário | offset |
| 1813-0/99 | Impressão de material para outros usos | offset |
| 1821-1/00 | Serviços de pré-impressão | nenhum (entra na busca, não pontua serviço) |
| 1822-9/01 | Serviços de encadernação e plastificação | acabamento |
| 1822-9/99 | Serviços de acabamentos gráficos, exceto encadernação e plastificação | acabamento |
| 1731-1/00 | Fabricação de embalagens de papel | cartonagem |
| 1732-0/00 | Fabricação de embalagens de cartolina e papel-cartão | cartonagem |
| 1733-8/00 | Fabricação de chapas e de embalagens de papelão ondulado | cartonagem |

Na CNAE 2.2, "impressão de material para outros usos" era 1813-0/02. Na 2.3 o código oficial é 1813-0/99. O 1813-0/02 ainda é aceito para não perder um extrato antigo. Digital não tem subclasse própria, então 1813 entra como offset. A nota explicativa do 1822-9/99 cita corte e vinco, colagem e hot stamping, mas a subclasse não diz qual a empresa faz: esses três só pontuam quando vierem indicados.

**Funil.** Na tela Fornecedores, embaixo da aprovação, o bloco "Prospector de Parceiros" mostra a contagem (encontrados, qualificados, abordados, abriram, cadastraram) e a lista das qualificadas, da maior nota para a menor. É só leitura. A aprovação de quem se cadastrou continua no bloco de cima, com o Felipe.

A etapa anda para frente: encontrado → qualificado → abordado → abriu → cadastrou. Pode pular, porque o cadastro pode chegar antes da abordagem. Descartado sai de qualquer etapa e não volta. "Não quero receber" marca descartado, grava a data e trava: nenhuma transição devolve à fila.

**Ligação com o cadastro.** São dois momentos, e só o segundo muda a etapa.

1. Cadastro público em `/parceiros` (`/api/parceiros/cadastro`) com o mesmo CNPJ: o prospecto **não muda de etapa**. O histórico ganha uma linha com a etapa atual, a data, o id do cadastro (`cadastroId`) e o texto `cadastro recebido (aguardando aprovação do Felipe)`. O mesmo cadastro não é registrado duas vezes.
2. O Felipe aprova o cadastro na tela Fornecedores (`mudarStatus` em `app/lib/parceirosServidor.ts`, status `aprovado`): a etapa vai para `cadastrou`, com a data, o id do cadastro e o texto `cadastro aprovado pelo Felipe`. Recusar não mexe no prospecto.

A gravação usa trava otimista: o update só vale se a etapa ainda é a lida no select. Se mudou no meio, não grava. O cadastro em si não muda. Se o prospecto está descartado ou marcou que não quer receber, nada acontece. Se a tabela ainda não existe, o cadastro e a aprovação seguem e o gancho falha em silêncio (há teste de servidor para isso em `tests/prospectorServidor.test.ts`).

A lista das qualificadas vem do banco já ordenada por `nota desc` antes do limite, e a tela reordena pela nota recalculada com os pesos atuais.

## Importador

É código: `app/lib/prospectorImportador.ts` (filtro, CSV, linha e regra de gravação, tudo puro), `app/lib/prospectorImportadorServidor.ts` (leitura, cursor e Supabase) e a rota `GET /api/prospector/importar`. Só lê e grava dados. Não manda mensagem de nenhum canal e não usa chave paga.

**Fonte.** Dados abertos de CNPJ da Receita Federal (`Estabelecimentos0..9.zip`, pasta do mês no compartilhamento público do Nextcloud da Receita, <https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9>. O importador lê pelo WebDAV público: `GET https://arquivos.receitafederal.gov.br/public.php/webdav/{AAAA-MM}/Estabelecimentos{n}.zip`, com `Authorization: Basic base64("YggdBLfdninEJX9:")`, ou seja, o token do compartilhamento como usuário e senha vazia. O token é público, não é segredo. O endereço antigo `/dados/cnpj/dados_abertos_cnpj/` passou a responder 404 em 24/11/2026. Se o mês atual ainda não existir, cai para o mês anterior). O zip é lido em fluxo (cabeçalho local + deflate), linha a linha, sem guardar o arquivo. Razão social e porte ficam nos arquivos `Empresas*`, que são outro conjunto grande. Por isso, só para quem passa no filtro, o importador completa com a [BrasilAPI](https://brasilapi.com.br) (`/api/cnpj/v1/{cnpj}`), gratuita e sem chave. Nem a BrasilAPI nem a minhareceita listam por CNAE, então não servem sozinhas para descobrir os CNPJs.

**Filtro.** UF = SP, situação 02 (ativa) e CNAE principal ou secundário em `CNAES_PROSPECTO` (inclui o 1813-0/02).

**Gravação.** Upsert idempotente por CNPJ. Linha nova entra em `encontrado` com a nota de `notaDoProspect` e uma linha no histórico. Quem já existe só ganha dados cadastrais e nota: etapa e histórico não mudam. `descartado` e `opt_out` não são tocados. Nada é apagado. Não há regra documentada que mande a nota para `qualificado`, então o importador não faz isso: promover é decisão à parte.

**Volume e cursor.** No máximo 400 CNPJs e 240 s por execução (`maxDuration` da rota: 300 s). O cursor `{ mes, arquivo, offset }` fica no campo `prospectorImportador` do AppConfig. A execução seguinte reabre o arquivo, descarta `offset` bytes e continua; ao fim do arquivo passa ao próximo, e ao fim do arquivo 9 marca `concluido` até a Receita publicar o mês seguinte. **Falha da BrasilAPI (24/11/2026).** A chamada manda `user-agent` e repete até 3 vezes, com pausa curta, em 429, 5xx e erro de rede; 403 e outros 4xx não repetem. Se ainda assim falhar (qualquer status que não seja 404), o prospecto é gravado com o que já vem na linha do Estabelecimentos (nome fantasia, DDD+telefone, e-mail, CEP/endereço, UF, CNAEs, abertura), com a razão social vazia para completar depois; município e porte ficam vazios (o arquivo traz só o código do município). Numa linha que já existe, a razão social e os campos vazios não são sobrescritos. O cursor avança normalmente. A resposta traz `falhasCadastro` (quantos CNPJs caíram nisso) e, se havia falha e nenhum CNPJ foi gravado nem ignorado, `ok: false` com `erro` (status da primeira falha da BrasilAPI) e a rota responde 502. 404 continua sendo `semCadastro` (não grava). Se a pasta do mês ainda não existe, usa o mês anterior.

**Agendamento e acesso.** Entrada em `vercel.json` (uma vez por dia, 13h UTC) e rota liberada em `proxy.ts`. Autenticação igual a `/api/whatsapp/verificar`: com `CRON_SECRET` exige `Authorization: Bearer`; sem ele, só o `User-Agent` `vercel-cron/`. O `CRON_SECRET` é o que a Vercel já usa nos crons do projeto; não há secret novo. Para andar mais rápido que um lote por dia, chame a rota à mão com o Bearer ou aumente a frequência do cron (planos Pro).

**Rodar o importador à mão (uma vez, em produção).** Não espera o cron e não envia nada. A rota é a mesma do cron, com o mesmo Bearer:

```
curl -sS -m 300 -H "Authorization: Bearer $CRON_SECRET" https://<dominio-de-producao>/api/prospector/importar
```

`$CRON_SECRET` é o valor da variável de ambiente do projeto na Vercel. Resposta esperada: `{"ok":true,"lidos":...,"inseridos":N,"cursor":{...}}` (HTTP 200). Cada chamada trata até 400 CNPJs e avança o cursor; repita até `inseridos` aparecer em `prospectos_parceiros`. Leituras do resultado: 401 = segredo errado; 502 com `Receita respondeu NNN` = a fonte recusou ou o mês ainda não existe (nada é gravado, o cursor não anda); 500 = erro de banco, ver `erro`. Não liga `prospector_envio_ativo`.

**Diagnóstico de 24/11/2026.** O cron das 10h (13h UTC) não gravou nada porque a rota e a entrada do `vercel.json` só entraram na `main` às 10h38 (BRT), depois do horário; o primeiro disparo agendado é o de 25/11. A rota, o `vercel.json` (`0 13 * * *`) e a liberação em `proxy.ts` estão corretos na `main`. Se a chamada manual falhar, o `erro` devolvido indica a causa.

## Envio automático (primeiro contato e lembrete)

Código: `app/lib/prospectorEnvio.ts` (textos, horário, canais e recusa, tudo puro), `app/lib/prospectorEnvioServidor.ts` (Supabase, Evolution, Resend) e a rota `GET /api/prospector/enviar`. O texto está aprovado. **A chave `prospector_envio_ativo` (AppConfig) começa desligada** e nenhuma migração, seed ou teste a liga. Desligada, a rota devolve `{ ativo: false }` e não lê a base nem envia. Quem liga é o Felipe.

**Agendamento e acesso.** `vercel.json`: `0 11-22 * * 1-5` (11h–22h UTC, 8h–19h em Brasília). A rota confere o horário de verdade: só segunda a sexta, das 8h às 20h (fim exclusivo) America/Sao_Paulo, e recusa fora disso mesmo que o cron dispare. Autenticação igual às outras rotas de cron (`CRON_SECRET` em Bearer, ou só o `User-Agent` `vercel-cron/`); liberada em `proxy.ts`. Sem secret novo.

**Canais.** E-mail pela Resend (`enviarEmail`), de `ENYLA Embalagens <parceiros@enyla.com.br>` e com Reply-To `felipeonobrega2@gmail.com`. O Reply-To vale só para o Prospector (parâmetro opcional `opcoes` de `enviarEmail`); as outras mensagens seguem com `EMAIL_RESPONDER_PARA`. WhatsApp pela instância Evolution que já existe (o número do atendimento), só para celular brasileiro com 9 dígitos depois do DDD. Quem tem os dois canais recebe os dois no mesmo dia, com o mesmo passo.

**Qualificação.** `encontrado` com nota maior ou igual a `prospector_nota_minima` (AppConfig, padrão 1) e celular ou e-mail válido vira `qualificado`, com linha no histórico. `descartado` e `opt_out` nunca são reabertos. A cada execução olha os 1000 de maior nota que têm telefone ou e-mail preenchido.

**Filtro de público (issue #128).** Todos os CNAEs de `CNAES_PROSPECTO` continuam (pré-impressão 1821 e acabamentos 1822-9/99 são fornecedores que a operação precisa). Regras, em `app/lib/prospectorEnvio.ts`, aplicadas na qualificação/envio (vale para quem já está na base) e no importador (novos):
- **Encadernação/plastificação (1822-9/01) como único CNAE da lista**: não qualifica e o importador não importa.
- **CNAE da lista só como secundário** (principal fora da lista): não é cortado, mas exige nota mínima `max(prospector_nota_minima, NOTA_MINIMA_SO_SECUNDARIO)`; a constante vale 2. Principal na lista segue `prospector_nota_minima`. Sem CNAE principal registrado, segue o mínimo configurado.
- **Nome fora do ramo**: razão social ou nome fantasia com algum termo de `TERMOS_FORA_DO_RAMO` (inflável, balão, figurinha, brinquedo, festa…), sem acento e sem maiúsculas, por trecho. Para mudar a lista, edite o array. O importador não grava prospecto novo com esse nome (`ignorar`, motivo `fora do ramo`); quem já existe só tem os dados atualizados.

Nada é apagado: quem não serve fica na base em `encontrado`, não vira `qualificado` e não é abordado. O motivo não é gravado no histórico (a tabela não tem campo de motivo e gravar a cada execução repetiria a linha); `motivoNaoQualifica` devolve o texto para quem quiser consultar. Quem já estava `qualificado` e cai numa regra também sai da fila de primeiro contato. Sem mensagem nova, cobrança ou chave.

**Fila.** `qualificado`, em ordem de nota decrescente. Cota por canal (decisão do Felipe, 25/11/2026): **WhatsApp, no máximo 10 primeiros contatos por dia** (dia de São Paulo em que o envio saiu); **e-mail tem teto diário** (próximo parágrafo). Quem tem os dois canais: o e-mail sai mesmo com a cota do WhatsApp cheia; o WhatsApp só sai se ainda houver vaga (senão fica pendente para o próximo dia com vaga). Lembretes não entram na cota, mas só saem no mesmo horário.

**Teto diário de e-mail (25/11/2026).** A Resend Free dá 100 e-mails por dia (dia UTC) por time, e o transacional a cliente (proposta, aprovação, sinal, arte, rastreio) usa a mesma cota. O Prospector manda no máximo `PROSPECTOR_TETO_EMAIL_DIA` e-mails por dia (env da Vercel): vazio ou inválido = **80**; `0` = sem teto (plano pago). A conta é feita no banco a cada execução, somando em `historico_etapas` de todos os prospectos os envios de e-mail do Prospector (primeiro contato e lembrete, `enviado` ou `reservado`) do dia de São Paulo; a execução para quando `feitosHoje + nestaExecucao >= teto`. O cron roda das 11h às 22h UTC (8h às 19h em SP), janela em que o dia de SP e o dia UTC da Resend coincidem. **A reserva de 20 por dia é para o que não é prospecção:** e-mail transacional a cliente e respostas da diretoria a quem respondeu ao Prospector não contam no teto. Se a Resend responder 429 de cota (`daily_quota_exceeded` ou `monthly_quota_exceeded`), `enviarEmail` não retenta e devolve `cota: true`; o Prospector para o e-mail pelo resto do dia, e essa falha (inclusive as já gravadas com a mensagem de cota) **não conta** para `MAX_FALHAS_POR_CANAL`: o lead volta para a fila sem penalidade. 429 de rate limit continua sendo retentado. A resposta de `executarEnvio` traz `emailHoje`, `tetoEmailDia` e `motivoParada` (`teto_diario`, `cota_resend` ou `limite_execucao`).

**Limite técnico por execução.** Sem teto diário não é um disparo só: cada execução manda no máximo `MAX_EMAILS_POR_EXECUCAO` (60) e-mails (primeiro contato e lembrete somados) e para depois de `ORCAMENTO_MS_POR_EXECUCAO` (90 s) dentro dos 120 s da rota (`maxDuration`). O restante sai no próximo cron (de hora em hora).

**Limite da Resend.** A API aceita, por padrão, 10 requisições por segundo por time (compartilhado entre todas as chaves). `enviarEmail` (`app/lib/email.ts`) espera 350 ms entre chamadas (~3 por segundo, para sobrar para o resto do sistema) e, em resposta 429, respeita o `Retry-After` (mínimo 0,5 s, máximo 10 s) e tenta de novo até 3 vezes no total. O teto diário do Prospector está no parágrafo acima.

**Cadência.**

1. Primeiro contato. Pelo menos um canal com sucesso: etapa `abordado`, e o histórico guarda passo, canal, data e o texto.
2. Lembrete, 3 dias depois do primeiro contato, só se não houve resposta e só nos canais em que o primeiro contato saiu. Um só.
3. 3 dias depois do lembrete, sem resposta: etapa `encerrado_sem_resposta`. Nunca mais sai nada para aquele CNPJ. Não existe terceira mensagem.

**Idempotência.** Antes de enviar, a execução grava no histórico uma linha `reservado` (passo + canal), com trava otimista em `atualizado_em`. Só envia quem conseguiu gravar; um segundo disparo (retry, duas instâncias) enxerga a reserva. Depois do envio a linha vira `enviado` ou `falhou`. `reservado` sem desfecho (processo morreu no meio) conta como enviado: prefere-se perder um envio a mandar duas vezes. Só `falhou` libera nova tentativa, e só do canal que faltou, como o mesmo passo (até 3 falhas por canal). O mesmo telefone ou e-mail não recebe o mesmo passo por dois CNPJs, e contato de quem pediu para sair (`opt_out`) nunca recebe, por nenhum CNPJ.

**Resposta.** O que chega pela Evolution fica em `whatsapp_mensagens`. A cada execução (dentro do horário), mensagem recebida (`from_me = false`) depois do primeiro contato, de um `jid` `...@s.whatsapp.net` cujo número casa com o telefone do prospecto (com ou sem o 9 extra), marca `respondeu` e para a cadência. Se o texto é recusa clara ("não quero receber", "pare de enviar", "sem interesse", "não"...), marca `opt_out` (`descartado` + `opt_out_em`) e nunca mais envia. A resposta segue para o atendimento que já existe. **Este envio não cria resposta automática nova e não manda a frase de despedida.**

**Limitações.**

- Resposta de e-mail cai no Gmail do Felipe (Reply-To). Não há leitor de Gmail: um "sim" ou "não" por e-mail **não para a cadência sozinho**. **Por isso o lembrete e o encerramento por falta de resposta estão suspensos para quem recebeu o primeiro contato por e-mail** (`LEMBRETE_EMAIL_ATIVO = false` em `app/lib/prospectorEnvio.ts`; nenhum canal recebe lembrete, e o prospecto não vai para `encerrado_sem_resposta`). Volta quando a entrada de e-mail existir. Quem foi abordado só por WhatsApp segue a cadência normal. O Felipe precisa olhar o Gmail e marcar o prospecto à mão (`respondeu` ou `opt_out`) enquanto não existir o leitor.
- Resposta por WhatsApp de um contato que chega com `jid` `@lid` (sem o número) não é casada com o prospecto.
- A tela do funil conta só as etapas antigas; `respondeu` e `encerrado_sem_resposta` ainda não aparecem nela.
- O agente de atendimento que já existe continua tratando as conversas que entram. Este PR não muda isso.

**Migração.** `supabase/migrations/20261125_prospectos_envio_etapas.sql`: solta e recria a constraint de etapa com `respondeu` e `encerrado_sem_resposta`. Só aditiva, sem apagar nem alterar dado. O Felipe roda uma vez no SQL Editor **antes** de ligar a chave.

### Textos finais

Primeiro contato, até 12h (America/Sao_Paulo):

```
Bom dia, tudo bem? Aqui é da ENYLA, somos uma gráfica de embalagens em Barueri. Vocês fazem serviços de terceirização para outras gráficas?
```

Depois das 12h: o mesmo texto com "Boa tarde". Assunto do e-mail: `ENYLA, gráfica de embalagens em Barueri`. Sem link, sem preço, sem volume, sem linha de saída.

Lembrete único, 3 dias depois, sem resposta:

```
Oi, tudo bem? Aqui é da ENYLA, de Barueri, de novo. Só para saber se vocês fazem serviços de terceirização para outras gráficas.
```

### Textos de referência (só para o atendimento humano; nada disto sai sozinho)

Sim, Como funciona, Tipo de serviço, Quanto paga, Qual volume, Quem são vocês, Como pegaram meu contato, Tem contrato, resposta ao "não" e a passagem para o Felipe estão no texto do pedido (issue #11). Regras: pagamento é 50% na entrada e 50% na retirada, valor e forma combinados antes de cada pedido; não afirmar Pix nem transferência; não prometer volume, ganho fixo nem citar os valores ilustrativos da página; não citar Jerograf nem Villa.

Resposta ao "não" (não é enviada automaticamente; o Prospector só marca o opt-out):

```
Obrigado pelo retorno. Não vamos voltar a escrever. Um abraço, ENYLA.
```
