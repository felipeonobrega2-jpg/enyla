// Agente de marketing no servidor: junta Meta (gasto, cliques, conversas) com o sistema (leads, MQL, orçamentos,
// pedidos) por campanha, pede a leitura à IA e guarda. Todo dia de manhã gera o de ontem e manda o resumo no seu WhatsApp.

import { tempoAteFechar } from "./tempoAteFecharServidor"
import { textoParaIA } from "./tempoAteFechar"
import { supabase } from "./supabase"
import { evo } from "./evolution"
import { clienteClaude, FALLBACK, MODELO } from "./claude"
import { licoesNoPrompt, LicoesIA } from "./licoesIA"
import { clienteDaConversa, ligacaoForte, Vinculos } from "./vinculoWhatsapp"
import { nomeChave } from "./negocio"
import { COL_FECHADO, COL_ENTREGUE } from "../types"
import { filtroEfetivo } from "./agenteLeads"
import { montarHoje } from "./hojeServidor"
import { mudarConfig } from "./configAtomica"
import {
  LinhaCampanha, Periodo, Relatorio, SEM_CAMPANHA, campanhaPeloGasto, linhaVazia, qualidadeDoLead, periodos, dentro, diaSP, somarDias,
  numerosParaIA, textoResumoWhatsapp, horaDoRelatorio,
} from "./marketing"

const BASE = "https://graph.facebook.com/v20.0"
const CONVERSA = "onsite_conversion.messaging_conversation_started_7d"
const MAX_RELATORIOS = 30
const ORDEM_RESUMO = ["Retomada", "ICP", "Oportunidade", "Lead médio", "MQL"]

type Cfg = {
  apiKey?: string; metaToken?: string; metaContaId?: string; filtroLeads?: string; vinculosWhatsapp?: Vinculos
  marketingRelatorios?: Relatorio[]; marketingGerandoEm?: string; agenteAuto?: { avisoNumero?: string }; licoesIA?: LicoesIA
}

async function lerCfg() {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  return (data?.data ?? {}) as Record<string, unknown> & Cfg
}
async function gravar(mudar: (d: Record<string, unknown> & Cfg) => Partial<Cfg>) {
  await mudarConfig(d => mudar(d as Record<string, unknown> & Cfg))
}

// Meta: gasto, cliques e conversas por campanha no período
async function daMeta(cfg: Cfg, p: Periodo): Promise<Map<string, LinhaCampanha>> {
  const out = new Map<string, LinhaCampanha>()
  const conta = cfg.metaContaId ?? (process.env.META_AD_ACCOUNT_ID ? (process.env.META_AD_ACCOUNT_ID.startsWith("act_") ? process.env.META_AD_ACCOUNT_ID : `act_${process.env.META_AD_ACCOUNT_ID}`) : null)
  const token = cfg.metaToken ?? process.env.META_ACCESS_TOKEN
  if (!conta || !token) return out
  const q = new URLSearchParams({ level: "campaign", fields: "campaign_id,campaign_name,spend,clicks,impressions,actions", time_range: JSON.stringify({ since: p.de, until: p.ate }), limit: "200", access_token: token })
  const j = await fetch(`${BASE}/${conta}/insights?${q}`).then(r => r.json()).catch(() => null) as { data?: { campaign_id: string; campaign_name: string; spend?: string; clicks?: string; impressions?: string; actions?: { action_type: string; value: string }[] }[]; error?: unknown } | null
  if (!j || j.error) throw new Error("A Meta não respondeu (token vencido ou sem acesso à conta).")
  for (const r of j.data ?? []) {
    const l = linhaVazia(r.campaign_id, r.campaign_name)
    l.gasto = Number(r.spend ?? 0); l.cliques = Number(r.clicks ?? 0); l.impressoes = Number(r.impressions ?? 0)
    l.conversasMeta = Number(r.actions?.find(a => a.action_type === CONVERSA)?.value ?? 0)
    out.set(l.id, l)
  }
  return out
}

type Lead = { jid: string; campanhaId: string; campanhaNome: string; entrada: string; qualidade: ReturnType<typeof qualidadeDoLead>; orcamentos: number; pedidos: number; faturamento: number }

