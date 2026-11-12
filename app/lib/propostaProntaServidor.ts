// Proposta pronta (servidor): monta e guarda a proposta do lead bom, avisa você no celular, e ao aprovar cria o
// orçamento (ORC), o card, o rastreio e manda a proposta com o link de aprovação no WhatsApp do cliente.
import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { notificar, LINK_SISTEMA } from "./notificar"
import { CONFIG_PADRAO, type Configuracoes } from "../config"
import { calcular } from "../calculos"
import type { DadosPedido } from "./atendente"
import { COL_FECHADO, COL_ENTREGUE, type FormData } from "../types"
import { brl, num } from "../utils"
import {
  PropostaPronta, AjusteProposta, AmostraMarkup, montarProposta, markupAprendido, baseDoHistorico, mudouAProposta, margemDe,
} from "./propostaPronta"

type AjusteGuardado = AjusteProposta & { multiplicadorAprovado?: number }
type Cfg = Record<string, unknown> & { propostasProntas?: PropostaPronta[]; propostasAjustes?: AjusteGuardado[] }

const MAX_GUARDADAS = 200

async function lerTudo() {
  const [{ data: cfgRow }, { data: hist }] = await Promise.all([
    supabase.from("AppConfig").select("data").eq("id", 1).single(),
    supabase.from("HistoricoItem").select("form").order("createdAt", { ascending: false }).limit(60),
  ])
  const cfg = (cfgRow?.data ?? {}) as Cfg
  return { cfg, config: { ...CONFIG_PADRAO, ...cfg } as Configuracoes, historico: (hist ?? []) as { form: Partial<FormData> | null }[] }
}

// Pedidos fechados (colunas Fechado → Entregue) com o orçamento salvo: preço ÷ custo do motor hoje, mesma caixa e quantidade
export async function amostrasDeMarkup(config: Configuracoes): Promise<AmostraMarkup[]> {
  const { data: cards } = await supabase.from("KanbanCard").select("numero, preco, quantidade, coluna, nomeCliente, createdAt")
    .gte("coluna", COL_FECHADO).lte("coluna", COL_ENTREGUE).order("createdAt", { ascending: false }).limit(80)
  const ganhos = (cards ?? []).filter(k => k.preco > 0 && k.quantidade > 0)
  if (!ganhos.length) return []
  const { data: hist } = await supabase.from("HistoricoItem").select("numero, form").in("numero", ganhos.map(k => k.numero))
  const forms = new Map((hist ?? []).map(h => [h.numero, h.form as FormData | null]))
  // Primeiro pedido de cada cliente = o mais antigo dele entre os fechados
  const primeiro = new Map<string, string>()
  for (const k of [...ganhos].reverse()) { const n = (k.nomeCliente ?? "").trim().toLowerCase(); if (!primeiro.has(n)) primeiro.set(n, k.numero) }
  const out: AmostraMarkup[] = []
  for (const k of ganhos.slice(0, 40)) {
    const f = forms.get(k.numero)
    if (!f || f.pecaPlana) continue
    const l = calcular({ ...f, quantidades: [k.quantidade] }, config)?.tabela[0]
    const custo = l ? (f.comFaca ? l.custoTotalComFaca : l.custoTotalSemFaca) : 0
    if (custo > 0) out.push({ quantidade: k.quantidade, razao: k.preco / custo, primeiroDoCliente: primeiro.get((k.nomeCliente ?? "").trim().toLowerCase()) === k.numero })
  }
  return out
}

export async function listarPropostas() {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  return ((data?.data ?? {}) as Cfg).propostasProntas ?? []
}

// Monta (ou atualiza) a proposta de uma conversa. Já enviada para essa conversa nos últimos 7 dias: não refaz.
export async function prepararProposta(jid: string, dados: DadosPedido, nome: string | null): Promise<{ ok: true; proposta: PropostaPronta; nova: boolean } | { ok: false; motivo: string }> {
  const { cfg, config, historico } = await lerTudo()
  const lista = cfg.propostasProntas ?? []
  if (lista.some(p => p.jid === jid && p.status === "enviada" && Date.now() - new Date(p.enviadaEm ?? p.em).getTime() < 7 * 86_400_000))
    return { ok: false, motivo: "já mandou proposta para essa conversa nesta semana" }
  const q = dados.quantidade ?? 0
  const mk = markupAprendido(q, await amostrasDeMarkup(config), cfg.propostasAjustes ?? [], config.multiplicadores.semFaca || 2)
  const m = montarProposta(dados, nome, config, baseDoHistorico(historico), mk.multiplicador)
  if (!m.ok) return m
  const nova: PropostaPronta = {
    id: `PP-${Date.now().toString(36).toUpperCase()}`,
    jid, nome, em: new Date().toISOString(), dados, form: m.form,
    quantidade: m.quantidade, opcoes: m.opcoes, custo: m.custo, preco: m.preco,
    multiplicador: mk.multiplicador, origemMarkup: mk.origem, medidaPadrao: m.medidaPadrao, status: "aguardando",
  }
  const anterior = lista.find(p => p.jid === jid && p.status === "aguardando")
  if (anterior && !mudouAProposta(anterior, nova)) return { ok: true, proposta: anterior, nova: false }
  await mudarConfig((d: Cfg) => ({
    propostasProntas: [nova, ...(d.propostasProntas ?? []).map(p => p.jid === jid && p.status === "aguardando" ? { ...p, status: "descartada" as const, erro: "substituída por uma mais nova" } : p)].slice(0, MAX_GUARDADAS),
  }))
  // Só o mínimo no celular (sem nome nem telefone): o toque abre o sistema, onde você aprova
  await notificar("Proposta pronta para aprovar",
    `${num(nova.quantidade)} caixas · ${brl(nova.preco)} · margem ${Math.round(margemDe(nova) * 100)}%${nova.medidaPadrao ? " · medida pelo ml" : ""}`,
    { prioridade: "alta", link: `${LINK_SISTEMA}/?aba=painel`, tags: ["page_facing_up"] }).catch(() => null)
  return { ok: true, proposta: nova, nova: true }
}

