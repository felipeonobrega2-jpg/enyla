// Prazo de produção do digital (Felipe, 19/11; ajustado em 25/11/2026 às 20h34, horário de Brasília): conta a partir
// do sinal pago e da arte aprovada, em dias úteis (somarDiasUteis).
// Até 200 caixinhas: 7 a 10 dias úteis. Acima de 200 (de 201 em diante): 15 dias úteis.
// Propostas/pedidos criados antes do corte (CORTE_PRAZO_15) que passam de 200 seguem com os 14 dias que já foram prometidos.
import { somarDiasUteis } from "./diasUteis"

export type PrazoDigital = { min: number; max: number; texto: string }

// Valores da regra. Se a config `digital.prazoPadrao` (#164) passar a existir, é daqui que ela deve sair/ler.
export const PRAZO_PADRAO_DIGITAL = { limite: 200, minAte200: 7, tetoAte200: 10, acima200: 15, acima200Antigo: 14 }

// Data/hora do deploy desta mudança (25/11/2026, 20h45 em Brasília). Compara com `em` do pedido ("quando cotou").
export const CORTE_PRAZO_15 = "2026-11-26T00:45:00.000Z"

export function prazoDigital(quantidade: number, criadoEm?: string | null): PrazoDigital {
  const c = PRAZO_PADRAO_DIGITAL
  if (quantidade <= c.limite) return { min: c.minAte200, max: c.tetoAte200, texto: `${c.minAte200} a ${c.tetoAte200} dias úteis` }
  const antigo = !!criadoEm && new Date(criadoEm).getTime() < new Date(CORTE_PRAZO_15).getTime()
  const d = antigo ? c.acima200Antigo : c.acima200
  return { min: d, max: d, texto: `${d} dias úteis` }
}

type PedidoPrazo = { quantidade: number; em?: string | null; prazoEntrega?: PrazoDigital | null; termos?: { prazo?: PrazoDigital } | null }

// Prioridade: 1) prazoEntrega gravado (gravar_digital/tela); 2) retrato do aceite (termos.prazo); 3) regra, pela data de criação.
export function prazoDoPedido(p: PedidoPrazo): PrazoDigital {
  return p.prazoEntrega ?? p.termos?.prazo ?? prazoDigital(p.quantidade, p.em)
}

// "até dd/mm" no link: teto do prazo contado da arte aprovada; antes disso, "a confirmar".
export function ateDataPrazo(p: PedidoPrazo & { arteAprovadaEm?: string | null }): string {
  if (!p.arteAprovadaEm) return "a confirmar"
  const iso = somarDiasUteis(p.arteAprovadaEm.slice(0, 10), prazoDoPedido(p).max)
  return `até ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}
