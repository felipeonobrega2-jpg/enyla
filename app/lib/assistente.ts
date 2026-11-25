// Assistente do Felipe pelo WhatsApp. Hoje: ele escreve (ou manda áudio) no chat "você mesmo" do número da ENYLA.
// Com o WhatsApp institucional: ele manda do número pessoal (agenteAuto.avisoNumero) para o número da ENYLA.
// Fala dos pedidos pelo LOTE (MAU-003), lembra a conversa (resposta contínua) e consulta os dados reais.
// O que muda dado (mover lote, recebimento, despesa, digital pronto) vira proposta e só executa com "sim".
// Só mensagem digitada no celular conta no chat "você mesmo" (id sem "3EB0": os avisos que o próprio sistema
// manda ali têm esse prefixo, e assim o assistente nunca responde a si mesmo).
import { lerConfigLinha } from "./configAtomica"
import type Anthropic from "@anthropic-ai/sdk"
import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { clienteClaude, MODELO, FALLBACK } from "./claude"
import { COLUNAS_KANBAN, COL_FECHADO, COL_ENTREGUE, type KanbanCard, type LancamentoFinanceiro } from "../types"

type Pendente = { acao: "mover" | "recebimento" | "despesa" | "pronto" | "assumir"; params: Record<string, unknown>; resumo: string; em: string }
type Fala = { r: "user" | "assistant"; t: string; em: string }
type Lote = { id: string; numero: string; nomeCliente: string }
type Cfg = Record<string, unknown> & {
  apiKey?: string; assistentePendente?: Pendente | null; assistenteConversa?: Fala[]
  agenteAuto?: { avisoNumero?: string }
  categoriasDespesa?: { id: string; nome: string }[]; categoriasReceita?: { id: string; nome: string }[]
  pedidosDigitais?: { id: string; nome: string | null; status: string; quantidade: number; total: number; sinal?: number; restante?: number; prontoEm?: string; sinalPagoEm?: string; restantePagoEm?: string; teste?: boolean }[]
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
const agoraBR = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
const norm = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()
const digitos = (s?: string | null) => (s ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")
export const ehComandoDoDono = (a: { fromMe?: boolean; remoteJid?: string; id?: string }, dono: string | null) =>
  !!a.fromMe && !!dono && !!a.remoteJid && a.remoteJid.split("@")[0] === dono && !!a.id && !/^3EB0/i.test(a.id)
// Número pessoal do Felipe (quando a ENYLA tiver o WhatsApp institucional): mensagem recebida dele é comando
export const ehDoNumeroPessoal = (a: { fromMe?: boolean; remoteJid?: string }, pessoal?: string | null) =>
  !a.fromMe && !!pessoal && digitos(pessoal).length >= 10 && digitos(a.remoteJid?.split("@")[0]) === digitos(pessoal)
export const ehConfirmacao = (t: string) => /^(sim|s|ok|okay|confirm[ao]|pode|pode sim|manda|isso|bora|fechado|positivo)\b/i.test(t.trim())
export const ehCancelamento = (t: string) => /^(n[aã]o|nao|cancela|cancelar|deixa|esquece|para)\b/i.test(t.trim())
export const pareceLote = (t: string) => /^[a-z]{2,6}-\d{2,4}$/i.test(t.trim()) && !/^(orc|prp|dig)-/i.test(t.trim())

async function todas<T>(tabela: string, sel = "*"): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; ; i += 1000) { const { data } = await supabase.from(tabela).select(sel).range(i, i + 999); out.push(...((data ?? []) as T[])); if (!data || data.length < 1000) break }
  return out
}

