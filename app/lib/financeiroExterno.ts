// Leitura financeira da porta externa (GET /api/externo?o=financeiro), só para a chave do CFO. Só leitura: nada é gravado.
// Reaproveita as contas das telas (financeiro, negocio, financeiroAndar, calibragem, pendenciasDono). De cliente sai só
// nome e valores; nunca telefone, e-mail, CNPJ, endereço ou documento. Do banco, nunca contraparte_doc nem o JSON bruto.
import type { KanbanCard, LancamentoFinanceiro } from "@/app/types"
import type { Configuracoes, GastoFixo } from "@/app/config"
import { supabase } from "./supabase"
import { lerConfigLinha } from "./configAtomica"
import { hoje, calcularResumoFinanceiro, dreDoPeriodo, idsNeutros, lancamentoNeutro } from "./financeiro"
import { receberDigital, juntarPedidos, ehPedidoDigital, type PedidoParaReceber } from "./receberDigital"
import { montarPedidos, recebiveis, noPeriodo, type Periodo as Intervalo } from "./negocio"
import { financeiroDoAndar } from "./financeiroAndar"
import { saldoInformado } from "./caixa"
import { compararPedidos } from "./calibragem"
import { pendencias } from "./pendenciasDono"
import { recebiveisDigitais, consultaAsaas, vinculosDoBanco, type PedidoReceber } from "./digitalReceber"
import type { StatusPluggy } from "./bancoServidor"
import type { Rodada } from "./rateioRodada"

export const PARTES = ["receber", "pagar", "banco", "saldos", "gastos", "margem", "depende", "asaas"] as const
export type Parte = typeof PARTES[number]
export const PERIODOS = ["mes", "trimestre", "semestre", "ano", "tudo"] as const
type PeriodoNome = typeof PERIODOS[number]
const ESTADOS = ["pendente", "vinculada", "criada", "ignorada", "todas"]

export const AJUDA_FINANCEIRO: Record<string, string> = {
  "?o=financeiro": "SÓ A CHAVE DO CFO (as outras recebem 403). Só leitura. Sem &parte devolve o resumo (a receber, a pagar, saldos, números do mês) e a lista das partes. Período opcional: &periodo=mes (padrão) | trimestre | semestre | ano | tudo, em America/Sao_Paulo",
  "?o=financeiro&incluirEstornados=": "opcional, junto com qualquer parte: 1 | true | sim inclui nos cálculos os lançamentos desativados/estornados (estornadoEm preenchido); sem ele, ficam de fora de receber, pagar, gastos e margem. Outro valor: 400. A resposta traz incluirEstornados",
  "?o=financeiro&parte=receber": "contas a receber: pedidos com saldo, vencidos e lançamentos a conferir. De cliente, só nome e valores. O bloco 'digital' traz os pedidos Digital abertos (sinal_pago, arte, producao e os com saldo; sem teste e cancelado): total, sinal, pago, emConferencia, saldo e vencimentoSaldo (vazio até o material ficar pronto). Pago só com txId 'asaas:' ou lançamento ligado a transação do banco; o resto fica em conferência",
  "?o=financeiro&parte=asaas": "só leitura, por pedido Digital (sem teste e sem nome, documento, telefone, e-mail ou jid): id, e para sinal e restante o id da cobrança Asaas, valor, status (confirmado pelo Asaas | confirmado pelo banco | em conferência | aguardando pagamento) e data de recebimento. Mesma regra de pago do a receber",
  "?o=financeiro&parte=pagar": "contas a pagar: despesas não pagas (fora a conta corrente de fornecedor), com flag de vencido",
  "?o=financeiro&parte=banco&estado=": "movimentos e conciliação do banco (pendente | vinculada | criada | ignorada | todas; padrão pendente), sem documento da contraparte",
  "?o=financeiro&parte=saldos": "saldo por conta (cadastro e Pluggy) e total",
  "?o=financeiro&parte=gastos": "gastos fixos cadastrados e gastos variáveis pagos no período, por categoria",
  "?o=financeiro&parte=margem": "DRE do período, margem e custo por pedido (previsto x real quando há orçamento). Pedido impresso numa rodada (várias encomendas na mesma tiragem) traz rodadaId, custoProprio (clichê, fotolito, arte, hot stamping, frete, imposto, faca exclusiva), custoRateado (fração da tiragem), custo e margem já com o rateio, e margemRodada/margemRodadaPct/rodadaVermelha (a rodada inteira; o alerta vermelho olha a rodada). Pedido sem rodada: custo = custo lançado, sem esses campos",
  "?o=financeiro&parte=depende": "'Dinheiro parado' e integrações de cobrança/banco do 'Depende de você' (só situação)",
}

