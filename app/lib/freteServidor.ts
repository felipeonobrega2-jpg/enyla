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
  // Motorista: nome/placa e a posição (a Lalamove atualiza a cada 10 s enquanto a corrida anda)
  let motorista = (atual as Frete).motorista
  if (p.driverId && (!motorista?.nome || p.status === "ON_GOING" || p.status === "PICKED_UP")) {
    const m = await consultarMotorista(orderId, p.driverId)
    if (m.ok && m.dados) {
      const c = m.dados.coordinates
      motorista = { nome: m.dados.name, telefone: m.dados.phone, placa: m.dados.plateNumber, foto: m.dados.photo,
        ...(c ? { lat: Number(c.lat), lng: Number(c.lng), em: c.updatedAt } : { lat: motorista?.lat, lng: motorista?.lng, em: motorista?.em }) }
    }
  }
  const mudou = p.status !== atual.status || (p.shareLink && p.shareLink !== atual.share_link) || JSON.stringify(motorista) !== JSON.stringify(atual.motorista)
  if (!mudou) return atual as Frete
  const agora = new Date().toISOString()
  const { data } = await supabase.from("fretes").update({
    status: p.status, share_link: p.shareLink ?? atual.share_link, motorista, atualizado_em: agora,
  }).eq("order_id", orderId).select("*").maybeSingle()
  // Linha do tempo (quanto demorou para aceitar, buscar, entregar): coluna própria, sem travar o resto se ainda não existir
  if (p.status !== atual.status) {
    const eventos = [...((atual as { eventos?: { status: string; em: string }[] }).eventos ?? []), { status: p.status, em: agora }]
    await supabase.from("fretes").update({ eventos }).eq("order_id", orderId).then(() => null, () => null)
  }
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

// Médias das suas corridas (minutos): até um motorista aceitar e do aceite até coletar. Base da hora de chegada estimada.
export async function mediasDasCorridas(): Promise<{ aceitar?: number; buscar?: number; amostras: number }> {
  const { data, error } = await supabase.from("fretes").select("criado_em, eventos").order("criado_em", { ascending: false }).limit(60)
  if (error) return { amostras: 0 }
  const aceitar: number[] = [], buscar: number[] = []
  for (const f of (data ?? []) as { criado_em: string; eventos?: { status: string; em: string }[] }[]) {
    const ev = f.eventos ?? []
    const aceito = ev.find(e => e.status === "ON_GOING")?.em, coletado = ev.find(e => e.status === "PICKED_UP")?.em
    const min = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60_000
    if (aceito) aceitar.push(min(f.criado_em, aceito))
    if (aceito && coletado) buscar.push(min(aceito, coletado))
  }
  const media = (l: number[]) => l.length >= 3 ? l.reduce((s, x) => s + x, 0) / l.length : undefined
  return { aceitar: media(aceitar), buscar: media(buscar), amostras: aceitar.length }
}