// Referência do Felipe → lote e os pedidos dele. Aceita "MAU-003", "ORC-2026-204" ou o nome do cliente (o lote mais recente).
async function resolver(ref: string): Promise<{ lote: Lote | null; cards: KanbanCard[] } | null> {
  const r = ref.trim()
  if (pareceLote(r)) {
    const { data: l } = await supabase.from("Lote").select("id, numero, nomeCliente").ilike("numero", r).maybeSingle()
    if (l) { const { data: cs } = await supabase.from("KanbanCard").select("*").eq("loteId", l.id); return { lote: l as Lote, cards: (cs ?? []) as KanbanCard[] } }
  }
  const { data: porNumero } = await supabase.from("KanbanCard").select("*").ilike("numero", `%${r}%`).limit(2)
  let card = porNumero?.length === 1 ? porNumero[0] as KanbanCard : null
  if (!card) {
    const { data: porNome } = await supabase.from("KanbanCard").select("*").ilike("nomeCliente", `%${r}%`).neq("coluna", 10).order("createdAt", { ascending: false }).limit(1)
    card = (porNome?.[0] as KanbanCard | undefined) ?? null
  }
  if (!card) return null
  if (card.loteId) {
    const { data: l } = await supabase.from("Lote").select("id, numero, nomeCliente").eq("id", card.loteId).maybeSingle()
    const { data: cs } = await supabase.from("KanbanCard").select("*").eq("loteId", card.loteId)
    return { lote: (l as Lote | null) ?? null, cards: (cs ?? [card]) as KanbanCard[] }
  }
  return { lote: null, cards: [card] }
}
const nomeDe = (x: { lote: Lote | null; cards: KanbanCard[] }) => x.lote?.numero ?? x.cards[0]?.numero ?? "pedido"

async function resumoDoLote(x: { lote: Lote | null; cards: KanbanCard[] }) {
  const ids = x.cards.map(c => c.id)
  const q = x.lote ? supabase.from("LancamentoFinanceiro").select("tipo, descricao, valor, status, formaPagamento, dataVencimento").eq("loteId", x.lote.id)
    : supabase.from("LancamentoFinanceiro").select("tipo, descricao, valor, status, formaPagamento, dataVencimento").in("cardId", ids)
  const { data: ls } = await q
  const l = (ls ?? []) as { tipo: string; descricao: string; valor: number; status: string; formaPagamento: string | null }[]
  const soma = (f: (y: typeof l[number]) => boolean) => Math.round(l.filter(f).reduce((t, y) => t + y.valor, 0) * 100) / 100
  const vendido = x.cards.reduce((t, c) => t + (Number(c.preco) || 0), 0)
  const recebido = soma(y => y.tipo === "receita" && y.status === "pago")
  const custos = soma(y => y.tipo === "despesa")
  return {
    lote: nomeDe(x), cliente: x.lote?.nomeCliente ?? x.cards[0]?.nomeCliente,
    itens: x.cards.map(c => ({ caixa: [c.dimensoes && c.dimensoes !== "0×0×0" ? `${c.dimensoes} cm` : null, c.materialNome].filter(Boolean).join(" · ") || "caixa", quantidade: c.quantidade, valor: c.preco, etapa: COLUNAS_KANBAN[c.coluna] ?? c.coluna, entregaPrevista: c.dataEntregaPrevista ?? null })),
    vendido, recebido, aReceber: Math.max(0, Math.round((vendido - recebido) * 100) / 100),
    custosLancados: custos, custosEmAbertoNaContaJerograf: soma(y => y.tipo === "despesa" && y.status !== "pago" && y.formaPagamento === "conta"),
    margemAteAgora: vendido ? Math.round((vendido - custos) / vendido * 1000) / 10 : null,
  }
}

