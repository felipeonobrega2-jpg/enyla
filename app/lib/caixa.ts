// Previsão de caixa: quanto dinheiro deve haver em cada semana, a partir de hoje.
//
//   Entra  — cobranças lançadas (no vencimento) e saldo sem cobrança (até a entrega:
//            só se entrega com o pedido quitado)
//   Sai    — despesas lançadas (no vencimento), custos de produção que ainda vão chegar
//            (motor − já lançado; fornecedor com conta corrente vai para a conta, não sai
//            do caixa), custos fixos do mês e pagamentos planejados das contas de fornecedor
//   Conta  — saldo devedor dos fornecedores com conta corrente (Jerograf): não tem data;
//            só sai do caixa quando há pagamento planejado

import { KanbanCard, LancamentoFinanceiro, FormData } from "../types"
import { Configuracoes } from "../config"
import { calcular } from "../calculos"
import { Pedido, pedidoEmProducao, pedidoEntregue, pixExpirado, isTerceirizado, nomeChave } from "./negocio"
import { normalizarProducao, ItemCusto } from "./producao"
import { classificar, Componente } from "./calibragem"

export type PlanoConta = { id: string; fornecedorId: string; data: string; valor: number }
export type ConfigCaixa = { planos?: PlanoConta[] }

export type Origem = "cobranca" | "saldoEntrega" | "despesa" | "producao" | "fixo" | "planoConta"

export type Movimento = {
  id: string
  data: string            // ISO; vencidos ficam na primeira semana
  tipo: "entrada" | "saida"
  origem: Origem
  descricao: string
  valor: number
  atrasado?: boolean
  estimado?: boolean
  detalhe?: string          // composição (ex.: etapas de produção que faltam)
  card?: KanbanCard
}

export type Semana = {
  inicio: string
  fim: string
  entradas: Movimento[]
  saidas: Movimento[]
  totalEntradas: number
  totalSaidas: number
  saldoFinal: number | null
}

export type ContaFornecedor = {
  fornecedorId: string
  nome: string
  saldo: number            // o que você deve hoje (lançado)
  aVir: number             // custos de produção previstos que ainda vão cair na conta
  planos: PlanoConta[]
}

export type PrevisaoCaixa = {
  saldoInicial: number | null
  semanas: Semana[]
  semData: Movimento[]      // entradas sem data provável (pedido sem entrega prevista)
  contas: ContaFornecedor[]
  menor: { saldo: number; semana: number } | null
  primeiroNegativo: number | null
}

type HistItem = { form: FormData; numero?: string }

const isoDe = (d: Date) => d.toLocaleDateString("sv-SE")
const somarDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return isoDe(d) }

// Saldo em conta: soma das contas ativas com saldo informado (cartão de crédito fica de fora)
export function saldoInformado(cfg: Configuracoes): number | null {
  const contas = (cfg.contas ?? []).filter(c => c.ativa && c.tipo !== "credito" && c.saldo != null)
  return contas.length ? contas.reduce((s, c) => s + (c.saldo ?? 0), 0) : null
}

const NOME_COMP: Partial<Record<Componente, string>> = {
  papel: "papel", impressao: "impressão", acabamento: "laminação/verniz", hotStamping: "hot stamping",
  corteVinco: "corte e vinco", colagem: "colagem", faca: "faca", frete: "frete",
}

// Etapa do motor → componente de custo (mesma divisão da calibragem)
const COMPONENTE_DA_ETAPA: Partial<Record<ItemCusto["etapa"], Componente>> = {
  papel: "papel", impressao: "impressao", laminacao: "acabamento", verniz: "acabamento",
  hotStamping: "hotStamping", cliche: "hotStamping", fotolito: "hotStamping",
  corteVinco: "corteVinco", colagem: "colagem", faca: "faca", frete: "frete",
}

