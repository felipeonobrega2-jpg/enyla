// Acompanhamento do pedido Digital na página pública (/d/DIG-0001?t=…), no modelo da Offset.
// Função pura: monta só os campos que o cliente pode ver (lista fechada). Nada de jid, telefone, e-mail, documento,
// endereço, custo, margem ou conversa. Campo vazio vira "a confirmar": não inventa data nem situação.
import { somarDiasUteis } from "./diasUteis"

export const A_CONFIRMAR = "a confirmar"
export const EM_CONFERENCIA = "em conferência"
export const SITUACOES_ARTE = ["sem arte", "enviada", "ajustes pedidos", "aprovada", "prova autorizada"] as const
const ARTE_APROVADA = ["aprovada", "prova autorizada"]

type Pag = { txId?: string | null; valor?: number; data?: string } | null
export type PedidoAcomp = {
  id: string; nome?: string | null; medidas: { a: number; l: number; p: number }; quantidade: number; total: number; sinal: number; restante?: number
  status: string; teste?: boolean; briefing?: { laminacao?: string } | null
  sinalPagoEm?: string; designerAvisadoEm?: string; arteEnviadaEm?: string; arteAprovadaEm?: string; villaEnviadoEm?: string; prontoEm?: string; statusEm?: string; restantePagoEm?: string
  pagamento?: Pag; pagamentoFinal?: Pag
  situacaoArte?: string | null; prazoEntrega?: string | null     // campos da #164
}
export type LancamentoAcomp = { id: string; valor: number; status: string; dataPagamento?: string | null }
export type EntradaAcomp = {
  lancamentos: LancamentoAcomp[]       // LancamentoFinanceiro do pedido (ids dig-{id}-sinal / -restante)
  vinculados: string[]                 // ids de lançamento ligados a transação bancária (banco_transacoes.lancamento_ids)
  prazoPadraoDias?: number | null      // AppConfig; vazia por padrão = prazo "a confirmar" para todos
}
export type Etapa = { nome: string; em: string | null }
export type AcompanhamentoDigital = {
  numero: string; primeiroNome: string | null; medida: string; quantidade: number; tipo: string
  etapaAtual: Etapa; historico: Etapa[]
  arte: string; prazoEntrega: string
  total: number; sinal: number
  pago: { valor: number; em: string | null } | null
  conferencia: boolean
  saldo: { valor: number; vencimento: string | null } | null
}

const centavos = (n: number) => Math.round(n * 100) / 100
const dia = (s?: string | null) => (s ?? "").slice(0, 10) || null
const ehData = (s?: string | null) => !!s && /^\d{4}-\d{2}-\d{2}/.test(s)
const num = (n: number) => String(n).replace(".", ",")
const doAsaas = (p?: Pag) => /^asaas:/.test(p?.txId ?? "")

export function pagamentoConfirmado(p: PedidoAcomp, parte: "sinal" | "restante", e: EntradaAcomp): { valor: number; em: string | null } | null {
  const lan = e.lancamentos.find(l => l.id === `dig-${p.id}-${parte}` && l.status === "pago")
  const pg = parte === "sinal" ? p.pagamento : p.pagamentoFinal
  const confirmado = doAsaas(pg) || (!!lan && e.vinculados.includes(lan.id))
  // Sem Asaas nem vínculo bancário, "status pago" sozinho não basta
  if (!confirmado) return null
  const valor = lan?.valor ?? pg?.valor
  if (valor == null) return null
  const em = dia(lan?.dataPagamento) ?? dia(pg?.data) ?? dia(parte === "sinal" ? p.sinalPagoEm : p.restantePagoEm)
  return { valor: centavos(valor), em }
}