// ── Ferramentas ──────────────────────────────────────────────────────────────
const ETAPAS = COLUNAS_KANBAN.slice(0, 11) as unknown as string[]
const FERRAMENTAS: Anthropic.Tool[] = [
  { name: "vendas_do_periodo", description: "Quanto foi vendido no mês (offset fechado + digital pago), com pedidos, ticket médio e unidades.", input_schema: { type: "object", properties: { mes: { type: "string", enum: ["atual", "anterior"] } }, required: [] } },
  { name: "buscar", description: "Procura lotes/pedidos pelo nome do cliente, número do lote (ex.: MAU-003) ou do digital (DIG-). Devolve lote, etapa, valor.", input_schema: { type: "object", properties: { termo: { type: "string" } }, required: ["termo"] } },
  { name: "detalhe_lote", description: "Tudo de um lote: itens (caixa, quantidade, etapa), vendido, recebido, a receber, custos lançados e margem.", input_schema: { type: "object", properties: { lote: { type: "string", description: "número do lote (MAU-003) ou nome do cliente" } }, required: ["lote"] } },
  { name: "lotes_em_producao", description: "Lotes que estão em andamento no quadro (de Fechado até Expedição), com etapa e entrega prevista.", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "contas_a_receber", description: "Receitas em aberto (sinais e restantes a receber), com total, por lote.", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "quem_esta_esperando", description: "Bons negócios esperando resposta do Felipe agora.", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "propor_mover", description: "Propõe mover um lote (todos os pedidos dele) para outra etapa do quadro. Só executa depois que o Felipe confirmar.", input_schema: { type: "object", properties: { lote: { type: "string", description: "lote (MAU-003) ou nome do cliente" }, etapa: { type: "string", enum: ETAPAS } }, required: ["lote", "etapa"] } },
  { name: "propor_recebimento", description: "Propõe registrar dinheiro recebido de um cliente/lote (dá baixa no lançamento em aberto de mesmo valor ou lança a receita no lote). Só executa depois da confirmação.", input_schema: { type: "object", properties: { lote: { type: "string" }, valor: { type: "number" }, forma: { type: "string", enum: ["pix", "dinheiro", "cartao", "boleto", "transferencia"] } }, required: ["lote", "valor"] } },
  { name: "propor_despesa", description: "Propõe lançar uma despesa paga hoje (opcionalmente ligada a um lote). Só executa depois da confirmação.", input_schema: { type: "object", properties: { descricao: { type: "string" }, valor: { type: "number" }, forma: { type: "string", enum: ["pix", "dinheiro", "cartao", "boleto", "debito"] }, lote: { type: "string" } }, required: ["descricao", "valor"] } },
  { name: "propor_digital_pronto", description: "Propõe marcar um pedido do digital como pronto (o cliente é avisado para pagar o restante). Só executa depois da confirmação.", input_schema: { type: "object", properties: { pedido: { type: "string", description: "DIG-xxxx ou nome do cliente" } }, required: ["pedido"] } },
  { name: "propor_passar_conversa", description: "Propõe passar uma conversa do WhatsApp para o agente de vendas assumir (ele continua de onde o Felipe parou e segue atendendo). Só executa depois da confirmação.", input_schema: { type: "object", properties: { contato: { type: "string", description: "nome do contato/cliente na conversa" } }, required: ["contato"] } },
  { name: "anotar_ideia", description: "Anota uma ideia no banco de ideias do sistema.", input_schema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] } },
]

