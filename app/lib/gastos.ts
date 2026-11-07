// Controle de gastos da operação: IA (tokens da Anthropic) e anúncios (Meta). Calcula o gasto por dia, quantos dias
// o saldo aguenta e quanto o braço digital (margem dos pedidos pagos) cobre. Puro: o servidor busca os dados.

// Preço por milhão de tokens, em US$ (tabela da Anthropic). Gravação de cache: 5 min = 1,25× a entrada, 1 h = 2×.
export const PRECO_IA: Record<string, { entrada: number; saida: number; cacheLido: number }> = {
  "claude-opus-5-5": { entrada: 4, saida: 20, cacheLido: 0.2 },
  "claude-opus-5": { entrada: 5, saida: 25, cacheLido: 0.5 },
  "claude-opus-4-8": { entrada: 5, saida: 25, cacheLido: 0.5 },
  "claude-sonnet-5-5": { entrada: 2, saida: 10, cacheLido: 0.2 },
  "claude-haiku-5-5": { entrada: 0.1, saida: 0.5, cacheLido: 0.01 },
}

export type UsoIA = {
  input_tokens?: number | null; output_tokens?: number | null
  cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null
}

// Custo de uma chamada em US$ (modelo desconhecido: preço do Opus 5.5, o que o sistema usa)
export function custoUsd(modelo: string, u: UsoIA): number {
  const base = Object.keys(PRECO_IA).find(m => modelo?.startsWith(m)) ?? "claude-opus-5-5"
  const p = PRECO_IA[base]
  const gravou5m = u.cache_creation?.ephemeral_5m_input_tokens ?? 0
  const gravou1h = u.cache_creation?.ephemeral_1h_input_tokens ?? Math.max(0, (u.cache_creation_input_tokens ?? 0) - gravou5m)
  const usd = (u.input_tokens ?? 0) * p.entrada + (u.output_tokens ?? 0) * p.saida + (u.cache_read_input_tokens ?? 0) * p.cacheLido
    + gravou5m * p.entrada * 1.25 + gravou1h * p.entrada * 2
  return usd / 1_000_000
}

// Gasto da IA por dia (São Paulo): { "2026-11-06": { usd, chamadas } }
export type GastoDia = { usd: number; chamadas: number }
export const diaSP = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

export function somarUso(dias: Record<string, GastoDia>, dia: string, usd: number, manterDias = 90): Record<string, GastoDia> {
  const atual = dias[dia] ?? { usd: 0, chamadas: 0 }
  const novo = { ...dias, [dia]: { usd: atual.usd + usd, chamadas: atual.chamadas + 1 } }
  const corte = Object.keys(novo).sort().slice(0, Math.max(0, Object.keys(novo).length - manterDias))
  for (const k of corte) delete novo[k]
  return novo
}

// "Saldo disponível (R$0,49 BRL)" → 0.49
export function saldoDoTexto(s: string | null | undefined): number | null {
  const m = (s ?? "").match(/R\$\s*([\d.]+(?:,\d{1,2})?)/)
  return m ? Number(m[1].replace(/\./g, "").replace(",", ".")) : null
}

// Dias de São Paulo de `ate` para trás (n dias, o mais antigo primeiro)
export function ultimosDias(n: number, ate = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => diaSP(new Date(ate.getTime() - (n - 1 - i) * 86_400_000)))
}

export type Recarga = { valor: number; em: string }   // saldo que você informou e quando
export type PedidoParaGasto = { status: string; margem: number; arte: number; total: number; sinalPagoEm?: string | null; em: string }

export type EntradaGastos = {
  agora: Date
  ia: { dias: Record<string, GastoDia>; recarga: Recarga | null; cotacao: number; semCreditoEm?: string | null }
  meta: { saldo: number | null; dias: Record<string, number>; erro?: string | null; em?: string | null } | null
  pedidos: PedidoParaGasto[]
  alertaDias: number
}

export type Linha = { media: number; hoje: number; ontem: number; restante: number | null; diasRestantes: number | null; serie: { dia: string; valor: number }[] }
export type Alerta = { tipo: "ia" | "meta"; nivel: "alerta" | "perigo"; texto: string }
export type Gastos = {
  ia: Linha & { recarga: Recarga | null; cotacao: number; semCredito: boolean }
  meta: (Linha & { erro: string | null; em: string | null }) | null
  totalDia: number
  digital: { pedidosPagos: number; margem: number; faturado: number; gasto30: number; cobertura: number | null; porDiaFalta: number }
  alertas: Alerta[]
}

const r2 = (n: number) => Math.round(n * 100) / 100