export function acompanhamentoDigital(p: PedidoAcomp, e: EntradaAcomp): AcompanhamentoDigital | null {
  if (p.status === "aguardando_sinal" || p.status === "cancelado" || p.teste) return null
  const hist: Etapa[] = [
    { nome: "Sinal pago", em: p.sinalPagoEm ?? null },
    { nome: "Arte em preparação", em: p.designerAvisadoEm ?? null },
    { nome: "Arte para aprovação", em: p.arteEnviadaEm ?? null },
    { nome: "Arte aprovada", em: p.arteAprovadaEm ?? null },
    { nome: "Em produção", em: p.villaEnviadoEm ?? null },
    { nome: "Pronto", em: p.prontoEm ?? null },
    { nome: "Enviado", em: p.status === "enviado" ? (p.statusEm ?? null) : null },
  ]
  const feitas = hist.filter(h => h.em)
  const atual = feitas.length ? feitas[feitas.length - 1] : { nome: "Sinal pago", em: p.sinalPagoEm ?? null }
  const historico = feitas.length ? feitas : [atual]

  const sit = (p.situacaoArte ?? "").trim().toLowerCase()
  const arte = (SITUACOES_ARTE as readonly string[]).includes(sit) ? sit : A_CONFIRMAR

  // Prazo: valor gravado na mão vale; senão só depois da arte aprovada, com o prazo padrão da config (vazia = "a confirmar")
  let prazo = A_CONFIRMAR
  const dias = e.prazoPadraoDias
  if (ehData(p.prazoEntrega)) prazo = dia(p.prazoEntrega)!
  else if (ARTE_APROVADA.includes(sit) && ehData(p.arteAprovadaEm) && dias != null && dias > 0) prazo = somarDiasUteis(dia(p.arteAprovadaEm)!, dias)

  const pagoSinal = pagamentoConfirmado(p, "sinal", e)
  const pagoRest = pagamentoConfirmado(p, "restante", e)
  const pago = pagoSinal ? { valor: centavos(pagoSinal.valor + (pagoRest?.valor ?? 0)), em: pagoRest?.em ?? pagoSinal.em } : null
  // Saldo exato (centavos do pedido) só com o pago confirmado
  const restante = p.restante ?? centavos(p.total - p.sinal)
  const saldo = pagoSinal ? { valor: pagoRest ? 0 : centavos(Math.max(0, restante)), vencimento: pagoRest ? null : dia(p.prontoEm) } : null

  return {
    numero: p.id, primeiroNome: (p.nome ?? "").trim().split(/\s+/)[0] || null,
    medida: `${num(p.medidas.a)} × ${num(p.medidas.l)} × ${num(p.medidas.p)} cm`, quantidade: p.quantidade,
    tipo: `Impressão digital, triplex 300g${p.briefing?.laminacao ? `, laminação ${p.briefing.laminacao}` : ""}`,
    etapaAtual: atual, historico, arte, prazoEntrega: prazo,
    total: centavos(p.total), sinal: p.sinal, pago, conferencia: !pago || !saldo, saldo,
  }
}

/** Servidor: lê os lançamentos do pedido e os vínculos bancários e monta o acompanhamento. */
export async function acompanhamentoDoPedido(p: PedidoAcomp, prazoPadraoDias?: number | null): Promise<AcompanhamentoDigital | null> {
  if (p.status === "aguardando_sinal" || p.status === "cancelado" || p.teste) return null
  const { supabase } = await import("./supabase")
  const ids = [`dig-${p.id}-sinal`, `dig-${p.id}-restante`]
  const [{ data: lans }, { data: txs }] = await Promise.all([
    supabase.from("LancamentoFinanceiro").select("id, valor, status, dataPagamento").in("id", ids),
    supabase.from("banco_transacoes").select("lancamento_ids").overlaps("lancamento_ids", ids),
  ])
  const vinculados = (txs ?? []).flatMap(t => (t.lancamento_ids as string[] | null) ?? []).filter(i => ids.includes(i))
  return acompanhamentoDigital(p, { lancamentos: (lans ?? []) as LancamentoAcomp[], vinculados, prazoPadraoDias })
}