async function rodarFerramenta(nome: string, e: Record<string, unknown>, cfg: Cfg): Promise<string> {
  if (nome === "vendas_do_periodo") {
    const { montarPedidos, vendasDoPeriodo } = await import("./negocio")
    const { unpackTerceirizado } = await import("./kanbanUnpack")
    const [k, l] = await Promise.all([todas<KanbanCard>("KanbanCard"), todas<LancamentoFinanceiro>("LancamentoFinanceiro").then(ls => ls.filter(l => (l.unidade ?? "offset") === "offset"))])
    const d = new Date(`${hoje()}T12:00:00-03:00`)
    const ant = e.mes === "anterior"
    const de = new Date(d.getFullYear(), d.getMonth() - (ant ? 1 : 0), 1), ate = ant ? new Date(d.getFullYear(), d.getMonth(), 0, 23, 59) : d
    const v = vendasDoPeriodo(montarPedidos(k.map(unpackTerceirizado), l), l, { from: de, to: ate })
    const dig = (cfg.pedidosDigitais ?? []).filter(p => p.sinalPagoEm && !p.teste && new Date(p.sinalPagoEm) >= de && new Date(p.sinalPagoEm) <= ate)
    const totDig = dig.reduce((t, p) => t + p.total, 0)
    return JSON.stringify({ periodo: `${de.toLocaleDateString("pt-BR")} a ${ate.toLocaleDateString("pt-BR")}`, offset: { vendido: v.receita, valorDosPedidos: v.valorPedidos, sobrasVendidas: v.sobras, pedidos: v.pedidos.length, ticketMedio_dosPedidos: v.ticketMedio, unidades: v.unidades }, digital: { vendido: totDig, pedidos: dig.length }, total: v.receita + totDig })
  }
  if (nome === "buscar") {
    const t = String(e.termo ?? "").trim()
    const lotes = pareceLote(t)
      ? (await supabase.from("Lote").select("id, numero, nomeCliente").ilike("numero", `%${t}%`).limit(5)).data ?? []
      : (await supabase.from("Lote").select("id, numero, nomeCliente").ilike("nomeCliente", `%${t}%`).order("criadoEm", { ascending: false }).limit(6)).data ?? []
    const { data: soltos } = await supabase.from("KanbanCard").select("numero, nomeCliente, coluna, preco, quantidade").is("loteId", null).ilike("nomeCliente", `%${t}%`).neq("coluna", 10).order("createdAt", { ascending: false }).limit(5)
    const comCards = await Promise.all(lotes.map(async l => { const { data: cs } = await supabase.from("KanbanCard").select("coluna, preco, quantidade").eq("loteId", l.id); return { lote: l.numero, cliente: l.nomeCliente, etapas: [...new Set((cs ?? []).map(c => COLUNAS_KANBAN[c.coluna]))], valor: (cs ?? []).reduce((s, c) => s + (Number(c.preco) || 0), 0), unidades: (cs ?? []).reduce((s, c) => s + (c.quantidade ?? 0), 0) } }))
    const dig = (cfg.pedidosDigitais ?? []).filter(p => norm(p.id).includes(norm(t)) || norm(p.nome ?? "").includes(norm(t))).slice(0, 4)
    return JSON.stringify({ lotes: comCards, orcamentosSemLote: (soltos ?? []).map(c => ({ orcamento: c.numero, cliente: c.nomeCliente, etapa: COLUNAS_KANBAN[c.coluna], valor: c.preco })), digital: dig.map(p => ({ id: p.id, cliente: p.nome, status: p.status, quantidade: p.quantidade, total: p.total, restante: p.restante ?? null, pronto: !!p.prontoEm })) })
  }
  if (nome === "detalhe_lote") {
    const x = await resolver(String(e.lote ?? ""))
    return x ? JSON.stringify(await resumoDoLote(x)) : "Não achei esse lote."
  }
  if (nome === "lotes_em_producao") {
    const { data } = await supabase.from("KanbanCard").select("loteNumero, numero, nomeCliente, coluna, quantidade, dataEntregaPrevista").gte("coluna", COL_FECHADO).lt("coluna", COL_ENTREGUE).order("coluna", { ascending: false })
    const g = new Map<string, { lote: string; cliente: string; etapa: string; unidades: number; entregaPrevista: string | null }>()
    for (const c of data ?? []) { const k = c.loteNumero ?? c.numero; const a = g.get(k); if (a) a.unidades += c.quantidade ?? 0; else g.set(k, { lote: k, cliente: c.nomeCliente, etapa: COLUNAS_KANBAN[c.coluna], unidades: c.quantidade ?? 0, entregaPrevista: c.dataEntregaPrevista ?? null }) }
    return JSON.stringify([...g.values()])
  }
  if (nome === "contas_a_receber") {
    const { data } = await supabase.from("LancamentoFinanceiro").select("descricao, valor, dataVencimento, nomeCliente, loteNumero, cardNumero").eq("tipo", "receita").neq("status", "pago").order("dataVencimento").limit(60)
    const lista = (data ?? []) as { valor: number; loteNumero: string | null; cardNumero: string | null; nomeCliente: string | null; descricao: string; dataVencimento: string | null }[]
    return JSON.stringify({ total: lista.reduce((t, x) => t + x.valor, 0), itens: lista.slice(0, 15).map(x => ({ lote: x.loteNumero ?? x.cardNumero, cliente: x.nomeCliente, descricao: x.descricao, valor: x.valor, vencimento: x.dataVencimento })) })
  }
  if (nome === "quem_esta_esperando") {
    const { quemEspera, paraOFelipe, tempoEspera } = await import("./esperando")
    const { data } = await supabase.from("whatsapp_conversas").select("jid, nome, etiquetas, status_lead, ultima_msg, ultima_recebida_at, ultima_enviada_at, proxima_acao, fechada_em").not("jid", "like", "%@g.us").gte("ultima_recebida_at", new Date(Date.now() - 7 * 86_400_000).toISOString()).limit(1000)
    return JSON.stringify(quemEspera((data ?? []) as never).filter(paraOFelipe).slice(0, 10).map(x => ({ nome: x.nome, ha: tempoEspera(x.minutos), mensagem: x.mensagem })))
  }
  if (nome === "anotar_ideia") {
    const texto = String(e.texto ?? "").trim().slice(0, 600)
    if (!texto) return "Ideia vazia."
    await mudarConfig((d: Cfg & { ideias?: unknown[] }) => ({ ideias: [{ id: `wa-${Date.now().toString(36)}`, texto, status: "ideia", criadaEm: new Date().toISOString() }, ...(d.ideias ?? [])] }))
    return "Anotada no banco de ideias."
  }
  // Propostas: guardam a ação e pedem confirmação
  let p: Pendente | null = null
  if (nome === "propor_mover") {
    const x = await resolver(String(e.lote ?? ""))
    const col = COLUNAS_KANBAN.indexOf(String(e.etapa) as never)
    if (!x) return "Não achei esse lote."
    if (col < 0) return "Etapa inválida."
    const de = [...new Set(x.cards.map(c => COLUNAS_KANBAN[c.coluna]))].join(", ")
    p = { acao: "mover", params: { ids: x.cards.map(c => c.id), coluna: col }, resumo: `Mover o lote *${nomeDe(x)}* (${x.cards[0]?.nomeCliente}${x.cards.length > 1 ? `, ${x.cards.length} itens` : ""}) de "${de}" para *"${COLUNAS_KANBAN[col]}"*`, em: new Date().toISOString() }
  }
  if (nome === "propor_recebimento") {
    const x = await resolver(String(e.lote ?? ""))
    const valor = Number(e.valor)
    if (!x) return "Não achei esse lote."
    if (!(valor > 0)) return "Valor inválido."
    const q = x.lote ? supabase.from("LancamentoFinanceiro").select("id, descricao, valor").eq("loteId", x.lote.id) : supabase.from("LancamentoFinanceiro").select("id, descricao, valor").in("cardId", x.cards.map(c => c.id))
    const { data: abertos } = await q.eq("tipo", "receita").neq("status", "pago")
    const casa = (abertos ?? []).find(l => Math.abs(l.valor - valor) < 1)
    const forma = String(e.forma ?? "pix")
    p = { acao: "recebimento", params: { loteId: x.lote?.id ?? null, lote: nomeDe(x), cardId: x.cards[0]?.id, cardNumero: x.cards[0]?.numero, cliente: x.cards[0]?.nomeCliente, valor, forma, lancamentoId: casa?.id ?? null },
      resumo: casa ? `Dar baixa em *${casa.descricao}* (${brl(casa.valor)}) do lote ${nomeDe(x)} como pago hoje (${forma})` : `Lançar *${brl(valor)}* recebido no lote *${nomeDe(x)}* (${x.cards[0]?.nomeCliente}) hoje (${forma})`, em: new Date().toISOString() }
  }
  if (nome === "propor_despesa") {
    const valor = Number(e.valor), descricao = String(e.descricao ?? "").trim()
    if (!(valor > 0) || !descricao) return "Faltou a descrição ou o valor."
    const x = e.lote ? await resolver(String(e.lote)) : null
    const { data: hist } = await supabase.from("LancamentoFinanceiro").select("categoria").eq("tipo", "despesa").ilike("descricao", descricao).not("categoria", "is", null).limit(20)
    const conta: Record<string, number> = {}; for (const h of hist ?? []) conta[h.categoria] = (conta[h.categoria] ?? 0) + 1
    const categoria = Object.entries(conta).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    const nomeCat = categoria ? (cfg.categoriasDespesa ?? []).find(c => c.id === categoria)?.nome ?? categoria : "sem categoria"
    const forma = String(e.forma ?? "pix")
    p = { acao: "despesa", params: { descricao, valor, forma, categoria, loteId: x?.lote?.id ?? null, lote: x ? nomeDe(x) : null, cardId: x?.cards[0]?.id ?? null, cardNumero: x?.cards[0]?.numero ?? null, cliente: x?.cards[0]?.nomeCliente ?? null },
      resumo: `Lançar despesa *${descricao}* de *${brl(valor)}*, paga hoje (${forma})${x ? ` no lote ${nomeDe(x)}` : ""} · categoria: ${nomeCat}`, em: new Date().toISOString() }
  }
  if (nome === "propor_digital_pronto") {
    const t = norm(String(e.pedido ?? ""))
    const ped = (cfg.pedidosDigitais ?? []).find(x => x.status === "producao" && (norm(x.id) === t || norm(x.nome ?? "").includes(t)))
    if (!ped) return "Não achei pedido do digital em produção com esse nome ou número."
    p = { acao: "pronto", params: { id: ped.id }, resumo: `Marcar *${ped.id}* (${ped.nome ?? "cliente"}) como pronto: o cliente recebe no WhatsApp o aviso do restante de ${brl(ped.restante ?? 0)}`, em: new Date().toISOString() }
  }
  if (nome === "propor_passar_conversa") {
    const t = String(e.contato ?? "").trim()
    const { data } = await supabase.from("whatsapp_conversas").select("jid, nome").ilike("nome", `%${t}%`).not("jid", "like", "%@g.us").order("ultima_at", { ascending: false }).limit(3)
    if (!data?.length) return "Não achei conversa com esse nome."
    if (data.length > 1 && norm(data[0].nome ?? "") !== norm(t)) return `Achei mais de uma: ${data.map(d => d.nome).join(", ")}. Qual?`
    p = { acao: "assumir", params: { jid: data[0].jid, nome: data[0].nome }, resumo: `Passar a conversa de *${data[0].nome}* para o agente: ele continua de onde você parou e segue atendendo`, em: new Date().toISOString() }
  }
  if (!p) return "Ferramenta desconhecida."
  await mudarConfig(() => ({ assistentePendente: p }))
  return `PROPOSTA GUARDADA, aguardando o Felipe confirmar: ${p.resumo}`
}

