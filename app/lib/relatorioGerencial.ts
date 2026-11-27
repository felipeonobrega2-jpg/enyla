// Relatório gerencial em PDF (para análise): resumo com comparação ao período anterior e leitura automática,
// resultado (DRE de caixa, igual ao Financeiro), caixa e recebíveis, comercial, pedidos do período, digital,
// produção e confiança dos dados. Puro: monta os números e o HTML A4; quem chama abre a impressão.
import type { KanbanCard, LancamentoFinanceiro } from "../types"
import { montarPedidos, vendasDoPeriodo, caixaDoPeriodo, conversao, orcamentosDoPeriodo, margemContribuicao, recebiveis, noPeriodo, nomeChave, isTerceirizado, type Periodo, type Pedido } from "./negocio"
import { dreDoPeriodo, semNeutras, type Dre } from "./financeiro"
import { categoriaPerda, rotuloPerda, type CategoriaPerda } from "./coleta"

export type ExtrasRelatorio = {
  digital: Digital; digitalAnt: Digital
  leads: Leads; leadsAnt: Leads
  meta: number | null; metaAnt: number | null
  dados: { em: string; confianca: number; total: number; graves: number; valorEmJogo: number } | null
}
type Digital = { orcados: number; pagos: number; faturamento: number; ticket: number; conversao: number | null; unidades: number }
type Leads = { novos: number; mql: number; doAnuncio: number; digital: number }

const DIA = 86_400_000
const iso = (d: Date) => d.toLocaleDateString("sv-SE")
export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const brl2 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const num = (n: number, d = 0) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })
const pct = (n: number | null, d = 1) => n == null ? "—" : `${num(n, d)}%`
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]!))

// Período anterior de mesmo tamanho, logo antes
export function periodoAnterior(p: { de: Date; ate: Date }) {
  const dias = Math.round((new Date(p.ate.getFullYear(), p.ate.getMonth(), p.ate.getDate()).getTime() - new Date(p.de.getFullYear(), p.de.getMonth(), p.de.getDate()).getTime()) / DIA) + 1
  // Mês cheio compara com o mês cheio anterior
  const mesCheio = p.de.getDate() === 1 && new Date(p.ate.getFullYear(), p.ate.getMonth() + 1, 0).getDate() === p.ate.getDate() && p.de.getMonth() === p.ate.getMonth()
  if (mesCheio) return { de: new Date(p.de.getFullYear(), p.de.getMonth() - 1, 1), ate: new Date(p.de.getFullYear(), p.de.getMonth(), 0) }
  // Começo de mês até um dia (mês corrente): os mesmos dias do mês anterior
  if (p.de.getDate() === 1 && p.de.getMonth() === p.ate.getMonth() && p.de.getFullYear() === p.ate.getFullYear()) {
    const fimAnt = new Date(p.de.getFullYear(), p.de.getMonth(), 0).getDate()
    return { de: new Date(p.de.getFullYear(), p.de.getMonth() - 1, 1), ate: new Date(p.de.getFullYear(), p.de.getMonth() - 1, Math.min(p.ate.getDate(), fimAnt)) }
  }
  const ate = new Date(p.de.getFullYear(), p.de.getMonth(), p.de.getDate() - 1)
  return { de: new Date(ate.getFullYear(), ate.getMonth(), ate.getDate() - dias + 1), ate }
}
const comoPeriodo = (p: { de: Date; ate: Date }): Periodo => ({ from: new Date(p.de.getFullYear(), p.de.getMonth(), p.de.getDate()), to: new Date(p.ate.getFullYear(), p.ate.getMonth(), p.ate.getDate(), 23, 59, 59) })

type Medida = {
  vendidoOffset: number; vendidoDigital: number; vendido: number; pedidos: number; ticket: number; unidades: number; precoUnidade: number | null
  recebido: number; pago: number; caixa: number; orcamentos: number; conversao: number | null; margem: number | null; novos: number
  dre: Dre
}

export type DadosRelatorio = {
  titulo: string; periodoNome: string; anteriorNome: string; geradoEm: string
  a: Medida; b: Medida
  extras: ExtrasRelatorio | null
  leitura: string[]
  meses: { rotulo: string; vendido: number; recebido: number; despesas: number }[]
  aging: { rotulo: string; valor: number; qtd: number }[]; devedores: { nome: string; numero: string; saldo: number; vencido: number }[]
  aPagar: { descricao: string; venc: string; valor: number; vencido: boolean }[]; aPagarTotal: number; aPagarVencido: number
  despesasCat: { nome: string; valor: number; ant: number }[]
  clientes: { nome: string; valor: number; pedidos: number; novo: boolean }[]; concentracaoTop3: number | null
  perdas: { motivo: string; qtd: number; valor: number }[]; venceram: number
  pedidosTabela: { numero: string; cliente: string; data: string; qtd: number; valor: number; custo: number; margem: number | null; recebido: number; saldo: number }[]
  entregas: { total: number; noPrazo: number; atrasoMedio: number | null; semPrazo: number }
}

