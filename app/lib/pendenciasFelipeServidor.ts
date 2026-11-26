// Pendências do Felipe, lado do servidor: junta as fontes, aplica a ordem e o corte em 5, guarda os pedidos dos diretores
// (dados_sistema, coleção pendenciaFelipe; nada é apagado) e avisa o próprio Felipe pelo ntfy quando entra item novo no top 5.
// Nunca manda mensagem a cliente.
import { supabase } from "./supabase"
import { DIRETORES, type IdDiretor } from "./diretoria"
import { lerConversa } from "./diretoriaServidor"
import { listarTarefas, aberta as tarefaAberta } from "./tarefaFelipe"
import { quemEspera, paraOFelipe, type ConvEspera } from "./esperando"
import { listarDispensadas, dispensar } from "./pendenciaDispensada"
import { ehSeguraSemIA } from "./agenteLeads"
import { notificar, LINK_SISTEMA } from "./notificar"
import {
  FIXAS, LIMITE_ABERTAS_DIRETOR, fim4, top, semDispensados, entraConversa, novosNoTop, textoAviso, valorDoItem, referenciaUnitaria, validarPedido,
  type ItemFelipe, type Registro,
} from "./pendenciasFelipe"

export const COLECAO = "pendenciaFelipe"
const COLECAO_ESTADO = "pendenciaFelipeEstado"
const NOME: Record<IdDiretor, string> = { coo: "COO", cco: "CCO", cmo: "CMO", cfo: "CFO", cto: "CTO" }
const aberto = (r: Registro) => !r.resolvidoEm && !r.canceladaEm

async function lerColecao<T>(colecao: string): Promise<T[]> {
  const { data } = await supabase.from("dados_sistema").select("dados").eq("colecao", colecao).limit(2000)
  return (data ?? []).map(r => r.dados as T)
}
async function gravar(colecao: string, id: string, dados: unknown) {
  const { data: atual } = await supabase.from("dados_sistema").select("v").eq("colecao", colecao).eq("id", id).maybeSingle()
  const agora = new Date().toISOString()
  const { error } = atual
    ? await supabase.from("dados_sistema").update({ dados, v: (atual.v ?? 0) + 1, atualizado_em: agora }).eq("colecao", colecao).eq("id", id)
    : await supabase.from("dados_sistema").insert({ colecao, id, dados, v: 1, atualizado_em: agora })
  if (error) throw new Error(error.message)
}
const listarRegistros = async () => (await lerColecao<Registro>(COLECAO)).filter(r => r && typeof r.id === "string")

type Card = { numero: string; nomeCliente: string; coluna: number; preco: number | string | null; quantidade: number | string | null; dimensoes: string | null }
type Conv = ConvEspera & { kanban_card_id: string | null }