// ── Execução depois do "sim" ─────────────────────────────────────────────────
export async function executar(p: Pendente, cfg: Cfg): Promise<string> {
  if (p.acao === "mover") {
    const { ids, coluna } = p.params as { ids: string[]; coluna: number }
    const { data: cs } = await supabase.from("KanbanCard").select("id, numero, loteNumero, dataFechamento, dataEntregaReal").in("id", ids)
    if (!cs?.length) return "Os pedidos não existem mais."
    for (const c of cs) {
      const patch: Record<string, unknown> = { coluna }
      if (coluna >= COL_FECHADO && coluna <= COL_ENTREGUE && !c.dataFechamento) patch.dataFechamento = hoje()
      if (coluna === COL_ENTREGUE && !c.dataEntregaReal) patch.dataEntregaReal = hoje()
      await supabase.from("KanbanCard").update(patch).eq("id", c.id)
      const { data: t } = await supabase.from("Tracking").select("etapas").eq("numero", c.numero).maybeSingle()
      if (t) await supabase.from("Tracking").update({ colunaAtual: coluna, etapas: [...((t.etapas as unknown[]) ?? []), { nome: COLUNAS_KANBAN[coluna], tipo: "coluna", coluna, dataHora: agoraBR() }] }).eq("numero", c.numero)
    }
    return `Feito: lote ${cs[0].loteNumero ?? cs[0].numero} em "${COLUNAS_KANBAN[coluna]}".${coluna === COL_ENTREGUE ? " Data de entrega registrada hoje." : " O cliente já vê no link de acompanhamento."}`
  }
  if (p.acao === "recebimento") {
    const a = p.params as { loteId: string | null; lote: string; cardId: string; cardNumero: string; cliente: string; valor: number; forma: string; lancamentoId: string | null }
    if (a.lancamentoId) await supabase.from("LancamentoFinanceiro").update({ status: "pago", dataPagamento: hoje(), formaPagamento: a.forma }).eq("id", a.lancamentoId)
    else {
      const cat = (cfg.categoriasReceita ?? []).find(x => /venda/i.test(`${x.id} ${x.nome}`))?.id ?? (cfg.categoriasReceita ?? [])[0]?.id ?? null
      await supabase.from("LancamentoFinanceiro").insert({ id: Date.now().toString(), tipo: "receita", descricao: `Lote ${a.lote} — ${a.cliente}`, valor: a.valor, dataVencimento: hoje(), dataPagamento: hoje(), status: "pago", cardId: a.cardId, cardNumero: a.cardNumero, nomeCliente: a.cliente, loteId: a.loteId, loteNumero: a.loteId ? a.lote : null, categoria: cat, formaPagamento: a.forma, criadoEm: new Date().toLocaleString("pt-BR") })
    }
    return `Feito: ${brl(a.valor)} recebido no lote ${a.lote}.`
  }
  if (p.acao === "despesa") {
    const a = p.params as { descricao: string; valor: number; forma: string; categoria: string | null; loteId: string | null; lote: string | null; cardId: string | null; cardNumero: string | null; cliente: string | null }
    await supabase.from("LancamentoFinanceiro").insert({ id: Date.now().toString(), tipo: "despesa", descricao: a.descricao, valor: a.valor, dataVencimento: hoje(), dataPagamento: hoje(), status: "pago", categoria: a.categoria, formaPagamento: a.forma, loteId: a.loteId, loteNumero: a.loteId ? a.lote : null, cardId: a.cardId, cardNumero: a.cardNumero, nomeCliente: a.cliente, criadoEm: new Date().toLocaleString("pt-BR") })
    return `Feito: despesa "${a.descricao}" de ${brl(a.valor)} lançada${a.lote ? ` no lote ${a.lote}` : ""}.${a.categoria ? "" : " Ficou sem categoria: escolha no Financeiro."}`
  }
  if (p.acao === "pronto") {
    const { marcarProntoDigital } = await import("./digitalServidor")
    const r = await marcarProntoDigital(String(p.params.id))
    return r.erro ? `Não deu: ${r.erro}` : r.aviso ?? `Feito: ${p.params.id} marcado como pronto e o cliente foi avisado do restante.`
  }
  if (p.acao === "assumir") {
    const { assumirEContinuar } = await import("./agenteAuto")
    const r = await assumirEContinuar(String(p.params.jid))
    return r.ok ? `Feito: o agente assumiu ${p.params.nome}.${r.texto ? ` Mandou: “${r.texto.slice(0, 200)}”` : ` ${r.motivo ?? ""}`}` : `Não deu: ${r.motivo ?? "erro"}`
  }
  return "Ação desconhecida."
}

