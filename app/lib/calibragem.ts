// Calibragem do motor de orçamento: compara, pedido a pedido, o custo que o motor
// prevê hoje (recalculado a partir do orçamento salvo) com os custos reais lançados.

import { FormData, KanbanCard, LancamentoFinanceiro } from "../types"
import { Configuracoes, Fornecedor } from "../config"
import { calcular } from "../calculos"
import { Pedido, isTerceirizado } from "./negocio"
import { normalizarProducao, ItemCusto } from "./producao"

export type Componente =
  | "papel" | "impressao" | "acabamento" | "hotStamping" | "corteVinco" | "colagem"
  | "faca" | "arte" | "frete" | "itens" | "semCategoria"

export const COMPONENTES: { id: Componente; nome: string; previsivel: boolean }[] = [
  { id: "papel", nome: "Papel", previsivel: true },
  { id: "impressao", nome: "Impressão", previsivel: true },
  { id: "acabamento", nome: "Laminação e verniz", previsivel: true },
  { id: "hotStamping", nome: "Hot stamping", previsivel: true },
  { id: "corteVinco", nome: "Corte e vinco", previsivel: true },
  { id: "colagem", nome: "Colagem", previsivel: true },
  { id: "faca", nome: "Faca", previsivel: true },
  { id: "arte", nome: "Arte", previsivel: true },
  { id: "frete", nome: "Frete", previsivel: true },
  { id: "itens", nome: "Itens extras (berço, adesivo, sacola)", previsivel: false },
  { id: "semCategoria", nome: "Sem categoria", previsivel: false },
]

// Subcategoria gravada ao categorizar pela calibragem (lida de volta pelo classificador)
export const SUBCATEGORIA: Record<Exclude<Componente, "semCategoria">, string> = {
  papel: "Papel", impressao: "Impressão", acabamento: "Verniz", hotStamping: "Hotstamping",
  corteVinco: "Corte e Vinco", colagem: "Colagem", faca: "Faca", arte: "Arte", frete: "Frete", itens: "Itens extras",
}

const REGRAS: [Componente, RegExp][] = [
  ["frete", /lalamove|frete|transporte|motoboy|\buber\b/],   // antes de corte/verniz: "Transporte corte e vinco" é frete
  ["hotStamping", /hot\s?stamp|clich[eê]|fotolito/],
  ["corteVinco", /corte|vinco/],
  ["colagem", /colagem|colad/],
  ["faca", /\bfaca\b|faquista/],
  ["acabamento", /verniz|lamina|acabamento|acbamento|uv\b/],
  ["impressao", /impress|\bchapa\b|offset/],
  ["papel", /papel|cart[aã]o|couch|triplex|duplex|folha/],
  ["arte", /\barte\b|design|desgin|prova digital|prova de cor|fechamento/],
  ["frete", /lalamove|frete|transporte|motoboy|correios|entrega|uber|particular/],
  ["itens", /ber[cç]o|adesiv|sacola|etiqueta|r[oó]tulo|fita/],
]

// Etapas citadas num texto de lançamento ("Impressão + Papel" → impressão e papel). Mais estrito que REGRAS
// para não acusar mistura à toa: "faca de corte" é só faca; "folha" não conta como papel; frete é sempre um só.
const ETAPAS_TEXTO: [Exclude<Componente, "semCategoria">, RegExp][] = [
  ["papel", /papel|cart[aã]o|triplex|duplex|couch/],
  ["impressao", /impress|offset/],
  ["acabamento", /verniz|lamina/],
  ["hotStamping", /hot\s?stamp/],
  ["corteVinco", /corte|vinco/],
  ["colagem", /colagem/],
  ["faca", /\bfaca\b/],
]
export function etapasNoTexto(texto: string): Exclude<Componente, "semCategoria">[] {
  const s = texto.toLowerCase().replace(/faca de corte( e vinco)?/g, "faca")
  if (REGRAS[0][1].test(s)) return ["frete"]
  return ETAPAS_TEXTO.filter(([, re]) => re.test(s)).map(([c]) => c)
}