// Leads do anúncio (com a data em que chegaram) e o que aconteceu com cada um: orçamento, pedido
async function leadsDoAnuncio(cfg: Cfg): Promise<Lead[]> {
  const [{ data: convs }, { data: cards }] = await Promise.all([
    supabase.from("whatsapp_conversas").select("jid, nome, criado_em, campanha, status_lead, etiquetas").ilike("campanha", "%anuncio%"),
    supabase.from("KanbanCard").select("nomeCliente, coluna, preco, createdAt"),
  ])
  const nomes = [...new Set((cards ?? []).map(c => c.nomeCliente).filter(Boolean))] as string[]
  const out: Lead[] = []
  for (const c of convs ?? []) {
    let o: { canal?: string; campanhaId?: string; campanhaNome?: string; entrada?: string } = {}
    try { o = JSON.parse(c.campanha) } catch { continue }
    if (o.canal !== "anuncio") continue
    const entrada = o.entrada ?? c.criado_em
    if (!entrada) continue
    // Orçamento e pedido: cliente ligado com segurança, cartões criados depois que o lead chegou
    const cli = clienteDaConversa(c, nomes, cfg.vinculosWhatsapp)
    const doCliente = cli && ligacaoForte(c, cli) ? (cards ?? []).filter(k => nomeChave(k.nomeCliente) === nomeChave(cli.nome) && (!k.createdAt || k.createdAt >= entrada.slice(0, 10))) : []
    const fechados = doCliente.filter(k => k.coluna >= COL_FECHADO && k.coluna <= COL_ENTREGUE)
    out.push({
      jid: c.jid, campanhaId: o.campanhaId ?? SEM_CAMPANHA, campanhaNome: o.campanhaNome ?? "Anúncio (campanha a identificar)", entrada,
      qualidade: qualidadeDoLead(c), orcamentos: doCliente.length, pedidos: fechados.length, faturamento: fechados.reduce((s, k) => s + (Number(k.preco) || 0), 0),
    })
  }
  return out
}

function juntar(meta: Map<string, LinhaCampanha>, leads: Lead[], p: Periodo): LinhaCampanha[] {
  const linhas = new Map([...meta].map(([k, v]) => [k, { ...v }]))
  const unica = campanhaPeloGasto([...meta.values()])
  for (const l of leads.filter(x => dentro(x.entrada, p))) {
    const id = l.campanhaId === SEM_CAMPANHA && unica ? unica : l.campanhaId
    const linha = linhas.get(id) ?? linhaVazia(l.campanhaId, l.campanhaNome)
    if (id !== l.campanhaId) linha.peloGasto = (linha.peloGasto ?? 0) + 1
    linha.leads++
    if (l.qualidade === "mql") linha.mql++
    else if (l.qualidade === "descartado") linha.descartados++
    else if (l.qualidade === "sumiu") linha.sumiram = (linha.sumiram ?? 0) + 1
    else linha.semClassificar++
    if (l.orcamentos) linha.orcamentos++
    if (l.pedidos) linha.pedidos++
    linha.faturamento += l.faturamento
    linhas.set(id, linha)
  }
  return [...linhas.values()].filter(l => l.gasto > 0 || l.leads > 0).sort((a, b) => b.gasto - a.gasto || b.leads - a.leads)
}

const ESQUEMA = {
  type: "object", additionalProperties: false, required: ["resumo", "destaques", "acao"],
  properties: {
    resumo: { type: "string", description: "2 ou 3 frases: como foi o dia e a semana, com os números que importam (custo por MQL antes de custo por lead)." },
    destaques: { type: "array", items: { type: "string" }, description: "Até 4 observações curtas e específicas (campanha que melhorou ou piorou, gargalo no funil)." },
    acao: { type: "string", description: "Uma recomendação prática para hoje (ex.: mudar verba, pausar, testar criativo, cobrar orçamentos). Vazio se não há o que mudar." },
  },
} as const

async function leitura(cfg: Cfg, r: Pick<Relatorio, "dia" | "dia1" | "semana" | "semanaAnterior">) {
  if (!cfg.apiKey) throw new Error("Chave da IA não configurada.")
  const filtro = filtroEfetivo(cfg.filtroLeads)
  // Ciclo de venda real (tempo até fechar): a IA não julga campanha antes de dar tempo de fechar
  const ciclo = await tempoAteFechar().then(textoParaIA).catch(() => "")
  const resp = await clienteClaude(cfg.apiKey).beta.messages.create({
    model: MODELO, max_tokens: 2000, ...FALLBACK,
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
    system: `Você é o analista de marketing do Felipe, de uma gráfica de embalagens (caixinhas de papel cartão, muito para perfumes). Ele anuncia na Meta e os leads chegam pelo WhatsApp. O objetivo do anúncio não é volume de leads: é bom negócio. MQL = lead bom (caixas em volume, 1.000+, ou outros produtos do ramo como frasco e essência). Cerca de 90% dos leads querem poucas caixas e são descartados. Por isso o número que mais importa é o custo por MQL, depois orçamentos e pedidos; custo por lead sozinho engana.

Como ele qualifica os leads (resumo do filtro dele):
<filtro>
${filtro.slice(0, 2500)}
</filtro>

Escreva em português, direto, como um sócio que entende do negócio. Use só os números dados; não invente nada. "Sumiram" não responderam nem aos follow-ups (lead do anúncio que não leu); "ainda conversando" são os que falam mas não disseram o volume. Poucos dias e números pequenos variam muito: não tire conclusão forte de 1 ou 2 leads, e diga quando a amostra é pequena. Pedidos demoram para fechar (o ciclo real vem junto dos números, quando houver): não cobre pedido de lead de ontem nem condene campanha mais nova que o ciclo.${licoesNoPrompt(cfg.licoesIA?.marketing)}`,
    messages: [{ role: "user", content: `${numerosParaIA(r)}${ciclo ? `\n\n${ciclo}` : ""}\n\nEscreva a leitura de marketing do dia.` }],
  })
  const texto = resp.content.flatMap(b => b.type === "text" ? [b.text] : []).join("")
  return JSON.parse(texto) as NonNullable<Relatorio["leitura"]>
}

