// Eventos do Evolution além das mensagens: conexão do número, confirmações de entrega/leitura e contatos.
// Só roda no servidor.

import { supabase } from "./supabase"
import { telefoneNaResposta } from "./contatos"
import { gravarCampos } from "./configAtomica"

// Estado da conexão do número (Painel avisa quando cai). Grava só quando muda.
// Aquecimento (o agente manda menos por um tempo) só depois de o WhatsApp REMOVER o aparelho (401: precisou ler o
// QR de novo, aparelho novo para o WhatsApp). Oscilação, reinício e "conectando" de passagem não contam.
export async function registrarConexao(estado: string, motivo: number | null = null) {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (data?.data as Record<string, unknown>) ?? {}
  const atual = cfg.whatsappConexao as { estado?: string; removido?: boolean; aquecerDesde?: string } | undefined
  if (atual?.estado === estado && !(motivo === 401 && !atual?.removido)) return
  const agora = new Date().toISOString()
  if (estado !== "open") {
    await gravarCampos({ whatsappConexao: { estado, em: agora, removido: atual?.removido || motivo === 401 || undefined, motivo: motivo ?? undefined } })
    return
  }
  await gravarCampos({ whatsappConexao: { estado, em: agora, ...(atual?.removido ? { aquecerDesde: agora, aquecimentoV: 2 } : {}) } })
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
