// Braço digital no servidor: link assinado da página do pedido, leitura e gravação dos pedidos (AppConfig, campo do
// servidor) e a conferência do sinal no extrato (Pluggy), que avisa o cliente e você.

import { supabase } from "./supabase"
import { linkPedido } from "./digitalLink"
export { BASE_PUBLICA, tokenDigital, tokenDigitalValido, linkPedido } from "./digitalLink"
import { evo } from "./evolution"
import { enviar, gravarCfg, seuNumero, Conversa, CfgAgente } from "./agenteAuto"
import { sinaisPagos, textoSinalPago, PedidoComBriefing, EntradaBanco } from "./digital"
import { sincronizar } from "./bancoServidor"
import { pluggyConfigurada, atualizarItem } from "./pluggy"


type CfgDigital = Omit<CfgAgente, "pedidosDigitais"> & { pedidosDigitais?: PedidoComBriefing[]; digitalConferidoEm?: string; digitalBancoEm?: string; pluggy?: { itens?: { id: string }[] } }

async function lerDados() {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  return (data?.data ?? {}) as Record<string, unknown> & CfgDigital
}

export async function lerPedido(id: string): Promise<{ pedido: PedidoComBriefing | null; cfg: CfgDigital }> {
  const cfg = await lerDados()
  return { pedido: (cfg.pedidosDigitais ?? []).find(p => p.id === id) ?? null, cfg }
}

// Troca um pedido (lendo de novo na hora de gravar, para não apagar o que mudou enquanto isso)
export async function gravarPedido(id: string, mudar: (p: PedidoComBriefing, todos: PedidoComBriefing[]) => PedidoComBriefing | null) {
  let novo: PedidoComBriefing | null = null
  await gravarCfg(d => {
    const todos = ((d as CfgDigital).pedidosDigitais ?? []) as PedidoComBriefing[]
    return { pedidosDigitais: todos.map(p => { if (p.id !== id) return p; const n = mudar(p, todos); if (n) novo = n; return n ?? p }) }
  })
  return novo as PedidoComBriefing | null
}

async function conversa(jid: string): Promise<Conversa | null> {
  const { data } = await supabase.from("whatsapp_conversas").select("jid, nome, telefone, etiquetas, status_lead").eq("jid", jid).maybeSingle()
  return (data as Conversa | null) ?? null
}

async function avisarVoce(cfg: CfgDigital, texto: string) {
  const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
  if (destino) await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text: texto }) }).catch(() => null)
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

// Confere no extrato os sinais esperando Pix. Pede atualização do banco à Pluggy no máximo a cada 20 min e
// sincroniza o extrato no máximo a cada 5 min (o cliente que clicou "Já paguei" força a conferência).
export async function conferirSinais(opts: { forcar?: boolean } = {}): Promise<{ pagos: string[]; pendentes: number; motivo?: string }> {
  const cfg = await lerDados()
  const agora = Date.now()
  const pendentes = (cfg.pedidosDigitais ?? []).filter(p => p.status === "aguardando_sinal" && agora - new Date(p.em).getTime() < 15 * 86_400_000)
  if (!pendentes.length) return { pagos: [], pendentes: 0 }
  const desdeUltima = cfg.digitalConferidoEm ? agora - new Date(cfg.digitalConferidoEm).getTime() : Infinity
  if (desdeUltima < (opts.forcar ? 60_000 : 5 * 60_000)) return { pagos: [], pendentes: pendentes.length, motivo: "conferido agora há pouco" }
  const bancoHa = cfg.digitalBancoEm ? agora - new Date(cfg.digitalBancoEm).getTime() : Infinity
  await gravarCfg(() => ({ digitalConferidoEm: new Date().toISOString(), ...(bancoHa > 20 * 60_000 ? { digitalBancoEm: new Date().toISOString() } : {}) } as Partial<CfgAgente>))

  if (pluggyConfigurada()) {
    // A Pluggy busca no banco em segundo plano: o Pix aparece numa das próximas conferências
    if (bancoHa > 20 * 60_000) for (const it of cfg.pluggy?.itens ?? []) await atualizarItem(it.id).catch(() => null)
    await sincronizar().catch(() => null)
  }
  const menorDia = pendentes.map(p => p.em.slice(0, 10)).sort()[0]
  const { data: extrato } = await supabase.from("banco_transacoes").select("id, data, valor, tipo, contraparte_nome").eq("tipo", "entrada").gte("data", menorDia).limit(2000)
  const usadas = new Set(((cfg.pedidosDigitais ?? []) as PedidoComBriefing[]).map(p => p.pagamento?.txId).filter(Boolean) as string[])
  const achados = sinaisPagos(pendentes, (extrato ?? []) as EntradaBanco[], usadas)

  const pagos: string[] = []
  for (const { id, tx } of achados) {
    const p = await gravarPedido(id, x => x.status !== "aguardando_sinal" ? null
      : { ...x, status: "sinal_pago", sinalPagoEm: new Date().toISOString(), pagamento: { txId: tx.id, valor: tx.valor, data: tx.data, nome: tx.contraparte_nome ?? null } })
    if (!p) continue
    pagos.push(id)
    const c = await conversa(p.jid)
    if (c) await enviar(c, textoSinalPago(p, linkPedido(p.id), !!(p.briefing?.marca || p.briefing?.arquivos?.length))).catch(() => null)
    await avisarVoce(cfg, `💰 *Digital ${p.id}* · sinal pago ${brl(p.sinal)}\n${p.nome ?? ""} · ${p.quantidade.toLocaleString("pt-BR")} caixinhas · total ${brl(p.total)}`)
  }
  return { pagos, pendentes: pendentes.length - pagos.length }
}
