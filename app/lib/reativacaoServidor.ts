// Reativação no servidor: monta a fila dos bons negócios parados, pede a retomada à IA e envia como você
// (lendo, "digitando…", etiqueta Reativação). Sozinha: no máximo N por dia, uma de cada vez, espaçadas.

import { supabase } from "./supabase"
import { atender } from "./atendenteServidor"
import { lerCfg, gravarCfg, registrar, lerConversa, aplicar, enviar, CfgAgente } from "./agenteAuto"
import { valoresEmReais, filtroEfetivo, PerfilLead } from "./agenteLeads"
import {
  ETIQUETA_REATIVACAO, POR_DIA_PADRAO, MINUTOS_ENTRE_ENVIOS, DIAS_MAXIMO, DIAS_ORCAMENTO_SEM_RESPOSTA, DIAS_ORCAMENTO_ABERTO, HistoricoCliente,
  motivoReativacao, tentouHaPouco, horarioDeReativacao, travaDaReativacao,
} from "./reativacao"
import { clienteDaConversa, ligacaoForte } from "./vinculoWhatsapp"
import { nomeChave, parseData } from "./negocio"
import { COL_FECHADO, COL_ENTREGUE, COL_HOT } from "../types"

export type CfgReativacao = {
  reativacaoAuto?: { ligado: boolean; porDia?: number }
  reativacaoPulados?: Record<string, string>      // jid → quando você pulou
  reativacaoProximaEm?: string                     // modo sozinho: a próxima não sai antes disso
}
type Cfg = Awaited<ReturnType<typeof lerCfg>> & CfgReativacao

export type Candidato = {
  jid: string
  nome: string | null
  motivo: string
  paradoDias: number
  ultimaMsg: string | null
  ultimaDeQuem: "voce" | "cliente" | null
  prioridade: number                     // 0 = ICP, depois oportunidade, médio, MQL
}

const PERFIL: Record<string, PerfilLead> = { "Orçamento sem resposta": "icp", ICP: "icp", Oportunidade: "oportunidade", "Lead médio": "medio", MQL: "icp", "Cliente que já comprou": "icp", "Orçamento perdido 5 mil+": "icp", "Orçamento perdido": "medio" }

// Kanban por cliente: comprou (fechado → entregue), em produção agora, maior quantidade orçada
async function historicos(): Promise<{ nomes: string[]; porCliente: Map<string, HistoricoCliente> }> {
  const { data: cards } = await supabase.from("KanbanCard").select("nomeCliente, coluna, quantidade, numero, data")
  const porCliente = new Map<string, HistoricoCliente>()
  for (const c of cards ?? []) {
    if (!c.nomeCliente) continue
    const k = nomeChave(c.nomeCliente)
    const h = porCliente.get(k) ?? { comprou: false, emAndamento: false, maiorOrcamento: 0 }
    if (c.coluna >= COL_FECHADO && c.coluna <= COL_ENTREGUE) h.comprou = true
    if (c.coluna >= COL_FECHADO && c.coluna < COL_ENTREGUE) h.emAndamento = true
    h.maiorOrcamento = Math.max(h.maiorOrcamento, Number(c.quantidade) || 0)
    const quando = parseData(c.data)
    const dias = quando ? Math.floor((Date.now() - quando.getTime()) / 86_400_000) : null
    if ((c.coluna === 0 || c.coluna === COL_HOT) && dias != null && dias <= DIAS_ORCAMENTO_ABERTO && (!h.orcamentoAberto || dias < h.orcamentoAberto.dias))
      h.orcamentoAberto = { numero: c.numero ?? "", dias }
    porCliente.set(k, h)
  }
  return { nomes: [...new Set((cards ?? []).map(c => c.nomeCliente).filter(Boolean))] as string[], porCliente }
}

export async function candidatos(cfg?: Cfg): Promise<Candidato[]> {
  cfg ??= await lerCfg() as Cfg
  const desde = new Date(Date.now() - DIAS_MAXIMO * 86_400_000).toISOString()
  // Orçamento sem resposta entra com 2 dias; os outros motivos pedem 10 (motivoReativacao decide)
  const ate = new Date(Date.now() - DIAS_ORCAMENTO_SEM_RESPOSTA * 86_400_000).toISOString()
  const [{ data }, { nomes, porCliente }] = await Promise.all([
    supabase.from("whatsapp_conversas")
      .select("jid, nome, telefone, status_lead, etiquetas, ultima_msg, ultima_recebida_at, ultima_enviada_at")
      .not("jid", "like", "%@g.us").gte("ultima_at", desde).lte("ultima_at", ate),
    historicos(),
  ])
  const ultimaRetomada = new Map<string, string>()
  for (const [jid, m] of Object.entries(cfg.agenteMarcos ?? {})) if (m.passos?.["Reativação"]) ultimaRetomada.set(jid, m.passos["Reativação"])
  for (const l of cfg.agenteLog ?? []) if (l.passo === "Reativação" && l.enviou && !ultimaRetomada.has(l.jid)) ultimaRetomada.set(l.jid, l.em)
  const out: Candidato[] = []
  for (const c of data ?? []) {
    // Cliente só com ligação segura (nome completo, manual): primeiro nome igual não conta
    const cli = clienteDaConversa(c, nomes, cfg.vinculosWhatsapp)
    const hist = cli && ligacaoForte(c, cli) ? porCliente.get(nomeChave(cli.nome)) ?? null : null
    const m = motivoReativacao(c, Date.now(), hist)
    if (!m || tentouHaPouco(ultimaRetomada.get(c.jid)) || tentouHaPouco(cfg.reativacaoPulados?.[c.jid])) continue
    const deQuem = !c.ultima_recebida_at && !c.ultima_enviada_at ? null : (c.ultima_enviada_at ?? "") >= (c.ultima_recebida_at ?? "") ? "voce" : "cliente"
    out.push({ jid: c.jid, nome: c.nome || cli?.nome || null, motivo: m.motivo, paradoDias: m.paradoDias, prioridade: m.prioridade, ultimaMsg: c.ultima_msg, ultimaDeQuem: deQuem })
  }
  // Mais perto do dinheiro primeiro; dentro do mesmo motivo, o que parou há menos tempo (mais quente)
  return out.sort((a, b) => a.prioridade - b.prioridade || a.paradoDias - b.paradoDias)
}

