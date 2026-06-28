import { supabase } from "@/app/lib/supabase"
import { calcularResumoFinanceiro } from "@/app/lib/financeiro"
import type { KanbanCard, LancamentoFinanceiro, NegocioParceiro } from "@/app/types"
import { COLUNAS_KANBAN, COL_FECHADO } from "@/app/types"

type ChatMsg = { role: "user" | "assistant"; content: string }

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const hoje = () => new Date().toISOString().slice(0, 10)

const TOOLS = [
  {
    name: "consultar_dados",
    description:
      "Retorna um snapshot completo e atual dos dados reais do sistema: orçamentos (histórico), pedidos (kanban), clientes, propostas customizadas, parceiros, negócios com parceiros, lançamentos financeiros, lotes, e um resumoFinanceiro já calculado (recebido/a receber/em atraso, com as exclusões de sobra e PIX vencido já aplicadas). Use esta ferramenta sempre que a pergunta envolver números, valores, status, pedidos, clientes ou qualquer dado concreto do negócio — não responda de memória.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "registrar_pagamento",
    description:
      "Propõe registrar um pagamento recebido num pedido ou lote. NÃO executa direto — retorna um resumo que a interface mostra ao usuário com botões de Confirmar/Cancelar. Use quando o usuário pedir pra registrar, marcar ou dar baixa num pagamento.",
    input_schema: {
      type: "object" as const,
      properties: {
        numero: { type: "string", description: "Número do pedido (ex: ORC-2026-052) ou do lote (ex: MAU-001)." },
        valor: { type: "number", description: "Valor recebido, em reais." },
        formaPagamento: { type: "string", enum: ["pix", "boleto", "cartao_credito", "cartao_debito", "dinheiro", "transferencia", "outro"] },
      },
      required: ["numero", "valor"],
    },
  },
  {
    name: "mover_pedido",
    description:
      "Propõe mover um pedido pra outra etapa do funil de produção. NÃO executa direto — retorna um resumo que a interface mostra ao usuário com botões de Confirmar/Cancelar. Colunas, em ordem: 0 Orçamento realizado, 1 Fechado, 2 Arte/Dieline, 3 Aprovação, 4 Fila de impressão, 5 Impressão, 6 Verniz, 7 Acabamento, 8 Expedição, 9 Entregue, 10 Perdido.",
    input_schema: {
      type: "object" as const,
      properties: {
        numero: { type: "string", description: "Número do pedido (KanbanCard), ex: ORC-2026-052." },
        coluna: { type: "number", description: "Índice da coluna de destino, de 0 a 10." },
      },
      required: ["numero", "coluna"],
    },
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

// ─── Ações com confirmação ──────────────────────────────────────────────────
// As ferramentas de escrita nunca tocam o banco no primeiro passo: elas resolvem
// o alvo, validam, e devolvem um token stateless (payload em base64) descrevendo
// a ação exata. A execução de fato só acontece quando o usuário clica em
// "Confirmar" na interface, que chama esta mesma rota com confirmarToken — sem
// passar pelo modelo de novo. Isso evita depender só do prompt pra não agir sem
// confirmação.

type AcaoRegistrarPagamento = {
  tool: "registrar_pagamento"
  valor: number
  formaPagamento: string
  cardId?: string; cardNumero?: string
  loteId?: string; loteNumero?: string
  nomeCliente: string
}
type AcaoMoverPedido = {
  tool: "mover_pedido"
  id: string; numero: string
  colunaAtual: number; novaColuna: number
}
type Acao = AcaoRegistrarPagamento | AcaoMoverPedido

function gerarToken(acao: Acao): string {
  return Buffer.from(JSON.stringify(acao)).toString("base64")
}
function decodificarToken(token: string): Acao {
  return JSON.parse(Buffer.from(token, "base64").toString("utf8"))
}

async function proporRegistrarPagamento(params: { numero: string; valor: number; formaPagamento?: string }) {
  if (!params.numero || !(params.valor > 0)) return { erro: "Informe o pedido/lote e um valor maior que zero." }

  const { data: card } = await supabase.from("KanbanCard").select("*").eq("numero", params.numero).maybeSingle()
  const { data: lote } = card ? { data: null } : await supabase.from("Lote").select("*").eq("numero", params.numero).maybeSingle()
  if (!card && !lote) return { erro: `Não achei nenhum pedido ou lote com o número "${params.numero}".` }

  const formaPagamento = params.formaPagamento ?? "pix"
  const nomeCliente = card?.nomeCliente ?? lote?.nomeCliente ?? ""
  const acao: AcaoRegistrarPagamento = {
    tool: "registrar_pagamento",
    valor: params.valor,
    formaPagamento,
    cardId: card?.id, cardNumero: card?.numero,
    loteId: lote?.id, loteNumero: lote?.numero,
    nomeCliente,
  }

  return {
    status: "pendente_confirmacao",
    resumo: `Registrar pagamento de ${brl(params.valor)} via ${formaPagamento} no pedido ${params.numero} (${nomeCliente}).`,
    confirmToken: gerarToken(acao),
  }
}

async function proporMoverPedido(params: { numero: string; coluna: number }) {
  if (!params.numero || !Number.isInteger(params.coluna) || params.coluna < 0 || params.coluna > 10) {
    return { erro: "Informe o número do pedido e uma coluna válida (0 a 10)." }
  }
  const { data: card } = await supabase.from("KanbanCard").select("*").eq("numero", params.numero).maybeSingle()
  if (!card) return { erro: `Não achei nenhum pedido com o número "${params.numero}".` }

  const acao: AcaoMoverPedido = {
    tool: "mover_pedido",
    id: card.id, numero: card.numero,
    colunaAtual: card.coluna, novaColuna: params.coluna,
  }

  return {
    status: "pendente_confirmacao",
    resumo: `Mover pedido ${params.numero} (${card.nomeCliente}) de "${COLUNAS_KANBAN[card.coluna]}" para "${COLUNAS_KANBAN[params.coluna]}".`,
    confirmToken: gerarToken(acao),
  }
}

async function executarAcao(token: string): Promise<{ ok: true; mensagem: string } | { erro: string }> {
  let acao: Acao
  try {
    acao = decodificarToken(token)
  } catch {
    return { erro: "Token de confirmação inválido." }
  }

  if (acao.tool === "registrar_pagamento") {
    const lancamento = {
      id: crypto.randomUUID(),
      tipo: "receita",
      descricao: `Pagamento registrado via Forma — ${acao.nomeCliente}`,
      valor: acao.valor,
      dataVencimento: hoje(),
      dataPagamento: hoje(),
      status: "pago",
      cardId: acao.cardId ?? null,
      cardNumero: acao.cardNumero ?? null,
      loteId: acao.loteId ?? null,
      loteNumero: acao.loteNumero ?? null,
      nomeCliente: acao.nomeCliente,
      formaPagamento: acao.formaPagamento,
      criadoEm: new Date().toLocaleString("pt-BR"),
    }
    const { error } = await supabase.from("LancamentoFinanceiro").insert(lancamento)
    if (error) return { erro: "Erro ao registrar o pagamento no banco." }
    return { ok: true, mensagem: `Pagamento de ${brl(acao.valor)} registrado em ${acao.cardNumero ?? acao.loteNumero}.` }
  }

  if (acao.tool === "mover_pedido") {
    const dataFechamento = acao.novaColuna === COL_FECHADO ? hoje() : undefined
    const { error } = await supabase.from("KanbanCard")
      .update({ coluna: acao.novaColuna, ...(dataFechamento ? { dataFechamento } : {}) })
      .eq("id", acao.id)
    if (error) return { erro: "Erro ao mover o pedido no banco." }

    const { data: tracking } = await supabase.from("Tracking").select("*").eq("numero", acao.numero).maybeSingle()
    if (tracking) {
      const colNome = COLUNAS_KANBAN[acao.novaColuna] ?? `Coluna ${acao.novaColuna}`
      const jaTem = (tracking.etapas ?? []).some((e: { coluna: number }) => e.coluna === acao.novaColuna)
      const etapas = jaTem ? tracking.etapas : [...(tracking.etapas ?? []), { coluna: acao.novaColuna, nome: colNome, dataHora: new Date().toLocaleString("pt-BR") }]
      await supabase.from("Tracking").update({ colunaAtual: acao.novaColuna, etapas }).eq("numero", acao.numero)
    }
    return { ok: true, mensagem: `Pedido ${acao.numero} movido para "${COLUNAS_KANBAN[acao.novaColuna]}".` }
  }

  return { erro: "Ação desconhecida." }
}

function buildSystemPrompt() {
  return `Você é Forma — a assistente interna da Enyla, uma gráfica especializada em embalagens e caixas (cartão/couchê). Você sabe tudo sobre o sistema interno usado pela equipe para orçar, produzir, entregar e cobrar pedidos, e responde a qualquer pergunta sobre o negócio com precisão, usando os dados reais via a ferramenta consultar_dados.

Hoje é ${hoje()}.

## COMO RESPONDER

- Sempre que a pergunta envolver números, status, pedidos, clientes, valores ou prazos, chame consultar_dados antes de responder. Nunca estime ou invente — calcule a partir dos dados retornados.
- Primeira linha = a resposta direta, com o número em **negrito**. Só depois vem o detalhe — e só o detalhe que importa pra essa pergunta específica, não todo dado relacionado que você encontrou.
- Pra listar 2+ itens (pedidos, clientes, lançamentos), use uma lista com "-", uma linha por item, curta. Não escreva os itens em prosa corrida separados por ponto-e-vírgula.
- Corte qualquer frase de fechamento genérica ("se precisar de mais detalhes, é só perguntar" etc.) — termine no último dado relevante.
- Markdown simples é renderizado de verdade na interface: **negrito** pra números/nomes-chave e listas com "-" funcionam. Não use títulos (#), tabelas nem blocos de código — não há espaço pra isso na bolha.
- Se a pergunta for sobre como usar o sistema (não sobre dados), responda com base no conhecimento do sistema abaixo, sem precisar consultar dados.
- Se os dados não tiverem o que foi pedido, diga isso claramente em uma frase — não invente, não enrole.
- Responda sempre em português brasileiro. Bolha de chat estreita: priorize respostas curtas e escaneáveis sobre respostas completas — quem quiser mais detalhe, pergunta de novo.

## AÇÕES (registrar_pagamento, mover_pedido)

Você pode propor ações que alteram dados de verdade: registrar um pagamento recebido, ou
mover um pedido pra outra etapa de produção. Essas ferramentas NUNCA executam direto — elas
devolvem um resumo da ação proposta, e a própria interface mostra botões de Confirmar/Cancelar
pro usuário. Seu trabalho é só: 1) chamar a ferramenta com os parâmetros certos, 2) repetir o
resumo que ela devolveu numa frase curta, perguntando se está correto. Não chame a ferramenta
de novo só porque o usuário disse "sim"/"confirma" em texto — isso não executa nada; quem
executa é o botão na interface. Se o usuário confirmar em texto em vez de clicar, oriente-o a
clicar no botão "Confirmar" que apareceu na mensagem anterior.
Se faltar informação (ex: pediram pra "registrar um pagamento" sem dizer valor ou pedido),
pergunte antes de chamar a ferramenta — não invente valor nem qual pedido.

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
brutos, mas aplicando a mesma lógica (exclui categoria="sobra" e PIX vencido de "a receber"/
"em atraso"; sobra paga conta em "recebido" normalmente).

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
  const body = await request.json()

  // Execução direta de uma ação já confirmada na interface — não passa pelo modelo.
  if (body.confirmarToken) {
    const resultado = await executarAcao(body.confirmarToken)
    return Response.json(resultado)
  }

  const { messages, apiKey } = body as { messages: ChatMsg[]; apiKey: string }

  if (!apiKey) {
    return Response.json({ error: "API key não configurada." }, { status: 400 })
  }

  type AnthropicMsg = { role: "user" | "assistant"; content: unknown }
  const convo: AnthropicMsg[] = messages.map(m => ({ role: m.role, content: m.content }))
  let acaoPendente: { resumo: string; confirmToken: string } | null = null

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
      return Response.json({ ...data, acaoPendente })
    }

    const toolUseBlocks = (data.content as Array<{ type: string; id: string; name: string; input: Record<string, unknown> }>).filter(
      b => b.type === "tool_use"
    )

    convo.push({ role: "assistant", content: data.content })

    const toolResults = await Promise.all(
      toolUseBlocks.map(async block => {
        let resultado: unknown
        if (block.name === "consultar_dados") resultado = await consultarDados()
        else if (block.name === "registrar_pagamento") resultado = await proporRegistrarPagamento(block.input as { numero: string; valor: number; formaPagamento?: string })
        else if (block.name === "mover_pedido") resultado = await proporMoverPedido(block.input as { numero: string; coluna: number })
        else resultado = { erro: "ferramenta desconhecida" }

        if (resultado && typeof resultado === "object" && (resultado as { status?: string }).status === "pendente_confirmacao") {
          const r = resultado as { resumo: string; confirmToken: string }
          acaoPendente = { resumo: r.resumo, confirmToken: r.confirmToken }
        }

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
