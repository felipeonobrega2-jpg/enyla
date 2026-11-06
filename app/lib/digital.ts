// Braço digital da ENYLA (pedidos pequenos, produção na Villa): o agente cota sozinho pela tabela da Villa, manda o
// link do sinal (50%) e o sistema segue o pedido. Aqui só as regras puras: medida padrão por ml, cotação, sinal
// único (para reconhecer o Pix no extrato) e o texto que vai para o cliente.

import type { DadosPedido } from "./atendente"
import { facaAberta, folhaDaFaca, precoDigital, quantidadesDa, Folha, RegraDigital, REGRA_DIGITAL_PADRAO } from "./precoDigital"

// Caixa padrão por ml (altura × largura × profundidade, cm), tirada das cotações com a Villa; o cliente confirma
export const MEDIDA_PADRAO: { ml: number; a: number; l: number; p: number }[] = [
  { ml: 15, a: 6, l: 2.7, p: 2.7 },
  { ml: 30, a: 9, l: 4, p: 4 },
  { ml: 50, a: 10, l: 5, p: 5 },
  { ml: 100, a: 13.2, l: 6.2, p: 6.2 },
]
// ml próximo da tabela (10 ml → 15, 60 ml → 50, 110 ml → 100); fora de 5–120 ml não chuta
export function padraoDoMl(ml: number | null | undefined) {
  if (!ml || ml < 5 || ml > 120) return null
  return MEDIDA_PADRAO.reduce((m, x) => Math.abs(x.ml - ml) < Math.abs(m.ml - ml) ? x : m)
}

export const SINAL_DIGITAL = 0.5

export type StatusDigital = "aguardando_sinal" | "sinal_pago" | "arte" | "producao" | "enviado" | "cancelado"
export type PedidoDigital = {
  id: string                       // DIG-0001
  jid: string; nome: string | null
  em: string                       // quando cotou
  produto: string | null; ml: number | null
  medidas: { a: number; l: number; p: number }; padrao: boolean   // padrão = medida da tabela por ml (cliente confirma)
  folha: Folha; quantidade: number; faixa: number
  custo: number; arte: number; margem: number; total: number
  sinal: number                    // valor exato do Pix do sinal (centavos únicos entre os abertos)
  status: StatusDigital
  sinalPagoEm?: string
}

export type Cotacao =
  | { ok: true; medidas: { a: number; l: number; p: number }; padrao: boolean; ml: number | null; folha: Folha; quantidade: number; faixa: number; custo: number; arte: number; margem: number; total: number }
  | { ok: false; motivo: string }

// Cota pelo que a IA tirou da conversa: medidas da caixa (ou o padrão do ml) e a quantidade
export function cotarDigital(d: DadosPedido | null, regra: RegraDigital = REGRA_DIGITAL_PADRAO): Cotacao {
  if (!d?.quantidade || d.quantidade < 1) return { ok: false, motivo: "falta a quantidade" }
  const cx = d.caixa_cm && d.caixa_cm.altura > 0 && d.caixa_cm.frente > 0 && d.caixa_cm.lateral > 0 ? d.caixa_cm : null
  const pad = cx ? null : padraoDoMl(d.volume_ml)
  if (!cx && !pad) return { ok: false, motivo: "faltam as medidas (ou o ml)" }
  const medidas = cx ? { a: cx.altura, l: cx.frente, p: cx.lateral } : { a: pad!.a, l: pad!.l, p: pad!.p }
  const faca = facaAberta(medidas.a, medidas.l, medidas.p)
  const folha = folhaDaFaca(faca.largura, faca.altura)
  if (!folha) return { ok: false, motivo: "caixa maior que A3 (consultar a Villa)" }
  const p = precoDigital(d.quantidade, folha, regra)
  if (!p) return { ok: false, motivo: `acima de ${Math.max(...quantidadesDa(folha))} un na ${folha} (fora da tabela da Villa)` }
  return { ok: true, medidas, padrao: !cx, ml: d.volume_ml ?? pad?.ml ?? null, folha, quantidade: p.faixa, faixa: p.faixa, custo: p.custo, arte: p.arte, margem: p.margem, total: p.total }
}

