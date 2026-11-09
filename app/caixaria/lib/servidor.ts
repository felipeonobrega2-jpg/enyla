// Módulo Caixaria no servidor. Tabelas próprias no Supabase (nada na configuração da ENYLA):
//   caixaria_pedidos        pedidos do site (o site grava; aqui só lemos)
//   caixaria_chapas         chapas compartilhadas
//   caixaria_chapa_lugares  o que ocupa cada chapa (item de pedido, ENYLA ou estoque)
//   caixaria_config         custos e regras de preço (chave "custos"); o site lê
//   caixaria_facas          cadastro de facas (o site lê: medidas reais, lugares por chapa, à venda ou não)
// SQL em supabase/migrations/20261108_caixaria_chapas.sql.

import { supabase } from "@/app/lib/supabase"
import { normalizarCustos, type Custos } from "./custos"
import { erroFaca, planificacao, cabemNaChapa, type DadosFaca, type Faca, type ProdutoSite } from "./facas"
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

// ── Facas ─────────────────────────────────────────────────────────────────────
// caixaria_facas (SQL em supabase/migrations/20261108_caixaria_facas.sql). O site lê a tabela;
// depois de salvar, avisamos o site (/api/revalidar) para a loja atualizar na hora.


const SITE_CAIXARIA = process.env.CAIXARIA_SITE_URL ?? "https://caixaria.com"

export async function listarFacas(): Promise<Faca[]> {
  const { data, error } = await supabase.from("caixaria_facas").select("*").order("codigo")
  if (error) throw new Error("caixaria_facas: " + error.message)
  return ((data ?? []) as Faca[]).map(f => ({ ...f, frente_mm: Number(f.frente_mm), lateral_mm: Number(f.lateral_mm), altura_mm: Number(f.altura_mm) }))
}

