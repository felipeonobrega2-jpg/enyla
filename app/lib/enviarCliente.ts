// Envia uma mensagem a um cliente pelo sistema (fica no histórico da conversa): telefone do cadastro, ou a conversa
// do WhatsApp ligada ao cliente (vínculo ou nome). Usado pela tela e pelos diretores (depois do "Aprovo" do Felipe).
// Nunca mandar por fora (Evolution direto sem gravar): o agente não vê e repete. Só roda no servidor.
import { lerConfigLinha } from "./configAtomica"
import { supabase } from "./supabase"
import { evo } from "./evolution"
import { gravarLote, type WaMessage } from "./whatsappDados"
import { clienteDaConversa, type Vinculos } from "./vinculoWhatsapp"
import { nomeChave } from "./negocio"

// Para onde vai a mensagem de um cliente (sem enviar nada)
export async function destinoDoCliente(cliente: string): Promise<{ destino: string | null; jid: string | null }> {
  const { data: cad } = await supabase.from("Cliente").select("nome, telefone")
  const tel = (cad ?? []).find(c => nomeChave(c.nome) === nomeChave(cliente))?.telefone?.replace(/\D/g, "")
  let destino: string | null = tel ? (tel.length <= 11 ? "55" + tel : tel) : null
  let jid: string | null = null
  if (!destino) {
    const { data: cfgRow } = await lerConfigLinha()
    const vinculos = ((cfgRow?.data as { vinculosWhatsapp?: Vinculos } | null)?.vinculosWhatsapp) ?? {}
    const { data: conversas } = await supabase.from("whatsapp_conversas").select("jid, nome, ultima_at").order("ultima_at", { ascending: false })
    jid = (conversas ?? []).find(c => clienteDaConversa(c, [cliente], vinculos)?.nome === cliente)?.jid ?? null
    destino = jid
  }
  return { destino, jid }
}

// leadJid: ordem da diretoria a um lead (conversa do WhatsApp sem cadastro). Vai para essa conversa e conta na cota por hora.
export async function enviarAoCliente(cliente: string, texto: string, leadJid?: string): Promise<{ ok: true; jid: string } | { ok: false; erro: string; status: number }> {
  if (!cliente || !texto?.trim()) return { ok: false, erro: "Cliente e mensagem são obrigatórios.", status: 400 }
  const { destino, jid } = leadJid ? { destino: leadJid, jid: leadJid } : await destinoDoCliente(cliente)
  if (!destino) return { ok: false, erro: `Sem telefone de ${cliente} no cadastro e nenhuma conversa ligada a ele.`, status: 404 }
  if (leadJid) await (await import("./agenteAuto")).reservarVezDeEnviar({ essencial: true }).catch(() => null)   // só registra na cota (Felipe aprovou: não barra)
  const r = await evo<WaMessage>("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text: texto.trim() }) })
  if (!r.ok || !r.corpo?.key?.id) return { ok: false, erro: `Não enviou (${r.status}). Confira a conexão do WhatsApp.`, status: 502 }
  const remoteJid = jid ?? r.corpo.key.remoteJid
  await gravarLote([{ ...r.corpo, key: { ...r.corpo.key, remoteJid, fromMe: true } }])
  return { ok: true, jid: remoteJid }
}