// O que ainda falta pagar de produção, etapa por etapa (previsto pelo motor − lançado naquela etapa),
// separando o que vai para conta corrente de fornecedor e o que sai do caixa
function custoAVir(p: Pedido, historico: HistItem[], cfg: Configuracoes, contaProdIds: Set<string>, contaFinIds: Set<string>) {
  const prodCfg = normalizarProducao(cfg.producao)
  const previsto = new Map<Componente, { valor: number; emConta: boolean }>()
  for (const card of p.cards.filter(c => !isTerceirizado(c))) {
    const hist = historico.find(h => h.numero === card.numero)
    if (!hist?.form || !card.quantidade) return null
    const rota = calcular({ ...hist.form, quantidades: [card.quantidade] }, cfg)?.rotas?.[0]?.melhor
    if (!rota) return null
    for (const i of rota.itens) {
      const comp = COMPONENTE_DA_ETAPA[i.etapa]
      if (!comp || i.valor <= 0) continue
      const atual = previsto.get(comp) ?? { valor: 0, emConta: false }
      previsto.set(comp, { valor: atual.valor + i.valor, emConta: atual.emConta || (!!i.fornecedorId && contaProdIds.has(i.fornecedorId)) })
    }
  }
  // Lançado por etapa e se essa etapa já está indo para conta corrente
  const lancado = new Map<Componente, number>()
  const contaReal = new Set<Componente>()
  for (const l of p.despesas.filter(x => x.status === "pago" || x.formaPagamento === "conta")) {
    const comp = classificar(l, cfg.fornecedores ?? [], cfg)
    lancado.set(comp, (lancado.get(comp) ?? 0) + l.valor)
    if (l.formaPagamento === "conta" && l.fornecedorId && contaFinIds.has(l.fornecedorId)) contaReal.add(comp)
  }
  // Envios registrados em Fornecedores dizem quem fez (ou está fazendo) cada etapa
  const daEtapa: Record<string, Componente[]> = { impressao: ["impressao"], acabamento: ["acabamento"], corteVinco: ["corteVinco"], colagem: ["colagem"] }
  const doServico: Record<string, Componente> = { impressao: "impressao", laminacao: "acabamento", verniz: "acabamento", hotStamping: "hotStamping", corteVinco: "corteVinco", colagem: "colagem" }
  for (const m of prodCfg.movimentos.filter(x => x.pedidoKey === p.key || x.pedidoLabel.startsWith(`${p.numero} `))) {
    if (!contaProdIds.has(m.fornecedorId)) continue
    const comps = m.servicos?.length ? m.servicos.map(sv => doServico[sv]).filter(Boolean) : daEtapa[m.etapa] ?? []
    for (const c of comps) contaReal.add(c)
  }
  const vaiParaConta = (comp: Componente): boolean =>
    contaReal.has(comp) || (!lancado.has(comp) && !!previsto.get(comp)?.emConta)
    // Papel é comprado com o impressor: segue a impressão
    || (comp === "papel" && !lancado.has("papel") && vaiParaConta("impressao"))
  let caixa = 0, conta = 0
  const partes: string[] = []
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  for (const [comp, prev] of previsto) {
    const falta = Math.max(0, prev.valor - (lancado.get(comp) ?? 0))
    if (falta <= 1) continue
    if (vaiParaConta(comp)) conta += falta
    else { caixa += falta; partes.push(`${NOME_COMP[comp] ?? comp} ${brl(falta)}`) }
  }
  return { caixa, conta, detalhe: partes.join(" · ") }
}