const sistema = () => `Você é o assistente do Felipe, dono da ENYLA Embalagens (gráfica de caixas personalizadas: offset em lotes, e digital para pouca quantidade). Ele fala com você pelo WhatsApp, em mensagens curtas ou áudio transcrito, como numa conversa contínua: use o que já foi falado ("ele", "esse lote", "e no mês passado?").
Hoje é ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}.
- Os pedidos do offset são identificados pelo LOTE (ex.: MAU-003). Fale sempre pelo lote; número de orçamento (ORC-/PRP-) só quando o pedido não tem lote. No digital, pelo DIG-.
- Use as ferramentas para tudo que for dado. Nunca invente número. Se a pergunta for ampla, consulte e já entregue a leitura (o que importa, o que fazer), não só os números.
- O que muda dados (mover lote, recebimento, despesa, digital pronto) vira PROPOSTA: chame a ferramenta, mostre o resumo e pergunte "Confirma? (sim / não)". Uma ação por vez.
- Faltou algo (qual lote, valor)? Pergunte curto. Ambíguo entre dois lotes? Liste e pergunte qual.
- Tom: parceiro de negócio, direto, curto, formato WhatsApp (*negrito* com asteriscos, listas com •, sem títulos markdown). Valores em R$.
- Etapas do quadro: ${ETAPAS.join(", ")}. Custos com forma "conta" são da conta corrente da Jerograf (pagos aos poucos ao tio), não são atraso.`

