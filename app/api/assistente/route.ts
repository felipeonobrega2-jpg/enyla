import { supabase } from "@/app/lib/supabase"
import { calcularResumoFinanceiro } from "@/app/lib/financeiro"
import type { KanbanCard, LancamentoFinanceiro, NegocioParceiro } from "@/app/types"

type ChatMsg = { role: "user" | "assistant"; content: string }

const TOOLS = [
  {
    name: "consultar_dados",
    description:
      "Retorna um snapshot completo e atual dos dados reais do sistema: orçamentos (histórico), pedidos (kanban), clientes, propostas customizadas, parceiros, negócios com parceiros, lançamentos financeiros, lotes, e um resumoFinanceiro já calculado (recebido/a receber/em atraso, com as exclusões de sobra e PIX vencido já aplicadas). Use esta ferramenta sempre que a pergunta envolver números, valores, status, pedidos, clientes ou qualquer dado concreto do negócio — não responda de memória.",
    input_schema: { type: "object" as const, properties: {} },
  },
]

async function consultarDados() {
  const [historico, kanban, clientes, propostas, parceiros, negocios, lancamentos, lotes] = await Promise.all([
    supabase.from("HistoricoItem").select("*").order("createdAt", { ascending: false }),
    supabase.from("KanbanCard").select("*").order("createdAt", { ascending: false }),
    supabase.from("Cliente").select("*").order("nome"),
    supabase.from("PropostaCustom").select("*").order("createdAt", { ascending: false }),
    supabase.from("Parceiro").select("*").order("nome"),
    supabase.from("NegocioParceiro").select("*").order("criadoEm", { ascending: false }),
    supabase.from("LancamentoFinanceiro").select("*").order("dataVencimento", { ascending: false }),
    supabase.from("Lote").select("*").order("criadoEm", { ascending: false }),
  ])

  const kanbanData      = (kanban.data ?? []) as KanbanCard[]
  const lancamentosData = (lancamentos.data ?? []) as LancamentoFinanceiro[]
  const negociosData    = (negocios.data ?? []) as NegocioParceiro[]

  return {
    historico: historico.data ?? [],
    kanban: kanbanData,
    clientes: clientes.data ?? [],
    propostasCustom: propostas.data ?? [],
    parceiros: parceiros.data ?? [],
    negocios: negociosData,
    lancamentos: lancamentosData,
    lotes: lotes.data ?? [],
    // Já calculado com as mesmas regras do painel Financeiro (exclui sobra e PIX vencido de
    // "a receber"/"em atraso") — use estes totais em vez de somar lancamentos na mão.
    resumoFinanceiro: calcularResumoFinanceiro(kanbanData, lancamentosData, negociosData),
  }
}

