// Assistente do Felipe pelo WhatsApp: ele escreve (ou manda áudio) no chat "você mesmo" do número da ENYLA e o
// sistema entende e executa. Consultas respondem na hora; o que muda dado (mover pedido, lançar recebimento ou
// despesa, digital pronto) vira uma proposta e só executa quando ele responde "sim". Anotar ideia é direto.
// Só mensagem digitada no celular conta (id sem "3EB0": os avisos que o próprio sistema manda ali têm esse prefixo,
// e assim o assistente nunca responde a si mesmo).
import type Anthropic from "@anthropic-ai/sdk"
import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { clienteClaude, MODELO, FALLBACK } from "./claude"
import { COLUNAS_KANBAN, COL_FECHADO, COL_ENTREGUE, type KanbanCard, type LancamentoFinanceiro } from "../types"

type Pendente = { acao: "mover" | "recebimento" | "despesa" | "pronto"; params: Record<string, unknown>; resumo: string; em: string }
type Cfg = Record<string, unknown> & { apiKey?: string; assistentePendente?: Pendente | null; categoriasDespesa?: { id: string; nome: string }[]; categoriasReceita?: { id: string; nome: string }[]; pedidosDigitais?: { id: string; nome: string | null; status: string; quantidade: number; total: number; restante?: number; prontoEm?: string }[] }

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
const agoraBR = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
const norm = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()
export const ehComandoDoDono = (a: { fromMe?: boolean; remoteJid?: string; id?: string }, dono: string | null) =>
  !!a.fromMe && !!dono && !!a.remoteJid && a.remoteJid.split("@")[0] === dono && !!a.id && !/^3EB0/i.test(a.id)
export const ehConfirmacao = (t: string) => /^(sim|s|ok|okay|confirm[ao]|pode|pode sim|manda|isso|bora|fechado|positivo)\b/i.test(t.trim())
export const ehCancelamento = (t: string) => /^(n[aã]o|nao|cancela|cancelar|deixa|esquece|para)\b/i.test(t.trim())

async function todas<T>(tabela: string, sel = "*"): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; ; i += 1000) { const { data } = await supabase.from(tabela).select(sel).range(i, i + 999); out.push(...((data ?? []) as T[])); if (!data || data.length < 1000) break }
  return out
}
async function acharCard(ref: string): Promise<KanbanCard | null> {
  const r = ref.trim()
  const { data: porNumero } = await supabase.from("KanbanCard").select("*").ilike("numero", `%${r}%`).limit(3)
  if (porNumero?.length === 1) return porNumero[0] as KanbanCard
  const { data: porNome } = await supabase.from("KanbanCard").select("*").ilike("nomeCliente", `%${r}%`).neq("coluna", 10).order("createdAt", { ascending: false }).limit(1)
  return (porNome?.[0] as KanbanCard | undefined) ?? (porNumero?.[0] as KanbanCard | undefined) ?? null
}

