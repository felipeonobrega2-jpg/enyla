// Braço digital no servidor: link assinado da página do pedido, leitura e gravação dos pedidos (AppConfig, campo do
// servidor) e a conferência do sinal no extrato (Pluggy), que avisa o cliente e você.

import { supabase } from "./supabase"
import { linkPedido, linkDesigner } from "./digitalLink"
export { BASE_PUBLICA, tokenDigital, tokenDigitalValido, linkPedido, tokenDesignerValido, linkDesigner } from "./digitalLink"
import { evo } from "./evolution"
import { enviar, enviarArquivo, gravarCfg, seuNumero, Conversa, CfgAgente } from "./agenteAuto"
import {
  sinaisPagos, textoSinalPago, PedidoComBriefing, EntradaBanco, restantesPagos, textoRestantePago, arteAtual, novaArte, marcarArteEnviada,
  aprovarArte, pedirAjuste, textoArteParaAprovar, textoArteAprovada, textoParaVilla, textoParaDesigner, acertoDaSemana, textoAcerto, semanaDe,
} from "./digital"
import { sincronizar } from "./bancoServidor"
import { pluggyConfigurada, atualizarItem } from "./pluggy"


export type ContatosDigital = { villa?: string; designer?: string; designerNome?: string }
type CfgDigital = Omit<CfgAgente, "pedidosDigitais"> & { pedidosDigitais?: PedidoComBriefing[]; digitalConferidoEm?: string; digitalBancoEm?: string; digitalAcertoSemana?: string; digitalContatos?: ContatosDigital; pluggy?: { itens?: { id: string }[] } }

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
  const restantes = (cfg.pedidosDigitais ?? []).filter(p => p.restante && !p.restantePagoEm && p.status !== "cancelado" && p.arteAprovadaEm)
  if (!pendentes.length && !restantes.length) return { pagos: [], pendentes: 0 }
  const desdeUltima = cfg.digitalConferidoEm ? agora - new Date(cfg.digitalConferidoEm).getTime() : Infinity
  if (desdeUltima < (opts.forcar ? 60_000 : 5 * 60_000)) return { pagos: [], pendentes: pendentes.length, motivo: "conferido agora há pouco" }
  const bancoHa = cfg.digitalBancoEm ? agora - new Date(cfg.digitalBancoEm).getTime() : Infinity
  await gravarCfg(() => ({ digitalConferidoEm: new Date().toISOString(), ...(bancoHa > 20 * 60_000 ? { digitalBancoEm: new Date().toISOString() } : {}) } as Partial<CfgAgente>))

  if (pluggyConfigurada()) {
    // A Pluggy busca no banco em segundo plano: o Pix aparece numa das próximas conferências
    if (bancoHa > 20 * 60_000) for (const it of cfg.pluggy?.itens ?? []) await atualizarItem(it.id).catch(() => null)
    await sincronizar().catch(() => null)
  }
  const menorDia = [...pendentes.map(p => p.em.slice(0, 10)), ...restantes.map(p => p.arteAprovadaEm!.slice(0, 10))].sort()[0]
  const { data: extrato } = await supabase.from("banco_transacoes").select("id, data, valor, tipo, contraparte_nome").eq("tipo", "entrada").gte("data", menorDia).limit(2000)
  const usadas = new Set(((cfg.pedidosDigitais ?? []) as PedidoComBriefing[]).flatMap(p => [p.pagamento?.txId, p.pagamentoFinal?.txId]).filter(Boolean) as string[])
  const achados = sinaisPagos(pendentes, (extrato ?? []) as EntradaBanco[], usadas)

  const pagos: string[] = []
  for (const { id, tx } of achados) {
    const p = await gravarPedido(id, x => x.status !== "aguardando_sinal" ? null
      : { ...x, status: "sinal_pago", sinalPagoEm: new Date().toISOString(), pagamento: { txId: tx.id, valor: tx.valor, data: tx.data, nome: tx.contraparte_nome ?? null } })
    if (!p) continue
    pagos.push(id)
    const c = await conversa(p.jid)
    if (c) await enviar(c, textoSinalPago(p, linkPedido(p.id), !!(p.briefing?.marca || p.briefing?.arquivos?.length))).catch(() => null)
    const designer = await avisarDesigner(cfg, p)
    await avisarVoce(cfg, `💰 *Digital ${p.id}* · sinal pago ${brl(p.sinal)}\n${p.nome ?? ""} · ${p.quantidade.toLocaleString("pt-BR")} caixinhas · total ${brl(p.total)}${designer ? "" : "\n\nSem designer cadastrada: cadastre em Digital → Contatos, ou mande o briefing pelo link:\n" + linkDesigner(p.id)}`)
  }
  for (const { id, tx } of restantesPagos(restantes, (extrato ?? []) as EntradaBanco[], new Set([...usadas, ...achados.map(a => a.tx.id)]))) {
    const p = await gravarPedido(id, x => x.restantePagoEm ? null : { ...x, restantePagoEm: new Date().toISOString(), pagamentoFinal: { txId: tx.id, valor: tx.valor, data: tx.data, nome: tx.contraparte_nome ?? null } })
    if (!p) continue
    pagos.push(id)
    const c = await conversa(p.jid)
    if (c) await enviar(c, textoRestantePago(p)).catch(() => null)
    await avisarVoce(cfg, `💰 *Digital ${p.id}* · restante pago ${brl(p.restante ?? 0)}\n${p.nome ?? ""}${p.entrega ? `\nEntrega: ${p.entrega.endereco} · CEP ${p.entrega.cep}` : "\nSem endereço de entrega ainda"}`)
  }
  return { pagos, pendentes: pendentes.length + restantes.length - pagos.length }
}

