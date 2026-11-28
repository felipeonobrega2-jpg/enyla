// Seções do "Financeiro completo" do relatório gerencial em PDF. Puro e só leitura: reaproveita a previsão de caixa
// (caixa.ts), os recebíveis (negocio.ts) e a meta do mês; nada é gravado, enviado ou cobrado.
// Regra: número que não existe aparece como "sem dado" (null aqui), nunca como zero inventado.
import type { KanbanCard, LancamentoFinanceiro } from "../types"
import type { Configuracoes } from "../config"
import { montarPedidos, recebiveis, vendasDoPeriodo, noPeriodo, type Periodo, type Pedido } from "./negocio"
import { previsaoDeCaixa, type Origem } from "./caixa"
import { semNeutras } from "./financeiro"

const DIA = 86_400_000
const iso = (d: Date) => d.toLocaleDateString("sv-SE")

export type MesPrevisto = {
  mes: string                      // AAAA-MM
  entradas: number                 // cobranças lançadas e saldos dos pedidos (na entrega)
  saidasFixas: number              // gastos fixos
  saidasLotes: number              // custos de produção dos lotes em aberto
  saidasOutras: number             // despesas lançadas a pagar e pagamentos planejados a fornecedor
  saldoFinal: number | null        // null = sem saldo informado em conta
}
export type PrevisaoMensal = { saldoAtual: number | null; meses: MesPrevisto[]; semDataTotal: number; semDataQtd: number }

const SAIDA_DE: Record<Origem, "fixas" | "lotes" | "outras" | null> = {
  cobranca: null, saldoEntrega: null, fixo: "fixas", producao: "lotes", despesa: "outras", planoConta: "outras",
}

/** Previsão mês a mês, de hoje até o mês `ateMes` (AAAA-MM, inclusive), em cima da previsão semanal de caixa. */
export function previsaoMensal(a: {
  kanban: KanbanCard[]; lancamentos: LancamentoFinanceiro[]; historico: { numero?: string; form?: unknown }[]
  config: Configuracoes; hoje: Date; ateMes: string
}): PrevisaoMensal {
  const hojeIso = iso(a.hoje)
  const [ano, mes] = a.ateMes.split("-").map(Number)
  const fim = iso(new Date(ano, mes, 0, 12))   // último dia do mês final
  const dias = Math.round((new Date(fim + "T12:00:00").getTime() - new Date(hojeIso + "T12:00:00").getTime()) / DIA)
  if (dias < 0) return { saldoAtual: null, meses: [], semDataTotal: 0, semDataQtd: 0 }
  const prev = previsaoDeCaixa({
    pedidos: montarPedidos(a.kanban, a.lancamentos), lancamentos: a.lancamentos,
    historico: a.historico as Parameters<typeof previsaoDeCaixa>[0]["historico"], config: a.config, hoje: a.hoje, semanas: Math.ceil((dias + 1) / 7),
  })
  const meses: MesPrevisto[] = []
  for (let d = new Date(a.hoje.getFullYear(), a.hoje.getMonth(), 1, 12); iso(d).slice(0, 7) <= a.ateMes; d = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12))
    meses.push({ mes: iso(d).slice(0, 7), entradas: 0, saidasFixas: 0, saidasLotes: 0, saidasOutras: 0, saldoFinal: null })
  for (const s of prev.semanas) for (const m of [...s.entradas, ...s.saidas]) {
    if (m.data > fim) continue
    const alvo = meses.find(x => x.mes === m.data.slice(0, 7))
    if (!alvo) continue
    if (m.tipo === "entrada") alvo.entradas += m.valor
    else { const k = SAIDA_DE[m.origem]; if (k === "fixas") alvo.saidasFixas += m.valor; else if (k === "lotes") alvo.saidasLotes += m.valor; else alvo.saidasOutras += m.valor }
  }
  let saldo = prev.saldoInicial
  for (const m of meses) {
    if (saldo != null) saldo += m.entradas - m.saidasFixas - m.saidasLotes - m.saidasOutras
    m.saldoFinal = saldo
  }
  return { saldoAtual: prev.saldoInicial, meses, semDataTotal: prev.semData.reduce((s, m) => s + m.valor, 0), semDataQtd: prev.semData.length }
}

