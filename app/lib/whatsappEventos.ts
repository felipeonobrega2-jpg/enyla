// Eventos do Evolution além das mensagens: conexão do número, confirmações de entrega/leitura e contatos.
// Só roda no servidor.

import { supabase } from "./supabase"

// Estado da conexão do número (Painel avisa quando cai). Grava só quando muda.
export async function registrarConexao(estado: string) {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (data?.data as Record<string, unknown>) ?? {}
  const atual = cfg.whatsappConexao as { estado?: string } | undefined
  if (atual?.estado === estado) return
  await supabase.from("AppConfig").update({ data: { ...cfg, whatsappConexao: { estado, em: new Date().toISOString() } } }).eq("id", 1)
}

const STATUS: Record<string, string> = { SERVER_ACK: "enviada", DELIVERY_ACK: "entregue", READ: "lida", PLAYED: "lida" }
const ORDEM = ["enviada", "entregue", "lida"]

type Recibo = { keyId?: string; messageId?: string; key?: { id?: string }; status?: string }

// ✓ enviada, ✓✓ entregue, ✓✓ azul lida. Nunca volta para trás. (Precisa da coluna whatsapp_mensagens.status.)
export async function registrarRecibos(lista: Recibo[]) {
  for (const r of lista) {
    const id = r.keyId ?? r.key?.id ?? r.messageId
    const status = STATUS[r.status ?? ""]
    if (!id || !status) continue
    const { data } = await supabase.from("whatsapp_mensagens").select("status").eq("id", id).maybeSingle()
    if (!data) continue
    if (ORDEM.indexOf(data.status ?? "") >= ORDEM.indexOf(status)) continue
    await supabase.from("whatsapp_mensagens").update({ status }).eq("id", id)
  }
}

type Contato = { id?: string; remoteJid?: string; pushName?: string; name?: string; notify?: string }

// Contatos: completa o nome das conversas que só têm o número
export async function registrarContatos(lista: Contato[]) {
  for (const c of lista) {
    const jid = c.remoteJid ?? c.id
    const nome = c.pushName ?? c.name ?? c.notify
    if (!jid || !nome || /^\d+$/.test(nome)) continue
    await supabase.from("whatsapp_conversas").update({ nome }).eq("jid", jid).filter("nome", "match", "^[0-9]+$")
  }
}
