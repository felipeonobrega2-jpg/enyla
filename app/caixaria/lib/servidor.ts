// Módulo Caixaria no servidor. Tabelas próprias no Supabase (nada na configuração da ENYLA):
//   caixaria_pedidos        pedidos do site (o site grava; aqui só lemos)
//   caixaria_chapas         chapas compartilhadas
//   caixaria_chapa_lugares  o que ocupa cada chapa (item de pedido, ENYLA ou estoque)
// SQL em supabase/migrations/20261108_caixaria_chapas.sql.

import { supabase } from "@/app/lib/supabase"
import { alocar, vagos, type Chapa, type ItemPago, type Ocupacao, type StatusChapa, type TipoLugar } from "./chapas"

// ── Pedidos do site ───────────────────────────────────────────────────────────

export type PedidoSite = {
  id: string; numero: string; status: string; forma: string; criado_em: string; atualizado_em: string
  subtotal: number; valor_pago: number
  cliente: { nome: string; email: string; telefone: string; documento: string }
  entrega: { cidade: string; uf: string; cep: string }
  itens: { slug: string; nome: string; medida: string; qtd: number; acab: string; prazo: string; marca?: string; total: number; cartao?: number; freteIncluso?: boolean; chapa?: ItemPago["chapa"] }[]
  mp_pagamentos: { status: string; em: string; metodo: string; valor: number }[]
}

export async function pedidosSite(dias = 90): Promise<PedidoSite[]> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
  const { data, error } = await supabase.from("caixaria_pedidos")
    .select("id, numero, status, forma, criado_em, atualizado_em, subtotal, valor_pago, cliente, entrega, itens, mp_pagamentos")
    .gte("criado_em", desde).order("criado_em", { ascending: false }).limit(500)
  if (error) throw new Error("caixaria_pedidos: " + error.message)
  return (data ?? []) as PedidoSite[]
}