export type LinhaReceber = { cliente: string; lote: string; valor: number; vencimento: string | null; diasAtraso: number | null }

const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] || "—"

/** Recebíveis em aberto: só o primeiro nome do cliente e o código do lote. Vencimento = a cobrança pendente mais antiga. */
export function recebiveisAbertos(pedidos: Pedido[], lancamentos: LancamentoFinanceiro[], hoje: Date): LinhaReceber[] {
  const hojeIso = iso(hoje)
  return recebiveis(pedidos, lancamentos).comSaldo.map(p => {
    const pend = p.receitas.filter(l => l.status !== "pago" && !p.sobrasQuitadas.includes(l.id)).map(l => l.dataVencimento).sort()
    const venc = pend[0] ?? null
    const atraso = venc && venc < hojeIso ? Math.round((new Date(hojeIso + "T12:00:00").getTime() - new Date(venc + "T12:00:00").getTime()) / DIA) : venc ? 0 : null
    return { cliente: primeiroNome(p.nomeCliente), lote: p.numero, valor: p.aReceber, vencimento: venc, diasAtraso: atraso }
  }).sort((x, y) => (y.diasAtraso ?? -1) - (x.diasAtraso ?? -1) || y.valor - x.valor)
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const ehRetirada = (l: LancamentoFinanceiro, nomeCategoria: (id: string) => string) =>
  /retirada|pro[\s_-]?labore|repassar[\s_-]?felipe/.test(semAcento(`${l.categoria ?? ""} ${nomeCategoria(l.categoria || "")}`))
const ehIA = (l: LancamentoFinanceiro) => /\bia\b|anthropic|claude|openai|chatgpt/.test(semAcento(`${l.subcategoria ?? ""} ${l.descricao}`))

const pagoNoPeriodo = (ls: LancamentoFinanceiro[], per: Periodo) =>
  ls.filter(l => l.tipo === "despesa" && l.status === "pago" && l.formaPagamento !== "conta" && noPeriodo(l.dataPagamento ?? l.dataVencimento, per))

/** Retiradas do Felipe pagas no período. null = nenhum lançamento nessa categoria (sem dado). */
export function retiradasDoPeriodo(ls: LancamentoFinanceiro[], per: Periodo, nomeCategoria: (id: string) => string, neutras?: ReadonlySet<string>) {
  const itens = pagoNoPeriodo(semNeutras(ls, neutras), per).filter(l => ehRetirada(l, nomeCategoria))
    .map(l => ({ data: l.dataPagamento ?? l.dataVencimento, descricao: l.descricao, valor: l.valor })).sort((x, y) => x.data.localeCompare(y.data))
  return { itens, total: itens.length ? itens.reduce((s, i) => s + i.valor, 0) : null }
}

/** Gasto de IA pago no período (lançamentos de IA/Anthropic/Claude/OpenAI). null = nenhum lançamento (sem dado). */
export function gastoIADoPeriodo(ls: LancamentoFinanceiro[], per: Periodo, neutras?: ReadonlySet<string>): number | null {
  const itens = pagoNoPeriodo(semNeutras(ls, neutras), per).filter(ehIA)
  return itens.length ? itens.reduce((s, l) => s + l.valor, 0) : null
}

/** Meta do mês de `hoje`: meta (config), realizado até agora (vendido offset do mês) e quanto falta. null = sem meta definida. */
export function metaDoMes(a: { pedidos: Pedido[]; lancamentos: LancamentoFinanceiro[]; metaMensal?: number | null; hoje: Date }) {
  const rotulo = a.hoje.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
  const meta = a.metaMensal && a.metaMensal > 0 ? a.metaMensal : null
  const realizado = vendasDoPeriodo(a.pedidos, a.lancamentos, { from: new Date(a.hoje.getFullYear(), a.hoje.getMonth(), 1), to: new Date(a.hoje.getFullYear(), a.hoje.getMonth() + 1, 0, 23, 59, 59) }).receita
  return { rotulo, meta, realizado: meta ? realizado : null, falta: meta ? Math.max(0, meta - realizado) : null, pct: meta ? realizado / meta * 100 : null }
}

export type DadosFinanceiro = {
  previsao: PrevisaoMensal
  receber: LinhaReceber[]
  retiradas: ReturnType<typeof retiradasDoPeriodo>
  iaGasto: number | null
  anuncios: number | null
  meta: ReturnType<typeof metaDoMes>
}

export function montarFinanceiro(a: {
  kanban: KanbanCard[]; lancamentos: LancamentoFinanceiro[]; historico: { numero?: string; form?: unknown }[]; config: Configuracoes
  periodo: { de: Date; ate: Date }; nomeCategoria: (id: string) => string; neutras?: ReadonlySet<string>; anuncios: number | null; hoje: Date; ateMes?: string
}): DadosFinanceiro {
  const per: Periodo = { from: new Date(a.periodo.de.getFullYear(), a.periodo.de.getMonth(), a.periodo.de.getDate()), to: new Date(a.periodo.ate.getFullYear(), a.periodo.ate.getMonth(), a.periodo.ate.getDate(), 23, 59, 59) }
  const pedidos = montarPedidos(a.kanban, a.lancamentos)
  return {
    previsao: previsaoMensal({ kanban: a.kanban, lancamentos: a.lancamentos, historico: a.historico, config: a.config, hoje: a.hoje, ateMes: a.ateMes ?? "2027-02" }),
    receber: recebiveisAbertos(pedidos, a.lancamentos, a.hoje),
    retiradas: retiradasDoPeriodo(a.lancamentos, per, a.nomeCategoria, a.neutras),
    iaGasto: gastoIADoPeriodo(a.lancamentos, per, a.neutras),
    anuncios: a.anuncios,
    meta: metaDoMes({ pedidos, lancamentos: a.lancamentos, metaMensal: a.config.metaMensal, hoje: a.hoje }),
  }
}

// ── HTML (mesmas classes e logo do PDF gerencial) ─────────────────────────────
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]!))
const SEM = `<span class="m">sem dado</span>`
const v = (n: number | null) => n == null ? SEM : brl(n)
const dm = (s: string) => s.split("-").reverse().join("/")
const nomeMes = (m: string) => new Date(m + "-15T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "")

export function paginasFinanceiro(f: DadosFinanceiro, cab: (t: string) => string, rod: (n: number) => string, primeiraPagina: number): string {
  const P = f.previsao
  const p1 = `<section class="pg">${cab("Financeiro completo")}
    <h1>Caixa e previsão até fevereiro de 2027</h1><p class="sub">Saldo atual em conta: <b>${v(P.saldoAtual)}</b>. Entradas: cobranças lançadas e saldos dos pedidos (na entrega). Saídas: gastos fixos, custos dos lotes em aberto e contas lançadas.</p>
    <table class="t"><thead><tr><th>Mês</th><th class="r">Entradas</th><th class="r">Gastos fixos</th><th class="r">Custos de lotes</th><th class="r">Outras saídas</th><th class="r">Saldo no fim</th></tr></thead><tbody>
    ${P.meses.map(m => `<tr><td>${nomeMes(m.mes)}</td><td class="r">${brl(m.entradas)}</td><td class="r">${brl(m.saidasFixas)}</td><td class="r">${brl(m.saidasLotes)}</td><td class="r">${brl(m.saidasOutras)}</td><td class="r ${m.saldoFinal != null && m.saldoFinal < 0 ? "neg" : ""}">${v(m.saldoFinal)}</td></tr>`).join("") || `<tr><td colspan="6" class="m">Sem meses a prever.</td></tr>`}
    </tbody></table>
    ${P.semDataQtd ? `<p class="m">Mais ${brl(P.semDataTotal)} a receber de ${P.semDataQtd} ${P.semDataQtd === 1 ? "pedido" : "pedidos"} sem data de entrega: não entram em nenhum mês.</p>` : ""}
    ${P.saldoAtual == null ? `<p class="m">Sem saldo informado em conta: o saldo mês a mês não pode ser calculado.</p>` : ""}
    <h2>Recebíveis e cobranças em aberto</h2>
    <table class="t pq"><thead><tr><th>Cliente</th><th>Lote</th><th class="r">Valor</th><th class="r">Vencimento</th><th class="r">Dias em atraso</th></tr></thead><tbody>
    ${f.receber.slice(0, 25).map(r => `<tr><td>${esc(r.cliente)}</td><td>${esc(r.lote)}</td><td class="r">${brl(r.valor)}</td><td class="r">${r.vencimento ? dm(r.vencimento) : `<span class="m">sem cobrança</span>`}</td><td class="r ${r.diasAtraso ? "neg" : "m"}">${r.diasAtraso == null ? "sem dado" : r.diasAtraso || "—"}</td></tr>`).join("") || `<tr><td colspan="5" class="m">Nada a receber.</td></tr>`}
    </tbody></table>${f.receber.length > 25 ? `<p class="m">e mais ${f.receber.length - 25} pedidos.</p>` : ""}
    ${rod(primeiraPagina)}</section>`

  const p2 = `<section class="pg">${cab("Financeiro completo")}
    <h1>Retiradas, IA, anúncios e meta</h1><p class="sub">Do período do relatório.</p>
    <div class="kpis k3">
      <div class="kpi"><div class="kl">Retiradas do Felipe</div><div class="kv">${v(f.retiradas.total)}</div></div>
      <div class="kpi"><div class="kl">Gasto com IA</div><div class="kv">${v(f.iaGasto)}</div></div>
      <div class="kpi"><div class="kl">Gasto com anúncios</div><div class="kv">${v(f.anuncios)}</div></div>
    </div>
    ${f.retiradas.itens.length ? `<h2>Retiradas no período</h2><table class="t"><tbody>${f.retiradas.itens.map(i => `<tr><td>${dm(i.data)}</td><td>${esc(i.descricao)}</td><td class="r">${brl(i.valor)}</td></tr>`).join("")}</tbody></table>` : ""}
    <h2>Meta de ${esc(f.meta.rotulo)}</h2>
    <div class="kpis k3">
      <div class="kpi"><div class="kl">Meta</div><div class="kv">${v(f.meta.meta)}</div></div>
      <div class="kpi"><div class="kl">Vendido até agora (offset)</div><div class="kv">${v(f.meta.realizado)}</div></div>
      <div class="kpi"><div class="kl">Falta</div><div class="kv">${v(f.meta.falta)}</div></div>
    </div>
    <h2>Fontes</h2>
    <ul class="leitura">
      <li>Saldo atual: saldo informado nas contas (Configurações).</li>
      <li>Entradas previstas: cobranças lançadas no Financeiro e saldo dos pedidos pela data de entrega (estimativa).</li>
      <li>Saídas previstas: gastos fixos cadastrados, despesas lançadas a pagar e custo de produção dos lotes em aberto (estimativa do motor de cálculo menos o já lançado).</li>
      <li>Recebíveis: pedidos do Kanban e lançamentos de receita.</li>
      <li>Retiradas e gasto com IA: lançamentos pagos no período, nas categorias de retirada e nos lançamentos de IA.</li>
      <li>Anúncios: Meta Ads, do mesmo período.</li>
      <li>Meta: meta mensal das Configurações; vendido do mês pelos pedidos fechados.</li>
    </ul>
    ${rod(primeiraPagina + 1)}</section>`
  return p1 + p2
}