// ── Ferramentas ──────────────────────────────────────────────────────────────
const FERRAMENTAS: Anthropic.Tool[] = [
  { name: "vendas_do_mes", description: "Quanto foi vendido no mês (offset fechado + digital pago), número de pedidos e ticket médio.", input_schema: { type: "object", properties: { mes: { type: "string", enum: ["atual", "anterior"] } }, required: [] } },
  { name: "buscar_pedidos", description: "Procura pedidos (offset e digital) pelo nome do cliente ou número (ORC-, PRP-, DIG-). Mostra etapa, valor e quantidade.", input_schema: { type: "object", properties: { termo: { type: "string" } }, required: ["termo"] } },
  { name: "contas_a_receber", description: "Receitas em aberto (sinais e restantes a receber), com total.", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "quem_esta_esperando", description: "Bons negócios esperando resposta do Felipe agora.", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "propor_mover_pedido", description: "Propõe mover um pedido offset para outra etapa do quadro. Só executa depois que o Felipe confirmar.", input_schema: { type: "object", properties: { pedido: { type: "string", description: "número ou nome do cliente" }, etapa: { type: "string", enum: COLUNAS_KANBAN.slice(0, 11) as unknown as string[] } }, required: ["pedido", "etapa"] } },
  { name: "propor_recebimento", description: "Propõe registrar dinheiro recebido de um cliente (dá baixa no sinal/restante em aberto ou lança a receita). Só executa depois da confirmação.", input_schema: { type: "object", properties: { pedido: { type: "string", description: "número ou nome do cliente" }, valor: { type: "number" }, forma: { type: "string", enum: ["pix", "dinheiro", "cartao", "boleto", "transferencia"] } }, required: ["pedido", "valor"] } },
  { name: "propor_despesa", description: "Propõe lançar uma despesa paga hoje. Só executa depois da confirmação.", input_schema: { type: "object", properties: { descricao: { type: "string" }, valor: { type: "number" }, forma: { type: "string", enum: ["pix", "dinheiro", "cartao", "boleto", "debito"] } }, required: ["descricao", "valor"] } },
  { name: "propor_digital_pronto", description: "Propõe marcar um pedido do digital como pronto (o cliente é avisado no WhatsApp para pagar o restante). Só executa depois da confirmação.", input_schema: { type: "object", properties: { pedido: { type: "string", description: "DIG-xxxx ou nome do cliente" } }, required: ["pedido"] } },
  { name: "anotar_ideia", description: "Anota uma ideia no banco de ideias do sistema.", input_schema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] } },
]