function linha(diasValor: Record<string, number>, agora: Date, restante: number | null): Linha {
  const sete = ultimosDias(7, agora)
  const serie = ultimosDias(14, agora).map(dia => ({ dia, valor: r2(diasValor[dia] ?? 0) }))
  // Ritmo: média dos dias com gasto entre os 6 anteriores (dia parado por falta de saldo não puxa a média para
  // baixo). Sem histórico ainda: o de hoje projetado para o dia inteiro.
  const anteriores = sete.slice(0, 6).map(d => diasValor[d] ?? 0).filter(v => v > 0)
  const agoraSP = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
  const fracaoHoje = Math.max(0.1, (agoraSP.getHours() * 60 + agoraSP.getMinutes()) / 1440)
  const media = anteriores.length ? anteriores.reduce((a, b) => a + b, 0) / anteriores.length : (diasValor[sete[6]] ?? 0) / fracaoHoje
  const diasRestantes = restante == null ? null : media > 0 ? restante / media : null
  return { media: r2(media), hoje: r2(diasValor[sete[6]] ?? 0), ontem: r2(diasValor[sete[5]] ?? 0), restante: restante == null ? null : r2(restante), diasRestantes: diasRestantes == null ? null : Math.round(diasRestantes * 10) / 10, serie }
}

export function montarGastos(e: EntradaGastos): Gastos {
  const { agora } = e
  // IA em R$ (cotação do dólar)
  const iaBrl: Record<string, number> = Object.fromEntries(Object.entries(e.ia.dias).map(([d, g]) => [d, g.usd * e.ia.cotacao]))
  // Saldo da IA: o que você informou menos o gasto desde então (o dia da recarga conta a partir da hora)
  let restanteIa: number | null = null
  if (e.ia.recarga) {
    const diaRec = diaSP(new Date(e.ia.recarga.em))
    const gastoDesde = Object.entries(e.ia.dias).filter(([d]) => d > diaRec).reduce((a, [, g]) => a + g.usd, 0)
    // No dia da recarga: só a parte proporcional depois da hora informada (estimativa)
    const doDia = e.ia.dias[diaRec]?.usd ?? 0
    const fimDoDia = new Date(new Date(e.ia.recarga.em).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
    const fracaoDepois = 1 - (fimDoDia.getHours() * 60 + fimDoDia.getMinutes()) / 1440
    restanteIa = Math.max(0, (e.ia.recarga.valor - gastoDesde - doDia * fracaoDepois)) * e.ia.cotacao
  }
  const semCredito = !!e.ia.semCreditoEm && agora.getTime() - new Date(e.ia.semCreditoEm).getTime() < 6 * 3_600_000
    && (!e.ia.recarga || new Date(e.ia.recarga.em) < new Date(e.ia.semCreditoEm))
  if (semCredito) restanteIa = 0
  const ia = { ...linha(iaBrl, agora, restanteIa), recarga: e.ia.recarga, cotacao: e.ia.cotacao, semCredito }
  const meta = e.meta ? { ...linha(e.meta.dias, agora, e.meta.saldo), erro: e.meta.erro ?? null, em: e.meta.em ?? null } : null

  // Braço digital: margem dos pedidos com sinal pago nos últimos 30 dias contra o gasto (IA + anúncios) do período
  const desde = agora.getTime() - 30 * 86_400_000
  const pagos = e.pedidos.filter(p => !["aguardando_sinal", "cancelado"].includes(p.status) && new Date(p.sinalPagoEm ?? p.em).getTime() >= desde)
  const dias30 = ultimosDias(30, agora)
  const gasto30 = dias30.reduce((a, d) => a + (iaBrl[d] ?? 0) + (e.meta?.dias[d] ?? 0), 0)
  const margem = pagos.reduce((a, p) => a + p.margem, 0)
  const totalDia = r2(ia.media + (meta?.media ?? 0))
  const digital = {
    pedidosPagos: pagos.length, margem: r2(margem), faturado: r2(pagos.reduce((a, p) => a + p.total, 0)), gasto30: r2(gasto30),
    cobertura: gasto30 > 0 ? Math.round(margem / gasto30 * 100) : null,
    // Quantos pedidos por dia pagam a operação (margem média por pedido)
    porDiaFalta: Math.round(totalDia / Math.max(1, pagos.length ? margem / pagos.length : 150) * 10) / 10,
  }

  const alertas: Alerta[] = []
  const avaliar = (tipo: "ia" | "meta", l: Linha, nome: string) => {
    if (l.restante == null) return
    if (l.restante <= 0.01 || (l.diasRestantes != null && l.diasRestantes < 1))
      alertas.push({ tipo, nivel: "perigo", texto: `${nome}: saldo ${l.restante <= 0.01 ? "acabou" : `para menos de 1 dia (R$ ${l.restante.toFixed(2).replace(".", ",")})`}. Recarregue para a operação não parar.` })
    else if (l.diasRestantes != null && l.diasRestantes < e.alertaDias)
      alertas.push({ tipo, nivel: "alerta", texto: `${nome}: saldo para cerca de ${l.diasRestantes.toFixed(1).replace(".", ",")} dias (R$ ${l.restante.toFixed(2).replace(".", ",")}).` })
  }
  if (semCredito) alertas.push({ tipo: "ia", nivel: "perigo", texto: "IA: a Anthropic recusou por falta de crédito. O agente parou de responder até você recarregar." })
  else avaliar("ia", ia, "IA (tokens)")
  if (meta) avaliar("meta", meta, "Anúncios da Meta")
  return { ia, meta, totalDia, digital, alertas }
}
