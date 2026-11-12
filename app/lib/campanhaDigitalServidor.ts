// Campanha digital (servidor): monta a fila, manda um de cada vez (pegando carona no webhook, como as outras rodadas)
// e conta o resultado. Estado em AppConfig.campanhaDigital (campo do servidor).
import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { enviar, aplicar, registrar, lerConversa, seuNumero, Conversa } from "./agenteAuto"
import { dentroDoHorario, ETIQUETAS_AGENTE } from "./agenteLeads"
import { cotarDigital, montarPedido, PedidoDigital } from "./digital"
import { linkPedido } from "./digitalLink"
import type { RegraDigital } from "./precoDigital"
import type { DadosPedido } from "./atendente"
import {
  EstadoCampanha, ConvCampanha, Candidato, candidato, ordenar, podeEnviar, proximoIntervalo, textoComOrcamento, textoPergunta, enviadosHoje, POR_DIA_PADRAO,
} from "./campanhaDigital"

type Cfg = Record<string, unknown> & {
  campanhaDigital?: EstadoCampanha; pedidosDigitais?: PedidoDigital[]; digital?: RegraDigital
  agenteLog?: { jid: string; perfil?: string }[]; vinculosWhatsapp?: Record<string, string>
  agenteAuto?: { ligado?: boolean; horario?: Parameters<typeof dentroDoHorario>[0] }
}

async function lerCfg() {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  return (data?.data ?? {}) as Cfg
}

const dadosDe = (proxima: string | null): DadosPedido | null => {
  try { return (JSON.parse(proxima ?? "null")?.r?.dados ?? null) as DadosPedido | null } catch { return null }
}

export async function fila(cfg?: Cfg): Promise<Candidato[]> {
  const c = cfg ?? await lerCfg()
  const e = c.campanhaDigital ?? {}
  const fora = new Set([
    ...(c.pedidosDigitais ?? []).map(p => p.jid),            // já recebeu orçamento digital
    ...Object.keys(e.enviados ?? {}), ...(e.pulados ?? []),
    ...Object.entries(c.vinculosWhatsapp ?? {}).filter(([, v]) => v).map(([j]) => j),   // ligado a um cliente
  ])
  // O seu próprio número nunca entra
  const meu = await seuNumero().catch(() => null)
  if (meu) fora.add(`${meu}@s.whatsapp.net`)
  const perfil = new Map<string, string>()
  for (const l of [...(c.agenteLog ?? [])].reverse()) if (l.perfil && l.perfil !== "indefinido") perfil.set(l.jid, l.perfil)
  const out: Candidato[] = []
  for (let de = 0; de < 20000; de += 1000) {
    const { data } = await supabase.from("whatsapp_conversas").select("jid, nome, etiquetas, status_lead, ultima_at, proxima_acao").range(de, de + 999)
    if (!data?.length) break
    for (const x of data) {
      if (fora.has(x.jid)) continue
      const conv: ConvCampanha = { jid: x.jid, nome: x.nome, etiquetas: x.etiquetas, status_lead: x.status_lead, ultima_at: x.ultima_at, dados: dadosDe(x.proxima_acao) }
      const cand = candidato(conv, perfil.get(x.jid) ?? null)
      if (cand) out.push(cand)
    }
    if (data.length < 1000) break
  }
  return ordenar(out)
}

// Uma rodada: se é hora, manda para o primeiro da fila
export async function talvezCampanhaDigital() {
  const cfg = await lerCfg()
  const e = cfg.campanhaDigital ?? {}
  if (!podeEnviar(e).ok || !cfg.agenteAuto?.ligado || !dentroDoHorario(cfg.agenteAuto?.horario)) return
  // Reserva a vez (duas rodadas ao mesmo tempo: só uma passa)
  let minha = false
  await mudarConfig((d: Cfg) => {
    const x = d.campanhaDigital ?? {}
    if (!podeEnviar(x).ok) return null
    minha = true
    return { campanhaDigital: { ...x, proximaEm: proximoIntervalo() } }
  })
  if (!minha) return
  const [alvo] = await fila(cfg)
  if (!alvo) return
  await enviarPara(alvo, cfg)
}