type Cfg = Configuracoes & { pluggy?: { itens?: unknown[] }; pluggyStatus?: StatusPluggy } & Record<string, unknown>
type Negocio = { comissaoValor: number; status: string }
export type Dados = { kanban: KanbanCard[]; lancamentos: LancamentoFinanceiro[]; negocios: Negocio[]; cfg: Cfg }

const r2 = (n: number) => Math.round(n * 100) / 100
const soma = (ls: { valor: number }[]) => r2(ls.reduce((s, l) => s + l.valor, 0))
const dia = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00")

// Período no estilo da tela (Financeiro), com o dia de hoje em São Paulo
export function intervalo(nome: PeriodoNome, hojeIso = hoje()): Intervalo {
  if (nome === "tudo") return { from: null, to: null }
  const [a, m] = hojeIso.split("-").map(Number)
  if (nome === "mes") return { from: new Date(a, m - 1, 1, 12), to: new Date(a, m, 0, 12) }
  if (nome === "trimestre") return { from: new Date(a, Math.floor((m - 1) / 3) * 3, 1, 12), to: null }
  if (nome === "semestre") return { from: new Date(a, m <= 6 ? 0 : 6, 1, 12), to: null }
  return { from: new Date(a, 0, 1, 12), to: null }
}

export async function carregarFinanceiro(): Promise<Dados> {
  const [kanban, lancamentos, negocios, cfg] = await Promise.all([
    supabase.from("KanbanCard").select("*").order("createdAt", { ascending: false }),
    supabase.from("LancamentoFinanceiro").select("*").order("dataVencimento", { ascending: false }),
    supabase.from("NegocioParceiro").select("*"),
    lerConfigLinha(),
  ])
  return {
    kanban: (kanban.data ?? []) as KanbanCard[], lancamentos: (lancamentos.data ?? []) as LancamentoFinanceiro[],
    negocios: (negocios.data ?? []) as Negocio[], cfg: (cfg.data?.data ?? {}) as Cfg,
  }
}

const offsetDe = (ls: LancamentoFinanceiro[]) => ls.filter(l => (l.unidade ?? "offset") === "offset" && l.formaPagamento !== "conta")
const aPagarDe = (ls: LancamentoFinanceiro[]) => ls.filter(l => l.tipo === "despesa" && l.status !== "pago" && l.formaPagamento !== "conta")

function contasPagar(ls: LancamentoFinanceiro[], hj: string) {
  const itens = aPagarDe(ls).sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento)).map(l => {
    const vencido = l.dataVencimento < hj
    return { id: l.id, descricao: l.descricao, valor: l.valor, dataVencimento: l.dataVencimento, status: l.status, categoria: l.categoria ?? null, fornecedorId: l.fornecedorId ?? null,
      vencido, diasAtraso: vencido ? Math.round((dia(hj).getTime() - dia(l.dataVencimento).getTime()) / 86_400_000) : 0 }
  })
  return { total: soma(itens), vencido: soma(itens.filter(i => i.vencido)), quantidade: itens.length, itens }
}

function saldos(cfg: Cfg) {
  const contas = (cfg.contas ?? []).map(c => ({ id: c.id, nome: c.nome, banco: c.banco, tipo: c.tipo, saldo: c.saldo ?? null, ativa: c.ativa }))
  const p = cfg.pluggyStatus
  return {
    total: saldoInformado(cfg), contas,
    pluggy: p ? { em: p.em, erro: p.erro ?? null, contas: (p.contas ?? []).map(c => ({ id: c.id, nome: c.nome, banco: c.banco, saldo: c.saldo })) } : null,
  }
}

async function digitalDe(d: Dados) {
  const pedidos = ((d.cfg as Record<string, unknown>).pedidosDigitais ?? []) as PedidoReceber[]
  if (!pedidos.length) return { pedidos, vinculos: new Map<string, string | null>() }
  const { data } = await supabase.from("banco_transacoes").select("lancamento_ids, data").not("lancamento_ids", "is", null).limit(5000)
  return { pedidos, vinculos: vinculosDoBanco((data ?? []) as { lancamento_ids: string[] | null; data?: string | null }[]) }
}