// ── Arte, Villa e acerto ─────────────────────────────────────────────────────
const soDigitos = (n?: string) => (n ?? "").replace(/\D/g, "")
async function paraNumero(numero: string, texto: string, arquivo?: { url: string; mime: string; nome: string }) {
  if (arquivo) {
    const mediatype = arquivo.mime.startsWith("image/") ? "image" : "document"
    const r = await evo("/message/sendMedia/{i}", { method: "POST", body: JSON.stringify({ number: numero, mediatype, mimetype: arquivo.mime, media: arquivo.url, caption: texto, fileName: mediatype === "document" ? arquivo.nome : undefined }) }).catch(() => null)
    return !!r?.ok
  }
  const r = await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: numero, text: texto }) }).catch(() => null)
  return !!r?.ok
}
const mimeDe = (url: string) => /\.pdf($|\?)/i.test(url) ? "application/pdf" : /\.png($|\?)/i.test(url) ? "image/png" : /\.webp($|\?)/i.test(url) ? "image/webp" : "image/jpeg"

// Briefing para a designer (sinal pago ou ajuste pedido). Devolve false se não há designer cadastrada.
export async function avisarDesigner(cfg: CfgDigital, p: PedidoComBriefing) {
  const num = soDigitos(cfg.digitalContatos?.designer)
  if (!num) return false
  const ok = await paraNumero(num, textoParaDesigner(p, linkDesigner(p.id)))
  if (ok) await gravarPedido(p.id, x => ({ ...x, designerAvisadoEm: new Date().toISOString() }))
  return ok
}

// Arte nova (designer pela página, ou você pelo painel): só guarda; mandar ao cliente é outro passo
export async function guardarArte(id: string, file: File) {
  const path = `digital/${id}/arte-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60)}`
  const { error } = await supabase.storage.from("pedido-arquivos").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })
  if (error) return { erro: "Não consegui guardar a arte. Tente de novo." }
  const { data: { publicUrl } } = supabase.storage.from("pedido-arquivos").getPublicUrl(path)
  const novo = await gravarPedido(id, p => novaArte(p, { url: publicUrl, nome: file.name.slice(0, 120), em: new Date().toISOString() }) as PedidoComBriefing | null)
  return novo ? { pedido: novo } : { erro: "Esse pedido não está na fase de arte." }
}