async function enviarPara(alvo: Candidato, cfg: Cfg) {
  const conv = await lerConversa(alvo.jid) as Conversa | null
  if (!conv) return
  let pedido: PedidoDigital | null = null
  let texto = textoPergunta(alvo.nome, alvo.dados)
  if (alvo.cotavel && alvo.dados) {
    const cot = cotarDigital(alvo.dados, cfg.digital)
    if (cot.ok) {
      pedido = montarPedido(cfg.pedidosDigitais ?? [], alvo.jid, alvo.nome, alvo.dados, cot)
      texto = textoComOrcamento(alvo.nome, alvo.dados, pedido, linkPedido(pedido.id))
    }
  }
  const env = await enviar(conv, texto, undefined, { proativo: true })
  const base = { em: new Date().toISOString(), jid: alvo.jid, nome: alvo.nome, perfil: "pequeno" as const, texto, passo: "Campanha digital" }
  if (!env.ids.length) {
    // Não saiu (limite, conexão): tenta de novo na próxima vez, sem marcar
    await registrar({ ...base, enviou: false, motivo: `Campanha digital: ${env.erro ?? "não enviou"}` })
    return
  }
  const p = pedido
  await mudarConfig((d: Cfg) => ({
    campanhaDigital: { ...(d.campanhaDigital ?? {}), enviados: { ...(d.campanhaDigital?.enviados ?? {}), [alvo.jid]: { em: new Date().toISOString(), tipo: p ? "orcamento" as const : "pergunta" as const, ...(p ? { pedido: p.id } : {}) } } },
    ...(p ? { pedidosDigitais: [p, ...(d.pedidosDigitais ?? [])].slice(0, 500) } : {}),
  }))
  // Etiqueta Digital (o agente atende quando responder); sai de Descartado
  await aplicar(conv, [...(conv.etiquetas ?? []).filter(x => x !== ETIQUETAS_AGENTE.descartado), ETIQUETAS_AGENTE.digital].filter((x, i, a) => a.indexOf(x) === i), null).catch(() => null)
  await registrar({ ...base, enviou: true, ids: env.ids, motivo: p ? `Campanha digital: orçamento ${p.id}` : "Campanha digital: oferta (pergunta o que falta)" })
}

// Painel: fila, estado e placar (enviados → responderam → receberam orçamento → pagaram)
export async function painel() {
  const cfg = await lerCfg()
  const e = cfg.campanhaDigital ?? {}
  const f = await fila(cfg)
  const env = Object.entries(e.enviados ?? {})
  let responderam = 0
  if (env.length) {
    const { data } = await supabase.from("whatsapp_conversas").select("jid, ultima_recebida_at").in("jid", env.map(([j]) => j))
    const rec = new Map((data ?? []).map(x => [x.jid, x.ultima_recebida_at as string | null]))
    responderam = env.filter(([j, x]) => { const r = rec.get(j); return !!r && new Date(r) > new Date(x.em) }).length
  }
  const pedidos = (cfg.pedidosDigitais ?? []).filter(p => e.enviados?.[p.jid] && new Date(p.em) >= new Date(e.enviados[p.jid].em))
  const pagos = pedidos.filter(p => p.sinalPagoEm && !p.teste)
  return {
    ligada: !!e.ligada, porDia: e.porDia ?? POR_DIA_PADRAO, hoje: enviadosHoje(e), proximaEm: e.proximaEm ?? null,
    agenteLigado: !!cfg.agenteAuto?.ligado,
    fila: f.slice(0, 40).map(c => ({ jid: c.jid, nome: c.nome, motivo: c.motivo, cotavel: c.cotavel, ultima: c.ultima_at })),
    naFila: f.length, cotaveis: f.filter(c => c.cotavel).length,
    placar: { enviados: env.length, responderam, comOrcamento: new Set(pedidos.map(p => p.jid)).size, pagaram: new Set(pagos.map(p => p.jid)).size, faturado: pagos.reduce((s, p) => s + p.total, 0) },
  }
}

export async function mudar(b: { ligada?: boolean; porDia?: number; pular?: string }) {
  await mudarConfig((d: Cfg) => {
    const x = { ...(d.campanhaDigital ?? {}) }
    if (typeof b.ligada === "boolean") x.ligada = b.ligada
    if (typeof b.porDia === "number" && b.porDia >= 1 && b.porDia <= 40) x.porDia = Math.round(b.porDia)
    if (b.pular) x.pulados = [...new Set([...(x.pulados ?? []), b.pular])]
    return { campanhaDigital: x }
  })
}