// Número do orçamento reservado no banco (o navegador e o servidor nunca pegam o mesmo)
export async function reservarNumeroOrc(): Promise<string> {
  const ano = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 4)
  for (let i = 0; i < 8; i++) {
    const { data } = await supabase.from("Contador").select("valor").eq("chave", "orc").maybeSingle()
    const atual = Number(data?.valor ?? 0)
    // Pula número que já existe (o contador do navegador pode ter ficado para trás)
    let prox = atual + 1
    for (;;) {
      const { data: ex } = await supabase.from("HistoricoItem").select("numero").eq("numero", `ORC-${ano}-${String(prox).padStart(3, "0")}`).maybeSingle()
      if (!ex) break
      prox++
    }
    const q = data
      ? supabase.from("Contador").update({ valor: prox }).eq("chave", "orc").eq("valor", atual).select("valor")
      : supabase.from("Contador").insert({ chave: "orc", valor: prox }).select("valor")
    const { data: ok, error } = await q
    if (!error && ok && ok.length) return `ORC-${ano}-${String(prox).padStart(3, "0")}`
  }
  throw new Error("não consegui reservar o número do orçamento")
}

// Você salvou o orçamento a partir da proposta (aprovou direto ou ajustou na mesa): fica ligada ao ORC, e o preço
// que você deixou (preço ÷ custo) ensina o markup das próximas
export async function propostaSalva(id: string, numero: string, preco?: number, multiplicador?: number) {
  await mudarConfig((d: Cfg) => {
    const p = (d.propostasProntas ?? []).find(x => x.id === id)
    if (!p || p.status !== "aguardando") return null
    const mult = multiplicador && multiplicador >= 1 && multiplicador <= 6 ? Math.round(multiplicador * 100) / 100 : undefined
    return {
      propostasProntas: (d.propostasProntas ?? []).map(x => x.id === id ? { ...x, status: "enviada" as const, enviadaEm: new Date().toISOString(), numero, precoAprovado: preco } : x),
      propostasAjustes: mult ? [{ em: new Date().toISOString(), quantidade: p.quantidade, sugerido: p.preco, aprovado: preco ?? p.preco, multiplicadorAprovado: mult }, ...(d.propostasAjustes ?? [])].slice(0, 100) : d.propostasAjustes,
    }
  })
}

export async function descartarProposta(id: string) {
  await mudarConfig((d: Cfg) => {
    if (!(d.propostasProntas ?? []).some(p => p.id === id && p.status === "aguardando")) return null
    return { propostasProntas: (d.propostasProntas ?? []).map(p => p.id === id ? { ...p, status: "descartada" as const } : p) }
  })
}

// Lead que já virou MQL mandou mensagem nova: a IA relê a conversa e, se já tem medida e quantidade, monta a proposta.
// No máximo 1 leitura a cada 10 min por conversa; nada se já tem proposta esperando você (recente) ou enviada.
export async function talvezPropostaDoMql(jid: string) {
  const lista = await listarPropostas()
  const dela = lista.filter(p => p.jid === jid)
  if (dela.some(p => p.status === "enviada" && Date.now() - new Date(p.enviadaEm ?? p.em).getTime() < 7 * 86_400_000)) return
  if (dela.some(p => p.status === "aguardando" && Date.now() - new Date(p.em).getTime() < 30 * 60_000)) return
  let minha = false
  await mudarConfig((d: Cfg & { propostaLidaEm?: Record<string, string> }) => {
    const ult = d.propostaLidaEm?.[jid]
    if (ult && Date.now() - new Date(ult).getTime() < 10 * 60_000) return null
    minha = true
    // Guarda só as últimas 200 conversas
    const ent = Object.entries({ ...(d.propostaLidaEm ?? {}), [jid]: new Date().toISOString() }).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 200)
    return { propostaLidaEm: Object.fromEntries(ent) }
  })
  if (!minha) return
  const { atender } = await import("./atendenteServidor")
  const a = await atender(jid, { automatico: true }).catch(() => null)
  if (!a?.ok) return
  if (a.conversa.clienteCadastrado) return   // cliente da casa: o preço é seu, sem rascunho automático
  await prepararProposta(jid, a.r.dados, a.conversa.nome).catch(() => null)
}