export function montarRelatorio(a: {
  kanban: KanbanCard[]; lancamentos: LancamentoFinanceiro[]; periodo: { de: Date; ate: Date }; periodoNome: string
  nomeCategoria: (id: string) => string; neutras?: ReadonlySet<string>; impostoPct?: number; extras: ExtrasRelatorio | null; hoje?: Date
}): DadosRelatorio {
  const hoje = a.hoje ?? new Date()
  const lancP = semNeutras(a.lancamentos, a.neutras)   // totais de caixa, despesa e DRE sem as categorias neutras (cobrança e pagamento seguem com todos)
  const pedidos = montarPedidos(a.kanban, a.lancamentos)
  const ant = periodoAnterior(a.periodo)
  const P = comoPeriodo(a.periodo), PA = comoPeriodo(ant)
  // Primeiro pedido de cada cliente (cliente novo = primeiro pedido dentro do período)
  const primeiro = new Map<string, string>()
  for (const p of pedidos) if (p.dataFechamento) { const k = nomeChave(p.nomeCliente); if (!primeiro.has(k) || p.dataFechamento < primeiro.get(k)!) primeiro.set(k, p.dataFechamento) }

  const medir = (per: Periodo, dig: Digital | undefined): Medida => {
    const v = vendasDoPeriodo(pedidos, a.lancamentos, per)
    const cx = caixaDoPeriodo(lancP, per, hoje)
    const pago = lancP.filter(l => l.tipo === "despesa" && l.status === "pago" && l.formaPagamento !== "conta" && noPeriodo(l.dataPagamento ?? l.dataVencimento, per)).reduce((s, l) => s + l.valor, 0)
    const conv = conversao(orcamentosDoPeriodo(a.kanban, per))
    const dre = dreDoPeriodo({ lancamentos: a.lancamentos, neutras: a.neutras, noPeriodo: l => noPeriodo(l.dataPagamento ?? l.dataVencimento, per), nomeCategoria: a.nomeCategoria, impostoPct: a.impostoPct })
    const vd = dig?.faturamento ?? 0
    return {
      vendidoOffset: v.receita, vendidoDigital: vd, vendido: v.receita + vd, pedidos: v.pedidos.length + (dig?.pagos ?? 0),
      ticket: v.ticketMedio, unidades: v.unidades + (dig?.unidades ?? 0), precoUnidade: v.precoMedioUnidade,
      recebido: cx.recebido, pago, caixa: cx.recebido - pago, orcamentos: conv.total, conversao: conv.decididos ? conv.taxa : null,
      margem: margemContribuicao(v.pedidos).pct, novos: [...primeiro.values()].filter(d => noPeriodo(d, per)).length, dre,
    }
  }
  const A = medir(P, a.extras?.digital), B = medir(PA, a.extras?.digitalAnt)

  // 6 meses até o fim do período
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(a.periodo.ate.getFullYear(), a.periodo.ate.getMonth() - 5 + i, 1)
    const per: Periodo = { from: d, to: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59) }
    return {
      rotulo: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      vendido: vendasDoPeriodo(pedidos, a.lancamentos, per).receita,
      recebido: caixaDoPeriodo(lancP, per, hoje).recebido,
      despesas: lancP.filter(l => l.tipo === "despesa" && l.status === "pago" && l.formaPagamento !== "conta" && noPeriodo(l.dataPagamento ?? l.dataVencimento, per)).reduce((s, l) => s + l.valor, 0),
    }
  })

  // Recebíveis por idade (hoje)
  const rec = recebiveis(pedidos, a.lancamentos)
  const hojeIso = iso(hoje)
  const faixas = [{ rotulo: "A vencer", f: (d: number) => d >= 0 }, { rotulo: "Vencido até 30 dias", f: (d: number) => d < 0 && d >= -30 }, { rotulo: "Vencido 31 a 60 dias", f: (d: number) => d < -30 && d >= -60 }, { rotulo: "Vencido há mais de 60 dias", f: (d: number) => d < -60 }]
  const pendentes = a.lancamentos.filter(l => l.tipo === "receita" && l.status !== "pago" && l.formaPagamento !== "conta" && !(l.categoria === "pix_link" && l.dataVencimento < hojeIso) && l.categoria !== "sobra")
  const dias = (v: string) => Math.round((new Date(v + "T12:00:00").getTime() - new Date(hojeIso + "T12:00:00").getTime()) / DIA)
  const aging = [...faixas.map(fx => { const ls = pendentes.filter(l => fx.f(dias(l.dataVencimento))); return { rotulo: fx.rotulo, valor: ls.reduce((s, l) => s + l.valor, 0), qtd: ls.length } }),
    { rotulo: "Sem cobrança lançada", valor: rec.semCobranca, qtd: rec.comSaldo.filter(p => p.semCobranca > 0.5).length }]
  const devedores = [...rec.comSaldo].sort((x, y) => y.aReceber - x.aReceber).slice(0, 8).map(p => ({ nome: p.nomeCliente, numero: p.numero, saldo: p.aReceber, vencido: p.vencido }))
  const ate30 = iso(new Date(hoje.getTime() + 30 * DIA))
  const pagar = a.lancamentos.filter(l => l.tipo === "despesa" && l.status !== "pago" && l.formaPagamento !== "conta" && l.dataVencimento <= ate30).sort((x, y) => x.dataVencimento.localeCompare(y.dataVencimento))
  const aPagar = pagar.slice(0, 12).map(l => ({ descricao: l.descricao, venc: l.dataVencimento, valor: l.valor, vencido: l.dataVencimento < hojeIso }))
  const aPagarVencido = pagar.filter(l => l.dataVencimento < hojeIso).reduce((s, l) => s + l.valor, 0)

  // Despesas por categoria (período × anterior)
  const porCat = (per: Periodo) => {
    const m = new Map<string, number>()
    for (const l of lancP) if (l.tipo === "despesa" && l.status === "pago" && l.formaPagamento !== "conta" && noPeriodo(l.dataPagamento ?? l.dataVencimento, per)) {
      const n = a.nomeCategoria(l.categoria || "outros"); m.set(n, (m.get(n) ?? 0) + l.valor)
    }
    return m
  }
  const ca = porCat(P), cb = porCat(PA)
  const despesasCat = [...ca.entries()].sort((x, y) => y[1] - x[1]).map(([nome, valor]) => ({ nome, valor, ant: cb.get(nome) ?? 0 }))

  // Clientes do período
  const doPer = pedidos.filter(p => noPeriodo(p.dataFechamento, P))
  const porCli = new Map<string, { nome: string; valor: number; pedidos: number; novo: boolean }>()
  for (const p of doPer) {
    const k = nomeChave(p.nomeCliente)
    const c = porCli.get(k) ?? { nome: p.nomeCliente, valor: 0, pedidos: 0, novo: noPeriodo(primeiro.get(k), P) }
    c.valor += p.venda; c.pedidos++; porCli.set(k, c)
  }
  const clientes = [...porCli.values()].sort((x, y) => y.valor - x.valor)
  const totCli = clientes.reduce((s, c) => s + c.valor, 0)
  const concentracaoTop3 = totCli ? clientes.slice(0, 3).reduce((s, c) => s + c.valor, 0) / totCli * 100 : null

  // Perdas
  const porMotivo = new Map<CategoriaPerda, { qtd: number; valor: number }>()
  let venceram = 0
  for (const c of orcamentosDoPeriodo(a.kanban, P)) {
    const cat = categoriaPerda(c)
    if (!cat) continue
    if (cat === "expirado") { venceram++; continue }
    const x = porMotivo.get(cat) ?? { qtd: 0, valor: 0 }; x.qtd++; x.valor += c.preco; porMotivo.set(cat, x)
  }
  const perdas = [...porMotivo.entries()].sort((x, y) => y[1].qtd - x[1].qtd).map(([c, m]) => ({ motivo: rotuloPerda(c), ...m }))

  // Pedidos do período
  const pedidosTabela = [...doPer].sort((x, y) => y.venda - x.venda).map((p: Pedido) => ({
    numero: p.numero, cliente: p.nomeCliente, data: p.dataFechamento ?? "", qtd: p.cards.filter(c => !isTerceirizado(c)).reduce((s, c) => s + (c.quantidade || 0), 0),
    valor: p.venda, custo: p.custoDireto, margem: p.custoDireto > 0 && p.venda > 0 ? (p.venda - p.custoDireto) / p.venda * 100 : null, recebido: p.recebido, saldo: p.aReceber,
  }))

  // Entregas do período (no prazo = entregou até a data prevista)
  const entregues = pedidos.filter(p => noPeriodo(p.dataEntregaReal, P))
  const comPrazo = entregues.filter(p => p.dataEntregaPrevista)
  const atrasos = comPrazo.map(p => Math.round((new Date(p.dataEntregaReal! + "T12:00:00").getTime() - new Date(p.dataEntregaPrevista! + "T12:00:00").getTime()) / DIA)).filter(d => d > 0)
  const entregas = { total: entregues.length, noPrazo: comPrazo.length - atrasos.length, atrasoMedio: atrasos.length ? atrasos.reduce((s, d) => s + d, 0) / atrasos.length : null, semPrazo: entregues.length - comPrazo.length }

  const nomePer = (p: { de: Date; ate: Date }) => `${p.de.toLocaleDateString("pt-BR")} a ${p.ate.toLocaleDateString("pt-BR")}`
  const dados: DadosRelatorio = {
    titulo: "Relatório gerencial", periodoNome: a.periodoNome, anteriorNome: nomePer(ant), geradoEm: hoje.toLocaleString("pt-BR"),
    a: A, b: B, extras: a.extras, leitura: [], meses, aging, devedores, aPagar, aPagarTotal: pagar.reduce((s, l) => s + l.valor, 0),
    aPagarVencido, despesasCat, clientes, concentracaoTop3, perdas, venceram, pedidosTabela, entregas,
  }
  dados.leitura = leituraDoPeriodo(dados)
  return dados
}