export function previsaoDeCaixa(args: {
  pedidos: Pedido[]
  lancamentos: LancamentoFinanceiro[]
  historico: HistItem[]
  config: Configuracoes
  hoje?: Date
  semanas?: number
}): PrevisaoCaixa {
  const { pedidos, lancamentos, historico, config } = args
  const hojeIso = isoDe(args.hoje ?? new Date())
  const nSemanas = args.semanas ?? 8
  const fimHorizonte = somarDias(hojeIso, nSemanas * 7 - 1)
  const movs: Movimento[] = []
  const semData: Movimento[] = []

  // Fornecedores com conta corrente (financeiro) e os de produção ligados a eles
  const prod = normalizarProducao(config.producao)
  const fornConta = (config.fornecedores ?? []).filter(f => f.conta && f.ativo)
  const contaFinIds = new Set(fornConta.map(f => f.id))
  const contaProdIds = new Set(prod.fornecedores.filter(f => f.fornecedorId && contaFinIds.has(f.fornecedorId)).map(f => f.id))
  const aVirConta = new Map<string, number>()

  // ── Entradas: o que os clientes ainda devem ────────────────────────────────
  for (const p of pedidos.filter(x => x.aReceber > 0.5)) {
    const card = p.cards.find(c => !isTerceirizado(c)) ?? p.cards[0]
    let restante = p.aReceber
    const cobrancas = p.receitas
      .filter(l => l.status !== "pago" && !pixExpirado(l, hojeIso) && !p.sobrasQuitadas.includes(l.id))
      .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
    for (const l of cobrancas) {
      if (restante <= 0.5) break
      const valor = Math.min(l.valor, restante)
      restante -= valor
      const atrasado = l.dataVencimento < hojeIso
      movs.push({ id: `rec-${l.id}`, data: atrasado ? hojeIso : l.dataVencimento, tipo: "entrada", origem: "cobranca",
        descricao: `${p.numero} · ${p.nomeCliente}${l.categoria === "sobra" ? " · sobra" : ""}`, valor, atrasado, card })
    }
    if (restante > 0.5) {
      // Cliente de relacionamento paga alguns dias depois da entrega; os demais, na entrega
      const rel = (config.clientesRelacionamento ?? []).find(r => nomeChave(r.nome) === nomeChave(p.nomeCliente))
      const entrega = pedidoEntregue(p) ? (p.dataEntregaReal ?? p.dataEntregaPrevista ?? hojeIso) : p.dataEntregaPrevista
      const quando = entrega && rel ? somarDias(entrega.slice(0, 10), rel.diasAposEntrega) : entrega
      const base: Movimento = { id: `saldo-${p.key}`, data: hojeIso, tipo: "entrada", origem: "saldoEntrega",
        descricao: `${p.numero} · ${p.nomeCliente} · ${rel ? `saldo ${rel.diasAposEntrega} dias após a entrega` : "saldo na entrega"}`, valor: restante, card }
      if (quando && quando < hojeIso) movs.push({ ...base, atrasado: true })
      else if (quando) movs.push({ ...base, data: quando })
      else if (pedidoEntregue(p)) movs.push({ ...base, atrasado: true })
      else semData.push(base)
    }
  }

  // ── Saídas: despesas lançadas (fora da conta corrente) ─────────────────────
  for (const l of lancamentos.filter(x => x.tipo === "despesa" && x.status !== "pago" && x.formaPagamento !== "conta")) {
    const atrasado = l.dataVencimento < hojeIso
    movs.push({ id: `desp-${l.id}`, data: atrasado ? hojeIso : l.dataVencimento, tipo: "saida", origem: "despesa", descricao: l.descricao, valor: l.valor, atrasado })
  }

  // ── Saídas: custos de produção que ainda vão chegar ────────────────────────
  for (const p of pedidos.filter(x => pedidoEmProducao(x))) {
    const falta = custoAVir(p, historico, config, contaProdIds, contaFinIds)
    if (!falta) continue
    if (falta.conta > 1) {
      // Conta corrente: soma ao saldo a vir do fornecedor (hoje, um só com conta na prática)
      const fin = prod.fornecedores.find(f => contaProdIds.has(f.id))?.fornecedorId ?? fornConta[0]?.id
      if (fin) aVirConta.set(fin, (aVirConta.get(fin) ?? 0) + falta.conta)
    }
    if (falta.caixa <= 1) continue
    // Fornecedores pagos na hora: o custo sai enquanto o pedido anda (até a entrega, no máximo em 1 semana)
    const entrega = p.dataEntregaPrevista
    const data = entrega && entrega < somarDias(hojeIso, 7) ? (entrega < hojeIso ? hojeIso : entrega) : somarDias(hojeIso, 7)
    movs.push({ id: `prod-${p.key}`, data, tipo: "saida", origem: "producao", estimado: true,
      descricao: `${p.numero} · ${p.nomeCliente} · custos de produção a vir`, valor: falta.caixa, detalhe: falta.detalhe, card: p.cards[0] })
  }

  // ── Saídas: custos fixos ───────────────────────────────────────────────────
  for (const g of (config.gastosFixos ?? []).filter(x => x.ativa && x.valor > 0)) {
    const inicio = new Date(hojeIso + "T12:00:00")
    for (let m = 0; m <= Math.ceil(nSemanas / 4) + 1; m++) {
      const ultimo = new Date(inicio.getFullYear(), inicio.getMonth() + m + 1, 0).getDate()
      const d = isoDe(new Date(inicio.getFullYear(), inicio.getMonth() + m, Math.min(g.diaVencimento, ultimo), 12))
      if (d < hojeIso || d > fimHorizonte) continue
      // Já lançado neste mês? (mesma regra da aba Gastos fixos)
      const mes = d.slice(0, 7)
      const lancado = lancamentos.some(l => l.tipo === "despesa" && l.descricao.toLowerCase().includes(g.nome.toLowerCase().slice(0, 8)) && (l.dataPagamento || l.dataVencimento).startsWith(mes))
      if (lancado) continue
      movs.push({ id: `fixo-${g.id}-${mes}`, data: d, tipo: "saida", origem: "fixo", descricao: g.nome, valor: g.valor })
    }
  }

  // ── Contas de fornecedor (conta corrente) ──────────────────────────────────
  const planos = (config.caixa?.planos ?? []).filter(pl => pl.data >= hojeIso)
  const contas: ContaFornecedor[] = fornConta.map(f => {
    const saldo = lancamentos.filter(l => l.fornecedorId === f.id && l.formaPagamento === "conta")
      .reduce((s, l) => s + (l.tipo === "despesa" ? l.valor : -l.valor), 0)
    return { fornecedorId: f.id, nome: f.nome, saldo, aVir: aVirConta.get(f.id) ?? 0, planos: planos.filter(pl => pl.fornecedorId === f.id) }
  })
  for (const pl of planos) {
    const f = fornConta.find(x => x.id === pl.fornecedorId)
    movs.push({ id: `plano-${pl.id}`, data: pl.data, tipo: "saida", origem: "planoConta", descricao: `Pagamento planejado · ${f?.nome ?? "fornecedor"}`, valor: pl.valor })
  }

  // ── Semanas ────────────────────────────────────────────────────────────────
  const saldoInicial = saldoInformado(config)
  let saldo = saldoInicial
  const semanas: Semana[] = Array.from({ length: nSemanas }, (_, i) => {
    const inicio = somarDias(hojeIso, i * 7), fim = somarDias(hojeIso, i * 7 + 6)
    const daSemana = movs.filter(m => m.data >= inicio && m.data <= fim)
    const entradas = daSemana.filter(m => m.tipo === "entrada").sort((a, b) => b.valor - a.valor)
    const saidas = daSemana.filter(m => m.tipo === "saida").sort((a, b) => b.valor - a.valor)
    const totalEntradas = entradas.reduce((s, m) => s + m.valor, 0)
    const totalSaidas = saidas.reduce((s, m) => s + m.valor, 0)
    if (saldo != null) saldo = saldo + totalEntradas - totalSaidas
    return { inicio, fim, entradas, saidas, totalEntradas, totalSaidas, saldoFinal: saldo }
  })

  let menor: PrevisaoCaixa["menor"] = null
  let primeiroNegativo: number | null = null
  semanas.forEach((s, i) => {
    if (s.saldoFinal == null) return
    if (!menor || s.saldoFinal < menor.saldo) menor = { saldo: s.saldoFinal, semana: i }
    if (primeiroNegativo == null && s.saldoFinal < 0) primeiroNegativo = i
  })

  return { saldoInicial, semanas, semData, contas, menor, primeiroNegativo }
}