// A retomada que a IA escreveria (não envia)
export async function preparar(jid: string, cfg?: Cfg) {
  cfg ??= await lerCfg() as Cfg
  const c = (await candidatos(cfg)).find(x => x.jid === jid)
  const a = await atender(jid, { cfg, automatico: true, reativar: { dias: c?.paradoDias ?? 15, motivo: c?.motivo ?? "MQL" } })
  if (!a.ok) return { ok: false as const, erro: a.erro }
  const trava = travaDaReativacao(a.r, valoresEmReais(filtroEfetivo(cfg.filtroLeads)), valoresEmReais)
  return { ok: true as const, texto: a.r.resposta, trava, motivo: a.r.motivo_alerta || a.r.lead.motivo, perfil: a.r.lead.perfil }
}

// Envia como você e etiqueta; fica no registro do agente como passo "Reativação" (base da taxa de resposta)
export async function enviarRetomada(jid: string, texto: string, quem: "voce" | "agente", perfil?: PerfilLead) {
  const c = await lerConversa(jid)
  if (!c) return { ok: false as const, erro: "Conversa não encontrada." }
  const env = await enviar(c, texto.trim(), undefined, { proativo: true })
  if (env.ids.length) await aplicar(c, [...new Set([...(c.etiquetas ?? []), ETIQUETA_REATIVACAO])], null)
  const p = perfil ?? PERFIL[(c.etiquetas ?? []).find(e => PERFIL[e]) ?? "MQL"] ?? "icp"
  await registrar({ em: new Date().toISOString(), jid, nome: c.nome, perfil: p, enviou: env.ids.length > 0, ids: env.ids, texto, passo: "Reativação",
    motivo: env.erro ?? (quem === "voce" ? "Retomada enviada por você" : "Retomada de bom negócio parado") })
  return env.ids.length ? { ok: true as const } : { ok: false as const, erro: env.erro ?? "Não enviou." }
}

export async function pular(jid: string) {
  await gravarCfg(d => ({ reativacaoPulados: { ...((d as CfgReativacao).reativacaoPulados ?? {}), [jid]: new Date().toISOString() } } as Partial<CfgAgente>))
}

export const enviadasHoje = (cfg: CfgAgente) => {
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
  const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
  return Object.values(cfg.agenteMarcos ?? {}).filter(m => m.passos?.["Reativação"] && dia(m.passos["Reativação"]) === hoje).length
}

// Chamado a cada evento do webhook: no horário, se ligado e se já passou o intervalo, manda UMA retomada
let ultimaLocal = 0
export async function talvezReativar() {
  if (Date.now() - ultimaLocal < 5 * 60_000 || !horarioDeReativacao()) return
  ultimaLocal = Date.now()
  const cfg = await lerCfg() as Cfg
  const auto = cfg.reativacaoAuto
  if (!auto?.ligado || enviadasHoje(cfg) >= (auto.porDia ?? POR_DIA_PADRAO)) return
  if (cfg.reativacaoProximaEm && Date.now() < new Date(cfg.reativacaoProximaEm).getTime()) return
  // Marca a próxima antes de tudo (outra execução ao mesmo tempo não manda em dobro)
  const [min, max] = MINUTOS_ENTRE_ENVIOS
  const proxima = new Date(Date.now() + (min + Math.random() * (max - min)) * 60_000).toISOString()
  await gravarCfg(() => ({ reativacaoProximaEm: proxima } as Partial<CfgAgente>))

  // Tenta até 2 da fila (a IA pode achar que um não vale retomar)
  for (const c of (await candidatos(cfg)).slice(0, 2)) {
    const p = await preparar(c.jid, cfg).catch(e => ({ ok: false as const, erro: String(e) }))
    if (!p.ok) return registrar({ em: new Date().toISOString(), jid: c.jid, nome: c.nome, perfil: PERFIL[c.motivo], enviou: false, texto: "", passo: "Reativação", motivo: `IA falhou: ${p.erro.slice(0, 120)}` })
    if (p.trava) {
      // Não vale retomar: sai da fila por um tempo (como se você tivesse pulado)
      await pular(c.jid)
      await registrar({ em: new Date().toISOString(), jid: c.jid, nome: c.nome, perfil: p.perfil, enviou: false, texto: p.texto, passo: "Reativação segurada", motivo: p.trava })
      continue
    }
    await enviarRetomada(c.jid, p.texto, "agente", PERFIL[c.motivo])
    return
  }
}