const variacao = (x: number | null, y: number | null) => x == null || y == null || y === 0 ? null : (x - y) / Math.abs(y) * 100

// Leitura automática: o que mudou e o que pede atenção, em frases curtas (regras, sem IA)
export function leituraDoPeriodo(d: DadosRelatorio): string[] {
  const out: string[] = []
  const { a, b } = d
  const vv = variacao(a.vendido, b.vendido)
  if (vv != null && Math.abs(vv) >= 5) out.push(`As vendas ${vv > 0 ? "subiram" : "caíram"} ${num(Math.abs(vv), 0)}% sobre o período anterior (${brl(a.vendido)} contra ${brl(b.vendido)}).`)
  else if (a.vendido > 0) out.push(`Vendas estáveis: ${brl(a.vendido)} no período.`)
  if (a.vendidoDigital > 0 && a.vendido > 0) out.push(`O digital respondeu por ${num(a.vendidoDigital / a.vendido * 100, 0)}% das vendas (${brl(a.vendidoDigital)}).`)
  if (a.dre.margemBrutaPct != null && b.dre.margemBrutaPct != null && Math.abs(a.dre.margemBrutaPct - b.dre.margemBrutaPct) >= 3)
    out.push(`A margem bruta ${a.dre.margemBrutaPct > b.dre.margemBrutaPct ? "melhorou" : "piorou"} de ${pct(b.dre.margemBrutaPct)} para ${pct(a.dre.margemBrutaPct)}.`)
  if (a.dre.resultado < 0) out.push(`O resultado de caixa ficou negativo em ${brl(Math.abs(a.dre.resultado))}: saiu mais dinheiro do que entrou.`)
  if (a.conversao != null && b.conversao != null && Math.abs(a.conversao - b.conversao) >= 5) out.push(`A conversão de orçamentos foi de ${pct(b.conversao, 0)} para ${pct(a.conversao, 0)}.`)
  if (d.concentracaoTop3 != null && d.concentracaoTop3 >= 50 && d.clientes.length >= 4) out.push(`Concentração alta: os 3 maiores clientes fizeram ${num(d.concentracaoTop3, 0)}% das vendas. Perder um deles pesa.`)
  const vencido60 = d.aging.find(x => x.rotulo.includes("mais de 60"))?.valor ?? 0
  const vencidoTot = d.aging.filter(x => x.rotulo.startsWith("Vencido")).reduce((s, x) => s + x.valor, 0)
  if (vencidoTot > 0) out.push(`Há ${brl(vencidoTot)} vencidos a receber${vencido60 ? `, dos quais ${brl(vencido60)} há mais de 60 dias` : ""}.`)
  const baixa = d.pedidosTabela.filter(p => p.margem != null && p.margem < 30)
  if (baixa.length) out.push(`${baixa.length} ${baixa.length === 1 ? "pedido fechou" : "pedidos fecharam"} com margem abaixo de 30% (${baixa.slice(0, 3).map(p => p.numero).join(", ")}${baixa.length > 3 ? "…" : ""}).`)
  const semCusto = d.pedidosTabela.filter(p => p.margem == null).length
  if (semCusto) out.push(`${semCusto} ${semCusto === 1 ? "pedido ainda não tem" : "pedidos ainda não têm"} custo lançado: a margem desses não entra na conta.`)
  const top = [...d.despesasCat].filter(c => c.ant > 0 && c.valor - c.ant > 500).sort((x, y) => (y.valor - y.ant) - (x.valor - x.ant))[0]
  if (top) out.push(`A despesa que mais cresceu foi ${top.nome}: ${brl(top.valor)} contra ${brl(top.ant)}.`)
  const ex = d.extras
  if (ex?.meta && ex.leads.novos) out.push(`Anúncios: ${brl2(ex.meta)} investidos, ${num(ex.leads.novos)} contatos novos (${brl2(ex.meta / ex.leads.novos)} por contato)${a.novos ? `, ${a.novos} ${a.novos === 1 ? "cliente novo" : "clientes novos"} (${brl(ex.meta / a.novos)} por cliente)` : ""}.`)
  if (d.entregas.total && d.entregas.noPrazo / d.entregas.total < 0.8) out.push(`Só ${num(d.entregas.noPrazo / d.entregas.total * 100, 0)}% das entregas saíram no prazo.`)
  if (ex?.dados && ex.dados.confianca < 90) out.push(`Atenção à confiabilidade: ${pct(ex.dados.confianca)} dos registros conferem (${ex.dados.total} itens a acertar na tela Dados).`)
  return out.slice(0, 8)
}

