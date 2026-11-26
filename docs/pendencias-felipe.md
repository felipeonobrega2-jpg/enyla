# Pendências do Felipe

Tela `/?aba=pendencias-felipe` (menu: "Pendências do Felipe"): no máximo 5 itens do que só o Felipe pode fazer, por **valor (R$) × urgência**. Issue #151, ordem do Felipe em 25/11/2026, 20h10.

## O que entra (fontes)
1. Fila do Aprovo: ações `tipo:"mensagem"` com `status:"aguardando"` nas conversas dos diretores.
2. Leads esperando o Felipe (`quemEspera` + `paraOFelipe`). Conversa que o Felipe conduz só entra se a última mensagem real é do lead (`entraConversa`).
3. Tarefas `tarefa_felipe` abertas.
4. Itens `pendencia_felipe` pedidos pelos diretores pela porta.
5. Ações fixas em código (`FIXAS` em `app/lib/pendenciasFelipe.ts`): passo da Resend, PRs com "Aprovo do Felipe".

## Valor e ordem
- Valor: o do ORC (quando há); senão quantidade × referência calculada pelo sistema, marcada "estimativa"; senão "sem valor" (conta como R$ 0, nunca inventado).
- Referência: mediana de preço ÷ quantidade dos pedidos do próprio sistema com a mesma medida (só com 3+ pedidos). Não chama o `calcular()` completo, que exige a ficha inteira do produto.
- Urgência: 1 + horas esperando/24 (até 72 h), ×2 com prazo vencido, ×1,5 com prazo em até 2 dias, ×1,5 para ICP. Empate (ex.: tudo sem valor): maior urgência, depois quem espera há mais tempo.
- Corte em 5.

## Botões
- **Resolvido**: tarefa vira feita; pedido de diretor ganha `resolvidoEm`/`resolvidoPor`; os demais viram dispensa com o motivo "Resolvido pelo Felipe". Nada é apagado.
- **Dispensar** (pede motivo): usa `pendenciaDispensada.ts`. Não volta, salvo mensagem nova do lead depois da dispensa (`ultima_recebida_at` > `em` da dispensa).
- **Assuma**: o agente assume a conversa (`assumirConversa`, mesmo caminho do "assuma"). Nenhuma mensagem sai sem o fluxo atual de Aprovo.

## Porta `/api/externo`
- `POST {acao:'pendencia_felipe', titulo, origem, oQueFazer?, jid?, orc?, quantidade?, medida?, tipo?, desde?, prazo?}`, qualquer diretor. Sem `titulo` ou `origem`: 400. Máximo de 10 abertas por diretor (11ª: 429). `valor` e `estimativa` enviados são ignorados: o valor vem do ORC existente, do cálculo do sistema ou fica "sem valor".
- A linha do que o Felipe faz vai em **`oQueFazer`**, porque `acao` já é o nome da ação da porta (o texto da issue usava `acao` nos dois lugares).
- `{acao:'pendencia_felipe', operacao:'cancelar', id}` cancela só as suas.
- Leitura `?o=pendencias_felipe` (todas as chaves): os até 5 do dia, quem pediu e as suas abertas.

## Avisos
- Item novo no top 5: `notificar()` (ntfy) ao próprio Felipe, só "N itens novos nas suas pendências", com link para a aba. Sem nome nem telefone. Checado a cada rodada do vigia e depois de cada ação.
- Resumo da manhã (slot das 8h do vigia, o mesmo do resumo do dia): só os 3 itens de maior valor.

## Pendente
- `conversaDoFelipe` (#150) ainda não está na main: `conduzida` está fixo em `false` em `pendenciasFelipeServidor.ts` (marcado no código). Trocar pela função da #150 quando ela entrar; a regra (`entraConversa`) já está testada.