export async function gerarRelatorio(dia = somarDias(diaSP(new Date()), -1), opts: { comLeitura?: boolean } = {}): Promise<Relatorio> {
  const cfg = await lerCfg()
  const p = periodos(dia)
  const [m1, m7, m7a, leads] = await Promise.all([daMeta(cfg, p.dia1), daMeta(cfg, p.semana), daMeta(cfg, p.semanaAnterior), leadsDoAnuncio(cfg)])
  const base = { dia, dia1: juntar(m1, leads, p.dia1), semana: juntar(m7, leads, p.semana), semanaAnterior: juntar(m7a, leads, p.semanaAnterior) }
  const rel: Relatorio = { ...base, geradoEm: new Date().toISOString(), leitura: null }
  if (opts.comLeitura !== false) {
    try { rel.leitura = await leitura(cfg, base) } catch (e) { rel.erroLeitura = String(e instanceof Error ? e.message : e).slice(0, 200) }
  }
  await gravar(d => ({ marketingRelatorios: [rel, ...(d.marketingRelatorios ?? []).filter(x => x.dia !== dia)].sort((a, b) => b.dia.localeCompare(a.dia)).slice(0, MAX_RELATORIOS) }))
  return rel
}

async function seuNumero() {
  const r = await evo<unknown>(`/instance/fetchInstances?instanceName=${encodeURIComponent(process.env.EVOLUTION_INSTANCE ?? "")}`)
  const lista = (Array.isArray(r.corpo) ? r.corpo : [r.corpo]) as { ownerJid?: string; owner?: string; instance?: { owner?: string; ownerJid?: string } }[]
  const jid = lista.map(i => i?.ownerJid ?? i?.owner ?? i?.instance?.ownerJid ?? i?.instance?.owner).find(Boolean)
  return jid ? jid.split("@")[0].split(":")[0] : null
}

// Chamado a cada evento do webhook: uma vez por dia, de manhã, gera o de ontem e manda o resumo da manhã
// (bons negócios esperando você + marketing)
let ultimaLocal = 0
export async function talvezRelatorio(origem: string) {
  if (Date.now() - ultimaLocal < 15 * 60_000 || !horaDoRelatorio()) return
  ultimaLocal = Date.now()
  const ontem = somarDias(diaSP(new Date()), -1)
  const cfg = await lerCfg()
  if ((cfg.marketingRelatorios ?? []).some(r => r.dia === ontem && r.leitura)) return
  if (cfg.marketingGerandoEm && Date.now() - new Date(cfg.marketingGerandoEm).getTime() < 30 * 60_000) return
  await gravar(() => ({ marketingGerandoEm: new Date().toISOString() }))
  const rel = await gerarRelatorio(ontem)
  const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
  const base = /vercel\.app|localhost/.test(origem) ? "https://app.enyla.com.br" : origem.replace(/\/$/, "")
  // O que pede você hoje vai no topo; se falhar, sai só o marketing
  const hoje = await montarHoje().catch(() => null)
  const dia = hoje ? {
    // No resumo, o maior negócio primeiro: retomada e ICP, oportunidade, lead médio; depois a quantidade
    esperando: hoje.responder.map(x => ({ nome: x.nome, jid: x.jid, rotulo: x.rotulo, quantidade: x.dados?.quantidade }))
      .sort((a, b) => ORDEM_RESUMO.indexOf(a.rotulo) - ORDEM_RESUMO.indexOf(b.rotulo) || (b.quantidade ?? 0) - (a.quantidade ?? 0)),
    orcamentosSemResposta: hoje.reativacao.orcamentosSemResposta ?? 0, retomar: hoje.retomar?.length ?? 0, orcar: (hoje.orcar ?? []).map(x => ({ nome: x.nome, jid: x.jid, quantidade: x.dados?.quantidade })), linkHoje: `${base}/?aba=painel`,
    meta: hoje.meta ? { total: hoje.meta.resumo.total, orcados: hoje.meta.resumo.orcados, noPrazo: hoje.meta.resumo.noPrazo,
      jaDa: hoje.meta.travados.filter(x => x.estado !== "falta").length, travados: hoje.meta.travados.length } : undefined,
  } : undefined
  if (destino) await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text: textoResumoWhatsapp(rel, `${base}/?aba=meta`, dia) }) }).catch(() => null)
}