// ── HTML ─────────────────────────────────────────────────────────────────────
function delta(x: number | null, y: number | null, menorMelhor = false) {
  const v = variacao(x, y)
  if (v == null) return `<span class="d0">—</span>`
  if (Math.abs(v) < 0.5) return `<span class="d0">0%</span>`
  const bom = menorMelhor ? v < 0 : v > 0
  return `<span class="${bom ? "dbom" : "druim"}">${v > 0 ? "▲" : "▼"} ${num(Math.abs(v), 0)}%</span>`
}

function graficoMeses(m: DadosRelatorio["meses"]) {
  const W = 680, H = 170, base = 140, larg = W / m.length
  const max = Math.max(1, ...m.flatMap(x => [x.vendido, x.recebido, x.despesas]))
  const h = (v: number) => Math.round(v / max * 118)
  const cores = ["#7c5ce0", "#22a06b", "#e0745a"]
  const barras = m.map((x, i) => [x.vendido, x.recebido, x.despesas].map((v, j) => {
    const bx = i * larg + larg / 2 - 27 + j * 18
    return `<rect x="${bx}" y="${base - h(v)}" width="15" height="${h(v)}" rx="2" fill="${cores[j]}"/>`
  }).join("") + `<text x="${i * larg + larg / 2}" y="${base + 16}" text-anchor="middle" class="eixo">${x.rotulo}</text>`).join("")
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}"><line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="#e6e3ee"/>${barras}</svg>
  <div class="legenda"><span><i style="background:#7c5ce0"></i>Vendido</span><span><i style="background:#22a06b"></i>Recebido</span><span><i style="background:#e0745a"></i>Despesas pagas</span></div>`
}

function barraH(itens: { rotulo: string; valor: number; extra?: string }[], cor = "#7c5ce0") {
  const max = Math.max(1, ...itens.map(i => i.valor))
  return itens.map(i => `<div class="bh"><div class="bh-r">${esc(i.rotulo)}</div><div class="bh-t"><div style="width:${Math.max(1, i.valor / max * 100)}%;background:${cor}"></div></div><div class="bh-v">${brl(i.valor)}${i.extra ? `<small>${i.extra}</small>` : ""}</div></div>`).join("")
}

export function htmlRelatorio(d: DadosRelatorio, logo: string): string {
  const { a, b } = d, ex = d.extras
  const kpi = (rotulo: string, valor: string, x: number | null, y: number | null, sub?: string, menorMelhor = false) =>
    `<div class="kpi"><div class="kl">${rotulo}</div><div class="kv">${valor}</div><div class="ks">${delta(x, y, menorMelhor)} <span>${sub ?? ""}</span></div></div>`
  const cab = (titulo: string) => `<div class="cab"><img src="${logo}" alt="ENYLA"/><div><b>${titulo}</b><span>${esc(d.periodoNome)}</span></div></div>`
  const rod = (n: number) => `<div class="rod"><span>ENYLA · ${d.titulo} · ${esc(d.periodoNome)}</span><span>Gerado em ${d.geradoEm} · p. ${n}</span></div>`
  const linhaDre = (nome: string, va: number, vb: number, opts: { forte?: boolean; nivel?: boolean; neg?: boolean } = {}) =>
    `<tr class="${opts.forte ? "forte" : ""}"><td class="${opts.nivel ? "niv" : ""}">${esc(nome)}</td><td class="r">${opts.neg ? "−" : ""}${brl(va)}</td><td class="r m">${a.dre.receita ? pct(va / a.dre.receita * 100) : ""}</td><td class="r m">${opts.neg ? "−" : ""}${brl(vb)}</td><td class="r">${delta(va, vb, opts.neg)}</td></tr>`
  const dreAnt = (nome: string, lista: "custosProducao" | "despesasOperacionais") => b.dre[lista].find(x => x.nome === nome)?.valor ?? 0

  const p1 = `<section class="pg">${cab(d.titulo)}
    <h1>Resumo do período</h1><p class="sub">Comparado com ${esc(d.anteriorNome)}${ex?.dados ? ` · <b>${pct(ex.dados.confianca)}</b> dos registros conferem (Auditor de dados)` : ""}</p>
    <div class="kpis">
      ${kpi("Vendido", brl(a.vendido), a.vendido, b.vendido, a.vendidoDigital ? `${brl(a.vendidoDigital)} do digital` : "")}
      ${kpi("Recebido", brl(a.recebido), a.recebido, b.recebido)}
      ${kpi("Resultado de caixa", brl(a.dre.resultado), a.dre.resultado, b.dre.resultado, a.dre.resultadoPct != null ? `${pct(a.dre.resultadoPct)} da receita` : "")}
      ${kpi("Margem bruta", pct(a.dre.margemBrutaPct), a.dre.margemBrutaPct, b.dre.margemBrutaPct)}
      ${kpi("Pedidos", num(a.pedidos), a.pedidos, b.pedidos, `${num(a.unidades)} un`)}
      ${kpi("Ticket médio (offset)", brl(a.ticket), a.ticket, b.ticket)}
      ${kpi("Conversão de orçamentos", pct(a.conversao, 0), a.conversao, b.conversao, `${num(a.orcamentos)} orçamentos`)}
      ${kpi("Clientes novos", num(a.novos), a.novos, b.novos)}
    </div>
    <h2>Leitura do período</h2>
    <ul class="leitura">${d.leitura.map(t => `<li>${esc(t)}</li>`).join("") || "<li>Sem movimento suficiente para comparar.</li>"}</ul>
    <h2>Últimos 6 meses</h2>${graficoMeses(d.meses)}
    ${rod(1)}</section>`

  const p2 = `<section class="pg">${cab("Resultado")}
    <h1>Demonstrativo de resultado</h1><p class="sub">Regime de caixa (o que entrou e saiu no período), igual ao Financeiro. Movimentos na conta corrente de fornecedor ficam de fora.${a.vendidoDigital ? " Os pagamentos do digital (Asaas/InfinitePay) não entram aqui; estão na página Comercial." : ""}</p>
    <table class="t"><thead><tr><th>Conta</th><th class="r">Período</th><th class="r">% receita</th><th class="r">Anterior</th><th class="r">Variação</th></tr></thead><tbody>
      ${linhaDre("Receita recebida", a.dre.receita, b.dre.receita, { forte: true })}
      ${linhaDre("Pedidos", a.dre.receitaPedidos, b.dre.receitaPedidos, { nivel: true })}
      ${a.dre.receitaSobras || b.dre.receitaSobras ? linhaDre("Sobras vendidas", a.dre.receitaSobras, b.dre.receitaSobras, { nivel: true }) : ""}
      ${a.dre.receitaOutras || b.dre.receitaOutras ? linhaDre("Outras receitas", a.dre.receitaOutras, b.dre.receitaOutras, { nivel: true }) : ""}
      ${linhaDre("Custo de produção", a.dre.custoProducao, b.dre.custoProducao, { forte: true, neg: true })}
      ${a.dre.custosProducao.slice(0, 8).map(x => linhaDre(x.nome, x.valor, dreAnt(x.nome, "custosProducao"), { nivel: true, neg: true })).join("")}
      ${linhaDre("Margem bruta", a.dre.margemBruta, b.dre.margemBruta, { forte: true })}
      ${linhaDre("Despesas operacionais", a.dre.despesaOperacional, b.dre.despesaOperacional, { forte: true, neg: true })}
      ${a.dre.despesasOperacionais.slice(0, 10).map(x => linhaDre(x.nome, x.valor, dreAnt(x.nome, "despesasOperacionais"), { nivel: true, neg: true })).join("")}
      ${linhaDre("Resultado", a.dre.resultado, b.dre.resultado, { forte: true })}
      ${a.dre.impostoEstimado ? linhaDre("Imposto estimado", a.dre.impostoEstimado, b.dre.impostoEstimado, { nivel: true, neg: true }) + linhaDre("Resultado após imposto", a.dre.resultadoAposImposto, b.dre.resultadoAposImposto, { forte: true }) : ""}
    </tbody></table>
    <h2>Despesas por categoria</h2>
    <table class="t"><thead><tr><th>Categoria</th><th class="r">Período</th><th class="r">Anterior</th><th class="r">Variação</th></tr></thead><tbody>
      ${d.despesasCat.slice(0, 12).map(c => `<tr><td>${esc(c.nome)}</td><td class="r">${brl(c.valor)}</td><td class="r m">${brl(c.ant)}</td><td class="r">${delta(c.valor, c.ant, true)}</td></tr>`).join("") || `<tr><td colspan="4" class="m">Sem despesas pagas no período.</td></tr>`}
    </tbody></table>
    ${rod(2)}</section>`

  const p3 = `<section class="pg">${cab("Caixa e recebíveis")}
    <h1>Caixa e recebíveis</h1><p class="sub">Movimento do período e a posição de hoje.</p>
    <div class="kpis k3">
      ${kpi("Entrou", brl(a.recebido), a.recebido, b.recebido)}
      ${kpi("Saiu", brl(a.pago), a.pago, b.pago, "", true)}
      ${kpi("Geração de caixa", brl(a.caixa), a.caixa, b.caixa)}
    </div>
    <div class="duas">
      <div><h2>A receber por idade (hoje)</h2>
        <table class="t"><tbody>${d.aging.map(x => `<tr class="${x.rotulo.includes("60") && x.valor ? "alerta" : ""}"><td>${x.rotulo}</td><td class="r m">${x.qtd || ""}</td><td class="r">${brl(x.valor)}</td></tr>`).join("")}</tbody></table>
        <h2>Quem mais deve</h2>
        <table class="t"><thead><tr><th>Cliente</th><th class="r">Saldo</th><th class="r">Vencido</th></tr></thead><tbody>
        ${d.devedores.map(x => `<tr><td>${esc(x.nome)}<small>${esc(x.numero)}</small></td><td class="r">${brl(x.saldo)}</td><td class="r ${x.vencido > 0.5 ? "neg" : "m"}">${x.vencido > 0.5 ? brl(x.vencido) : "—"}</td></tr>`).join("") || `<tr><td colspan="3" class="m">Ninguém devendo.</td></tr>`}</tbody></table>
      </div>
      <div><h2>A pagar até 30 dias · ${brl(d.aPagarTotal)}</h2>
        ${d.aPagarVencido ? `<p class="neg" style="margin:0 0 4px">${brl(d.aPagarVencido)} já vencidos (pagou e não deu baixa, ou está atrasado)</p>` : ""}
        <table class="t"><thead><tr><th>Conta</th><th class="r">Vence</th><th class="r">Valor</th></tr></thead><tbody>
        ${d.aPagar.map(x => `<tr><td>${esc(x.descricao)}</td><td class="r ${x.vencido ? "neg" : "m"}">${x.venc.split("-").reverse().slice(0, x.vencido ? 3 : 2).join("/")}${x.vencido ? " · vencido" : ""}</td><td class="r">${brl(x.valor)}</td></tr>`).join("") || `<tr><td colspan="3" class="m">Nada a pagar.</td></tr>`}</tbody></table>
      </div>
    </div>
    ${rod(3)}</section>`

  const L = ex?.leads, LA = ex?.leadsAnt, Dg = ex?.digital, DgA = ex?.digitalAnt
  const p4 = `<section class="pg">${cab("Comercial")}
    <h1>Comercial</h1><p class="sub">Do contato ao pedido.</p>
    ${L ? `<div class="kpis">
      ${kpi("Contatos novos", num(L.novos), L.novos, LA?.novos ?? null, `${num(L.doAnuncio)} do anúncio`)}
      ${kpi("Leads bons (MQL)", num(L.mql), L.mql, LA?.mql ?? null, L.novos ? `${pct(L.mql / L.novos * 100, 0)} dos contatos` : "")}
      ${kpi("Investido em anúncios", ex?.meta != null ? brl(ex.meta) : "—", ex?.meta ?? null, ex?.metaAnt ?? null, "", true)}
      ${kpi("Custo por cliente novo", ex?.meta != null && a.novos ? brl(ex.meta / a.novos) : "—", ex?.meta != null && a.novos ? ex.meta / a.novos : null, ex?.metaAnt != null && b.novos ? ex.metaAnt / b.novos : null, "", true)}
    </div>` : ""}
    <div class="kpis">
      ${kpi("Orçamentos (offset)", num(a.orcamentos), a.orcamentos, b.orcamentos)}
      ${kpi("Conversão (offset)", pct(a.conversao, 0), a.conversao, b.conversao)}
      ${kpi("Preço médio por caixa", a.precoUnidade != null ? brl2(a.precoUnidade) : "—", a.precoUnidade, b.precoUnidade)}
      ${kpi("Margem de contribuição", pct(a.margem), a.margem, b.margem, "pedidos com custo lançado")}
    </div>
    ${Dg && (Dg.orcados || Dg.pagos || DgA?.orcados || DgA?.pagos) ? `<h2>Digital</h2><div class="kpis">
      ${kpi("Orçamentos digitais", num(Dg.orcados), Dg.orcados, DgA?.orcados ?? null)}
      ${kpi("Pagos (sinal)", num(Dg.pagos), Dg.pagos, DgA?.pagos ?? null, Dg.conversao != null ? `${pct(Dg.conversao, 0)} dos orçados` : "")}
      ${kpi("Faturamento digital", brl(Dg.faturamento), Dg.faturamento, DgA?.faturamento ?? null)}
      ${kpi("Ticket digital", brl(Dg.ticket), Dg.ticket, DgA?.ticket ?? null)}
    </div>` : ""}
    <div class="duas">
      <div><h2>Maiores clientes${d.concentracaoTop3 != null && d.clientes.length >= 4 ? ` · top 3 = ${pct(d.concentracaoTop3, 0)}` : ""}</h2>
        ${barraH(d.clientes.slice(0, 10).map(c => ({ rotulo: c.nome, valor: c.valor, extra: `${c.pedidos}×${c.novo ? " · novo" : ""}` })))}
        ${!d.clientes.length ? `<p class="m">Nenhum pedido no período.</p>` : ""}</div>
      <div><h2>Por que perdemos</h2>
        ${d.perdas.length ? barraH(d.perdas.map(p => ({ rotulo: p.motivo, valor: p.valor, extra: `${p.qtd}×` })), "#e0745a") : `<p class="m">Nenhuma perda com motivo no período.</p>`}
        ${d.venceram ? `<p class="m">Mais ${d.venceram} ${d.venceram === 1 ? "orçamento venceu" : "orçamentos venceram"} sem resposta.</p>` : ""}</div>
    </div>
    ${rod(4)}</section>`

  const p5 = `<section class="pg">${cab("Pedidos do período")}
    <h1>Pedidos fechados no período (offset)</h1><p class="sub">${d.pedidosTabela.length} pedidos · margem = (venda − custo lançado) ÷ venda. Em vermelho, margem abaixo de 30%.</p>
    <table class="t pq"><thead><tr><th>Pedido</th><th>Cliente</th><th class="r">Fechou</th><th class="r">Qtd</th><th class="r">Venda</th><th class="r">Custo</th><th class="r">Margem</th><th class="r">Saldo</th></tr></thead><tbody>
    ${d.pedidosTabela.map(p => `<tr><td>${esc(p.numero)}</td><td>${esc(p.cliente)}</td><td class="r m">${p.data.split("-").reverse().slice(0, 2).join("/")}</td><td class="r">${num(p.qtd)}</td><td class="r">${brl(p.valor)}</td><td class="r m">${p.custo ? brl(p.custo) : "—"}</td><td class="r ${p.margem != null && p.margem < 30 ? "neg" : ""}">${pct(p.margem, 1)}</td><td class="r ${p.saldo > 0.5 ? "" : "m"}">${p.saldo > 0.5 ? brl(p.saldo) : "quitado"}</td></tr>`).join("") || `<tr><td colspan="8" class="m">Nenhum pedido fechado no período.</td></tr>`}
    </tbody></table>
    <h2>Entregas</h2>
    <p>${d.entregas.total ? `${d.entregas.total} ${d.entregas.total === 1 ? "pedido entregue" : "pedidos entregues"} no período · <b>${num((d.entregas.noPrazo) / Math.max(1, d.entregas.total - d.entregas.semPrazo) * 100, 0)}% no prazo</b>${d.entregas.atrasoMedio != null ? ` · atraso médio de ${num(d.entregas.atrasoMedio, 1)} dias nos atrasados` : ""}${d.entregas.semPrazo ? ` · ${d.entregas.semPrazo} sem prazo combinado` : ""}.` : "Nenhuma entrega registrada no período."}</p>
    ${ex?.dados ? `<h2>Confiabilidade dos números</h2><p>O Auditor de dados conferiu em ${new Date(ex.dados.em).toLocaleString("pt-BR")}: <b>${pct(ex.dados.confianca)}</b> dos registros batem entre pedidos, financeiro, banco e digital. ${ex.dados.total ? `${ex.dados.total} itens a acertar (${ex.dados.graves} graves, ${brl(ex.dados.valorEmJogo)} envolvidos) na tela Dados.` : "Nenhuma diferença encontrada."}</p>` : ""}
    ${rod(5)}</section>`

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${d.titulo} · ${esc(d.periodoNome)}</title><style>
  @page{size:A4;margin:12mm}
  *{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1d1a29;font-size:10.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#f2f1f6}
  .pg{background:#fff;width:186mm;min-height:270mm;margin:10px auto;padding:0;position:relative;page-break-after:always;break-after:page;display:flex;flex-direction:column}
  .pg:last-child{page-break-after:auto;break-after:auto}
  @media screen{.pg{padding:12mm;width:210mm;min-height:297mm;box-shadow:0 2px 12px rgba(0,0,0,.08)}}
  @media print{body{background:#fff}.pg{margin:0;width:auto;min-height:271mm}}
  .cab{display:flex;align-items:center;gap:10px;border-bottom:2px solid #7c5ce0;padding-bottom:8px;margin-bottom:12px}
  .cab img{height:22px}.cab div{display:flex;flex-direction:column}.cab b{font-size:12px}.cab span{color:#6b6878;font-size:10px}
  h1{font-size:17px;margin:2px 0 2px}h2{font-size:11.5px;margin:14px 0 6px;color:#3a3550;text-transform:uppercase;letter-spacing:.04em}
  .sub{color:#6b6878;margin:0 0 10px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:6px 0}.kpis.k3{grid-template-columns:repeat(3,1fr)}
  .kpi{border:1px solid #e9e6f1;border-radius:7px;padding:7px 9px}.kl{color:#6b6878;font-size:9px;text-transform:uppercase;letter-spacing:.04em}
  .kv{font-size:15px;font-weight:700;margin:2px 0}.ks{font-size:9px;color:#6b6878}
  .dbom{color:#13844f;font-weight:700}.druim{color:#c92f31;font-weight:700}.d0{color:#9a97a5}
  .leitura{margin:0;padding-left:16px}.leitura li{margin:3px 0;line-height:1.45}
  .t{width:100%;border-collapse:collapse}.t th{font-size:9px;color:#6b6878;text-align:left;font-weight:600;border-bottom:1px solid #e3e0ec;padding:4px 6px}
  .t td{padding:4px 6px;border-bottom:1px solid #f0eef5;vertical-align:top}.t .r{text-align:right;white-space:nowrap}.t .m,.m{color:#8a8796}
  .t tr.forte td{font-weight:700;background:#f7f6fb}.t td.niv{padding-left:18px;color:#4a4658}.t small{display:block;color:#8a8796;font-size:8.5px}
  .t tr.alerta td{color:#c92f31;font-weight:600}.neg{color:#c92f31;font-weight:600}
  .pq td{font-size:9.5px;padding:3px 5px}
  .duas{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .bh{display:grid;grid-template-columns:38% 1fr auto;gap:6px;align-items:center;margin:3px 0}.bh-r{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bh-t{height:8px;background:#f0eef5;border-radius:4px;overflow:hidden}.bh-t div{height:100%;border-radius:4px}.bh-v{text-align:right;white-space:nowrap;font-weight:600}.bh-v small{display:block;font-weight:400;color:#8a8796;font-size:8.5px}
  .eixo{font-size:10px;fill:#6b6878}.legenda{display:flex;gap:14px;font-size:9.5px;color:#6b6878;margin-top:2px}.legenda i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}
  .rod{margin-top:auto;padding-top:10px;display:flex;justify-content:space-between;color:#9a97a5;font-size:8.5px;border-top:1px solid #f0eef5}
  </style></head><body>${p1}${p2}${p3}${p4}${p5}</body></html>`
}
