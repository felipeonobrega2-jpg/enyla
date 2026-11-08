// Painel de chapas no servidor: lê os pedidos pagos do site da Caixaria (tabela caixaria_pedidos, mesmo Supabase),
// coloca os itens novos nas chapas (AppConfig.caixariaChapas) e aplica as ações do painel.

import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { alocar, vagos, type Chapa, type ItemPago, type TipoLugar } from "./chapas"

type Dados = Record<string, unknown> & { caixariaChapas?: Chapa[] }

type PedidoSite = {
  id: string; numero: string; status: string; forma: string; atualizado_em: string; criado_em: string
  cliente: { nome: string; telefone: string }
  itens: { slug: string; nome: string; qtd: number; marca?: string; total: number; cartao?: number; chapa?: ItemPago["chapa"] }[]
  mp_pagamentos: { status: string; em: string }[]
}

async function itensPagos(): Promise<ItemPago[]> {
  const { data, error } = await supabase.from("caixaria_pedidos")
    .select("id, numero, status, forma, atualizado_em, criado_em, cliente, itens, mp_pagamentos")
    .in("status", ["pago", "sinal_pago"])
    .order("criado_em", { ascending: true })
    .limit(1000)
  if (error) throw new Error("caixaria_pedidos: " + error.message)
  return ((data ?? []) as PedidoSite[]).flatMap(p => {
    const aprovado = (p.mp_pagamentos ?? []).filter(x => x.status === "approved").map(x => x.em).sort()[0]
    return (p.itens ?? []).map((i, idx) => ({
      pedidoId: p.id, pedido: p.numero, itemIdx: idx, pagoEm: aprovado ?? p.atualizado_em,
      cliente: p.cliente?.nome ?? "", telefone: p.cliente?.telefone ?? "",
      slug: i.slug, nome: i.nome, qtd: i.qtd, marca: i.marca, total: i.total, cartao: i.cartao, forma: p.forma, chapa: i.chapa,
    }))
  })
}

// Lê as chapas e encaixa o que foi pago desde a última vez
export async function chapasAtualizadas(): Promise<{ chapas: Chapa[]; semDados: number }> {
  const itens = await itensPagos()
  const semDados = itens.filter(i => !i.chapa).length   // pedidos antigos, de antes do painel
  let chapas: Chapa[] = []
  await mudarConfig<Dados>(d => {
    const r = alocar(d.caixariaChapas ?? [], itens)
    chapas = r.chapas
    return r.novos ? { caixariaChapas: r.chapas } : null
  })
  return { chapas, semDados }
}

export type AcaoChapa =
  | { acao: "arte"; chapa: string; ocupacao: string; aprovada: boolean }
  | { acao: "preencher"; chapa: string; tipo: Exclude<TipoLugar, "cliente">; lugares: number; descricao: string }
  | { acao: "liberar"; chapa: string; ocupacao: string }
  | { acao: "status"; chapa: string; status: Chapa["status"] }

export async function aplicar(a: AcaoChapa): Promise<Chapa[]> {
  let erro = ""
  const r = await mudarConfig<Dados>(d => {
    const lista = (d.caixariaChapas ?? []).map(c => ({ ...c, ocupacao: [...c.ocupacao] }))
    const c = lista.find(x => x.id === a.chapa)
    if (!c) { erro = "Chapa não encontrada"; return null }
    const agora = new Date().toISOString()
    if (a.acao === "arte") {
      // A arte é do pedido: marca em todos os pedaços do mesmo item, em qualquer chapa
      const o = c.ocupacao.find(x => x.id === a.ocupacao)
      if (!o?.pedidoId) { erro = "Lugar sem pedido"; return null }
      for (const ch of lista) ch.ocupacao = ch.ocupacao.map(x => x.pedidoId === o.pedidoId && x.itemIdx === o.itemIdx ? { ...x, arteAprovadaEm: a.aprovada ? agora : null } : x)
    } else if (a.acao === "preencher") {
      if (c.status !== "aberta") { erro = "A chapa já fechou"; return null }
      const n = Math.max(1, Math.min(Math.round(a.lugares), vagos(c)))
      if (!vagos(c)) { erro = "A chapa está cheia"; return null }
      c.ocupacao.push({ id: Math.random().toString(36).slice(2, 10), tipo: a.tipo, lugares: n, descricao: a.descricao.trim().slice(0, 80) || (a.tipo === "enyla" ? "Pedido ENYLA" : "Estoque") })
    } else if (a.acao === "liberar") {
      const o = c.ocupacao.find(x => x.id === a.ocupacao)
      if (!o || o.tipo === "cliente") { erro = "Só dá para liberar lugar da ENYLA ou de estoque"; return null }
      c.ocupacao = c.ocupacao.filter(x => x.id !== a.ocupacao)
    } else if (a.acao === "status") {
      if (a.status === "producao") {
        const sem = c.ocupacao.filter(o => o.tipo === "cliente" && !o.arteAprovadaEm).length
        if (sem) { erro = `Falta aprovar a arte de ${sem} pedido${sem > 1 ? "s" : ""}`; return null }
        c.fechadaEm = agora
      }
      if (a.status === "pronta") c.prontaEm = agora
      if (a.status === "aberta") { c.fechadaEm = null; c.prontaEm = null }
      c.status = a.status
    }
    return { caixariaChapas: lista }
  })
  if (erro) throw new Error(erro)
  return r.caixariaChapas ?? []
}