export async function responderAoDono(texto: string): Promise<string> {
  const cfg = (await lerConfigLinha()).data?.data as Cfg
  const agora = Date.now()
  const historico = (cfg.assistenteConversa ?? []).filter(f => agora - new Date(f.em).getTime() < 6 * 3_600_000).slice(-16)
  const lembrar = async (resp: string) => {
    const em = new Date().toISOString()
    await mudarConfig((d: Cfg) => ({ assistenteConversa: [...(d.assistenteConversa ?? []).filter(f => agora - new Date(f.em).getTime() < 6 * 3_600_000), { r: "user", t: texto, em }, { r: "assistant", t: resp, em }].slice(-24) as Fala[] }))
    return resp
  }
  // Confirmação de uma proposta pendente (até 30 min)
  const pend = cfg.assistentePendente
  if (pend && agora - new Date(pend.em).getTime() < 30 * 60_000) {
    if (ehConfirmacao(texto)) { await mudarConfig(() => ({ assistentePendente: null })); return lembrar(await executar(pend, cfg)) }
    if (ehCancelamento(texto)) { await mudarConfig(() => ({ assistentePendente: null })); return lembrar("Ok, cancelado.") }
  }
  if (!cfg.apiKey) return "A chave da IA não está configurada."
  const cli = clienteClaude(cfg.apiKey, "assistente")
  // Conversa contínua: as últimas falas (alternando) + a mensagem nova
  const msgs: Anthropic.MessageParam[] = []
  for (const f of historico) {
    const role = f.r === "user" ? "user" : "assistant"
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += `\n${f.t}`
    else if (msgs.length || role === "user") msgs.push({ role, content: f.t })
  }
  if (msgs.length && msgs[msgs.length - 1].role === "user") msgs[msgs.length - 1].content += `\n${texto}`
  else msgs.push({ role: "user", content: texto })
  for (let i = 0; i < 6; i++) {
    const r = await cli.beta.messages.create({ model: MODELO, max_tokens: 2000, system: sistema(), tools: FERRAMENTAS, messages: msgs, ...FALLBACK } as never) as Anthropic.Message
    const usos = r.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    if (!usos.length) return lembrar(r.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join("\n").trim() || "Ok.")
    msgs.push({ role: "assistant", content: r.content as never })
    const resultados = await Promise.all(usos.map(async u => ({ type: "tool_result" as const, tool_use_id: u.id, content: await rodarFerramenta(u.name, u.input as Record<string, unknown>, cfg).catch(e => `Erro: ${String(e).slice(0, 200)}`) })))
    msgs.push({ role: "user", content: resultados })
  }
  return lembrar("Não consegui concluir. Tente de outro jeito.")
}

