// Acompanhamento do pedido depois de pago: briefing da marca, arte de cada caixa (versões, ajustes, aprovação)
// e envio. Fica na coluna `acompanhamento` (jsonb) de cartuxo_pedidos.
// Cópia de cartuxo/lib/acompanhamento.ts (site): se mudar lá, mudar aqui.

export type Arquivo = { url: string; nome: string; em: string }

export type Briefing = {
  marca: string
  cores: string
  texto: string            // o que vai escrito na caixa, referências, observações
  arquivos: Arquivo[]      // logo e referências
  em: string
}

export type ArteItem = {
  versoes: Arquivo[]       // a última é a atual
  enviadaEm?: string       // última versão liberada para o cliente aprovar
  aprovadaEm?: string
  ajustes: { texto: string; em: string }[]
}

export type Envio = { em: string; transportadora: string; rastreio: string }

export type Acompanhamento = {
  briefing?: Briefing
  artes?: Record<string, ArteItem>   // índice do item do pedido → arte
  envio?: Envio
}

export type EstadoArte = "esperando-briefing" | "criando" | "para-aprovar" | "ajuste" | "aprovada"

export function estadoArte(a: Acompanhamento | null | undefined, item: number): EstadoArte {
  const x = a?.artes?.[item]
  if (x?.aprovadaEm) return "aprovada"
  const ultimoAjuste = x?.ajustes.at(-1)?.em
  if (x?.enviadaEm && (!ultimoAjuste || ultimoAjuste < x.enviadaEm)) return "para-aprovar"
  if (ultimoAjuste) return "ajuste"
  if (!a?.briefing) return "esperando-briefing"
  return "criando"
}

export const ROTULO_ARTE: Record<EstadoArte, string> = {
  "esperando-briefing": "Esperando o logo",
  criando: "Arte em criação",
  "para-aprovar": "Arte para aprovar",
  ajuste: "Ajuste pedido",
  aprovada: "Arte aprovada",
}

// Etapas que o cliente vê na página do pedido
export type Etapa = "pago" | "arte" | "producao" | "pronta" | "enviado"
export type StatusChapa = "aberta" | "producao" | "pronta"

export function etapaAtual(qtdItens: number, a: Acompanhamento | null | undefined, chapas: (StatusChapa | null)[]): Etapa {
  if (a?.envio) return "enviado"
  const itens = Array.from({ length: qtdItens }, (_, i) => i)
  const aprovadas = itens.every(i => estadoArte(a, i) === "aprovada")
  if (!aprovadas) return itens.some(i => estadoArte(a, i) !== "esperando-briefing") || a?.briefing ? "arte" : "pago"
  if (chapas.length && chapas.every(c => c === "pronta")) return "pronta"
  if (chapas.some(c => c === "producao" || c === "pronta")) return "producao"
  return "producao"   // arte aprovada: entra na fila de produção
}

// Formatos aceitos para logo, referência e arte
export const ACEITOS = ".png,.jpg,.jpeg,.webp,.svg,.pdf,.ai,.eps,.psd,.cdr,.zip"
export const MAX_MB = 50
export const nomeSeguro = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)
export const ehImagem = (url: string) => /\.(png|jpe?g|webp|svg)($|\?)/i.test(url)

// ── Avisos ao cliente (sistema) ───────────────────────────────────────────────

import { SITE_CARTUXO } from "./site"

export type Aviso = { id: string; nome: string; texto: string }

export function avisos(p: { numero: string; cliente: { nome: string }; itens: { nome: string; prazo: string }[] }, a: Acompanhamento | null | undefined, site = SITE_CARTUXO): Aviso[] {
  const n = p.cliente.nome.trim().split(/\s+/)[0] ?? ""
  const oi = n ? `Oi, ${n.charAt(0).toUpperCase()}${n.slice(1).toLowerCase()}!` : "Oi!"
  const link = `${site}/pedido/${p.numero}`
  const estados = p.itens.map((_, i) => estadoArte(a, i))
  const out: Aviso[] = []
  if (!a?.briefing) out.push({ id: "logo", nome: "Pedir o logo", texto: `${oi} Aqui é da Cartuxo. Recebemos o pagamento do pedido ${p.numero}, obrigado! Para a nossa equipe de design começar a sua arte, mande o seu logo por aqui ou pela página do pedido: ${link}` })
  if (estados.some(e => e === "para-aprovar")) out.push({ id: "arte", nome: "Arte pronta para aprovar", texto: `${oi} A arte da sua caixa ficou pronta. Veja e aprove por aqui: ${link}\n\nSe quiser mudar alguma coisa, é só pedir o ajuste na mesma página.` })
  if (estados.length && estados.every(e => e === "aprovada") && !a?.envio) out.push({ id: "producao", nome: "Entrou na produção", texto: `${oi} Arte aprovada! A sua caixa entrou na produção (${p.itens[0]?.prazo.toLowerCase() ?? "no prazo escolhido"}). Você acompanha tudo por aqui: ${link}` })
  if (estados.length && estados.every(e => e === "aprovada") && !a?.envio) out.push({ id: "pronta", nome: "Caixas prontas", texto: `${oi} As suas caixas do pedido ${p.numero} ficaram prontas! Vamos combinar o envio?` })
  if (a?.envio) out.push({ id: "enviado", nome: "Pedido enviado", texto: `${oi} O pedido ${p.numero} foi enviado por ${a.envio.transportadora}.${a.envio.rastreio ? ` Código de rastreio: ${a.envio.rastreio}.` : ""} Qualquer coisa, estamos por aqui. ${link}` })
  return out
}