// Manda a arte para o cliente aprovar (imagem com o link da página)
export async function mandarArte(id: string) {
  const { pedido, cfg } = await lerPedido(id)
  const a = pedido && arteAtual(pedido)
  if (!pedido || !a) return { erro: "Ainda não tem arte neste pedido." }
  const c = await conversa(pedido.jid)
  if (!c) return { erro: "Não achei a conversa do cliente." }
  const r = await enviarArquivo(c, a.url, mimeDe(a.url), textoArteParaAprovar(pedido, linkPedido(id)), a.nome)
  if (r.erro) return { erro: `WhatsApp: ${r.erro}` }
  const novo = await gravarPedido(id, p => marcarArteEnviada(p) as PedidoComBriefing | null)
  await avisarVoce(cfg, `🎨 *Digital ${id}* · arte enviada para ${pedido.nome ?? "o cliente"} aprovar`)
  return { pedido: novo }
}

// Cliente aprovou na página: produção, Villa e você avisados
export async function aprovarPeloCliente(id: string) {
  const novo = await gravarPedido(id, (p, todos) => aprovarArte(p, todos) as PedidoComBriefing | null)
  if (!novo) return { erro: "Essa arte não está esperando aprovação." }
  const { cfg } = await lerPedido(id)
  const c = await conversa(novo.jid)
  if (c) await enviar(c, textoArteAprovada(novo, linkPedido(id))).catch(() => null)
  await mandarParaVilla(cfg, novo)
  return { pedido: novo }
}
export async function mandarParaVilla(cfg: CfgDigital, p: PedidoComBriefing) {
  const a = arteAtual(p)
  const texto = textoParaVilla(p, a?.url ?? null)
  const villa = soDigitos(cfg.digitalContatos?.villa)
  const ok = villa ? await paraNumero(villa, texto, a ? { url: a.url, mime: mimeDe(a.url), nome: a.nome } : undefined) : false
  if (ok) await gravarPedido(p.id, x => ({ ...x, villaEnviadoEm: new Date().toISOString() }))
  await avisarVoce(cfg, ok
    ? `✅ *Digital ${p.id}* · arte aprovada e enviada para a Villa\n${p.nome ?? ""} · restante ${brl(p.restante ?? 0)}`
    : `✅ *Digital ${p.id}* · arte aprovada. Sem o número da Villa cadastrado (Digital → Contatos): encaminhe ao Leandro:\n\n${texto}`)
}

export async function ajustePeloCliente(id: string, texto: string) {
  const novo = await gravarPedido(id, p => pedirAjuste(p, texto) as PedidoComBriefing | null)
  if (!novo) return { erro: "Escreva o que quer mudar." }
  const { cfg } = await lerPedido(id)
  const designer = await avisarDesigner(cfg, novo)
  await avisarVoce(cfg, `✏️ *Digital ${id}* · ${novo.nome ?? "cliente"} pediu ajuste na arte:\n${texto.slice(0, 400)}${designer ? "\n(a designer já recebeu)" : ""}`)
  return { pedido: novo }
}

// Segunda-feira de manhã: o que foi para a Villa e falta acertar (uma vez por semana)
export async function talvezAcertoSemanal() {
  const agora = new Date()
  const sp = new Date(agora.getTime() - 3 * 3_600_000)
  if (sp.getUTCDay() !== 1 || sp.getUTCHours() < 9) return
  const cfg = await lerDados()
  const semana = semanaDe(sp)
  if (cfg.digitalAcertoSemana === semana) return
  await gravarCfg(() => ({ digitalAcertoSemana: semana } as Partial<CfgAgente>))
  const { itens, total } = acertoDaSemana(cfg.pedidosDigitais ?? [])
  if (itens.length) await avisarVoce(cfg, textoAcerto(itens, total))
}