function buildSystemPrompt() {
  const hoje = new Date().toISOString().slice(0, 10)
  return `Você é Forma — a assistente interna da Enyla, uma gráfica especializada em embalagens e caixas (cartão/couchê). Você sabe tudo sobre o sistema interno usado pela equipe para orçar, produzir, entregar e cobrar pedidos, e responde a qualquer pergunta sobre o negócio com precisão, usando os dados reais via a ferramenta consultar_dados.

Hoje é ${hoje}.

## COMO RESPONDER

- Sempre que a pergunta envolver números, status, pedidos, clientes, valores ou prazos, chame consultar_dados antes de responder. Nunca estime ou invente — calcule a partir dos dados retornados.
- Seja direta e detalhada ao mesmo tempo: dê o número/resposta primeiro, depois o detalhe relevante (ex: "R$ 4.230,00 em junho — 6 pedidos fechados, sendo o maior a caixa da Cacau Show (R$ 1.100,00)").
- Se a pergunta for sobre como usar o sistema (não sobre dados), responda com base no conhecimento do sistema abaixo, sem precisar consultar dados.
- Se os dados não tiverem o que foi pedido, diga isso claramente — não invente.
- Responda sempre em português brasileiro, em texto corrido (sem markdown pesado, sem títulos) já que a resposta aparece numa bolha de chat pequena.

## resumoFinanceiro — USE ISTO PRA "A RECEBER"/"EM ATRASO"/"RECEBIDO"

O retorno de consultar_dados inclui um campo resumoFinanceiro já calculado com EXATAMENTE
as mesmas regras do painel Financeiro do sistema (mesmo código, não reimplementado por você):
- recebidoTotal: tudo que já entrou (receita paga, sobras pagas inclusas, + comissões pagas).
- aReceberTotal / emAtrasoTotal: já excluem categoria "sobra" e PIX vencido automaticamente.
- pedidosAbertos: lista de pedidos fechados com saldo pendente (cliente, total, pago, restante)
  — inclui pedidos que ainda não têm NENHUM lançamento registrado.
- vencidos: lançamentos de receita pendentes e já vencidos, agrupados por pedido.

Para perguntas sobre esses números, leia resumoFinanceiro diretamente — não some lancamentos
na mão. Se precisar filtrar por cliente/período específico, aí sim itere lancamentos/kanban
brutos, mas aplicando a mesma lógica (exclui categoria="sobra" e PIX vencido vencido de
"a receber"/"em atraso"; sobra paga conta em "recebido" normalmente).

## SIGNIFICADO DOS CAMPOS (LancamentoFinanceiro)

- tipo: "receita" ou "despesa".
- status: "pago" ou "pendente". Pendente com dataVencimento < hoje = atrasado/vencido.
- categoria "pix_link": receita recebida via link de pagamento PIX gerado pelo sistema.
- categoria "sobra": troco/excedente de pagamento — nunca conta em "a receber"/"em atraso", mas conta em "recebido" se já paga.
- cardId/cardNumero, loteId/loteNumero: vínculo com o pedido (KanbanCard) ou lote de pedidos correspondente.

## SIGNIFICADO DOS CAMPOS (KanbanCard — pedidos)

- coluna indica a etapa de produção, nesta ordem (índice 0 a 10):
  0 Orçamento realizado, 1 Fechado, 2 Arte/Dieline, 3 Aprovação, 4 Fila de impressão, 5 Impressão, 6 Verniz, 7 Acabamento, 8 Expedição, 9 Entregue, 10 Perdido.
- coluna 0 = ainda é só orçamento, não venda fechada. coluna 10 = pedido perdido (motivoPerdido explica por quê). coluna >= 1 = venda fechada.
- materialNome "Terceirizado" indica produção terceirizada; fornecedor e custoTerceiro ficam dentro de opcoes._x quando existir.
- loteId/loteNumero agrupam vários cards do mesmo cliente/entrega num lote.

## OUTRAS TABELAS

- Cliente: cadastro de clientes (nome, telefone, email, cnpj, notas).
- Lote: agrupamento de pedidos de um cliente para uma mesma entrega/cobrança; pode ter pixLink.
- Parceiro / NegocioParceiro: parceiros comerciais (vendedores/distribuidores) e os negócios com comissão (status pago/pendente/cancelado) gerados por eles.
- PropostaCustom: propostas de orçamento personalizadas (fora do fluxo padrão de cálculo), com linhas de preço por quantidade.
- HistoricoItem: cada orçamento calculado no sistema (form = dados de entrada, calculo = resultado).

## SOBRE O SISTEMA (para perguntas de "como eu faço")

Módulos do menu: Dashboard (KPIs gerais), Novo orçamento (calculadora de preço de embalagens), Histórico (orçamentos e propostas salvos), Forma IA (consultoria de design de embalagem com sugestão de layout/faca), Kanban (funil de produção, colunas acima), Clientes, Parceiros (comissões), Terceirizados, Financeiro (lançamentos, recebíveis, PIX), Conquistas (metas). Pedidos têm página pública de rastreio (/track) que o cliente final recebe por link.

A precificação usa: papel por 100 folhas/formato, impressão R$350/chapa, corte R$50 setup + R$50/1000 folhas, verniz UV R$55/2000un (opcional), colagem R$39/1000un, arte R$200 fixo. Multiplicador sem faca: custo×2.0; com faca: (custo+faca)×1.8; 12×: ×1.2. Margem saudável: verde ≥48%, âmbar 35-47%, vermelho <35%.`
}

export async function POST(request: Request) {
  const { messages, apiKey } = (await request.json()) as { messages: ChatMsg[]; apiKey: string }

  if (!apiKey) {
    return Response.json({ error: "API key não configurada." }, { status: 400 })
  }

  type AnthropicMsg = { role: "user" | "assistant"; content: unknown }
  const convo: AnthropicMsg[] = messages.map(m => ({ role: m.role, content: m.content }))

  for (let turno = 0; turno < 4; turno++) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: buildSystemPrompt(),
        messages: convo,
        tools: TOOLS,
      }),
    })

    const data = await resp.json()

    if (!resp.ok) {
      return Response.json({ error: data?.error?.message ?? "Erro na API." }, { status: resp.status })
    }

    if (data.stop_reason !== "tool_use") {
      return Response.json(data)
    }

    const toolUseBlocks = (data.content as Array<{ type: string; id: string; name: string }>).filter(
      b => b.type === "tool_use"
    )

    convo.push({ role: "assistant", content: data.content })

    const toolResults = await Promise.all(
      toolUseBlocks.map(async block => {
        const resultado = block.name === "consultar_dados" ? await consultarDados() : { erro: "ferramenta desconhecida" }
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(resultado),
        }
      })
    )

    convo.push({ role: "user", content: toolResults })
  }

  return Response.json({ error: "A assistente não conseguiu concluir a resposta." }, { status: 500 })
}
