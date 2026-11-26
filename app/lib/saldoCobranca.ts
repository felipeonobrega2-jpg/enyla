// Cobrança enviada direto (Aprovo desligado): antes de sair, confere de novo o saldo ATUAL do pedido no banco.
// Só lê; não mexe em cálculo de cobrança, valores, pagamento ou PIX (usa montarPedidos como a tela já usa).
import { supabase } from "./supabase"
import { montarPedidos } from "./negocio"
import { unpackTerceirizado } from "./kanbanUnpack"
import type { KanbanCard, LancamentoFinanceiro } from "../types"

async function todas<T>(tabela: string): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; ; i += 1000) { const { data } = await supabase.from(tabela).select("*").range(i, i + 999); out.push(...((data ?? []) as T[])); if (!data || data.length < 1000) break }
  return out
}

// Valores em reais escritos no texto ("R$ 1.234,56"), em centavos
export function valoresDoTexto(texto: string): number[] {
  return [...texto.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/g)]
    .map(m => Math.round(Number(m[1].replace(/\./g, "")) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0)))
}
const pedidoDoTexto = (t: string) => /pedido\s+([A-Za-z0-9-]+)/i.exec(t)?.[1]

export type ConfereSaldo = { ok: true } | { ok: false; motivo: string }
// Puro: o texto precisa citar o pedido e todo valor citado tem de ser igual ao saldo atual
export function conferirSaldo(texto: string, numero: string | undefined, saldoAtual: number | null): ConfereSaldo {
  if (!numero) return { ok: false, motivo: "cobrança sem número de pedido: não deu para conferir o saldo" }
  if (saldoAtual === null) return { ok: false, motivo: `pedido ${numero} não encontrado: não deu para conferir o saldo` }
  const valores = valoresDoTexto(texto)
  const saldo = Math.round(saldoAtual * 100)
  if (!valores.length) return { ok: false, motivo: "cobrança sem valor no texto: não deu para conferir o saldo" }
  if (valores.some(v => v !== saldo)) return { ok: false, motivo: `valor da mensagem diferente do saldo atual do pedido ${numero}` }
  return { ok: true }
}

export async function conferirSaldoDaCobranca(texto: string, pedido?: unknown): Promise<ConfereSaldo> {
  const numero = (typeof pedido === "string" && pedido.trim()) || pedidoDoTexto(texto)
  if (!numero) return conferirSaldo(texto, undefined, null)
  const [kanban, lanc] = await Promise.all([todas<KanbanCard>("KanbanCard"), todas<LancamentoFinanceiro>("LancamentoFinanceiro")])
  const p = montarPedidos(kanban.map(unpackTerceirizado), lanc.filter(l => (l.unidade ?? "offset") === "offset")).find(x => x.numero === numero)
  return conferirSaldo(texto, numero, p ? p.aReceber : null)
}
