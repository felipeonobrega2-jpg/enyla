// Atualiza uma corrida a partir da própria Lalamove (status, link, motorista). Usado pelo webhook e ao abrir o pedido.
// O webhook da Lalamove não traz assinatura documentada: por isso nunca confiamos no conteúdo dele, só no número da corrida.
// Só roda no servidor.

import { supabase } from "./supabase"
import { consultarPedido, consultarMotorista } from "./lalamove"
import { Frete, statusFinal } from "./frete"

export async function atualizarFrete(orderId: string): Promise<Frete | null> {
  const { data: atual } = await supabase.from("fretes").select("*").eq("order_id", orderId).maybeSingle()
  if (!atual) return null
  const r = await consultarPedido(orderId)
  if (!r.ok || !r.dados) return atual as Frete
  const p = r.dados
  let motorista = (atual as Frete).motorista
  if (p.driverId && !motorista?.nome) {
    const m = await consultarMotorista(orderId, p.driverId)
    if (m.ok && m.dados) motorista = { nome: m.dados.name, telefone: m.dados.phone, placa: m.dados.plateNumber }
  }
  const mudou = p.status !== atual.status || (p.shareLink && p.shareLink !== atual.share_link) || motorista !== atual.motorista
  if (!mudou) return atual as Frete
  const { data } = await supabase.from("fretes").update({
    status: p.status, share_link: p.shareLink ?? atual.share_link, motorista, atualizado_em: new Date().toISOString(),
  }).eq("order_id", orderId).select("*").maybeSingle()
  return (data ?? atual) as Frete
}

// Corridas de um pedido; as que ainda estão andando são conferidas na Lalamove
export async function fretesDoPedido(f: { numero?: string | null; cardId?: string | null; loteId?: string | null }) {
  let q = supabase.from("fretes").select("*").order("criado_em", { ascending: false })
  if (f.loteId) q = q.eq("lote_id", f.loteId)
  else if (f.cardId) q = q.eq("card_id", f.cardId)
  else if (f.numero) q = q.eq("pedido_numero", f.numero)
  else return []
  const { data } = await q
  return Promise.all(((data ?? []) as Frete[]).map(fr => statusFinal(fr.status) ? fr : atualizarFrete(fr.order_id).then(x => x ?? fr)))
}
