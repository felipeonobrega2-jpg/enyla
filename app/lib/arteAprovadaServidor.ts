// Sugestão de "arte aprovada" (Digital): leitura das conversas e o clique de uma pessoa. As decisões ficam em
// dados_sistema, coleção nova "sugestaoArteDecisao" (uma linha por pedido; nada é apagado). Nenhuma mensagem ao cliente.
import { supabase } from "./supabase"
import { gravarPedido } from "./digitalServidor"
import { lerConfigLinha } from "./configAtomica"
import { aprovacoesSemAmbiguidade, confirmarArteAprovada, ehAprovacao, sugestoesDeArte, type DecisaoSug, type MsgZap, type PedidoSug, type SugestaoArte } from "./arteAprovadaSugestao"

export const COLECAO_SUGESTAO = "sugestaoArteDecisao"

async function lerDecisoes(): Promise<DecisaoSug[]> {
  const { data } = await supabase.from("dados_sistema").select("dados").eq("colecao", COLECAO_SUGESTAO).limit(2000)
  return (data ?? []).map(r => r.dados as DecisaoSug).filter(d => d && typeof d.msgId === "string")
}

/** Sugestões pendentes dos pedidos dados (só leitura; falha vira lista vazia). */
export async function lerSugestoes(pedidos: PedidoSug[]): Promise<SugestaoArte[]> {
  try {
    const cand = pedidos.filter(p => ["sinal_pago", "arte"].includes(p.status) && !p.arteAprovadaEm)
    if (!cand.length) return []
    const jids = [...new Set(cand.map(p => p.jid))]
    const porJid: Record<string, MsgZap[]> = {}
    await Promise.all(jids.map(async jid => {
      const { data } = await supabase.from("whatsapp_mensagens").select("id, ts, from_me, tipo, corpo").eq("jid", jid).order("ts", { ascending: false }).limit(80)
      porJid[jid] = (data ?? []) as MsgZap[]
    }))
    return sugestoesDeArte(cand, porJid, await lerDecisoes())
  } catch { return [] }
}

async function gravarDecisao(d: DecisaoSug) {
  const { data: atual } = await supabase.from("dados_sistema").select("v").eq("colecao", COLECAO_SUGESTAO).eq("id", d.pedido).maybeSingle()
  const agora = new Date().toISOString()
  const r = atual
    ? await supabase.from("dados_sistema").update({ dados: d, v: (atual.v ?? 0) + 1, atualizado_em: agora }).eq("colecao", COLECAO_SUGESTAO).eq("id", d.pedido)
    : await supabase.from("dados_sistema").insert({ colecao: COLECAO_SUGESTAO, id: d.pedido, dados: d, v: 1, atualizado_em: agora })
  if (r.error) throw new Error(r.error.message)
}

/**
 * O clique de uma pessoa. "confirmar" marca só a aprovação da arte no pedido (arteAprovadaEm/arteAprovadaPor), sem mudar
 * a etapa e sem mandar nada; "descartar" ("Não é aprovação") só guarda a decisão. Em conversa ambígua, o clique vale
 * para o pedido escolhido; descartar vale para todos os candidatos.
 */
export async function decidirSugestao(pedidos: PedidoSug[], id: string, decisao: "confirmar" | "descartar", por: string): Promise<{ ok?: true; erro?: string }> {
  const s = (await lerSugestoes(pedidos)).find(x => x.pedido === id)
  if (!s) return { erro: "Essa sugestão não existe mais (já decidida ou a arte já foi aprovada)." }
  const em = new Date().toISOString()
  if (decisao === "descartar") {
    for (const c of s.candidatos) await gravarDecisao({ pedido: c, msgId: s.msgId, decisao: "descartada", por, em })
    return { ok: true }
  }
  const novo = await gravarPedido(id, p => confirmarArteAprovada(p, s, por, em))
  if (!novo) return { erro: "Esse pedido não está mais esperando aprovação da arte." }
  await gravarDecisao({ pedido: id, msgId: s.msgId, decisao: "confirmada", por, em })
  return { ok: true }
}

/**
 * Aprovação não ambígua no WhatsApp: grava na hora arteAprovadaEm (o ts da mensagem do cliente) e arteAprovadaPor (por:
 * sistema), registra a decisão "confirmada" e não mexe na etapa nem manda mensagem. Idempotente: arteAprovadaEm já
 * preenchido não é sobrescrito. Ambígua (mais de um pedido esperando no mesmo jid) segue só como sugestão no painel.
 * Chamada quando chega mensagem nova do cliente; falha nunca derruba o webhook.
 */
export async function gravarAprovacaoDoChat(jid: string, corpo: string | null | undefined): Promise<string[]> {
  if (!ehAprovacao(corpo)) return []
  try {
    const { data } = await lerConfigLinha()
    const pedidos = (((data?.data ?? {}) as { pedidosDigitais?: PedidoSug[] }).pedidosDigitais ?? []).filter(p => p.jid === jid)
    const gravados: string[] = []
    for (const s of aprovacoesSemAmbiguidade(await lerSugestoes(pedidos))) {
      const em = new Date().toISOString()
      const novo = await gravarPedido(s.pedido, p => confirmarArteAprovada(p, s, "sistema", em))
      if (!novo) continue
      await gravarDecisao({ pedido: s.pedido, msgId: s.msgId, decisao: "confirmada", por: "sistema", em })
      gravados.push(s.pedido)
    }
    return gravados
  } catch (e) { console.error("[arte aprovada no chat]", e); return [] }
}