// Sinal com centavos únicos entre os pedidos esperando Pix (o extrato só mostra valor e nome: assim o Pix acha o pedido)
export function sinalUnico(total: number, abertos: number[]): number {
  let v = Math.round(total * SINAL_DIGITAL * 100)
  const usados = new Set(abertos.map(x => Math.round(x * 100)))
  while (usados.has(v)) v -= 1
  return v / 100
}

export const proximoIdDigital = (pedidos: { id: string }[]) =>
  `DIG-${String(pedidos.reduce((m, p) => Math.max(m, Number(p.id.replace(/\D/g, "")) || 0), 0) + 1).padStart(4, "0")}`

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ")
const cm = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })

// Link da página Pix do sistema (a mesma do sinal da ENYLA)
export const linkPixDigital = (base: string, p: Pick<PedidoDigital, "id" | "sinal" | "nome">) =>
  `${base}/pix/${encodeURIComponent(p.id)}?v=${p.sinal.toFixed(2)}&c=${encodeURIComponent(p.nome || "Cliente")}`

export function textoOrcamentoDigital(p: Pick<PedidoDigital, "quantidade" | "ml" | "medidas" | "padrao" | "total" | "sinal" | "produto">, link: string) {
  const oque = p.ml ? `para frasco de ${p.ml} ml` : p.produto ? `para ${p.produto}` : ""
  return [
    `Fechou! Em impressão digital fica assim:`,
    ``,
    `*${p.quantidade.toLocaleString("pt-BR")} caixinhas* ${oque} (${cm(p.medidas.a)} × ${cm(p.medidas.l)} × ${cm(p.medidas.p)} cm), triplex 300g com laminação fosca ou brilhante, *arte inclusa* (nossa designer cria pra você).`,
    `Total: *${brl(p.total)}* (${brl(p.total / p.quantidade)} a unidade).`,
    ``,
    `Para começar, o sinal de 50% (*${brl(p.sinal)}*) pelo Pix: ${link}`,
    `Assim que cair, a designer já começa a sua arte.`,
    p.padrao ? `\nUsei a medida padrão de caixa ${oque}. Se o seu frasco for diferente, me manda as medidas que eu ajusto.` : null,
  ].filter(x => x !== null).join("\n")
}

// Valores em R$ deste pedido (podem sair nas respostas seguintes sem travar)
export const valoresDoPedido = (p: Pick<PedidoDigital, "total" | "sinal" | "quantidade">) =>
  [p.total, p.sinal, p.total / p.quantidade, p.total - p.sinal].map(v => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }))

// Pedido novo a partir da cotação (id e sinal únicos entre os que já existem)
export function montarPedido(pedidos: PedidoDigital[], jid: string, nome: string | null, d: DadosPedido | null, c: Extract<Cotacao, { ok: true }>, agora = new Date()): PedidoDigital {
  const abertos = pedidos.filter(p => p.status === "aguardando_sinal").map(p => p.sinal)
  return {
    id: proximoIdDigital(pedidos), jid, nome, em: agora.toISOString(), produto: d?.produto ?? null, ml: c.ml,
    medidas: c.medidas, padrao: c.padrao, folha: c.folha, quantidade: c.quantidade, faixa: c.faixa,
    custo: c.custo, arte: c.arte, margem: c.margem, total: c.total, sinal: sinalUnico(c.total, abertos), status: "aguardando_sinal",
  }
}

// O pedido em andamento desta conversa (últimos 30 dias, não cancelado)
export const pedidoDaConversa = (pedidos: PedidoDigital[] | undefined, jid: string, agora = Date.now()) =>
  (pedidos ?? []).find(p => p.jid === jid && p.status !== "cancelado" && agora - new Date(p.em).getTime() < 30 * 86_400_000) ?? null

// Recotar? Só antes do sinal e se mudou a quantidade ou as medidas (ele mandou as do frasco dele)
export const mudouACotacao = (p: PedidoDigital, c: Extract<Cotacao, { ok: true }>) =>
  p.status === "aguardando_sinal" && (p.quantidade !== c.quantidade || p.medidas.a !== c.medidas.a || p.medidas.l !== c.medidas.l || p.medidas.p !== c.medidas.p)
