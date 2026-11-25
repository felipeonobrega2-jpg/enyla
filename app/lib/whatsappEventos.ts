// Eventos do Evolution além das mensagens: conexão do número, confirmações de entrega/leitura e contatos.
// Só roda no servidor.

import { lerConfigLinha } from "./configAtomica"
import { supabase } from "./supabase"
import { telefoneNaResposta } from "./contatos"
import { gravarCampos } from "./configAtomica"
import { evo } from "./evolution"

// O Evolution manda o nome do evento de jeitos diferentes: "connection.update", "CONNECTION_UPDATE", "connection-update".
export const nomeDoEvento = (e: unknown) => String(e ?? "").trim().toLowerCase().replace(/[_\-\s]+/g, ".")

type DadosConexao = { state?: string; connection?: string; instance?: { state?: string }; statusReason?: number | string; lastDisconnect?: { error?: { output?: { statusCode?: number } } } }

// Estado e motivo de um connection.update (Evolution 2.4: data.state; Baileys cru: data.connection; alguns: data.instance.state)
export function lerEventoConexao(data: unknown): { estado: string; motivo: number | null } | null {
  const d = (data ?? {}) as DadosConexao
  const bruto = [d.state, d.connection, d.instance?.state].find(v => typeof v === "string" && v.trim())
  if (!bruto) return null
  const motivo = Number(d.statusReason ?? d.lastDisconnect?.error?.output?.statusCode ?? 0) || null
  return { estado: bruto.trim().toLowerCase(), motivo }
}

// Estado da conexão do número (Painel avisa quando cai). Grava só quando muda.
// Aquecimento (o agente manda menos por um tempo) só depois de o WhatsApp REMOVER o aparelho (401: precisou ler o
// QR de novo, aparelho novo para o WhatsApp). Oscilação, reinício e "conectando" de passagem não contam.
export async function registrarConexao(estado: string, motivo: number | null = null) {
  const { data } = await lerConfigLinha()
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

// Prova de vida: uma mensagem nossa ou do cliente foi gravada, ou um envio nosso foi confirmado. O número está no ar,
// mesmo que o evento de conexão tenha se perdido. Não é 401: nunca mexe em removido/aquecerDesde. Já em "open": não escreve.
// Se o aparelho foi removido (removido), deixa para a conexão de verdade (evento ou Vigia), que liga o aquecimento.
export async function provaDeVida(): Promise<boolean> {
  const { data } = await lerConfigLinha()
  const atual = ((data?.data as Record<string, unknown>) ?? {}).whatsappConexao as { estado?: string; removido?: boolean } | undefined
  if (atual?.estado === "open" || atual?.removido) return false
  await registrarConexao("open")
  return true
}

type ResultadoEstado = { ok: boolean; status: number; corpo: { instance?: { state?: string } } | null }

// Vigia (a cada 5 min): só lê o connectionState e grava o carimbo. API fora do ar ou sem estado: não grava nada.
export async function conferirConexao(consultar: () => Promise<ResultadoEstado> = () => evo("/instance/connectionState/{i}")): Promise<string | null> {
  const r = await consultar().catch(() => null)
  const estado = r?.ok ? r.corpo?.instance?.state : null
  if (typeof estado !== "string" || !estado.trim()) return null
  await registrarConexao(estado.trim().toLowerCase())
  return estado.trim().toLowerCase()
}

const STATUS: Record<string, string> = { SERVER_ACK: "enviada", DELIVERY_ACK: "entregue", READ: "lida", PLAYED: "lida" }
const ORDEM = ["enviada", "entregue", "lida"]

type Recibo = { keyId?: string; messageId?: string; key?: { id?: string }; status?: string }

// ✓ enviada, ✓✓ entregue, ✓✓ azul lida. Nunca volta para trás. (Precisa da coluna whatsapp_mensagens.status.)
export async function registrarRecibos(lista: Recibo[]) {
  let nossoConfirmado = false
  for (const r of lista) {
    const id = r.keyId ?? r.key?.id ?? r.messageId
    const status = STATUS[r.status ?? ""]
    if (!id || !status) continue
    const { data } = await supabase.from("whatsapp_mensagens").select("status, from_me").eq("id", id).maybeSingle()
    if (!data) continue
    if (data.from_me) nossoConfirmado = true
    if (ORDEM.indexOf(data.status ?? "") >= ORDEM.indexOf(status)) continue
    await supabase.from("whatsapp_mensagens").update({ status }).eq("id", id)
  }
  // Envio nosso confirmado (enviada/entregue/lida): o número está no ar
  if (nossoConfirmado) await provaDeVida().catch(() => null)
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