async function rodarFerramenta(nome: string, e: Record<string, unknown>, cfg: Cfg): Promise<string> {
  if (nome === "vendas_do_mes") {
    const { montarPedidos, vendasDoPeriodo } = await import("./negocio")
    const { unpackTerceirizado } = await import("./kanbanUnpack")
    const [k, l] = await Promise.all([todas<KanbanCard>("KanbanCard"), todas<LancamentoFinanceiro>("LancamentoFinanceiro")])
    const d = new Date(`${hoje()}T12:00:00-03:00`)
    const ant = e.mes === "anterior"
    const de = new Date(d.getFullYear(), d.getMonth() - (ant ? 1 : 0), 1), ate = ant ? new Date(d.getFullYear(), d.getMonth(), 0, 23, 59) : d
    const v = vendasDoPeriodo(montarPedidos(k.map(unpackTerceirizado), l), l, { from: de, to: ate })
    const dig = (cfg.pedidosDigitais ?? []).filter(p => { const s = (p as { sinalPagoEm?: string; teste?: boolean }); return s.sinalPagoEm && !s.teste && new Date(s.sinalPagoEm) >= de && new Date(s.sinalPagoEm) <= ate })
    const totDig = dig.reduce((t, p) => t + p.total, 0)
    return JSON.stringify({ periodo: `${de.toLocaleDateString("pt-BR")} a ${ate.toLocaleDateString("pt-BR")}`, offset: { vendido: v.receita, valorDosPedidos: v.valorPedidos, sobrasVendidas: v.sobras, pedidos: v.pedidos.length, ticketMedio_dosPedidos: v.ticketMedio, unidades: v.unidades }, digital: { vendido: totDig, pedidos: dig.length }, total: v.receita + totDig })
  }
  if (nome === "buscar_pedidos") {
    const t = String(e.termo ?? "")
    const { data } = await supabase.from("KanbanCard").select("numero, nomeCliente, coluna, preco, quantidade, data").or(`numero.ilike.%${t}%,nomeCliente.ilike.%${t}%`).order("createdAt", { ascending: false }).limit(8)
    const dig = (cfg.pedidosDigitais ?? []).filter(p => norm(p.id).includes(norm(t)) || norm(p.nome ?? "").includes(norm(t))).slice(0, 5)
    return JSON.stringify({ offset: (data ?? []).map(c => ({ numero: c.numero, cliente: c.nomeCliente, etapa: COLUNAS_KANBAN[c.coluna] ?? c.coluna, valor: c.preco, quantidade: c.quantidade, criado: c.data })), digital: dig.map(p => ({ id: p.id, cliente: p.nome, status: p.status, quantidade: p.quantidade, total: p.total, restante: p.restante ?? null, pronto: !!p.prontoEm })) })
  }
  if (nome === "contas_a_receber") {
    const { data } = await supabase.from("LancamentoFinanceiro").select("descricao, valor, dataVencimento, nomeCliente, cardNumero").eq("tipo", "receita").neq("status", "pago").order("dataVencimento").limit(40)
    const lista = (data ?? []) as { valor: number }[]
    return JSON.stringify({ total: lista.reduce((t, x) => t + x.valor, 0), itens: lista.slice(0, 12) })
  }
  if (nome === "quem_esta_esperando") {
    const { quemEspera, paraOFelipe, tempoEspera } = await import("./esperando")
    const { data } = await supabase.from("whatsapp_conversas").select("jid, nome, etiquetas, status_lead, ultima_msg, ultima_recebida_at, ultima_enviada_at, proxima_acao, fechada_em").not("jid", "like", "%@g.us").gte("ultima_recebida_at", new Date(Date.now() - 7 * 86_400_000).toISOString()).limit(1000)
    const l = quemEspera((data ?? []) as never).filter(paraOFelipe)
    return JSON.stringify(l.slice(0, 10).map(x => ({ nome: x.nome, ha: tempoEspera(x.minutos), mensagem: x.mensagem })))
  }
  if (nome === "anotar_ideia") {
    const texto = String(e.texto ?? "").trim().slice(0, 600)
    if (!texto) return "Ideia vazia."
    await mudarConfig((d: Cfg & { ideias?: unknown[] }) => ({ ideias: [{ id: `wa-${Date.now().toString(36)}`, texto, status: "ideia", criadaEm: new Date().toISOString() }, ...(d.ideias ?? [])] }))
    return "Anotada no banco de ideias."
  }
  // Propostas: guardam a ação e pedem confirmação
  let p: Pendente | null = null
  if (nome === "propor_mover_pedido") {
    const c = await acharCard(String(e.pedido ?? ""))
    const col = COLUNAS_KANBAN.indexOf(String(e.etapa) as never)
    if (!c) return "Não achei esse pedido."
    if (col < 0) return "Etapa inválida."
    p = { acao: "mover", params: { id: c.id, coluna: col }, resumo: `Mover *${c.numero}* (${c.nomeCliente}) de "${COLUNAS_KANBAN[c.coluna]}" para *"${COLUNAS_KANBAN[col]}"*`, em: new Date().toISOString() }
  }
  if (nome === "propor_recebimento") {
    const c = await acharCard(String(e.pedido ?? ""))
    const valor = Number(e.valor)
    if (!c) return "Não achei esse pedido."
    if (!(valor > 0)) return "Valor inválido."
    const { data: abertos } = await supabase.from("LancamentoFinanceiro").select("id, descricao, valor").eq("cardId", c.id).eq("tipo", "receita").neq("status", "pago")
    const casa = (abertos ?? []).find(l => Math.abs(l.valor - valor) < 1)
    p = { acao: "recebimento", params: { cardId: c.id, numero: c.numero, cliente: c.nomeCliente, valor, forma: e.forma ?? "pix", lancamentoId: casa?.id ?? null },
      resumo: casa ? `Dar baixa em *${casa.descricao}* (${brl(casa.valor)}) de ${c.nomeCliente} como pago hoje (${e.forma ?? "pix"})` : `Lançar *${brl(valor)}* recebido de ${c.nomeCliente} (${c.numero}) hoje (${e.forma ?? "pix"})`, em: new Date().toISOString() }
  }
  if (nome === "propor_despesa") {
    const valor = Number(e.valor), descricao = String(e.descricao ?? "").trim()
    if (!(valor > 0) || !descricao) return "Faltou a descrição ou o valor."
    const { data: hist } = await supabase.from("LancamentoFinanceiro").select("categoria").eq("tipo", "despesa").ilike("descricao", descricao).not("categoria", "is", null).limit(20)
    const conta: Record<string, number> = {}; for (const h of hist ?? []) conta[h.categoria] = (conta[h.categoria] ?? 0) + 1
    const categoria = Object.entries(conta).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    const nomeCat = categoria ? (cfg.categoriasDespesa ?? []).find(x => x.id === categoria)?.nome ?? categoria : "sem categoria"
    p = { acao: "despesa", params: { descricao, valor, forma: e.forma ?? "pix", categoria }, resumo: `Lançar despesa *${descricao}* de *${brl(valor)}*, paga hoje (${e.forma ?? "pix"}) · categoria: ${nomeCat}`, em: new Date().toISOString() }
  }
  if (nome === "propor_digital_pronto") {
    const t = norm(String(e.pedido ?? ""))
    const ped = (cfg.pedidosDigitais ?? []).find(x => x.status === "producao" && (norm(x.id) === t || norm(x.nome ?? "").includes(t)))
    if (!ped) return "Não achei pedido do digital em produção com esse nome ou número."
    p = { acao: "pronto", params: { id: ped.id }, resumo: `Marcar *${ped.id}* (${ped.nome ?? "cliente"}) como pronto: o cliente recebe no WhatsApp o aviso do restante de ${brl(ped.restante ?? 0)}`, em: new Date().toISOString() }
  }
  if (!p) return "Ferramenta desconhecida."
  await mudarConfig(() => ({ assistentePendente: p }))
  return `PROPOSTA GUARDADA, aguardando o Felipe confirmar: ${p.resumo}`
}

