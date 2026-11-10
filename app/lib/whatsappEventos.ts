// Eventos do Evolution além das mensagens: conexão do número, confirmações de entrega/leitura e contatos.
// Só roda no servidor.

import { supabase } from "./supabase"
import { telefoneNaResposta } from "./contatos"
import { gravarCampos } from "./configAtomica"

// Estado da conexão do número (Painel avisa quando cai). Grava só quando muda.
// Conectou de novo depois de ficar mais de 15 min fora (QR, aparelho removido): marca o início do "aquecimento"
// (o agente manda menos mensagens por um tempo). Oscilação de segundos não conta.
export async function registrarConexao(estado: string) {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (data?.data as Record<string, unknown>) ?? {}
  const atual = cfg.whatsappConexao as { estado?: string; caiuEm?: string; aquecerDesde?: string } | undefined
  if (atual?.estado === estado) return
  const agora = new Date().toISOString()
  if (estado !== "open") {
    await gravarCampos({ whatsappConexao: { ...atual, estado, em: agora, caiuEm: atual?.caiuEm ?? agora } })
    return
  }
  const fora = atual?.caiuEm ? Date.now() - new Date(atual.caiuEm).getTime() : 0
  await gravarCampos({ whatsappConexao: { estado, em: agora, aquecerDesde: fora > 15 * 60_000 ? agora : atual?.aquecerDesde } })
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

type Contato = { id?: string; remoteJid?: string; pushName?: string; name?: string; notify?: string; [k: string]: unknown }

// Contatos: completa o nome das conversas que só têm o número
export async function registrarContatos(lista: Contato[]) {
  for (const c of lista) {
    const jid = c.remoteJid ?? c.id
    // Contato novo (@lid) que veio com o número junto: guarda o telefone (o WhatsApp esconde nas conversas)
    if (jid?.endsWith("@lid")) {
      const tel = telefoneNaResposta({ ...c, remoteJid: undefined, id: undefined })
      if (tel) await supabase.from("whatsapp_conversas").update({ telefone: tel }).eq("jid", jid).is("telefone", null)
    }
    const nome = c.pushName ?? c.name ?? c.notify
    if (!jid || !nome || /^\d+$/.test(nome)) continue
    await supabase.from("whatsapp_conversas").update({ nome }).eq("jid", jid).filter("nome", "match", "^[0-9]+$")
  }
}
