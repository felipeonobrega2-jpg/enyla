# Prospector de Parceiros

A ENYLA fica em Barueri-SP. O prospector acha gráficas paulistas, dá uma nota e acompanha o funil até o cadastro em [/parceiros](https://app.enyla.com.br/parceiros). Esta nota não manda mensagem.

## Esta parte — base, nota e funil

É o que este pull request entrega.

**Base.** A tabela `prospectos_parceiros` guarda o CNPJ (único), a razão social, o nome fantasia, o CNAE principal e os secundários, os serviços inferidos, a situação cadastral, a data de abertura, o porte, o município, a UF, o CEP, o endereço, latitude e longitude opcionais, o e-mail e o telefone do cadastro, a fonte, a data da coleta, a nota, a etapa e o histórico de etapas. O campo "não quero receber" é `opt_out`, com data em `opt_out_em`.

A migração é só aditiva: `supabase/migrations/20261124_prospectos_parceiros.sql`. Neste repositório o SQL não sobe sozinho. O Felipe roda o arquivo uma vez no SQL Editor do Supabase. Pode rodar de novo sem duplicar. Este pull request não cria a tabela em produção. Enquanto ela não existir, a tela avisa e a aprovação de parceiro segue como está.

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

## Próxima parte — importador

Ainda não é código. Lê os dados abertos de CNPJ da Receita Federal, só de fonte gratuita, e fica com UF = SP, situação ativa e os CNAEs da tabela acima. Grava na `prospectos_parceiros`, calcula a nota com `notaDoProspect` e começa em `encontrado`. Não manda mensagem.

## Parte final — abordagem

Fica desligada até o Felipe aprovar o texto e ligar o disparo. Não há envio, modelo de mensagem nem chave neste pull request.

Quando existir, a regra é esta:

- E-mail pela Resend e WhatsApp só pelo número institucional. Nunca pelo número pessoal.
- No máximo 10 abordagens por dia, de segunda a sexta.
- Primeiro contato, um lembrete 4 dias depois, e encerra.
- Toda mensagem leva "não quero receber" e o link do cadastro `/parceiros`.
- Quem recusa fica com `opt_out` e sai da fila para sempre.
