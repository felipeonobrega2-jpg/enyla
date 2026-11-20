// Caixa de entrada montada no servidor (para o resumo no WhatsApp às 8h, 13h e 18h e para o assistente): os mesmos
// itens e as mesmas chaves do Painel, então o que o Felipe marcou como resolvido ou adiou não aparece.
import { supabase } from "./supabase"
import { ordenar, type ItemResumo } from "./caixaEntrada"

async function todas<T>(tabela: string, sel = "*"): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; ; i += 1000) { const { data } = await supabase.from(tabela).select(sel).range(i, i + 999); out.push(...((data ?? []) as T[])); if (!data || data.length < 1000) break }
  return out
}
const haQuanto = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000); return m < 60 ? `há ${Math.max(1, m)} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d` }

export async function ocultosDaCaixa(): Promise<Record<string, string>> {
  const { data } = await supabase.from("agente_tratadas").select("id").gte("id", "caixa|").lt("id", "caixa}").limit(3000)
  const o: Record<string, string> = {}
  for (const { id } of data ?? []) { const [, ate, ...r] = (id as string).split("|"); o[decodeURIComponent(r.join("|"))] = ate }
  return o
}

export async function montarCaixaServidor() {
  const { montarHoje } = await import("./hojeServidor")
  const { pendencias } = await import("./pendencias")
  const { montarPedidos } = await import("./negocio")
  const { unpackTerceirizado } = await import("./kanbanUnpack")
  const { CONFIG_PADRAO } = await import("../config")
  const [hoje, kanbanBruto, lancamentos, historico, propostasCustom, clientes, cfgRow, ocultos] = await Promise.all([
    montarHoje(), todas<import("../types").KanbanCard>("KanbanCard"), todas<import("../types").LancamentoFinanceiro>("LancamentoFinanceiro"),
    todas<{ form: import("../types").FormData; numero?: string }>("HistoricoItem", "numero, form"), todas<import("../types").PropostaCustom>("PropostaCustom"),
    todas<import("../types").Cliente>("Cliente"), supabase.from("AppConfig").select("data").eq("id", 1).single(), ocultosDaCaixa(),
  ])
  const cfg = { ...CONFIG_PADRAO, ...((cfgRow.data?.data ?? {}) as object) } as import("../config").Configuracoes & {
    propostasProntas?: { id: string; nome: string | null; quantidade: number; preco: number; status: string }[]
    pedidosDigitais?: { id: string; nome: string | null; quantidade: number; total: number; status: string; negociacao?: { status: string; em: string; pedidoTotal: number | null } | null }[]
  }
  const kanban = kanbanBruto.map(unpackTerceirizado)
  const pend = pendencias({ pedidos: montarPedidos(kanban, lancamentos), kanban, lancamentos, historico, propostasCustom, clientes, config: cfg })
  const numerosPend = new Set(pend.map(x => (x as { card?: { numero?: string } }).card?.numero).filter(Boolean))
  const nivel = (t: string) => t === "perigo" ? "perigo" as const : t === "alerta" ? "alerta" as const : t === "sucesso" ? "sucesso" as const : "info" as const
  const itens: ItemResumo[] = []
  for (const a of hoje.gastos?.alertas ?? []) itens.push({ chave: `gasto:${a.tipo}:${a.nivel}`, tipo: "sistema", nivel: a.nivel, titulo: a.tipo === "ia" ? "Saldo da IA" : "Saldo dos anúncios da Meta", sub: a.texto })
  for (const x of hoje.resolver ?? []) {
    if (x.tipo === "digital" || (x.numero && numerosPend.has(x.numero))) continue
    const [nome, numero] = x.titulo.split(" · ")
    itens.push({ chave: `r:${x.tipo}:${x.numero ?? x.jid ?? x.titulo}:${x.desde ?? ""}`, tipo: x.tipo, nivel: nivel(x.nivel), titulo: nome, sub: [numero, x.detalhe].filter(Boolean).join(" · "), valor: x.valor })
  }
  for (const x of hoje.orcar ?? []) itens.push({ chave: `orcar:${x.jid}:${x.desde}`, tipo: "orcar", nivel: "alerta", titulo: x.nome || x.jid.split("@")[0], sub: `esperando o seu orçamento ${haQuanto(x.desde)}` })
  // MQL ainda faltando dado é da IA (checklist antes de passar para o Felipe): só entra quem não tem falta
  for (const x of (hoje.meta?.travados ?? []).filter(x => !x.falta?.length)) itens.push({ chave: `travado:${x.jid}:${x.desde}`, tipo: "travado", nivel: "info", titulo: x.nome || x.jid.split("@")[0], sub: `MQL sem orçamento${x.falta?.length ? `, falta ${x.falta.join(", ")}` : ""}` })
  for (const x of hoje.responder) itens.push({ chave: `responder:${x.jid}:${x.desde}`, tipo: "responder", nivel: "info", titulo: x.nome || x.jid.split("@")[0], sub: `${x.rotulo} esperando ${haQuanto(x.desde)}` })
  for (const x of hoje.retomar ?? []) itens.push({ chave: `retomar:${x.jid}:${x.desde}`, tipo: "retomar", nivel: "info", titulo: x.nome || x.jid.split("@")[0], sub: x.nota ? `lembrete: ${x.nota}` : `sem resposta ${haQuanto(x.desde)}` })
  for (const p of (cfg.propostasProntas ?? []).filter(p => p.status === "aguardando")) itens.push({ chave: `prop:${p.id}`, tipo: "propostaPronta", nivel: "alerta", titulo: `Proposta pronta · ${p.nome ?? "cliente"}`, sub: `${p.quantidade.toLocaleString("pt-BR")} un, falta aprovar e enviar`, valor: p.preco })
  for (const p of (cfg.pedidosDigitais ?? []).filter(p => p.status === "aguardando_sinal" && p.negociacao?.status === "aguardando")) itens.push({ chave: `neg:${p.id}:${p.negociacao?.em ?? ""}`, tipo: "negociacao", nivel: "alerta", titulo: `Negociação no digital · ${p.nome ?? "cliente"}`, sub: p.negociacao?.pedidoTotal ? `pediu ${p.negociacao.pedidoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : "pediu desconto", valor: p.negociacao?.pedidoTotal ?? p.total })
  for (const x of pend) itens.push({ chave: `p:${x.id}`, tipo: x.tipo, nivel: nivel(x.tom), titulo: x.titulo, sub: x.sub, valor: x.valor ?? null })
  return ordenar(itens, ocultos)
}
