// "Para resolver agora": o que passou do prazo ou depende de você, num lugar só, por valor.
// Liga sozinho cada conversa ao orçamento que ela recebeu (mensagem nossa com "ORC-2026-123" ou o link de aprovação),
// gravando em whatsapp_conversas.kanban_card_id. Só roda no servidor.
import { prazoDigital } from "./prazoDigital"
import { supabase } from "./supabase"
import { COL_FECHADO, COL_HOT, COL_ENTREGUE, COL_PERDIDO } from "../types"
import type { AprovacaoOnline } from "./aprovacao"
import type { Passos } from "./hoje"

export type ItemResolver = {
  tipo: "proposta" | "pagamento" | "atrasado" | "sistema" | "digital" | "grande" | "esperando" | "promessa"
  titulo: string            // "Márcio Santana · ORC-2026-283"
  detalhe: string           // "abriu a proposta 3× · sem retomada há 2 dias"
  valor: number | null
  jid: string | null
  numero: string | null
  desde: string | null
  nivel: "perigo" | "alerta" | "info"
}

const ORC = /ORC-\d{4}-\d{2,5}/g
const DIA = 86_400_000
const dias = (iso: string, agora: number) => Math.floor((agora - new Date(iso).getTime()) / DIA)
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

// Liga conversa → orçamento pelo número que mandamos na conversa (o mais recente vale). Não desfaz ligação existente.
export async function ligarConversasAosOrcamentos(diasAtras = 45): Promise<number> {
  const desde = new Date(Date.now() - diasAtras * DIA).toISOString()
  const { data: ms } = await supabase.from("whatsapp_mensagens").select("jid, corpo, criado_em").eq("from_me", true).gte("criado_em", desde).ilike("corpo", "%ORC-20%").order("criado_em", { ascending: false }).limit(2000)
  const porJid = new Map<string, string>()
  for (const m of ms ?? []) {
    if (String(m.jid).includes("@g.us") || porJid.has(m.jid)) continue
    const n = String(m.corpo ?? "").match(ORC)?.at(-1)
    if (n) porJid.set(m.jid, n)
  }
  if (!porJid.size) return 0
  const { data: cards } = await supabase.from("KanbanCard").select("id, numero").in("numero", [...new Set(porJid.values())])
  const idDo = new Map((cards ?? []).map(c => [c.numero as string, c.id as string]))
  const { data: convs } = await supabase.from("whatsapp_conversas").select("jid, kanban_card_id").in("jid", [...porJid.keys()])
  let ligadas = 0
  for (const c of convs ?? []) {
    const id = idDo.get(porJid.get(c.jid)!)
    if (!id || c.kanban_card_id === id) continue
    await supabase.from("whatsapp_conversas").update({ kanban_card_id: id }).eq("jid", c.jid)
    ligadas++
  }
  return ligadas
}

// Digital parado além do prazo de cada etapa (dono entre parênteses no texto)
export const PRAZO_DIGITAL = { arteFazer: 2, arteCliente: 2, producao: 7 }   // dias
type PedDig = { id: string; nome?: string | null; jid: string; total: number; quantidade?: number; status: string; statusEm?: string; sinalPagoEm?: string; arteEnviadaEm?: string; arteAprovadaEm?: string; artes?: unknown[]; teste?: boolean; restante?: number | null; restantePagoEm?: string }
export function digitalParado(pedidos: PedDig[], agora = Date.now()): ItemResolver[] {
  const out: ItemResolver[] = []
  for (const p of pedidos) {
    if (p.teste) continue
    const base = { valor: p.total, jid: p.jid, numero: p.id, titulo: `${p.nome || "Cliente"} · ${p.id}` }
    const desde = (iso?: string) => iso ? dias(iso, agora) : 0
    if (p.status === "sinal_pago" || (p.status === "arte" && !p.arteEnviadaEm)) {
      const d = desde(p.statusEm ?? p.sinalPagoEm)
      if (d >= PRAZO_DIGITAL.arteFazer) out.push({ ...base, tipo: "digital", detalhe: `sinal pago há ${d} dias e a arte ainda não foi para o cliente (Leandro)`, desde: p.statusEm ?? p.sinalPagoEm ?? null, nivel: d >= 4 ? "perigo" : "alerta" })
    } else if (p.status === "arte" && p.arteEnviadaEm && !p.arteAprovadaEm) {
      const d = desde(p.arteEnviadaEm)
      if (d >= PRAZO_DIGITAL.arteCliente) out.push({ ...base, tipo: "digital", detalhe: `arte com o cliente há ${d} dias sem aprovar: dê um toque`, desde: p.arteEnviadaEm, nivel: "info" })
    } else if (p.status === "producao") {
      const d = desde(p.arteAprovadaEm ?? p.statusEm)
      const limite = p.quantidade ? prazoDigital(p.quantidade).max : PRAZO_DIGITAL.producao
      if (d >= limite) out.push({ ...base, tipo: "digital", detalhe: `em produção há ${d} dias (Villa; prazo ${p.quantidade ? prazoDigital(p.quantidade).texto : `${limite} dias`}): confira quando sai`, desde: p.arteAprovadaEm ?? p.statusEm ?? null, nivel: "alerta" })
    }
  }
  return out
}

