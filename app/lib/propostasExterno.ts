// Leitura "propostas" na porta externa (?o=propostas), só CCO e CMO. SÓ LÊ: não grava, não envia mensagem, não apaga.
// JSON estruturado e paginado (sem o corte de ~7.000 caracteres do ?o=detalhe). Junta as propostas prontas (PP-, config)
// com os orçamentos/pedidos (ORC-, KanbanCard): PP que já virou ORC é UM item só, com os dois códigos.
// Sem telefone, e-mail, documento, endereço ou texto de conversa: o contato é só o jid.
import { supabase } from "./supabase"
import { lerCampos } from "./configAtomica"
import { podeAcionarComercial } from "./ordemComercial"
import { PREFIXO_PERTO, lerMarca, type MarcaPerto } from "./perto"
import { classificarNivel, carregarFontesNivel, type Nivel, type FontesNivel } from "./nivelCliente"
import { orcadoPeloFelipe } from "./orcadoPeloFelipe"
import { orcadoManualAtivo, type EstadoLead } from "./leadEstado"
import { lerEstadosLead } from "./leadEstadoServidor"
import { lerIdsAgente } from "./registroAgente"
import type { PropostaPronta } from "./propostaPronta"
import { COL_FECHADO, COL_PERDIDO, COL_HOT } from "../types"
import type { IdDiretor } from "./diretoria"

export const LIMITE_PADRAO = 50
export const LIMITE_MAX = 100
export const STATUS_PROPOSTA = ["pronta", "enviada", "aceita", "perdida"] as const
export type StatusItem = typeof STATUS_PROPOSTA[number]

export const AJUDA_PROPOSTAS = "SÓ CCO e CMO (as outras recebem 403). Propostas Offset em JSON paginado, sem corte de caracteres: pagina (1-based, padrão 1), limite (padrão 50, máx 100), total (de tudo que passa nos filtros). Filtros opcionais: status=pronta|enviada|aceita|perdida e estrela=true. Cada item: codigoPp (PP- ou null), codigoOrc (ORC- ou null; PP que já virou orçamento vem uma vez só, com os dois), valor, status (pronta = PP aguardando aprovação; enviada = PP enviada ou orçamento na coluna 'Orçamento realizado'/hot; aceita = pedido fechado em diante ou aprovação online; perdida = coluna Perdido ou PP descartada), dataCriacao, dataEnvio (null se não há data de envio registrada; no orçamento sem PP vem do histórico do WhatsApp, o mesmo do painel), estrela (true só se o Felipe marcou em 'Perto de você'; sugestão da semana não conta), estrelaDesconhecida (true quando não deu para achar o contato do orçamento: NÃO trate como livre), nivel ('A'|'B'|'C'|'lead'|'indefinido', ou null quando não há conversa ligada ou não deu para classificar), jid e nome (o contato do orçamento sem PP é resolvido pela conversa ligada, vínculo ou nome único; jid null = não resolvido). Itens fechados e perdidos entram: filtre no cliente. Mais novos primeiro. Só leitura."

export type ItemProposta = {
  codigoPp: string | null; codigoOrc: string | null; valor: number; status: StatusItem
  dataCriacao: string | null; dataEnvio: string | null; estrela: boolean; estrelaDesconhecida: boolean; nivel: Nivel | null
  jid: string | null; nome: string | null
}
export type ContatoOrc = { jid: string; nome: string | null }
export type CardProposta = { id?: string | null; numero: string | null; nomeCliente: string | null; preco: number | null; coluna: number; createdAt: string | null }
export type AprovProposta = { numero: string; desfeita?: boolean }