// Componente de um custo real: subcategoria → descrição → categoria → fornecedor vinculado
export function classificar(l: LancamentoFinanceiro, fornecedores: Fornecedor[], cfg: Configuracoes): Componente {
  const textos = [l.subcategoria, l.descricao, l.categoria === "transporte" ? "transporte" : ""]
  for (const t of textos) {
    const s = (t ?? "").toLowerCase()
    if (!s) continue
    for (const [comp, re] of REGRAS) if (re.test(s)) return comp
  }
  // Fornecedor do financeiro ligado a um fornecedor de produção com um único serviço
  const forn = fornecedores.find(f => f.id === l.fornecedorId)
  if (forn) {
    const prod = normalizarProducao(cfg.producao).fornecedores.find(p => p.fornecedorId === forn.id)
    const servicos = prod ? Object.keys(prod.servicos) : []
    if (servicos.length === 1) {
      const s = servicos[0]
      if (s === "impressao") return "impressao"
      if (s === "corteVinco") return "corteVinco"
      if (s === "colagem") return "colagem"
      if (s === "hotStamping") return "hotStamping"
      if (s === "laminacao" || s === "verniz") return "acabamento"
    }
    for (const [comp, re] of REGRAS) if (re.test(`${forn.nome} ${forn.categoria}`.toLowerCase())) return comp
  }
  return "semCategoria"
}

export type ItemPrevisto = { etapa: ItemCusto["etapa"]; fornecedorId?: string; valor: number; estimado: boolean }

export type Comparacao = {
  pedido: Pedido
  previsto: Partial<Record<Componente, number>> | null   // null = sem orçamento calculado para recalcular
  previstoItens: ItemPrevisto[]                           // itens do motor, com o fornecedor que ele assumiu
  materiais: string[]                                     // materiais dos cards de produção
  fornecedorReal: Partial<Record<Componente, string>>     // quem fez, pelos lançamentos (fornecedor de produção)
  facaPelaTabela: boolean                                 // faca prevista pela tabela padrão (sem valor do faquista)
  jogosChapa: number                                      // maior nº de jogos de chapa entre os cards (artes ÷ cavidades)
  folhasImpressas: number                                 // soma das folhas impressas previstas
  real: Partial<Record<Componente, number>>
  custosReais: { lancamento: LancamentoFinanceiro; componente: Componente }[]
  previstoTotal: number
  realTotal: number
  pctCategorizado: number   // parte do custo real com componente identificado
}

type HistItem = { form: FormData; numero?: string }

const ETAPA_ROTA: Partial<Record<Componente, "acabamento" | "hotStamping" | "corteVinco" | "colagem">> = {
  acabamento: "acabamento", hotStamping: "hotStamping", corteVinco: "corteVinco", colagem: "colagem",
}

// Fornecedor de produção que fez cada componente, quando todos os lançamentos vinculados apontam para o mesmo
function fornecedoresReais(custos: { lancamento: LancamentoFinanceiro; componente: Componente }[], cfg: Configuracoes) {
  const prod = normalizarProducao(cfg.producao)
  const out: Partial<Record<Componente, string>> = {}
  const porComp = new Map<Componente, Set<string>>()
  for (const c of custos) {
    const p = prod.fornecedores.find(f => f.fornecedorId && f.fornecedorId === c.lancamento.fornecedorId)
    if (!p) continue
    porComp.set(c.componente, (porComp.get(c.componente) ?? new Set()).add(p.id))
  }
  for (const [comp, ids] of porComp) if (ids.size === 1) out[comp] = [...ids][0]
  return out
}

const soma = (o: Partial<Record<Componente, number>>) => Object.values(o).reduce((s, v) => s + (v ?? 0), 0)

type PrevistoCard = { comp: Partial<Record<Componente, number>>; itens: ItemPrevisto[]; jogos: number; folhas: number }

// Custo previsto pelo motor de hoje para um card, na quantidade vendida
function previstoDoCard(card: KanbanCard, hist: HistItem | undefined, cfg: Configuracoes, reais: Partial<Record<Componente, string>> = {}): PrevistoCard | null {
  if (!hist?.form || !card.quantidade) return null
  // Só o motor (sem valores digitados nem extras), mas com quem realmente fez cada etapa
  const fornecedores = { ...hist.form.rota?.fornecedores }
  for (const [comp, etapa] of Object.entries(ETAPA_ROTA)) if (reais[comp as Componente]) fornecedores[etapa!] = reais[comp as Componente]
  const rota = {
    ...hist.form.rota, valores: undefined, extras: undefined, fornecedores,
    impressorId: reais.impressao ?? hist.form.rota?.impressorId,
  }
  const r = calcular({ ...hist.form, rota, quantidades: [card.quantidade] }, cfg)
  const l = r?.tabela[0]
  if (!l) return null
  const comFaca = hist.form.comFaca
  const itens = (r.rotas?.[0]?.melhor.itens ?? []).map(i => ({ etapa: i.etapa, fornecedorId: i.fornecedorId, valor: i.valor, estimado: i.estimado }))
  return { itens, jogos: r.rotas?.[0]?.melhor.jogos ?? 1, folhas: r.rotas?.[0]?.melhor.folhasImpressas ?? 0, comp: {
    papel: l.custoPapel,
    impressao: l.custoImpressao,
    acabamento: l.custoVerniz,
    hotStamping: l.custoHotStamping ?? 0,
    corteVinco: l.custoCorte,
    colagem: l.custoColagem,
    faca: comFaca ? l.custoTotalComFaca - l.custoTotalSemFaca : 0,
    arte: l.custoArte,
    frete: l.custoFrete ?? 0,
  } }
}