// ── Execução depois do "sim" ─────────────────────────────────────────────────
export async function executar(p: Pendente, cfg: Cfg): Promise<string> {
  if (p.acao === "mover") {
    const { id, coluna } = p.params as { id: string; coluna: number }
    const { data: c } = await supabase.from("KanbanCard").select("numero, coluna, dataFechamento, dataEntregaReal").eq("id", id).single()
    if (!c) return "O pedido não existe mais."
    const patch: Record<string, unknown> = { coluna }
    if (coluna >= COL_FECHADO && coluna <= COL_ENTREGUE && !c.dataFechamento) patch.dataFechamento = hoje()
    if (coluna === COL_ENTREGUE && !c.dataEntregaReal) patch.dataEntregaReal = hoje()
    await supabase.from("KanbanCard").update(patch).eq("id", id)
    const { data: t } = await supabase.from("Tracking").select("etapas").eq("numero", c.numero).maybeSingle()
    if (t) await supabase.from("Tracking").update({ colunaAtual: coluna, etapas: [...((t.etapas as unknown[]) ?? []), { nome: COLUNAS_KANBAN[coluna], tipo: "coluna", coluna, dataHora: agoraBR() }] }).eq("numero", c.numero)
    return `Feito: ${c.numero} está em "${COLUNAS_KANBAN[coluna]}". O cliente já vê no link de acompanhamento.`
  }
  if (p.acao === "recebimento") {
    const a = p.params as { cardId: string; numero: string; cliente: string; valor: number; forma: string; lancamentoId: string | null }
    if (a.lancamentoId) await supabase.from("LancamentoFinanceiro").update({ status: "pago", dataPagamento: hoje(), formaPagamento: a.forma }).eq("id", a.lancamentoId)
    else {
      const cat = (cfg.categoriasReceita ?? []).find(x => /venda/i.test(`${x.id} ${x.nome}`))?.id ?? (cfg.categoriasReceita ?? [])[0]?.id ?? null
      await supabase.from("LancamentoFinanceiro").insert({ id: Date.now().toString(), tipo: "receita", descricao: `Recebido · ${a.numero}`, valor: a.valor, dataVencimento: hoje(), dataPagamento: hoje(), status: "pago", cardId: a.cardId, cardNumero: a.numero, nomeCliente: a.cliente, categoria: cat, formaPagamento: a.forma, criadoEm: new Date().toLocaleString("pt-BR") })
    }
    return `Feito: ${brl(a.valor)} de ${a.cliente} registrado como recebido hoje.`
  }
  if (p.acao === "despesa") {
    const a = p.params as { descricao: string; valor: number; forma: string; categoria: string | null }
    await supabase.from("LancamentoFinanceiro").insert({ id: Date.now().toString(), tipo: "despesa", descricao: a.descricao, valor: a.valor, dataVencimento: hoje(), dataPagamento: hoje(), status: "pago", categoria: a.categoria, formaPagamento: a.forma, criadoEm: new Date().toLocaleString("pt-BR") })
    return `Feito: despesa "${a.descricao}" de ${brl(a.valor)} lançada.${a.categoria ? "" : " Ficou sem categoria: escolha no Financeiro."}`
  }
  if (p.acao === "pronto") {
    const { marcarProntoDigital } = await import("./digitalServidor")
    const r = await marcarProntoDigital(String(p.params.id))
    return r.erro ? `Não deu: ${r.erro}` : r.aviso ?? `Feito: ${p.params.id} marcado como pronto e o cliente foi avisado do restante.`
  }
  return "Ação desconhecida."
}

