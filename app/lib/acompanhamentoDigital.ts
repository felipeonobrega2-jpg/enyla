// Acompanhamento do pedido Digital na página pública (/d/{id}?t=…), no modelo do /track da Offset.
// Função pura: monta só os campos visíveis ao cliente (lista fechada). Nada de jid, telefone, e-mail, documento,
// endereço, custo, margem, txId, cobrança interna ou conversa. Os valores de pagamento vêm SOMENTE do "a receber"
// (receberDigital); sem o pedido lá, o cliente vê "em conferência", nunca um saldo calculado de total - sinal.
import { somarDiasUteis } from "./diasUteis"
import { prazoDigital } from "./prazoDigital"
import { formatarData } from "./formato"
import { diaDe, type PedidoDig } from "./digitalProducao"
import { esperandoAprovacao } from "./digital"
import type { PedidoReceberDigital } from "./receberDigital"

export type PedidoAcompanhamento = PedidoDig & {
  nome?: string | null; medidas: { a: number; l: number; p: number }; quantidade: number; total: number; sinal: number
  artes?: unknown[]; briefing?: { laminacao?: "fosca" | "brilho" }
}

export type EtapaCliente = { chave: string; rotulo: string; em: string | null }
export type SituacaoArte = "aprovada" | "esperando_cliente" | "nao_enviada"
export type PagamentoCliente =
  | { situacao: "conferencia"; mensagem: string }
  | { situacao: "ok"; pago: number; pagoEm: string | null; saldo: number; vencimento: string | null }
export type Acompanhamento = {
  numero: string; primeiroNome: string | null; medida: { altura: number; largura: number; profundidade: number; unidade: "cm" }
  quantidade: number; tipo: string
  etapaAtual: EtapaCliente; historico: EtapaCliente[]; arte: SituacaoArte
  prazoEntrega: { previstoDe: string | null; previstoAte: string | null; texto: string }
  valorTotal: number; sinal: number; pagamento: PagamentoCliente
}

const ORDEM: { chave: string; rotulo: string; data: (p: PedidoDig) => string | undefined }[] = [
  { chave: "sinal_pago", rotulo: "Sinal pago", data: p => p.sinalPagoEm },
  { chave: "arte_preparo", rotulo: "Arte em preparação", data: p => p.sinalPagoEm ? (p.designerAvisadoEm ?? p.sinalPagoEm) : undefined },
  { chave: "arte_aprovacao", rotulo: "Arte para aprovação", data: p => p.arteEnviadaEm },
  { chave: "arte_aprovada", rotulo: "Arte aprovada (fila de produção)", data: p => p.arteAprovadaEm },
  { chave: "producao", rotulo: "Em produção", data: p => p.villaEnviadoEm },
  { chave: "pronto", rotulo: "Pronto", data: p => p.prontoEm },
  { chave: "enviado", rotulo: "Enviado", data: p => p.status === "enviado" ? (p.statusEm ?? "") : undefined },
]

export function acompanhamentoDigital(p: PedidoAcompanhamento, receber?: PedidoReceberDigital | null): Acompanhamento | null {
  if (!p.sinalPagoEm || p.status === "aguardando_sinal" || p.status === "cancelado") return null
  const historico = ORDEM.flatMap(e => { const d = e.data(p); return d !== undefined ? [{ chave: e.chave, rotulo: e.rotulo, em: d ? diaDe(d) : null }] : [] })
  const etapaAtual = historico[historico.length - 1]
  const arte: SituacaoArte = p.arteAprovadaEm ? "aprovada" : esperandoAprovacao(p as never) ? "esperando_cliente" : "nao_enviada"
  const prazo = prazoDigital(p.quantidade)
  let prazoEntrega: Acompanhamento["prazoEntrega"]
  if (p.arteAprovadaEm) {
    const base = [diaDe(p.sinalPagoEm), diaDe(p.arteAprovadaEm)].sort().at(-1)!   // conta depois do sinal E da arte aprovada
    const de = somarDiasUteis(base, prazo.min), ate = somarDiasUteis(base, prazo.max)
    prazoEntrega = { previstoDe: de, previstoAte: ate, texto: `Entrega prevista ${de === ate ? `até ${formatarData(ate)}` : `entre ${formatarData(de)} e ${formatarData(ate)}`} (${prazo.texto} depois do sinal pago e da arte aprovada).` }
  } else {
    prazoEntrega = { previstoDe: null, previstoAte: null, texto: `A data de entrega sai depois da aprovação da arte (${prazo.texto} depois dela).` }
  }
  const pagamento: PagamentoCliente = receber
    ? { situacao: "ok", pago: receber.recebido, pagoEm: receber.digital.pagoEm, saldo: receber.aReceber, vencimento: receber.digital.vencimento }
    : { situacao: "conferencia", mensagem: "Pagamento em conferência: já já mostramos aqui o que foi pago e o saldo." }
  return {
    numero: p.id, primeiroNome: p.nome?.trim().split(/\s+/)[0] || null,
    medida: { altura: p.medidas.a, largura: p.medidas.l, profundidade: p.medidas.p, unidade: "cm" },
    quantidade: p.quantidade,
    tipo: ["Impressão digital", "triplex 300g", ...(p.briefing?.laminacao ? [`laminação ${p.briefing.laminacao}`] : [])].join(" · "),
    etapaAtual, historico, arte, prazoEntrega, valorTotal: p.total, sinal: p.sinal, pagamento,
  }
}
