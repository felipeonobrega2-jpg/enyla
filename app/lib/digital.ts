// Braço digital da ENYLA (pedidos pequenos, produção na Villa): o agente cota sozinho pela tabela da Villa, manda o
// link do sinal (50%) e o sistema segue o pedido. Aqui só as regras puras: medida padrão por ml, cotação, sinal
// único (para reconhecer o Pix no extrato) e o texto que vai para o cliente.

import type { DadosPedido } from "./atendente"
import { custoVilla, facaAberta, folhaDaFaca, precoDigital, quantidadesDa, Folha, RegraDigital, REGRA_DIGITAL_PADRAO } from "./precoDigital"

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

// Medida padrão crescida até caber o frasco que o cliente descreveu ("9,6 com a válvula", "3 x 10 cm"):
// o maior número é a altura (+0,4 cm de folga), o menor é o diâmetro (+0,3 cm). Números com "ml" não contam.
export function caberFrasco(pad: { a: number; l: number; p: number }, frasco: string | null | undefined, alturaCaixa?: number) {
  const nums = (frasco ?? "").replace(/(\d+(?:[.,]\d+)?)\s*ml/gi, " ").match(/\d+(?:[.,]\d+)?/g)?.map(n => Number(n.replace(",", "."))).filter(n => n >= 1 && n <= 30) ?? []
  const r1 = (n: number) => Math.round(n * 10) / 10
  let { a, l, p } = pad
  const ord = [...nums].sort((x, y) => y - x)
  if (ord.length >= 3) { a = r1(ord[0] + 0.4); l = r1(ord[1] + 0.3); p = r1(ord[2] + 0.3) }   // altura × largura × profundidade: caixa justa
  else if (ord.length) {
    a = Math.max(a, r1(ord[0] + 0.4))
    if (ord.length === 2) { const d = r1(ord[1] + 0.3); l = Math.max(l, d); p = Math.max(p, d) }   // altura e diâmetro
  }
  if (alturaCaixa && alturaCaixa > 0 && alturaCaixa <= 30) a = Math.max(a, alturaCaixa)
  return { a, l, p }
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
  vistoEm?: string; ultimaVista?: string; vistas?: number   // quando o cliente abriu a página (só para o seu painel)
  lembretes?: { nivel: number; em: string }[]                // lembretes que o follow-up mandou
  statusEm?: string                                          // última mudança de status
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
  const medidas = cx ? { a: cx.altura, l: cx.frente, p: cx.lateral } : caberFrasco(pad!, d.frasco_cm, d.caixa_cm?.altura)
  const faca = facaAberta(medidas.a, medidas.l, medidas.p)
  const naFolha = folhaDaFaca(faca.largura, faca.altura)
  if (!naFolha) return { ok: false, motivo: "caixa maior que A3 (consultar a Villa)" }
  // Cabe na A4 mas a quantidade passa da tabela A4 (só vai até 100): usa a tabela A3, que é mais cara (nunca cobra a menos)
  const folha = naFolha === "A4" && !custoVilla(d.quantidade, "A4") ? "A3" : naFolha
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

// ── Página do pedido ─────────────────────────────────────────────────────────
export type Briefing = { marca?: string; cores?: string; referencias?: string; arquivos?: { nome: string; url: string }[]; em?: string }
export type PedidoComBriefing = PedidoDigital & { briefing?: Briefing; pagamento?: { txId: string; valor: number; data: string; nome: string | null } }

// As quantidades da tabela da folha deste pedido, com o preço de cada uma
export function opcoesDoPedido(p: Pick<PedidoDigital, "folha">, regra: RegraDigital = REGRA_DIGITAL_PADRAO) {
  return quantidadesDa(p.folha).map(q => precoDigital(q, p.folha, regra)!).map(x => ({ quantidade: x.faixa, total: x.total, unit: x.total / x.faixa }))
}

// Cliente escolheu outra quantidade na página (só antes do sinal): refaz total e sinal
export function trocarQuantidade(pedidos: PedidoDigital[], p: PedidoDigital, q: number, regra: RegraDigital = REGRA_DIGITAL_PADRAO): PedidoDigital | null {
  if (p.status !== "aguardando_sinal") return null
  const x = precoDigital(q, p.folha, regra)
  if (!x || x.faixa !== q) return null
  const abertos = pedidos.filter(o => o.id !== p.id && o.status === "aguardando_sinal").map(o => o.sinal)
  return { ...p, quantidade: q, faixa: q, custo: x.custo, arte: x.arte, margem: x.margem, total: x.total, sinal: sinalUnico(x.total, abertos) }
}

// ── Sinal no extrato ─────────────────────────────────────────────────────────
export type EntradaBanco = { id: string; data: string; valor: number; tipo: "entrada" | "saida"; contraparte_nome?: string | null }
// Entrada com o valor exato do sinal, a partir do dia em que cotou, que ainda não pagou outro pedido
export function sinaisPagos(pedidos: PedidoDigital[], extrato: EntradaBanco[], usadas: Set<string>): { id: string; tx: EntradaBanco }[] {
  const out: { id: string; tx: EntradaBanco }[] = []
  const ja = new Set(usadas)
  for (const p of pedidos.filter(x => x.status === "aguardando_sinal")) {
    const dia = new Date(new Date(p.em).getTime() - 3 * 3_600_000).toISOString().slice(0, 10)   // dia em São Paulo
    const tx = extrato.find(t => t.tipo === "entrada" && !ja.has(t.id) && t.data >= dia && Math.round(t.valor * 100) === Math.round(p.sinal * 100))
    if (tx) { out.push({ id: p.id, tx }); ja.add(tx.id) }
  }
  return out
}

export function textoSinalPago(p: Pick<PedidoDigital, "id" | "sinal">, link: string, temBriefing: boolean) {
  return [
    `Pagamento do sinal confirmado (${brl(p.sinal)}). Obrigado! ✅`,
    temBriefing
      ? `A designer já está com as suas informações e começa a sua arte. Assim que ficar pronta, eu te mando aqui para aprovar.`
      : `Para a designer começar a sua arte, me conta pelo link: o nome da marca, as cores e, se tiver, o logo e referências. ${link}`,
  ].join("\n\n")
}

// Mensagem curta do orçamento: o preço e o link da página (a escolha da quantidade e o Pix ficam lá)
export function textoLinkPedido(p: Pick<PedidoDigital, "quantidade" | "ml" | "medidas" | "padrao" | "total" | "produto">, link: string) {
  const oque = p.ml ? `para frasco de ${p.ml} ml` : p.produto ? `para ${p.produto}` : ""
  return [
    `Montei o seu orçamento em impressão digital, com a *arte inclusa* (nossa designer cria pra você).`,
    `*${p.quantidade.toLocaleString("pt-BR")} caixinhas* ${oque} (${cm(p.medidas.a)} × ${cm(p.medidas.l)} × ${cm(p.medidas.p)} cm): *${brl(p.total)}*`,
    `Veja a caixa, escolha a quantidade e pague o sinal de 50% pelo Pix aqui: ${link}`,
    p.padrao ? `Usei a medida padrão de caixa ${oque}. Se o seu frasco for diferente, me manda as medidas que eu ajusto.` : null,
  ].filter(x => x !== null).join("\n\n")
}


// ── Lembrete do pedido (follow-up de quem não pagou o sinal) ─────────────────
// O follow-up do agente (3 h, 24 h, 72 h sem resposta) vira lembrete deste pedido: texto fixo, na voz do Felipe,
// com o link. Nunca conta que viu o cliente abrir a página.
export const DIAS_VALIDADE_DIGITAL = 15
export function pedidoPendente(pedidos: PedidoDigital[] | undefined, jid: string, agora = Date.now()): PedidoDigital | null {
  return (pedidos ?? []).find(p => p.jid === jid && p.status === "aguardando_sinal" && agora - new Date(p.em).getTime() < DIAS_VALIDADE_DIGITAL * 86_400_000) ?? null
}
const primeiroNome = (n: string | null) => {
  const x = (n ?? "").trim().split(/\s+/)[0] ?? ""
  return /^[A-Za-zÀ-ÿ]{2,}$/.test(x) ? x[0].toUpperCase() + x.slice(1).toLowerCase() : ""
}
export function textoLembreteDigital(p: Pick<PedidoDigital, "nome" | "quantidade" | "total" | "em" | "vistoEm">, nivel: 1 | 2 | 3, link: string): string {
  const oi = primeiroNome(p.nome) ? `Oi, ${primeiroNome(p.nome)}!` : "Oi!"
  const ate = new Date(new Date(p.em).getTime() + DIAS_VALIDADE_DIGITAL * 86_400_000).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })
  if (nivel === 1) return p.vistoEm
    ? `${oi} Ficou alguma dúvida no orçamento das caixinhas? Se quiser outra quantidade, dá pra escolher lá mesmo:\n${link}`
    : `${oi} Conseguiu abrir o orçamento das caixinhas? Segue o link de novo:\n${link}`
  if (nivel === 2) return `${oi} Passando pra lembrar do seu orçamento: *${p.quantidade.toLocaleString("pt-BR")} caixinhas* por *${brl(p.total)}*, com a arte inclusa. Assim que o sinal cair, a designer já começa a sua arte.\n${link}`
  return `${oi} Consigo segurar esse valor até ${ate}. Se ainda fizer sentido, é só pagar o sinal pelo link:\n${link}\n\nSe mudou alguma coisa (quantidade ou medida), me fala que eu ajusto.`
}

// Avanço de status pelo painel (o sinal pago vem do extrato; daí em diante, até as próximas fases, é você)
export const PROXIMO_STATUS: Partial<Record<StatusDigital, StatusDigital>> = { sinal_pago: "arte", arte: "producao", producao: "enviado" }
export const ROTULO_STATUS: Record<StatusDigital, string> = {
  aguardando_sinal: "Esperando sinal", sinal_pago: "Sinal pago", arte: "Arte", producao: "Produção", enviado: "Enviado", cancelado: "Cancelado",
}
export function mudarStatus(p: PedidoDigital, para: StatusDigital, agora = new Date()): PedidoDigital | null {
  const ok = para === "cancelado" ? p.status !== "enviado" && p.status !== "cancelado" : PROXIMO_STATUS[p.status] === para
  return ok ? { ...p, status: para, statusEm: agora.toISOString() } : null
}