async function receber(d: Dados, hj: string) {
  const dig = await digitalDe(d)
  const linhas = recebiveisDigitais(dig.pedidos, dig.vinculos, hj)
  const resumo = calcularResumoFinanceiro(d.kanban, d.lancamentos, d.negocios as never)
  const offset = offsetDe(d.lancamentos)
  // Digital na mesma lista: o saldo do restante vem dos lançamentos dig-{id}-* (a mesma base da página do cliente)
  const digLancs = d.lancamentos.filter(l => l.unidade === "digital" && l.formaPagamento !== "conta")
  const digital = receberDigital(d.cfg.pedidosDigitais as PedidoParaReceber[] | undefined, digLancs)
  const rec = recebiveis(juntarPedidos(montarPedidos(d.kanban, offset), digital), [...offset, ...digLancs])
  return {
    aReceberTotal: r2(resumo.aReceberTotal), emAtrasoTotal: r2(resumo.emAtrasoTotal), recebidoTotal: r2(resumo.recebidoTotal),
    aReceberDigital: r2(digital.reduce((s, p) => s + p.aReceber, 0)),
    pedidos: rec.comSaldo.map(p => ({ numero: p.numero, cliente: p.nomeCliente, etapa: p.etapa, venda: r2(p.venda), recebido: r2(p.recebido), aReceber: r2(p.aReceber), cobrado: r2(p.cobrado), vencido: r2(p.vencido), semCobranca: r2(p.semCobranca),
      ...(ehPedidoDigital(p) ? { unidade: "digital", sinal: r2(p.digital.sinal), pagoEm: p.digital.pagoEm, vencimento: p.digital.vencimento } : {}) })),
    vencidos: resumo.vencidos.map(v => ({ numero: v.loteNumero ?? v.cardNumero ?? null, cliente: v.nomeCliente, valor: r2(v.total), diasAtraso: v.diasAtraso, vencimento: v.lancamentos[0]?.dataVencimento ?? null, status: v.lancamentos[0]?.status ?? null })),
    aConferir: rec.aConferir.map(l => ({ id: l.id, numero: l.loteNumero ?? l.cardNumero ?? null, cliente: l.nomeCliente ?? null, valor: l.valor, vencimento: l.dataVencimento, status: l.status })),
    comissoesPendentes: soma(d.negocios.filter(n => n.status === "pendente").map(n => ({ valor: n.comissaoValor }))),
    digital: { saldoTotal: soma(linhas.map(l => ({ valor: l.saldo }))), emConferenciaTotal: soma(linhas.map(l => ({ valor: l.emConferencia }))), pedidos: linhas.map(({ id, status, total, sinal, pago, emConferencia, saldo, vencimentoSaldo, atrasado, cliente }) => ({ id, cliente, status, total, sinal, pago, emConferencia, saldo, vencimentoSaldo, atrasado })) },
  }
}

async function asaasDoCfo(d: Dados) {
  const dig = await digitalDe(d)
  return { pedidos: consultaAsaas(dig.pedidos, dig.vinculos) }
}

async function banco(estado: string, per: Intervalo) {
  let q = supabase.from("banco_transacoes").select("id, conta_id, conta_nome, data, valor, tipo, descricao, contraparte_nome, categoria_pluggy, estado, lancamento_ids, sugestao")
  if (estado !== "todas") q = q.eq("estado", estado)
  const { data, error } = await q.order("data", { ascending: false }).limit(estado === "pendente" ? 3000 : 400)
  const { count } = await supabase.from("banco_transacoes").select("id", { count: "exact", head: true }).eq("estado", "pendente")
  const lista = ((data ?? []) as Record<string, unknown>[]).filter(t => estado === "pendente" || noPeriodo(String(t.data ?? ""), per))
  return {
    estado, pendentes: count ?? 0, erro: error?.message ?? null,
    transacoes: lista.map(t => ({ id: t.id, conta_id: t.conta_id, conta_nome: t.conta_nome, data: t.data, valor: t.valor, tipo: t.tipo, descricao: t.descricao,
      contraparte_nome: t.contraparte_nome, categoria_pluggy: t.categoria_pluggy, estado: t.estado, lancamento_ids: t.lancamento_ids, sugestao: t.sugestao })),
  }
}

