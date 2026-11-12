// Tempo até fechar (servidor): primeiro pedido fechado de cada cliente (offset) e sinais pagos do digital, com a
// primeira mensagem da conversa ligada ao cliente (mesma regra da tela: vínculo, telefone ou nome).
// Guardado 15 min em memória (não grava nada no banco).
import { supabase } from "./supabase"
import { isGanho, parseData, nomeChave } from "./negocio"
import { clienteDaConversa, chaveTelefone } from "./vinculoWhatsapp"
import { Caso, diasEntre, montarTempo, TempoAteFechar } from "./tempoAteFechar"
import type { KanbanCard } from "../types"

let cache: { em: number; t: TempoAteFechar } | null = null

async function primeiraMensagem(jids: string[]): Promise<Date | null> {
  let menor: Date | null = null
  for (const j of jids.slice(0, 6)) {
    const { data } = await supabase.from("whatsapp_mensagens").select("ts").eq("jid", j).order("ts", { ascending: true }).limit(1)
    const ts = data?.[0]?.ts ? new Date(data[0].ts) : null
    if (ts && (!menor || ts < menor)) menor = ts
  }
  return menor
}

export async function tempoAteFechar(forcar = false): Promise<TempoAteFechar> {
  if (!forcar && cache && Date.now() - cache.em < 15 * 60_000) return cache.t
  const [{ data: cards }, { data: clientes }, { data: convs }, { data: cfgRow }] = await Promise.all([
    supabase.from("KanbanCard").select("id, numero, nomeCliente, coluna, dataFechamento, preco, materialNome").not("dataFechamento", "is", null).limit(3000),
    supabase.from("Cliente").select("nome, telefone"),
    supabase.from("whatsapp_conversas").select("jid, nome, telefone").limit(10000),
    supabase.from("AppConfig").select("data").eq("id", 1).single(),
  ])
  const cfg = (cfgRow?.data ?? {}) as { vinculosWhatsapp?: Record<string, string>; pedidosDigitais?: { jid: string; nome: string | null; sinalPagoEm?: string; total: number; teste?: boolean; status: string }[] }
  const vinc = cfg.vinculosWhatsapp ?? {}
  const nomes = (clientes ?? []).map(c => c.nome as string)
  const telDe = new Map((clientes ?? []).map(c => [nomeChave(c.nome), chaveTelefone(c.telefone)]))

  // Conversas de cada cliente: vínculo, nome (regra da tela) ou o telefone do cadastro
  const convsDe = new Map<string, string[]>()
  for (const c of convs ?? []) {
    const r = clienteDaConversa(c, nomes, vinc)
    if (r) convsDe.set(nomeChave(r.nome), [...(convsDe.get(nomeChave(r.nome)) ?? []), c.jid])
  }
  const porTel = new Map<string, string[]>()
  for (const c of convs ?? []) { const k = chaveTelefone(c.telefone ?? c.jid.split("@")[0]); if (k) porTel.set(k, [...(porTel.get(k) ?? []), c.jid]) }

  // Primeiro pedido fechado de cada cliente (itens terceirizados não contam)
  const primeiro = new Map<string, KanbanCard>()
  for (const c of ((cards ?? []) as KanbanCard[]).filter(c => isGanho(c) && c.dataFechamento && c.materialNome !== "Terceirizado").sort((a, b) => a.dataFechamento!.localeCompare(b.dataFechamento!))) {
    const k = nomeChave(c.nomeCliente)
    if (!primeiro.has(k)) primeiro.set(k, c)
  }

  const casos: Caso[] = []
  for (const [k, c] of primeiro) {
    const tel = telDe.get(k)
    const jids = [...new Set([...(convsDe.get(k) ?? []), ...(tel ? porTel.get(tel) ?? [] : [])])]
    const contato = jids.length ? await primeiraMensagem(jids) : null
    casos.push({ cliente: c.nomeCliente, tipo: "offset", fechou: c.dataFechamento!.slice(0, 10), valor: c.preco, dias: diasEntre(contato, parseData(c.dataFechamento)!) })
  }
  // Digital: do primeiro contato ao sinal pago (pedido de teste não conta)
  for (const p of (cfg.pedidosDigitais ?? []).filter(p => p.sinalPagoEm && !p.teste && p.status !== "cancelado")) {
    const contato = await primeiraMensagem([p.jid])
    casos.push({ cliente: p.nome ?? "Cliente digital", tipo: "digital", fechou: p.sinalPagoEm!.slice(0, 10), valor: p.total, dias: diasEntre(contato, new Date(p.sinalPagoEm!)) })
  }
  const t = montarTempo(casos)
  cache = { em: Date.now(), t }
  return t
}