export function compararPedidos(
  pedidos: Pedido[], historico: HistItem[], cfg: Configuracoes,
): Comparacao[] {
  const fornecedores = cfg.fornecedores ?? []
  return pedidos
    .filter(p => p.custoDireto > 0)
    .map(p => {
      const custosReais = p.despesas
        .filter(l => l.status === "pago" || l.formaPagamento === "conta")
        .map(l => ({ lancamento: l, componente: classificar(l, fornecedores, cfg) }))
      const real: Partial<Record<Componente, number>> = {}
      for (const c of custosReais) real[c.componente] = (real[c.componente] ?? 0) + c.lancamento.valor

      // Previsto: soma dos cards de produção (revendas não passam pelo motor)
      const fornecedorReal = fornecedoresReais(custosReais, cfg)
      let previsto: Partial<Record<Componente, number>> | null = {}
      const previstoItens: ItemPrevisto[] = []
      const materiais = new Set<string>()
      let facaPelaTabela = true
      let jogosChapa = 1
      let folhasImpressas = 0
      for (const card of p.cards.filter(c => !isTerceirizado(c))) {
        const hist = historico.find(h => h.numero === card.numero)
        const prev = previstoDoCard(card, hist, cfg, fornecedorReal)
        if (!prev) { previsto = null; break }
        for (const [k, v] of Object.entries(prev.comp)) previsto[k as Componente] = (previsto[k as Componente] ?? 0) + (v ?? 0)
        previstoItens.push(...prev.itens)
        jogosChapa = Math.max(jogosChapa, prev.jogos)
        folhasImpressas += prev.folhas
        if (hist?.form.materialId) materiais.add(hist.form.materialId)
        if (hist?.form.comFaca && hist.form.valorFaca > 0) facaPelaTabela = false
      }

      const realTotal = soma(real)
      return {
        pedido: p, previsto, real, custosReais,
        previstoItens: previsto ? previstoItens : [], materiais: [...materiais], facaPelaTabela, fornecedorReal, jogosChapa, folhasImpressas,
        previstoTotal: previsto ? soma(previsto) : 0,
        realTotal,
        pctCategorizado: realTotal > 0 ? 1 - (real.semCategoria ?? 0) / realTotal : 0,
      }
    })
    .sort((a, b) => (b.pedido.dataFechamento ?? "").localeCompare(a.pedido.dataFechamento ?? ""))
}

// Pedido com custos completos o bastante para comparar: recalculável e com papel e impressão lançados
export const comparavel = (c: Comparacao) => !!c.previsto && (c.real.papel ?? 0) > 0 && (c.real.impressao ?? 0) > 0

export type Leitura = "calibrado" | "subestima" | "superestima" | "raroLancado" | "naoPrevisto"

export type DesvioComponente = {
  componente: Componente
  nome: string
  pedidos: number          // pedidos comparáveis
  lancadoEm: number        // em quantos deles o componente aparece no custo real
  previsto: number         // previsto nos pedidos em que foi lançado
  real: number             // real nos pedidos em que foi lançado
  previstoTodos: number    // previsto em todos os pedidos comparáveis
  desvioPct: number | null // (real − previsto) ÷ previsto, só onde foi lançado
  leitura: Leitura
}

// Desvio por componente nos pedidos comparáveis. Separa "o motor erra o valor"
// de "o custo quase nunca é lançado" (feito internamente ou embutido em outra nota).
export function desviosPorComponente(comps: Comparacao[]): DesvioComponente[] {
  const base = comps.filter(comparavel)
  return COMPONENTES.filter(c => c.previsivel).map(({ id, nome }) => {
    const lancados = base.filter(c => (c.real[id] ?? 0) > 0)
    const previsto = lancados.reduce((s, c) => s + (c.previsto![id] ?? 0), 0)
    const real = lancados.reduce((s, c) => s + (c.real[id] ?? 0), 0)
    const previstoTodos = base.reduce((s, c) => s + (c.previsto![id] ?? 0), 0)
    const desvioPct = previsto > 0 ? (real - previsto) / previsto * 100 : null
    const leitura: Leitura =
      previsto <= 0 && real > 0 ? "naoPrevisto"
      : base.length > 0 && previstoTodos > 0 && lancados.length / base.length < 0.5 ? "raroLancado"
      : desvioPct == null ? "calibrado"
      : desvioPct > 15 ? "subestima"
      : desvioPct < -15 ? "superestima"
      : "calibrado"
    return { componente: id, nome, pedidos: base.length, lancadoEm: lancados.length, previsto, real, previstoTodos, desvioPct, leitura }
  }).filter(d => d.previstoTodos > 0 || d.real > 0)
}