function gastos(d: Dados, per: Intervalo) {
  const fixos = ((d.cfg.gastosFixos ?? []) as GastoFixo[]).map(g => ({ id: g.id, nome: g.nome, categoriaId: g.categoriaId, valor: g.valor, diaVencimento: g.diaVencimento, contaId: g.contaId ?? null, obs: g.obs ?? null, ativa: g.ativa }))
  const ativos = fixos.filter(g => g.ativa)
  const nomes = ativos.map(g => g.nome.trim().toLowerCase()).filter(Boolean)
  // Variável = despesa paga no período (sem a conta corrente de fornecedor) que não é o pagamento de um gasto fixo cadastrado (pelo nome)
  const variaveis = d.lancamentos.filter(l => l.tipo === "despesa" && l.status === "pago" && l.formaPagamento !== "conta" && noPeriodo(l.dataPagamento ?? l.dataVencimento, per)
    && !nomes.some(n => l.descricao.toLowerCase().includes(n)) && !lancamentoNeutro(l, idsNeutros(d.cfg.categoriasDespesa as never, d.cfg.categoriasReceita as never)))
  const porCat = new Map<string, { total: number; quantidade: number }>()
  for (const l of variaveis) { const k = l.categoria || "outros"; const c = porCat.get(k) ?? { total: 0, quantidade: 0 }; porCat.set(k, { total: c.total + l.valor, quantidade: c.quantidade + 1 }) }
  return {
    fixos: { totalAtivos: soma(ativos), itens: fixos },
    variaveis: { total: soma(variaveis), porCategoria: [...porCat.entries()].map(([categoria, v]) => ({ categoria, total: r2(v.total), quantidade: v.quantidade })).sort((a, b) => b.total - a.total) },
  }
}

async function margem(d: Dados, per: Intervalo) {
  const nomeCategoria = (id: string) => ((d.cfg.categoriasDespesa ?? []) as { id: string; nome: string }[]).find(c => c.id === id)?.nome ?? id
  const dre = dreDoPeriodo({ lancamentos: d.lancamentos, neutras: idsNeutros(d.cfg.categoriasDespesa as never, d.cfg.categoriasReceita as never), noPeriodo: l => noPeriodo(l.dataPagamento ?? l.dataVencimento, per), nomeCategoria })
  const rodadas = ((d.cfg.producao as { rodadas?: Rodada[] } | undefined)?.rodadas ?? [])
  const pedidos = montarPedidos(d.kanban, d.lancamentos, rodadas).filter(p => (p.rodada ? p.rodada.custoTotal : p.custoDireto) > 0 && noPeriodo(p.dataFechamento, per))
  const { data: hist } = await supabase.from("HistoricoItem").select("*")
  const comps = new Map(compararPedidos(pedidos, (hist ?? []) as never, d.cfg).map(c => [c.pedido.key, c]))
  return {
    dre,
    pedidos: pedidos.map(p => {
      const c = comps.get(p.key)
      const custo = p.rodada ? p.rodada.custoTotal : p.custoDireto
      return { numero: p.numero, cliente: p.nomeCliente, venda: r2(p.venda), custo: r2(custo), margem: r2(p.venda - custo), margemPct: p.venda > 0 ? r2((p.venda - custo) / p.venda * 100) : null,
        previstoTotal: c?.previsto ? r2(c.previstoTotal) : null, realTotal: c ? r2(c.realTotal) : null,
        ...(p.rodada ? { rodadaId: p.rodada.rodadaId, custoProprio: r2(p.rodada.custoProprio), custoRateado: r2(p.rodada.custoRateado), puxador: p.rodada.puxador,
          margemRodada: r2(p.rodada.margemRodada), margemRodadaPct: p.rodada.margemRodadaPct, rodadaVermelha: p.rodada.rodadaVermelha, pedidoVermelho: p.rodada.vermelho } : {}) }
    }),
  }
}