async function itensPagos(): Promise<ItemPago[]> {
  const { data, error } = await supabase.from("caixaria_pedidos")
    .select("id, numero, status, forma, criado_em, atualizado_em, cliente, itens, mp_pagamentos")
    .in("status", ["pago", "sinal_pago"]).order("criado_em", { ascending: true }).limit(2000)
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

// ── Chapas ────────────────────────────────────────────────────────────────────

type LinhaChapa = {
  id: string; numero: number; modelo: string; modelo_nome: string; acabamento: string; expressa: boolean; lugares: number
  formato: string; rodada: number; colagem_por_mil: number; status: StatusChapa; criada_em: string; fechada_em: string | null; pronta_em: string | null
}
type LinhaLugar = {
  id: string; chapa_id: string; tipo: TipoLugar; lugares: number; descricao: string
  pedido_id: string | null; pedido_numero: string | null; item_idx: number | null; parte: number
  cliente: string | null; telefone: string | null; marca: string | null
  receita: number | null; frete: number | null; arte: number | null; pago_em: string | null; arte_aprovada_em: string | null
}

const num = (v: unknown) => (v == null ? undefined : Number(v))

function deLinha(c: LinhaChapa, lugares: LinhaLugar[]): Chapa {
  return {
    id: c.id, numero: Number(c.numero), modelo: c.modelo, modeloNome: c.modelo_nome, acabamento: c.acabamento, expressa: c.expressa,
    lugares: c.lugares, formato: c.formato, rodada: Number(c.rodada), colagemPorMil: Number(c.colagem_por_mil),
    status: c.status, criadaEm: c.criada_em, fechadaEm: c.fechada_em, prontaEm: c.pronta_em,
    ocupacao: lugares.filter(l => l.chapa_id === c.id).sort((a, b) => (a.pago_em ?? "z").localeCompare(b.pago_em ?? "z")).map(l => ({
      id: l.id, tipo: l.tipo, lugares: l.lugares, descricao: l.descricao,
      pedido: l.pedido_numero ?? undefined, pedidoId: l.pedido_id ?? undefined, itemIdx: l.item_idx ?? undefined, parte: l.parte,
      cliente: l.cliente ?? undefined, telefone: l.telefone ?? undefined, marca: l.marca ?? undefined,
      receita: num(l.receita), frete: num(l.frete), arte: num(l.arte), pagoEm: l.pago_em ?? undefined, arteAprovadaEm: l.arte_aprovada_em,
    })),
  }
}

async function lerChapas(): Promise<Chapa[]> {
  const [{ data: cs, error: e1 }, { data: ls, error: e2 }] = await Promise.all([
    supabase.from("caixaria_chapas").select("*").order("numero", { ascending: true }),
    supabase.from("caixaria_chapa_lugares").select("*"),
  ])
  if (e1 || e2) throw new Error("caixaria_chapas: " + (e1 ?? e2)!.message)
  return ((cs ?? []) as LinhaChapa[]).map(c => deLinha(c, (ls ?? []) as LinhaLugar[]))
}

const paraLinhaLugar = (chapaId: string, o: Ocupacao) => ({
  id: o.id, chapa_id: chapaId, tipo: o.tipo, lugares: o.lugares, descricao: o.descricao,
  pedido_id: o.pedidoId ?? null, pedido_numero: o.pedido ?? null, item_idx: o.itemIdx ?? null, parte: o.parte ?? 0,
  cliente: o.cliente ?? null, telefone: o.telefone ?? null, marca: o.marca ?? null,
  receita: o.receita ?? null, frete: o.frete ?? null, arte: o.arte ?? null, pago_em: o.pagoEm ?? null, arte_aprovada_em: o.arteAprovadaEm ?? null,
})

// Lê as chapas e encaixa os itens pagos desde a última vez. O índice único (pedido_id, item_idx, parte) impede
// que duas leituras ao mesmo tempo coloquem o mesmo item duas vezes.
export async function chapasAtualizadas(): Promise<{ chapas: Chapa[]; semDados: number }> {
  const [itens, atuais] = await Promise.all([itensPagos(), lerChapas()])
  const semDados = itens.filter(i => !i.chapa).length
  const { chapas, novos } = alocar(atuais, itens)
  if (!novos) return { chapas: atuais, semDados }

  const existentes = new Set(atuais.map(c => c.id))
  const antes = new Set(atuais.flatMap(c => c.ocupacao.map(o => o.id)))
  const novasChapas = chapas.filter(c => !existentes.has(c.id))
  if (novasChapas.length) {
    const { error } = await supabase.from("caixaria_chapas").insert(novasChapas.map(c => ({
      id: c.id, modelo: c.modelo, modelo_nome: c.modeloNome, acabamento: c.acabamento, expressa: c.expressa, lugares: c.lugares,
      formato: c.formato, rodada: c.rodada, colagem_por_mil: c.colagemPorMil, status: c.status,
    })))
    if (error) throw new Error("caixaria_chapas: " + error.message)
  }
  const novosLugares = chapas.flatMap(c => c.ocupacao.filter(o => !antes.has(o.id)).map(o => paraLinhaLugar(c.id, o)))
  const { error } = await supabase.from("caixaria_chapa_lugares").upsert(novosLugares, { onConflict: "pedido_id,item_idx,parte", ignoreDuplicates: true })
  if (error) throw new Error("caixaria_chapa_lugares: " + error.message)
  // Chapa criada por uma leitura que perdeu a corrida fica vazia: apaga
  if (novasChapas.length) {
    const { data: ocupadas } = await supabase.from("caixaria_chapa_lugares").select("chapa_id").in("chapa_id", novasChapas.map(c => c.id))
    const comLugar = new Set((ocupadas ?? []).map(l => l.chapa_id))
    const vazias = novasChapas.filter(c => !comLugar.has(c.id)).map(c => c.id)
    if (vazias.length) await supabase.from("caixaria_chapas").delete().in("id", vazias)
  }
  return { chapas: await lerChapas(), semDados }
}

export type AcaoChapa =
  | { acao: "arte"; chapa: string; ocupacao: string; aprovada: boolean }
  | { acao: "preencher"; chapa: string; tipo: Exclude<TipoLugar, "cliente">; lugares: number; descricao: string }
  | { acao: "liberar"; chapa: string; ocupacao: string }
  | { acao: "status"; chapa: string; status: StatusChapa }

export async function aplicar(a: AcaoChapa) {
  const c = (await lerChapas()).find(x => x.id === a.chapa)
  if (!c) throw new Error("Chapa não encontrada")
  const agora = new Date().toISOString()
  const ok = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message) }

  if (a.acao === "arte") {
    // A arte é do item do pedido: marca em todas as partes dele
    const o = c.ocupacao.find(x => x.id === a.ocupacao)
    if (!o?.pedidoId) throw new Error("Lugar sem pedido")
    ok(await supabase.from("caixaria_chapa_lugares").update({ arte_aprovada_em: a.aprovada ? agora : null })
      .eq("pedido_id", o.pedidoId).eq("item_idx", o.itemIdx!))
  } else if (a.acao === "preencher") {
    if (c.status !== "aberta") throw new Error("A chapa já fechou")
    if (!vagos(c)) throw new Error("A chapa está cheia")
    const n = Math.max(1, Math.min(Math.round(a.lugares), vagos(c)))
    ok(await supabase.from("caixaria_chapa_lugares").insert({
      chapa_id: c.id, tipo: a.tipo, lugares: n,
      descricao: a.descricao.trim().slice(0, 80) || (a.tipo === "enyla" ? "Pedido ENYLA" : "Estoque"),
    }))
  } else if (a.acao === "liberar") {
    const o = c.ocupacao.find(x => x.id === a.ocupacao)
    if (!o || o.tipo === "cliente") throw new Error("Só dá para liberar lugar da ENYLA ou de estoque")
    ok(await supabase.from("caixaria_chapa_lugares").delete().eq("id", o.id))
  } else if (a.acao === "status") {
    const mud: Record<string, unknown> = { status: a.status }
    if (a.status === "producao") {
      const sem = c.ocupacao.filter(o => o.tipo === "cliente" && !o.arteAprovadaEm).length
      if (sem) throw new Error(`Falta aprovar a arte de ${sem} pedido${sem > 1 ? "s" : ""}`)
      mud.fechada_em = agora
    }
    if (a.status === "pronta") mud.pronta_em = agora
    if (a.status === "aberta") { mud.fechada_em = null; mud.pronta_em = null }
    ok(await supabase.from("caixaria_chapas").update(mud).eq("id", c.id))
  }
}