export async function paraResolver(cfg: { grandesNegocios?: import("./grandesNegocios").GrandeNegocio[]; pedidosDigitais?: PedDig[]; visitasProposta?: Record<string, { vezes: number; ultima: string }>; aprovacoesOnline?: AprovacaoOnline[]; proximosPassos?: Passos; agenteSemCreditoEm?: string; whatsappConexao?: { estado?: string; em?: string } }, agora = Date.now()): Promise<ItemResolver[]> {
  const itens: ItemResolver[] = []
  const hoje = new Date(agora - 3 * 3600_000).toISOString().slice(0, 10)

  // Sistema: o que, se parar, você perde lead sem saber
  if (cfg.agenteSemCreditoEm && agora - new Date(cfg.agenteSemCreditoEm).getTime() < 3 * 3600_000)
    itens.push({ tipo: "sistema", titulo: "IA da Enyla sem crédito", detalhe: "o agente não responde enquanto não recarregar (Anthropic)", valor: null, jid: null, numero: null, desde: cfg.agenteSemCreditoEm, nivel: "perigo" })
  if (cfg.whatsappConexao?.estado && cfg.whatsappConexao.estado !== "open")
    itens.push({ tipo: "sistema", titulo: "WhatsApp desconectado", detalhe: "ninguém recebe resposta: leia o QR em Configurações", valor: null, jid: null, numero: null, desde: cfg.whatsappConexao.em ?? null, nivel: "perigo" })

  // Propostas offset abertas (até 30 dias) com a conversa ligada: você falou por último há 2+ dias, ou ele abriu a
  // proposta e não respondeu. O próximo passo que você marcou ("esperando", "lembrar") segura até a data.
  const desde = new Date(agora - 30 * DIA).toISOString()
  const { data: abertos } = await supabase.from("KanbanCard").select("id, numero, nomeCliente, preco, coluna, createdAt").in("coluna", [0, COL_HOT]).gte("createdAt", desde)
  const ids = (abertos ?? []).map(c => c.id)
  const { data: convs } = ids.length ? await supabase.from("whatsapp_conversas").select("jid, nome, kanban_card_id, ultima_recebida_at, ultima_enviada_at").in("kanban_card_id", ids) : { data: [] }
  const convDo = new Map((convs ?? []).map(c => [c.kanban_card_id as string, c]))
  for (const k of abertos ?? []) {
    const c = convDo.get(k.id)
    if (!c) continue
    const passo = cfg.proximosPassos?.[c.jid]
    if (passo && new Date(passo.ate).getTime() > agora) continue
    const vis = cfg.visitasProposta?.[k.numero]
    const nos = !!c.ultima_enviada_at && (!c.ultima_recebida_at || c.ultima_enviada_at > c.ultima_recebida_at)
    const parado = nos ? dias(c.ultima_enviada_at!, agora) : 0
    const abriuSemResponder = !!vis && nos && new Date(vis.ultima).getTime() > new Date(c.ultima_enviada_at!).getTime()
    if (!nos || (parado < 2 && !(abriuSemResponder && agora - new Date(vis!.ultima).getTime() > 3 * 3600_000))) continue
    itens.push({
      tipo: "proposta", titulo: `${k.nomeCliente} · ${k.numero}`, valor: Number(k.preco) || null, jid: c.jid, numero: k.numero, desde: c.ultima_enviada_at,
      detalhe: [vis ? `abriu a proposta ${vis.vezes}×` : "não abriu a proposta", parado ? `sem retomada há ${parado} ${parado === 1 ? "dia" : "dias"}` : "abriu agora e não respondeu"].join(" · "),
      nivel: (vis?.vezes ?? 0) >= 2 || (Number(k.preco) || 0) >= 8000 ? "alerta" : "info",
    })
  }

  // Aprovou online e não pagou o sinal em 24 h
  const aprov = (cfg.aprovacoesOnline ?? []).filter(a => !a.desfeita && agora - new Date(a.em).getTime() > DIA && agora - new Date(a.em).getTime() < 20 * DIA)
  if (aprov.length) {
    const { data: pagos } = await supabase.from("LancamentoFinanceiro").select("cardNumero").in("cardNumero", aprov.map(a => a.numero)).eq("tipo", "receita").eq("status", "pago")
    const pago = new Set((pagos ?? []).map(p => p.cardNumero))
    const { data: cardsAprov } = await supabase.from("KanbanCard").select("numero, coluna").in("numero", aprov.map(a => a.numero))
    const fora = new Set((cardsAprov ?? []).filter(c => c.coluna === 0 || c.coluna === COL_PERDIDO).map(c => c.numero))
    const { data: cvs } = await supabase.from("whatsapp_conversas").select("jid, kanban_card_id").in("kanban_card_id", aprov.map(a => a.cardId))
    for (const a of aprov) {
      if (pago.has(a.numero) || fora.has(a.numero)) continue
      itens.push({ tipo: "pagamento", titulo: `${a.nomeCliente} · ${a.numero}`, detalhe: `aprovou há ${dias(a.em, agora)} dias e o sinal de ${brl(a.sinal)} não caiu`, valor: a.preco, jid: cvs?.find(c => c.kanban_card_id === a.cardId)?.jid ?? null, numero: a.numero, desde: a.em, nivel: "alerta" })
    }
  }

  // Entrega prevista vencida e o pedido ainda não saiu
  const { data: atrasados } = await supabase.from("KanbanCard").select("id, numero, nomeCliente, preco, coluna, dataEntregaPrevista").gte("coluna", COL_FECHADO).lt("coluna", COL_ENTREGUE).lt("dataEntregaPrevista", hoje).not("dataEntregaPrevista", "is", null)
  const idsAt = (atrasados ?? []).map(c => c.id)
  const { data: cvAt } = idsAt.length ? await supabase.from("whatsapp_conversas").select("jid, kanban_card_id").in("kanban_card_id", idsAt) : { data: [] }
  for (const k of atrasados ?? []) {
    const d = dias(`${k.dataEntregaPrevista}T12:00:00-03:00`, agora)
    itens.push({ tipo: "atrasado", titulo: `${k.nomeCliente} · ${k.numero}`, detalhe: `entrega era ${String(k.dataEntregaPrevista).split("-").reverse().slice(0, 2).join("/")} (${d} ${d === 1 ? "dia" : "dias"} de atraso): avise o cliente e ajuste a data`, valor: Number(k.preco) || null, jid: cvAt?.find(c => c.kanban_card_id === k.id)?.jid ?? null, numero: k.numero, desde: k.dataEntregaPrevista, nivel: d >= 3 ? "perigo" : "alerta" })
  }

  // Digital é da IA e da operação (menu Digital tem o aviso próprio): fora da sua lista
  // Quem está esperando resposta há 30+ min, só bom negócio (ICP, Oportunidade, MQL/médio): o resto a IA atende
  {
    const { quemEspera, tempoEspera, paraOFelipe } = await import("./esperando")
    const { data: cvs } = await supabase.from("whatsapp_conversas").select("jid, nome, etiquetas, status_lead, ultima_msg, ultima_recebida_at, ultima_enviada_at, proxima_acao, fechada_em")
      .not("jid", "like", "%@g.us").gte("ultima_recebida_at", new Date(agora - 3 * DIA).toISOString()).limit(800)
    for (const e of quemEspera((cvs ?? []) as never, agora, 30).filter(paraOFelipe).slice(0, 15))
      itens.push({ tipo: "esperando", titulo: e.nome, detalhe: `${e.rotulo} esperando há ${tempoEspera(e.minutos)}: “${e.mensagem}”`, valor: null, jid: e.jid, numero: null, desde: null, nivel: e.minutos >= 120 || e.peso >= 3 ? "perigo" : "alerta" })
  }
  // Grande negócio com o próximo passo vencido (ou sem próximo passo): sobe logo depois do sistema
  const { precisaDeVoce } = await import("./grandesNegocios")
  for (const g of cfg.grandesNegocios ?? []) {
    const p = precisaDeVoce(g, agora)
    if (!p || p === "hoje") continue
    itens.push({ tipo: "grande", titulo: g.nome, valor: g.valor ?? null, jid: g.jid ?? null, numero: null, desde: g.proximoEm ?? null, nivel: "perigo",
      detalhe: p === "sem_passo" ? "grande negócio sem próximo passo: defina o que fazer e quando" : `venceu ${String(g.proximoEm).split("-").reverse().slice(0, 2).join("/")}: ${g.proximoPasso}` })
  }
  // Orçamento prometido e não enviado (o vigia confere a cada 15 min)
  for (const p of ((cfg as { promessasAbertas?: { jid: string; nome: string; horas: number; texto: string; bom: boolean; chave: string }[] }).promessasAbertas ?? []))
    itens.push({ tipo: "promessa", titulo: p.nome, detalhe: `você prometeu orçamento há ${p.horas} h: “${p.texto.slice(0, 80)}”`, valor: null, jid: p.jid, numero: null, desde: p.chave.split("|")[1] ?? null, nivel: p.bom || p.horas >= 6 ? "perigo" : "alerta" })
  const ordem = { sistema: 0, promessa: 1, esperando: 2, grande: 3, pagamento: 4, atrasado: 5, digital: 6, proposta: 7 }
  return itens.sort((a, b) => ordem[a.tipo] - ordem[b.tipo] || (b.valor ?? 0) - (a.valor ?? 0))
}
