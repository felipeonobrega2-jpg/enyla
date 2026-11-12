// Proposta pronta (servidor): monta e guarda a proposta do lead bom, avisa você no celular, e ao aprovar cria o
// orçamento (ORC), o card, o rastreio e manda a proposta com o link de aprovação no WhatsApp do cliente.
import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { notificar, LINK_SISTEMA } from "./notificar"
import { tokenAprovacao } from "./aprovacao"
import { especificacaoDaProposta } from "./mensagemProposta"
import { CONFIG_PADRAO, type Configuracoes } from "../config"
import { calcular, compactarCalculo } from "../calculos"
import type { DadosPedido } from "./atendente"
import { COL_FECHADO, COL_ENTREGUE, type FormData, type KanbanCard } from "../types"
import { brl, num } from "../utils"
import {
  PropostaPronta, AjusteProposta, AmostraMarkup, montarProposta, markupAprendido, baseDoHistorico, mudouAProposta, ajustarPreco, margemDe,
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

export function textoDaProposta(p: Pick<PropostaPronta, "form" | "opcoes" | "quantidade">, numero: string, link: string) {
  const primeiro = (p.form.nomeCliente ?? "").trim().split(/\s+/)[0]
  const ok = primeiro && /^[A-Za-zÀ-ÿ]{2,}$/.test(primeiro)
  const principal = p.opcoes.find(o => o.quantidade === p.quantidade) ?? p.opcoes[0]
  const outras = p.opcoes.filter(o => o !== principal)
  return [
    `Oi${ok ? `, ${primeiro}` : ""}! Segue a proposta ${numero} da sua embalagem.`,
    `\n${especificacaoDaProposta(p.form as FormData).join("\n")}`,
    `\n${num(principal.quantidade)} unidades · ${brl(principal.preco)} (${brl(principal.unitario)}/un)`,
    outras.length ? outras.map(o => `${num(o.quantidade)} unidades · ${brl(o.preco)} (${brl(o.unitario)}/un)`).join("\n") : null,
    `\nPara ver a caixa em 3D e aprovar: ${link}`,
    `\nQualquer dúvida, é só me chamar.`,
  ].filter(Boolean).join("\n")
}

// Você aprovou (com ou sem ajuste de preço): cria ORC + card + rastreio e manda para o cliente
export async function aprovarProposta(id: string, novoPreco?: number): Promise<{ ok: true; numero: string; enviou: boolean; erro?: string } | { ok: false; erro: string }> {
  // Trava: só uma aprovação por proposta (dois toques não mandam duas vezes)
  let p: PropostaPronta | null = null
  await mudarConfig((d: Cfg) => {
    const x = (d.propostasProntas ?? []).find(y => y.id === id)
    if (!x || x.status !== "aguardando") { p = null; return null }
    p = x
    return { propostasProntas: (d.propostasProntas ?? []).map(y => y.id === id ? { ...y, status: "enviada" as const, enviadaEm: new Date().toISOString() } : y) }
  })
  const prop = p as PropostaPronta | null
  if (!prop) return { ok: false, erro: "Essa proposta já foi aprovada ou descartada." }

  const ajuste = novoPreco && novoPreco > 0 && Math.abs(novoPreco - prop.preco) >= 0.01 ? ajustarPreco(prop, novoPreco) : null
  const form: FormData = { ...prop.form, rota: { ...(prop.form.rota ?? {}), multiplicador: ajuste?.multiplicador ?? prop.multiplicador } }
  try {
    // Recalcula com o markup aprovado: o orçamento salvo fica igual ao que a tela calcularia
    const { config } = await lerTudo()
    const calc = calcular(form, config)
    if (!calc) throw new Error("o motor não conseguiu calcular essa caixa")
    const opcoes = calc.tabela.map(l => ({ quantidade: l.quantidade, preco: Math.round((form.comFaca ? l.precoComFaca : l.precoSemFaca) * 100) / 100, unitario: form.comFaca ? l.unitarioComFaca : l.unitarioSemFaca }))
    const preco = ajuste?.preco ?? (opcoes.find(o => o.quantidade === prop.quantidade)?.preco ?? prop.preco)
    const numero = await reservarNumeroOrc()
    const data = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    const card: Partial<KanbanCard> = {
      id: Date.now().toString(), numero, nomeCliente: form.nomeCliente || prop.nome || "Sem nome",
      dimensoes: `${form.frente}×${form.alturaBox}×${form.lateral}`, materialNome: form.materialNome,
      preco, quantidade: prop.quantidade, data, coluna: 0,
      // Preço ajustado à mão: a opção principal fica com o valor que você aprovou
      opcoes: opcoes.map(o => o.quantidade === prop.quantidade ? { ...o, preco, unitario: preco / o.quantidade } : o),
    }
    const { error: e1 } = await supabase.from("HistoricoItem").insert({ id: crypto.randomUUID(), numero, form, calculo: compactarCalculo(calc), data })
    if (e1) throw new Error(e1.message)
    const { error: e2 } = await supabase.from("KanbanCard").insert({ ...card, motivoPerdido: null })
    if (e2) throw new Error(e2.message)
    await supabase.from("Tracking").upsert({
      numero, nomeCliente: card.nomeCliente, descricao: card.dimensoes, materialNome: card.materialNome, quantidade: card.quantidade, preco,
      colunaAtual: 0, etapas: [{ coluna: 0, nome: "Orçamento criado", dataHora: data, tipo: "criacao" }], criadoEm: data,
    }, { onConflict: "numero" })

    const link = `${LINK_SISTEMA}/aprovar/${encodeURIComponent(numero)}?t=${tokenAprovacao(numero)}`
    const { enviar, lerConversa } = await import("./agenteAuto")
    const conv = await lerConversa(prop.jid)
    const env = conv ? await enviar(conv, textoDaProposta({ ...prop, form, opcoes: card.opcoes! }, numero, link), undefined, { essencial: true }) : { ids: [], erro: "conversa não encontrada" }
    const enviou = env.ids.length > 0
    await mudarConfig((d: Cfg) => ({
      propostasProntas: (d.propostasProntas ?? []).map(y => y.id === id ? { ...y, numero, precoAprovado: preco, opcoes: card.opcoes!, erro: enviou ? undefined : `ORC criado, mas a mensagem não saiu: ${env.erro ?? "erro"}` } : y),
      propostasAjustes: [{ em: new Date().toISOString(), quantidade: prop.quantidade, sugerido: prop.preco, aprovado: preco, multiplicadorAprovado: form.rota?.multiplicador ?? prop.multiplicador }, ...(d.propostasAjustes ?? [])].slice(0, 100),
    }))
    return { ok: true, numero, enviou, erro: enviou ? undefined : env.erro }
  } catch (e) {
    // Não criou: volta para aguardando (você tenta de novo)
    await mudarConfig((d: Cfg) => ({ propostasProntas: (d.propostasProntas ?? []).map(y => y.id === id ? { ...y, status: "aguardando" as const, enviadaEm: undefined, erro: String(e).slice(0, 200) } : y) }))
    return { ok: false, erro: `Não consegui criar o orçamento: ${String(e).slice(0, 160)}` }
  }
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