export async function produtosDoSite(): Promise<ProdutoSite[]> {
  const r = await fetch(`${SITE_CAIXARIA}/api/catalogo`, { cache: "no-store", signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`caixaria.com respondeu ${r.status}`)
  return ((await r.json()).produtos ?? []) as ProdutoSite[]
}

async function avisarSite(): Promise<boolean> {
  const segredo = process.env.CAIXARIA_REVALIDAR_SEGREDO
  if (!segredo) return false
  try {
    const r = await fetch(`${SITE_CAIXARIA}/api/revalidar`, { method: "POST", headers: { "x-segredo": segredo }, signal: AbortSignal.timeout(8000) })
    return r.ok
  } catch { return false }
}

export async function salvarFaca(d: DadosFaca): Promise<{ siteAtualizado: boolean }> {
  const erro = erroFaca(d)
  if (erro) throw new Error(erro)
  const linha = {
    codigo: d.codigo.trim().toUpperCase().slice(0, 30), nome: d.nome.trim().slice(0, 80), tipo: d.tipo,
    frente_mm: Number(d.frente_mm), lateral_mm: Number(d.lateral_mm), altura_mm: Number(d.altura_mm),
    lugares: d.lugares ?? null, planificacao: d.planificacao?.slice(0, 40) || null,
    produto_slug: d.produto_slug || null, tem_faca: !!d.tem_faca, no_site: !!d.no_site && !!d.tem_faca,
    obs: (d.obs ?? "").slice(0, 500), atualizada_em: new Date().toISOString(),
  }
  const r = d.id
    ? await supabase.from("caixaria_facas").update(linha).eq("id", d.id)
    : await supabase.from("caixaria_facas").insert(linha)
  if (r.error) {
    if (/duplicate key.*codigo/i.test(r.error.message)) throw new Error("Já existe uma faca com esse código")
    if (/duplicate key.*produto_slug/i.test(r.error.message)) throw new Error("Essa caixa do site já tem outra faca")
    throw new Error(r.error.message)
  }
  return { siteAtualizado: await avisarSite() }
}

export async function apagarFaca(id: string): Promise<{ siteAtualizado: boolean }> {
  const { error } = await supabase.from("caixaria_facas").delete().eq("id", id)
  if (error) throw new Error(error.message)
  return { siteAtualizado: await avisarSite() }
}

// ── Custos ────────────────────────────────────────────────────────────────────

export async function lerCustos(): Promise<{ custos: Custos; salvoEm: string | null }> {
  const { data, error } = await supabase.from("caixaria_config").select("dados, atualizada_em").eq("chave", "custos").maybeSingle()
  if (error) throw new Error("caixaria_config: " + error.message)
  return { custos: normalizarCustos(data?.dados as Partial<Custos> | undefined), salvoEm: data?.atualizada_em ?? null }
}

export async function salvarCustos(c: Partial<Custos>): Promise<{ siteAtualizado: boolean }> {
  const custos = normalizarCustos(c)
  const { error } = await supabase.from("caixaria_config").upsert({ chave: "custos", dados: custos, atualizada_em: new Date().toISOString() })
  if (error) throw new Error("caixaria_config: " + error.message)
  return { siteAtualizado: await avisarSite() }
}

// O que a ENYLA já sabe: a configuração da ferramenta de orçamentos e o que foi pago de verdade por lote.
export type Referencia = { campo: keyof Custos; valor: number; fonte: string; detalhe: string }

type RegraENYLA = { tipo: string; acerto?: number; milheiro?: number; valor?: number }
type FornecedorENYLA = { id: string; nome: string; ativo: boolean; servicos: Record<string, RegraENYLA | undefined> }

const mediana = (xs: number[]) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return NaN
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

export async function referenciasENYLA(): Promise<{ referencias: Referencia[]; avisos: string[] }> {
  const refs: Referencia[] = []
  const avisos: string[] = []
  const r2 = (n: number) => Math.round(n * 100) / 100
  const rs = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // 1) Configuração da ferramenta de orçamentos
  const { data: cfgRow } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (cfgRow?.data ?? {}) as {
    materiais?: { id: string; nome: string; precos: Record<string, number> }[]
    producao?: { fornecedores?: FornecedorENYLA[]; padroes?: Record<string, string>; perdaPct?: number; impostoPct?: number }
  }
  const prod = cfg.producao ?? {}
  const forns = (prod.fornecedores ?? []).filter(f => f.ativo)
  const cartao = (cfg.materiais ?? []).find(m => /cart[aã]o\s*300/i.test(m.nome))
  if (cartao?.precos["66x96"]) refs.push({ campo: "papelPorFolha", valor: r2(cartao.precos["66x96"] / 100 / 2), fonte: "Configuração da ENYLA", detalhe: `${cartao.nome}: R$ ${cartao.precos["66x96"]} o cento de 66×96 (meia folha = 66×48)` })
  const imp = forns.find(f => f.servicos.impressao?.tipo === "fixo_chapa")
  if (imp?.servicos.impressao?.valor) refs.push({ campo: "impressao", valor: imp.servicos.impressao.valor, fonte: "Configuração da ENYLA", detalhe: `${imp.nome}: valor fixo por chapa` })
  if (prod.perdaPct != null) refs.push({ campo: "perdaPct", valor: prod.perdaPct, fonte: "Configuração da ENYLA", detalhe: "folhas a mais nos orçamentos" })
  if (prod.impostoPct != null) refs.push({ campo: "impostoPct", valor: prod.impostoPct, fonte: "Configuração da ENYLA", detalhe: "imposto sobre o preço" })
  const corte = forns.filter(f => f.servicos.corteVinco?.tipo === "acerto_milheiro").sort((a, b) => (a.servicos.corteVinco!.acerto ?? 0) - (b.servicos.corteVinco!.acerto ?? 0))[0]
  if (corte) {
    const k = corte.servicos.corteVinco!
    refs.push({ campo: "corteAcerto", valor: k.acerto ?? 0, fonte: "Configuração da ENYLA", detalhe: `${corte.nome}: R$ ${k.acerto} de acerto + R$ ${k.milheiro} o milheiro` })
    refs.push({ campo: "corteMilheiro", valor: k.milheiro ?? 0, fonte: "Configuração da ENYLA", detalhe: `${corte.nome}` })
  }
  const arte = forns.map(f => ({ f, v: f.servicos.arte?.tipo === "por_trabalho" ? f.servicos.arte.valor ?? 0 : 0 })).filter(x => x.v > 0).sort((a, b) => a.v - b.v)[0]
  if (arte) refs.push({ campo: "arte", valor: arte.v, fonte: "Configuração da ENYLA", detalhe: `${arte.f.nome}, por trabalho` })
  const lam = forns.find(f => f.servicos.laminacao && Object.keys((f.servicos.laminacao as { precosPorTipo?: object }).precosPorTipo ?? {}).length)
  if (!lam) avisos.push("Nenhum fornecedor da ENYLA tem tabela de laminação cadastrada. O valor da laminação ainda é estimado: confirme com quem lamina.")

  // 2) O que foi pago: despesas por lote ÷ folhas do lote (lotes de 3.000 caixas ou mais, com medida conhecida)
  const desde = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10)
  const [{ data: ls }, { data: cs }] = await Promise.all([
    supabase.from("LancamentoFinanceiro").select("descricao, valor, categoria, subcategoria, loteNumero").eq("tipo", "despesa").not("loteNumero", "is", null).gte("dataVencimento", desde),
    supabase.from("KanbanCard").select("loteNumero, dimensoes, quantidade").not("loteNumero", "is", null),
  ])
  const lotes = new Map<string, { qtd: number; folhas: number; ok: boolean }>()
  for (const c of (cs ?? []) as { loteNumero: string; dimensoes: string | null; quantidade: number | null }[]) {
    const L = lotes.get(c.loteNumero) ?? { qtd: 0, folhas: 0, ok: true }
    const q = c.quantidade ?? 0
    const m = (c.dimensoes ?? "").replace(/,/g, ".").match(/([\d.]+)\s*[×x]\s*([\d.]+)\s*[×x]\s*([\d.]+)/)
    // Medidas da ENYLA: frente × altura × lateral, em cm
    const n = m && +m[1] > 0 ? (() => { const p = planificacao("simples", +m[1] * 10, +m[3] * 10, +m[2] * 10); return cabemNaChapa(p.largura, p.altura) })() : 0
    if (n) L.folhas += q / n; else L.ok = false
    L.qtd += q
    lotes.set(c.loteNumero, L)
  }
  const cat = (l: { descricao: string | null; categoria: string | null; subcategoria: string | null }) => {
    const t = `${l.categoria} ${l.subcategoria} ${l.descricao}`.toLowerCase()
    if (/transporte|lalamove|motoboy/.test(t)) return "transporte"
    if (/lamina/.test(t)) return "laminacao"
    if (/verniz/.test(t)) return "verniz"
    if (/corte|vinco/.test(t)) return "corte"
    if (/colag/.test(t)) return "colagem"
    if (/papel/.test(t)) return "papel"
    return null
  }
  const porLote = new Map<string, Record<string, number>>()
  for (const l of (ls ?? []) as { descricao: string | null; valor: number; categoria: string | null; subcategoria: string | null; loteNumero: string }[]) {
    const k = cat(l); if (!k) continue
    const o = porLote.get(l.loteNumero) ?? {}
    o[k] = (o[k] ?? 0) + Number(l.valor)
    porLote.set(l.loteNumero, o)
  }
  const amostra = (k: string, fn: (v: number, L: { qtd: number; folhas: number }) => number, precisaFolhas = true) => {
    const xs: number[] = []
    for (const [n, o] of porLote) {
      const L = lotes.get(n)
      if (!L || o[k] == null || L.qtd < 3000 || (precisaFolhas && (!L.ok || !L.folhas))) continue
      xs.push(fn(o[k], L))
    }
    return { v: mediana(xs), n: xs.length }
  }
  const pago = (campo: keyof Custos, k: string, fn: (v: number, L: { qtd: number; folhas: number }) => number, txt: (v: number, n: number) => string, precisaFolhas = true) => {
    const { v, n } = amostra(k, fn, precisaFolhas)
    if (n >= 2) refs.push({ campo, valor: r2(v), fonte: `Pago em ${n} lotes da ENYLA`, detalhe: txt(v, n) })
  }
  pago("papelPorFolha", "papel", (v, L) => v / L.folhas, v => `mediana de R$ ${rs(v)} por folha, já com a perda`)
  pago("laminacaoPorFolha", "verniz", (v, L) => v / L.folhas, v => `verniz: mediana de R$ ${rs(v)} por folha. Laminação costuma custar mais que verniz`)
  pago("laminacaoPorFolha", "laminacao", (v, L) => v / L.folhas, v => `laminação: mediana de R$ ${rs(v)} por folha`)
  pago("corteMilheiro", "corte", (v, L) => v / L.folhas * 1000, v => `mediana de R$ ${Math.round(v)} por mil folhas, acerto incluído`)
  pago("colagemPorMil", "colagem", (v, L) => v / L.qtd * 1000, v => `mediana de R$ ${Math.round(v)} por mil caixas`, false)
  pago("logistica", "transporte", v => v, v => `mediana de R$ ${Math.round(v)} por lote (Lalamove, motoboy, carro)`, false)

  return { referencias: refs, avisos }
}