// Mesmos sinais de /api/pendencias, só os itens financeiros e só a situação (sem chaves nem segredos)
async function depende(d: Dados) {
  const c = d.cfg as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  let g: Awaited<ReturnType<typeof import("./gastosServidor").gastosAtuais>> | null = null
  try { g = await (await import("./gastosServidor")).gastosAtuais() } catch { g = null }
  const lista = pendencias({
    env: { asaas: !!process.env.ASAAS_API_KEY, pluggy: !!(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET), lalamoveProducao: false, cronSecret: false },
    pluggyItens: c.pluggy?.itens?.length ?? 0,
    metaSaldo: g?.meta?.restante ?? null, metaDiasRestantes: g?.meta?.diasRestantes ?? null, metaTokenExpira: null, metaTokenTipo: null,
    iaRecargaEm: c.gastosCfg?.recargaIA?.em ?? null, iaDiasRestantes: g?.ia?.diasRestantes ?? null,
    designer: false, villa: false, videos: 0, feitos: c.pendenciasDono ?? {},
  })
  return { itens: lista.filter(p => p.grupo === "Dinheiro parado" || p.id === "asaas" || p.id === "pluggy").map(p => ({ id: p.id, grupo: p.grupo, titulo: p.titulo, porque: p.porque, nivel: p.nivel, feito: p.feito })) }
}

export type Leitura = { status: 200 | 400; corpo: unknown }

export async function leituraFinanceira(params: URLSearchParams): Promise<Leitura> {
  const parte = params.get("parte")
  if (parte && !(PARTES as readonly string[]).includes(parte)) return { status: 400, corpo: { erro: `parte: ${PARTES.join(" | ")}` } }
  const pn = params.get("periodo") ?? "mes"
  if (!(PERIODOS as readonly string[]).includes(pn)) return { status: 400, corpo: { erro: `periodo: ${PERIODOS.join(" | ")}` } }
  const estado = params.get("estado") ?? "pendente"
  if (!ESTADOS.includes(estado)) return { status: 400, corpo: { erro: `estado: ${ESTADOS.join(" | ")}` } }
  const ie = params.get("incluirEstornados")
  if (ie !== null && !["1", "true", "sim"].includes(ie)) return { status: 400, corpo: { erro: "incluirEstornados: 1 | true | sim" } }
  const incluirEstornados = ie !== null
  const per = intervalo(pn as PeriodoNome), hj = hoje()
  const periodo = { nome: pn, de: per.from ? per.from.toLocaleDateString("sv-SE") : null, ate: per.to ? per.to.toLocaleDateString("sv-SE") : null, fuso: "America/Sao_Paulo" }
  const d = await carregarFinanceiro()
  if (!incluirEstornados) d.lancamentos = d.lancamentos.filter(l => !l.estornadoEm)

  if (!parte) {
    const rec = await receber(d, hj), pagar = contasPagar(d.lancamentos, hj), sal = saldos(d.cfg)
    const mes = financeiroDoAndar(d.kanban, d.lancamentos, sal.total, dia(hj))
    return { status: 200, corpo: { hoje: hj, periodo, incluirEstornados, aReceber: { total: rec.aReceberTotal, vencido: rec.emAtrasoTotal }, aPagar: { total: pagar.total, vencido: pagar.vencido, quantidade: pagar.quantidade },
      saldos: { total: sal.total, contas: sal.contas.length }, mes, partes: PARTES } }
  }
  const corpo = parte === "receber" ? await receber(d, hj) : parte === "asaas" ? await asaasDoCfo(d) : parte === "pagar" ? contasPagar(d.lancamentos, hj) : parte === "banco" ? await banco(estado, per)
    : parte === "saldos" ? saldos(d.cfg) : parte === "gastos" ? gastos(d, per) : parte === "margem" ? await margem(d, per) : await depende(d)
  return { status: 200, corpo: { parte, hoje: hj, periodo, incluirEstornados, ...corpo } }
}

// O "a receber" de cada pedido com saldo, calculado na hora (venda − total já pago): o mesmo número de ?o=detalhe&area=financeiro.
// Pedido que não aparece aqui está quitado (saldo 0). Usado pela trava de valor das mensagens enviadas sem o Aprovo.
export async function aReceberDosPedidos(): Promise<{ numero: string; cliente: string; aReceber: number }[]> {
  const d = await carregarFinanceiro()
  d.lancamentos = d.lancamentos.filter(l => !l.estornadoEm)
  const r = await receber(d, hoje())
  return r.pedidos.map(p => ({ numero: String(p.numero), cliente: p.cliente, aReceber: p.aReceber }))
}