const iso = (v: unknown): string | null => {
  if (!v) return null
  const d = new Date(v as string)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function statusDoCard(coluna: number, aprovado: boolean): StatusItem {
  if (coluna === COL_PERDIDO) return "perdida"
  if (aprovado || (coluna >= COL_FECHADO && coluna < COL_PERDIDO)) return "aceita"
  if (coluna === COL_HOT || coluna === 0) return "enviada"
  return "enviada"
}

export function montarPropostas(a: {
  propostas: PropostaPronta[]; cards: CardProposta[]; aprovacoes: AprovProposta[]; marcas: MarcaPerto[]; fontes?: FontesNivel
  contatos?: Map<string, ContatoOrc>   // numero do ORC sem PP -> conversa
}): ItemProposta[] {
  const estrelas = new Set(a.marcas.map(m => m.jid))
  const aprovados = new Set(a.aprovacoes.filter(x => !x.desfeita).map(x => x.numero))
  const cardPorNumero = new Map<string, CardProposta>()
  for (const c of a.cards) if (c.numero && !cardPorNumero.has(c.numero)) cardPorNumero.set(c.numero, c)
  const usados = new Set<string>()

  const nivelDe = (jid: string | null, nome: string | null): Nivel | null =>
    jid && a.fontes ? classificarNivel({ jid, nome }, a.fontes).nivel : null
  const contatos = a.contatos ?? new Map<string, ContatoOrc>()

  const itens: ItemProposta[] = []
  for (const p of a.propostas) {
    const card = p.numero ? cardPorNumero.get(p.numero) : undefined
    if (card && p.numero) usados.add(p.numero)
    const aprovado = !!p.numero && aprovados.has(p.numero)
    let status: StatusItem
    if (p.status === "descartada") status = "perdida"
    else if (card) status = statusDoCard(card.coluna, aprovado)
    else if (aprovado) status = "aceita"
    else status = p.status === "aguardando" ? "pronta" : "enviada"
    itens.push({
      codigoPp: p.id ?? null, codigoOrc: p.numero ?? null,
      valor: Number(card ? card.preco : p.precoAprovado ?? p.preco) || 0,
      status, dataCriacao: iso(p.em) ?? iso(card?.createdAt), dataEnvio: iso(p.enviadaEm),
      estrela: estrelas.has(p.jid), estrelaDesconhecida: false, nivel: nivelDe(p.jid, p.nome ?? null), jid: p.jid, nome: p.nome ?? null,
    })
  }
  for (const c of a.cards) {
    if (!c.numero || usados.has(c.numero)) continue
    usados.add(c.numero)
    // ORC sem PP: o contato vem da conversa ligada ao orçamento (como no painel). Sem contato, a estrela é desconhecida, não "livre".
    const ct = contatos.get(c.numero)
    const nome = c.nomeCliente || ct?.nome || null
    itens.push({
      codigoPp: null, codigoOrc: c.numero, valor: Number(c.preco) || 0, status: statusDoCard(c.coluna, aprovados.has(c.numero)),
      dataCriacao: iso(c.createdAt), dataEnvio: null,
      estrela: !!ct && estrelas.has(ct.jid), estrelaDesconhecida: !ct, nivel: ct ? nivelDe(ct.jid, ct.nome ?? nome) : null,
      jid: ct?.jid ?? null, nome,
    })
  }
  return itens.sort((x, y) => (y.dataCriacao ?? "").localeCompare(x.dataCriacao ?? "") || (x.codigoPp ?? x.codigoOrc ?? "").localeCompare(y.codigoPp ?? y.codigoOrc ?? ""))
}

export function paginar<T>(todos: T[], pagina?: number, limite?: number) {
  const lim = Math.min(LIMITE_MAX, Math.max(1, Math.floor(Number(limite)) || LIMITE_PADRAO))
  const pag = Math.max(1, Math.floor(Number(pagina)) || 1)
  return { pagina: pag, limite: lim, total: todos.length, itens: todos.slice((pag - 1) * lim, pag * lim) }
}

const lotes = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

// Contato do ORC sem PP, pelo caminho do painel: 1) conversa ligada ao orçamento (whatsapp_conversas.kanban_card_id);
// 2) vínculo manual jid -> cliente; 3) conversa de mesmo nome, só se for uma. Ambíguo ou ausente: sem contato.
export async function resolverContatos(cards: CardProposta[], vinculos: Record<string, string> = {}): Promise<Map<string, ContatoOrc>> {
  const out = new Map<string, ContatoOrc>()
  const porId = new Map(cards.filter(c => c.id && c.numero).map(c => [c.id as string, c]))
  for (const lote of lotes([...porId.keys()], 200)) {
    const { data } = await supabase.from("whatsapp_conversas").select("jid, nome, kanban_card_id").in("kanban_card_id", lote)
    for (const c of data ?? []) { const k = porId.get(c.kanban_card_id as string); if (k?.numero && !out.has(k.numero)) out.set(k.numero, { jid: c.jid as string, nome: (c.nome as string | null) ?? null }) }
  }
  const sem = cards.filter(c => c.numero && !out.has(c.numero) && c.nomeCliente)
  const chave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
  const porVinculo = new Map<string, string[]>()
  for (const [jid, nome] of Object.entries(vinculos)) if (nome) porVinculo.set(chave(nome), [...(porVinculo.get(chave(nome)) ?? []), jid])
  const faltam: CardProposta[] = []
  for (const c of sem) {
    const js = porVinculo.get(chave(c.nomeCliente as string))
    if (js?.length === 1) out.set(c.numero as string, { jid: js[0], nome: c.nomeCliente })
    else faltam.push(c)
  }
  const nomes = [...new Set(faltam.map(c => c.nomeCliente as string))]
  const porNome = new Map<string, ContatoOrc[]>()
  for (const lote of lotes(nomes, 200)) {
    const { data } = await supabase.from("whatsapp_conversas").select("jid, nome").in("nome", lote).not("jid", "like", "%@g.us")
    for (const c of data ?? []) porNome.set(chave(c.nome as string), [...(porNome.get(chave(c.nome as string)) ?? []), { jid: c.jid as string, nome: c.nome as string }])
  }
  for (const c of faltam) { const l = porNome.get(chave(c.nomeCliente as string)); if (l?.length === 1) out.set(c.numero as string, l[0]) }
  return out
}

// dataEnvio do ORC sem PP: a mesma fonte do painel (orcadoPeloFelipe nas mensagens, ou marcado à mão). Só para a página devolvida.
async function completarEnvio(itens: ItemProposta[]): Promise<void> {
  const alvo = itens.filter(i => !i.codigoPp && i.jid && !i.dataEnvio)
  if (!alvo.length) return
  const [ids, estados] = await Promise.all([lerIdsAgente().catch(() => null), lerEstadosLead().catch(() => new Map<string, EstadoLead>())])
  const agente = new Set(ids ?? [])
  for (const lote of lotes(alvo, 10)) await Promise.all(lote.map(async i => {
    try {
      const manual = orcadoManualAtivo(estados.get(i.jid as string), null)
      if (manual) { i.dataEnvio = iso(manual.em); return }
      const { data } = await supabase.from("whatsapp_mensagens").select("id, from_me, tipo, ts, corpo").eq("jid", i.jid as string).order("ts", { ascending: false }).limit(120)
      const o = orcadoPeloFelipe((data ?? []) as never, agente)
      i.dataEnvio = o.orcado ? iso(o.em) : null
    } catch { /* sem leitura, dataEnvio segue null */ }
  }))
}

export type ParamsPropostas ={ pagina?: string | null; limite?: string | null; status?: string | null; estrela?: string | null }

export async function lerPropostasExterno(diretor: IdDiretor, p: ParamsPropostas = {}): Promise<{ status: number; corpo: Record<string, unknown> }> {
  if (!podeAcionarComercial(diretor)) return { status: 403, corpo: { erro: "?o=propostas é só para as chaves do CCO e da CMO." } }
  if (p.status && !(STATUS_PROPOSTA as readonly string[]).includes(p.status)) return { status: 400, corpo: { erro: "status: pronta, enviada, aceita ou perdida" } }
  const [{ data: linhas }, { data: cards }, cfg] = await Promise.all([
    supabase.from("agente_tratadas").select("id, em").like("id", `${PREFIXO_PERTO}%`).limit(2000),
    supabase.from("KanbanCard").select("id, numero, nomeCliente, preco, coluna, createdAt"),
    lerCampos<{ propostasProntas?: PropostaPronta[]; aprovacoesOnline?: AprovProposta[] }>(["propostasProntas", "aprovacoesOnline"]),
  ])
  const marcas = (linhas ?? []).map(r => lerMarca(r.id as string, r.em as string)).filter((x): x is MarcaPerto => !!x)
  const fontes = await carregarFontesNivel()
  const listaCards = (cards ?? []) as unknown as CardProposta[]
  const comPp = new Set((cfg.propostasProntas ?? []).map(x => x.numero).filter(Boolean))
  const contatos = await resolverContatos(listaCards.filter(c => c.numero && !comPp.has(c.numero)), fontes.vinculos).catch(() => new Map<string, ContatoOrc>())
  let todos = montarPropostas({
    propostas: cfg.propostasProntas ?? [], cards: listaCards,
    aprovacoes: cfg.aprovacoesOnline ?? [], marcas, fontes, contatos,
  })
  if (p.status) todos = todos.filter(i => i.status === p.status)
  if (p.estrela === "true") todos = todos.filter(i => i.estrela)
  const r = paginar(todos, Number(p.pagina), Number(p.limite))
  await completarEnvio(r.itens)
  return { status: 200, corpo: { total: r.total, pagina: r.pagina, limite: r.limite, itens: r.itens } }
}