// Entrada pelo webhook: mensagem do dono (chat "você mesmo" hoje; número pessoal com o WhatsApp institucional)
export async function talvezAssistente(msgId: string, remoteJid: string, fromMe: boolean, tipo: string) {
  const { seuNumero } = await import("./agenteAuto")
  const dono = await seuNumero()
  const cfgA = (await supabase.from("AppConfig").select("agenteAuto:data->agenteAuto").eq("id", 1).single()).data as { agenteAuto?: { avisoNumero?: string } } | null
  const pessoal = cfgA?.agenteAuto?.avisoNumero ?? null
  if (!dono || /^3EB0/i.test(msgId)) return
  // O chat pode chegar pelo código interno (@lid): vale o número que a gravação resolveu
  let jid = remoteJid
  if (jid.split("@")[0] !== dono && !ehDoNumeroPessoal({ fromMe, remoteJid: jid }, pessoal)) {
    for (let i = 0; i < 4; i++) {
      const { data } = await supabase.from("whatsapp_mensagens").select("jid").eq("id", msgId).maybeSingle()
      if (data?.jid) { jid = data.jid as string; break }
      await new Promise(r => setTimeout(r, 1500))
    }
  }
  const pessoalOk = ehDoNumeroPessoal({ fromMe, remoteJid: jid }, pessoal)
  if (!ehComandoDoDono({ fromMe, remoteJid: jid, id: msgId }, dono) && !pessoalOk) return
  const { reservarTratada } = await import("./registroAgente")
  if ((await reservarTratada(`assistente:${msgId}`)) === false) return
  // Vídeo do Felipe → conhecimento vivo (desligado por padrão: AppConfig.videosConhecimento.ativo). Responde só a ele.
  if (/^video/i.test(tipo)) {
    const { processarVideoDoFelipe } = await import("./videosConhecimentoServidor")
    const conf = await processarVideoDoFelipe(msgId).catch(e => `Recebi o vídeo, mas deu erro: ${String(e).slice(0, 160)}`)
    if (conf) { const { evo } = await import("./evolution"); await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: pessoalOk ? digitos(pessoal) : dono, text: conf }) }).catch(() => null); return }
  }
  let texto: string | null = null
  if (/audio|ptt/i.test(tipo)) {
    const { transcreverPendentes } = await import("./transcricao")
    await transcreverPendentes({ ids: [msgId] }).catch(() => null)
  }
  for (let i = 0; i < 5 && !texto; i++) {
    const { data } = await supabase.from("whatsapp_mensagens").select("corpo").eq("id", msgId).maybeSingle()
    texto = (data?.corpo as string | null)?.trim() || null
    if (!texto) await new Promise(r => setTimeout(r, 2000))
  }
  if (!texto) return
  const resposta = await responderAoDono(texto).catch(e => `Deu erro: ${String(e).slice(0, 200)}`)
  const { evo } = await import("./evolution")
  await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: pessoalOk ? digitos(pessoal) : dono, text: resposta }) }).catch(() => null)
}