// ── Custo do fornecedor → pedido certo (aba Banco) ───────────────────────────
// Previsto pelo motor de cada pedido em produção (ou entregue há pouco), por componente e por fornecedor do financeiro
export type PrevistoPedido = { pedido: Pedido; comp: Partial<Record<Componente, number>>; porFornecedor: Record<string, number> }
export function previstosEmAberto(pedidos: Pedido[], historico: HistItem[], cfg: Configuracoes, hojeIso: string, dias = 45): PrevistoPedido[] {
  const prod = normalizarProducao(cfg.producao)
  const corte = new Date(new Date(hojeIso + "T12:00:00").getTime() - dias * 86_400_000).toISOString().slice(0, 10)
  const out: PrevistoPedido[] = []
  for (const p of pedidos) {
    if (!p.dataFechamento || (p.dataEntregaReal && p.dataEntregaReal.slice(0, 10) < corte)) continue
    const comp: Partial<Record<Componente, number>> = {}, porFornecedor: Record<string, number> = {}
    let algum = false
    for (const card of p.cards.filter(c => !isTerceirizado(c))) {
      const prev = previstoDoCard(card, historico.find(h => h.numero === card.numero), cfg)
      if (!prev) continue
      algum = true
      for (const [k, v] of Object.entries(prev.comp)) comp[k as Componente] = (comp[k as Componente] ?? 0) + (v ?? 0)
      for (const i of prev.itens) {
        const fin = prod.fornecedores.find(f => f.id === i.fornecedorId)?.fornecedorId
        if (fin && i.valor > 0) porFornecedor[fin] = (porFornecedor[fin] ?? 0) + i.valor
      }
    }
    if (algum) out.push({ pedido: p, comp, porFornecedor })
  }
  return out
}

// Pagamento a fornecedor: o pedido cujo custo previsto (desse fornecedor ou dessa etapa) bate com o valor (até 12%),
// que ainda não tem esse custo lançado e já estava fechado. Só devolve quando a escolha é clara.
export function pedidoDoCusto(tx: { valor: number; data: string }, l: Partial<LancamentoFinanceiro>, previstos: PrevistoPedido[], cfg: Configuracoes):
  { pedido: Pedido; previsto: number; etapa: string } | null {
  const fornecedores = cfg.fornecedores ?? []
  const comp = classificar({ id: "", tipo: "despesa", descricao: l.descricao ?? "", valor: tx.valor, dataVencimento: tx.data, status: "pago", criadoEm: "", ...l } as LancamentoFinanceiro, fornecedores, cfg)
  const nomeEtapa = COMPONENTES.find(c => c.id === comp)?.nome ?? "custo"
  const cands: { pedido: Pedido; previsto: number; dif: number; etapa: string }[] = []
  for (const pp of previstos) {
    // Pagamento antes do pedido fechar (com 2 dias de folga) não é dele
    const limite = new Date(new Date(tx.data.slice(0, 10) + "T12:00:00").getTime() + 2 * 86_400_000).toISOString().slice(0, 10)
    if ((pp.pedido.dataFechamento ?? "").slice(0, 10) > limite) continue
    const doForn = l.fornecedorId ? pp.porFornecedor[l.fornecedorId] : undefined
    const alvo = doForn ?? (comp !== "semCategoria" ? pp.comp[comp] : undefined)
    if (!alvo || alvo <= 0) continue
    // Já tem esse custo lançado no pedido: não liga de novo
    const jaTem = pp.pedido.despesas.some(d => (l.fornecedorId && d.fornecedorId === l.fornecedorId) || (comp !== "semCategoria" && classificar(d, fornecedores, cfg) === comp))
    if (jaTem) continue
    const dif = Math.abs(alvo - tx.valor) / tx.valor
    if (dif <= 0.12) cands.push({ pedido: pp.pedido, previsto: alvo, dif, etapa: doForn ? (fornecedores.find(f => f.id === l.fornecedorId)?.nome ?? nomeEtapa) : nomeEtapa })
  }
  cands.sort((a, b) => a.dif - b.dif)
  if (!cands.length) return null
  if (cands.length > 1 && cands[1].dif - cands[0].dif < 0.04) return null   // dois pedidos parecidos: você escolhe
  return { pedido: cands[0].pedido, previsto: cands[0].previsto, etapa: cands[0].etapa }
}
