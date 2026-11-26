// Envia uma mensagem a um cliente pelo sistema (fica no histórico da conversa): telefone do cadastro, ou a conversa
// do WhatsApp ligada ao cliente (vínculo ou nome). Usado pela tela e pelos diretores (depois do "Aprovo" do Felipe).
// Nunca mandar por fora (Evolution direto sem gravar): o agente não vê e repete. Só roda no servidor.
import { lerConfigLinha } from "./configAtomica"
import { supabase } from "./supabase"
import { evo } from "./evolution"
import { gravarLote, type WaMessage } from "./whatsappDados"
import { clienteDaConversa, type Vinculos } from "./vinculoWhatsapp"
import { nomeChave } from "./negocio"

// Para onde vai a mensagem de um cliente (sem enviar nada). "cliente" pode ser o nome ou o número de um pedido Digital (DIG-0001).
// Ordem: pedido Digital (jid da conversa que originou o pedido), telefone do cadastro, pedido Digital pelo nome, conversa ligada.
// Sem destino, devolve o motivo (pedido_nao_encontrado, pedido_sem_jid, sem_jid) em vez de falhar em silêncio.
export async function destinoDoCliente(cliente: string): Promise<{ destino: string | null; jid: string | null; motivo?: "pedido_nao_encontrado" | "pedido_sem_jid" | "sem_jid" }> {
  const { data: cfgRow } = await lerConfigLinha()
  const cfg = (cfgRow?.data as { vinculosWhatsapp?: Vinculos; pedidosDigitais?: { id: string; jid?: string; nome: string | null }[] } | null) ?? {}
  const pedidos = cfg.pedidosDigitais ?? []
  const ehPedido = /^DIG-\d+$/i.test(cliente.trim())
  const pedido = ehPedido ? pedidos.find(p => p.id.toUpperCase() === cliente.trim().toUpperCase()) : undefined
  if (ehPedido && !pedido) return { destino: null, jid: null, motivo: "pedido_nao_encontrado" }
  if (pedido?.jid) return { destino: pedido.jid, jid: pedido.jid }
  const nome = pedido?.nome ?? cliente
  const { data: cad } = await supabase.from("Cliente").select("nome, telefone")
  const tel = (cad ?? []).find(c => nomeChave(c.nome) === nomeChave(nome))?.telefone?.replace(/\D/g, "")
  if (tel) return { destino: tel.length <= 11 ? "55" + tel : tel, jid: null }
  const doPedido = pedido ?? pedidos.find(p => p.jid && nomeChave(p.nome) && nomeChave(p.nome) === nomeChave(nome))
  if (doPedido?.jid) return { destino: doPedido.jid, jid: doPedido.jid }
  const { data: conversas } = await supabase.from("whatsapp_conversas").select("jid, nome, ultima_at").order("ultima_at", { ascending: false })
  const jid = (conversas ?? []).find(c => clienteDaConversa(c, [nome], cfg.vinculosWhatsapp ?? {})?.nome === nome)?.jid ?? null
  if (jid) return { destino: jid, jid }
  return { destino: null, jid: null, motivo: pedido ? "pedido_sem_jid" : "sem_jid" }
}

// leadJid: ordem da diretoria a um lead (conversa do WhatsApp sem cadastro). Vai para essa conversa e conta na cota por hora.
export async function enviarAoCliente(cliente: string, texto: string, leadJid?: string): Promise<{ ok: true; jid: string } | { ok: false; erro: string; status: number }> {
  if (!cliente || !texto?.trim()) return { ok: false, erro: "Cliente e mensagem são obrigatórios.", status: 400 }
  const { destino, jid, motivo } = leadJid ? { destino: leadJid, jid: leadJid, motivo: undefined } : await destinoDoCliente(cliente)
  if (!destino) return { ok: false, erro: `Sem telefone de ${cliente} no cadastro e nenhuma conversa ligada a ele${motivo ? ` (${motivo})` : ""}.`, status: 404 }
  if (leadJid) await (await import("./agenteAuto")).reservarVezDeEnviar({ essencial: true }).catch(() => null)   // só registra na cota (Felipe aprovou: não barra)
  const r = await evo<WaMessage>("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text: texto.trim() }) })
  if (!r.ok || !r.corpo?.key?.id) return { ok: false, erro: `Não enviou (${r.status}). Confira a conexão do WhatsApp.`, status: 502 }
  const remoteJid = jid ?? r.corpo.key.remoteJid
  await gravarLote([{ ...r.corpo, key: { ...r.corpo.key, remoteJid, fromMe: true } }])
  return { ok: true, jid: remoteJid }
}