export async function montarItens(agora = Date.now()): Promise<{ itens: ItemFelipe[]; ultimaDoLead: Record<string, string | null> }> {
  const [{ data: cardsRaw }, { data: convsRaw }, tarefas, registros] = await Promise.all([
    supabase.from("KanbanCard").select("id, numero, nomeCliente, coluna, preco, quantidade, dimensoes").limit(3000),
    supabase.from("whatsapp_conversas").select("jid, nome, etiquetas, status_lead, ultima_msg, ultima_recebida_at, ultima_enviada_at, proxima_acao, fechada_em, kanban_card_id")
      .not("jid", "like", "%@g.us").gte("ultima_recebida_at", new Date(agora - 8 * 86_400_000).toISOString()).order("ultima_recebida_at", { ascending: false }).limit(2000),
    listarTarefas().catch(() => []), listarRegistros().catch(() => [] as Registro[]),
  ])
  const cards = (cardsRaw ?? []) as (Card & { id: string })[]
  const porId = new Map(cards.map(c => [c.id, c])), porNumero = new Map(cards.map(c => [c.numero, c]))
  // "O já te respondo" automático não é resposta (igual à espera longa)
  const convs = ((convsRaw ?? []) as Conv[]).map(c => ehSeguraSemIA(c.ultima_msg) ? { ...c, ultima_enviada_at: null, ultima_msg: "" } : c)
  const ultimaDoLead: Record<string, string | null> = Object.fromEntries(convs.map(c => [c.jid, c.ultima_recebida_at]))
  const itens: ItemFelipe[] = []
  const base = { jid: null, fim4: null, valor: null, estimativa: false, quantidade: null, medida: null, tipo: null, desde: null, prazo: null, risco: null, icp: false, orc: null, pedidoPor: null, podeAssumir: false } satisfies Partial<ItemFelipe>
  const doOrc = (orc: Card | undefined, quantidade: number | null, medida: string | null) => {
    const v = valorDoItem({ orc: orc ? Number(orc.preco) : null, quantidade: quantidade ?? (orc ? Number(orc.quantidade) : null), referenciaUnit: referenciaUnitaria(medida ?? orc?.dimensoes, cards) })
    return { ...v, quantidade: quantidade ?? (orc ? Number(orc.quantidade) || null : null), medida: medida ?? orc?.dimensoes ?? null }
  }

  // 1. Fila do Aprovo (ordens dos diretores que esperam o OK dele)
  for (const d of DIRETORES) {
    for (const m of await lerConversa(d.id).catch(() => [])) for (const a of m.acoes ?? []) {
      if (a.tipo !== "mensagem" || a.status !== "aguardando") continue
      const conv = a.jid ? convs.find(c => c.jid === a.jid) : undefined
      const orc = conv?.kanban_card_id ? porId.get(conv.kanban_card_id) : undefined
      itens.push({ ...base, chave: `aprovo:${a.id}`, fonte: "aprovo", nome: a.cliente, jid: a.jid ?? null, fim4: fim4(a.jid), acao: `Aprovar a mensagem do ${a.funcionario} para ${a.cliente}`,
        ...doOrc(orc, null, null), tipo: orc ? "orçamento" : null, desde: a.em ?? m.em, origem: `diretor ${NOME[d.id]}`, link: "/?aba=escritorio", orc: orc?.numero ?? null, pedidoPor: NOME[d.id] })
    }
  }
  // 2. Leads esperando o Felipe (a conversa que ele conduz só entra se a última mensagem é do lead)
  const porJid = new Map(convs.map(c => [c.jid, c]))
  for (const e of quemEspera(convs, agora).filter(paraOFelipe)) {
    const c = porJid.get(e.jid)!
    if (!entraConversa({ conduzida: false /* #150: conversaDoFelipe(jid) quando entrar */, ultimaRecebidaAt: c.ultima_recebida_at, ultimaEnviadaAt: c.ultima_enviada_at })) continue
    type Ficha = { quantidade?: number | null; caixa_cm?: { frente: number; lateral: number; altura: number } | null; produto?: string }
    let dados: Ficha | null = null
    try { dados = (JSON.parse(c.proxima_acao ?? "") as { r?: { dados?: Ficha } }).r?.dados ?? null } catch { /* sem ficha */ }
    const orc = c.kanban_card_id ? porId.get(c.kanban_card_id) : undefined
    const medida = dados?.caixa_cm ? `${dados.caixa_cm.frente}x${dados.caixa_cm.lateral}x${dados.caixa_cm.altura} cm` : null
    const audio = /^\[(audio|áudio|ptt)/i.test(e.mensagem)
    itens.push({ ...base, chave: `esp:${e.jid}`, fonte: "espera", nome: e.nome, jid: e.jid, fim4: fim4(e.jid),
      acao: audio ? "Ouvir o áudio e responder" : e.checklistOk ? "Dar o preço (já tem tudo para orçar)" : "Responder o lead (a IA não conseguiu seguir)",
      ...doOrc(orc, dados?.quantidade ?? null, medida), tipo: dados?.produto ?? (orc ? "orçamento" : null),
      desde: c.ultima_recebida_at, origem: orc ? `ORC ${orc.numero} e conversa` : dados ? "ficha e conversa" : "conversa", link: "/?aba=whatsapp", icp: e.peso >= 5, orc: orc?.numero ?? null, podeAssumir: true })
  }
  // 3. Tarefas dos diretores no "Depende de você"
  for (const t of tarefas.filter(tarefaAberta)) itens.push({ ...base, chave: `tarefa:${t.id}`, fonte: "tarefa", nome: t.titulo, acao: t.titulo, desde: t.em, prazo: t.prazo ?? null, origem: `diretor ${t.pedidoPor}`, link: "/?aba=painel", pedidoPor: t.pedidoPor })
  // 4. Itens pedidos pela porta (pendencia_felipe)
  for (const r of registros.filter(aberto)) {
    const orc = r.orc ? porNumero.get(r.orc) : undefined
    itens.push({ ...base, chave: `pf:${r.id}`, fonte: "diretor", nome: r.titulo, jid: r.jid ?? null, fim4: fim4(r.jid), acao: r.acao,
      ...doOrc(orc, r.quantidade ?? null, r.medida ?? null), tipo: r.tipo ?? (orc ? "orçamento" : null), desde: r.desde ?? r.em, prazo: r.prazo ?? null,
      origem: `${r.origem} (diretor ${r.pedidoPor})`, link: r.jid ? "/?aba=whatsapp" : orc ? "/?aba=orcamentos" : "/?aba=painel", orc: orc?.numero ?? null, pedidoPor: r.pedidoPor, podeAssumir: !!r.jid })
  }
  // 5. Ações que só ele faz (lista fixa em código)
  for (const f of FIXAS) itens.push({ ...base, ...f, fonte: "fixa" })
  return { itens, ultimaDoLead }
}

// Os (até) 5 do dia, já sem os dispensados
export async function pendenciasDoFelipe(agora = Date.now()) {
  const { itens, ultimaDoLead } = await montarItens(agora)
  const visiveis = semDispensados(itens, await listarDispensadas().catch(() => []), ultimaDoLead, agora)
  return { itens: top(visiveis, agora), total: visiveis.length, todos: visiveis }
}

// Aviso ao próprio Felipe (ntfy, só o mínimo) quando um item novo entra no top 5. A primeira leitura só grava o estado.
export async function avisarNovos(agora = Date.now()): Promise<number> {
  const { itens } = await pendenciasDoFelipe(agora)
  const estado = (await lerColecao<{ chaves: string[] }>(COLECAO_ESTADO))[0]
  const novos = estado ? novosNoTop(estado.chaves, itens) : []
  await gravar(COLECAO_ESTADO, "top", { chaves: itens.map(i => i.chave), em: new Date(agora).toISOString() })
  if (novos.length) await notificar("Pendências do Felipe", textoAviso(novos.length), { prioridade: "alta", link: `${LINK_SISTEMA}/?aba=pendencias-felipe`, tags: ["pushpin"] }).catch(() => null)
  return novos.length
}

// Texto para o resumo das 8h30: só os 3 de maior valor
export async function linhasDoResumo(agora = Date.now()): Promise<string[]> {
  const { topPorValor } = await import("./pendenciasFelipe")
  const { todos } = await pendenciasDoFelipe(agora)
  return topPorValor(todos).map(i => `${i.nome}${i.fim4 ? ` (${i.fim4})` : ""} · ${i.acao}${i.valor != null ? ` · ${i.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${i.estimativa ? " (estimativa)" : ""}` : " · sem valor"}`)
}

// ── Porta: POST { acao:'pendencia_felipe', ... } e leitura ───────────────────────
export type Resultado = { status: number; corpo: Record<string, unknown> }
export async function acaoPendenciaFelipe(diretor: IdDiretor, b: Record<string, unknown>): Promise<Resultado> {
  if (b.operacao === "cancelar") {
    const id = typeof b.id === "string" ? b.id.trim() : ""
    if (!id) return { status: 400, corpo: { erro: "id: obrigatório em cancelar." } }
    const r = (await listarRegistros()).find(x => x.id === id && x.por === diretor)   // só as que ele criou
    if (!r || r.canceladaEm) return { status: 404, corpo: { erro: `Pendência ${id} não encontrada entre as suas.` } }
    if (r.resolvidoEm) return { status: 400, corpo: { erro: "O Felipe já resolveu essa pendência." } }
    await gravar(COLECAO, r.id, { ...r, canceladaEm: new Date().toISOString() })
    return { status: 200, corpo: { ok: true, resultado: `Pendência cancelada: ${r.titulo}`, id } }
  }
  if (b.operacao != null && b.operacao !== "criar") return { status: 400, corpo: { erro: "operacao: criar (padrão) ou cancelar." } }
  const v = validarPedido(b)
  if (!v.ok) return { status: 400, corpo: { erro: v.erro } }
  const abertas = (await listarRegistros()).filter(r => r.por === diretor && aberto(r)).length
  if (abertas >= LIMITE_ABERTAS_DIRETOR) return { status: 429, corpo: { erro: `Você já tem ${LIMITE_ABERTAS_DIRETOR} pendências abertas para o Felipe. Espere ele resolver ou cancele alguma.` } }
  let orc = v.r.orc
  if (orc) {   // valor só vale se apontar para um ORC que existe
    const { data } = await supabase.from("KanbanCard").select("numero").eq("numero", orc).maybeSingle()
    if (!data) orc = null
  }
  const r: Registro = { ...v.r, orc, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), por: diretor, pedidoPor: NOME[diretor], em: new Date().toISOString() }
  await gravar(COLECAO, r.id, r)
  const aviso = v.r.orc && !orc ? ` O ORC ${v.r.orc} não existe: o valor será estimado pelo sistema ou ficará "sem valor".` : ""
  return { status: 200, corpo: { ok: true, resultado: `Pendência posta para o Felipe: ${r.titulo}.${aviso}`, pendencia: { id: r.id, titulo: r.titulo, orc } } }
}

export async function leituraParaDiretor() {
  const { itens, total } = await pendenciasDoFelipe()
  const regs = await listarRegistros().catch(() => [] as Registro[])
  return { pendenciasFelipe: {
    doDia: itens.map(i => ({ chave: i.chave, titulo: i.nome, acao: i.acao, valor: i.valor, estimativa: i.estimativa, desde: i.desde, prazo: i.prazo, origem: i.origem, pedidoPor: i.pedidoPor, fonte: i.fonte })),
    totalAbertas: total,
    minhas: regs.filter(r => aberto(r)).map(r => ({ id: r.id, titulo: r.titulo, pedidoPor: r.pedidoPor, em: r.em })),
  } }
}

// ── Tela: Resolvido, Dispensar, Assuma ──────────────────────────────────────────
export async function resolverItem(chave: string, por: string) {
  if (chave.startsWith("pf:")) {
    const r = (await listarRegistros()).find(x => x.id === chave.slice(3))
    if (r && !r.resolvidoEm) await gravar(COLECAO, r.id, { ...r, resolvidoEm: new Date().toISOString(), resolvidoPor: por })
    return { ok: true as const }
  }
  if (chave.startsWith("tarefa:")) { const { marcarTarefa } = await import("./tarefaFelipe"); await marcarTarefa(chave, true); return { ok: true as const } }
  return dispensar({ chave, titulo: chave, motivo: "Resolvido pelo Felipe" }, por)   // só marca, com quem e quando
}
export const dispensarItem = (chave: string, titulo: string, motivo: string, por: string) => dispensar({ chave, titulo, motivo }, por)
// Assuma: o mesmo caminho da conversa passada ao agente. Nada sai daqui: o agente só responde pelo fluxo atual (Aprovo).
export async function assumirItem(jid: string) { const { assumirConversa } = await import("./agenteAuto"); await assumirConversa(jid) }