const SISTEMA = `Você é o assistente do Felipe, dono da ENYLA Embalagens (gráfica de caixas personalizadas: offset, e digital para pouca quantidade). Ele fala com você pelo WhatsApp, em mensagens curtas ou áudio transcrito.
- Use as ferramentas para consultar dados ou propor ações. Nunca invente número: só o que as ferramentas devolverem.
- Ações que mudam dados (mover pedido, recebimento, despesa, digital pronto) viram PROPOSTA: depois de chamar a ferramenta, mostre o resumo e pergunte "Confirma? (sim / não)". Uma ação por vez.
- Se faltar informação (qual pedido, valor), pergunte de forma curta.
- Responda em português, curto, direto, formato de WhatsApp (*negrito* com asteriscos, sem markdown de títulos). Valores em R$.
- Etapas do quadro offset: ${COLUNAS_KANBAN.slice(0, 11).join(", ")}.`

export async function responderAoDono(texto: string): Promise<string> {
  const cfg = (await supabase.from("AppConfig").select("data").eq("id", 1).single()).data?.data as Cfg
  // Confirmação de uma proposta pendente (até 30 min)
  const pend = cfg.assistentePendente
  if (pend && Date.now() - new Date(pend.em).getTime() < 30 * 60_000) {
    if (ehConfirmacao(texto)) { await mudarConfig(() => ({ assistentePendente: null })); return await executar(pend, cfg) }
    if (ehCancelamento(texto)) { await mudarConfig(() => ({ assistentePendente: null })); return "Ok, cancelado." }
  }
  if (!cfg.apiKey) return "A chave da IA não está configurada."
  const cli = clienteClaude(cfg.apiKey)
  const msgs: Anthropic.MessageParam[] = [{ role: "user", content: texto }]
  for (let i = 0; i < 5; i++) {
    const r = await cli.beta.messages.create({ model: MODELO, max_tokens: 1500, system: SISTEMA, tools: FERRAMENTAS, messages: msgs, ...FALLBACK } as never) as Anthropic.Message
    const usos = r.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    if (!usos.length) return r.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join("\n").trim() || "Ok."
    msgs.push({ role: "assistant", content: r.content as never })
    const resultados = await Promise.all(usos.map(async u => ({ type: "tool_result" as const, tool_use_id: u.id, content: await rodarFerramenta(u.name, u.input as Record<string, unknown>, cfg).catch(e => `Erro: ${String(e).slice(0, 200)}`) })))
    msgs.push({ role: "user", content: resultados })
  }
  return "Não consegui concluir. Tente de outro jeito."
}

// Entrada pelo webhook: mensagem do dono no chat "você mesmo"
export async function talvezAssistente(msgId: string, remoteJid: string, fromMe: boolean, tipo: string) {
  const { seuNumero } = await import("./agenteAuto")
  const dono = await seuNumero()
  if (!fromMe || !dono || /^3EB0/i.test(msgId)) return
  // O chat pode chegar pelo código interno (@lid): vale o número que a gravação resolveu
  let jid = remoteJid
  for (let i = 0; i < 4 && jid.split("@")[0] !== dono; i++) {
    const { data } = await supabase.from("whatsapp_mensagens").select("jid").eq("id", msgId).maybeSingle()
    if (data?.jid) { jid = data.jid as string; break }
    await new Promise(r => setTimeout(r, 1500))
  }
  if (!ehComandoDoDono({ fromMe, remoteJid: jid, id: msgId }, dono)) return
  const { reservarTratada } = await import("./registroAgente")
  if ((await reservarTratada(`assistente:${msgId}`)) === false) return
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
  await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: dono, text: resposta }) }).catch(() => null)
}
