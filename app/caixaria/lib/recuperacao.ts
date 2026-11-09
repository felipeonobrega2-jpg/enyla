// Cartuxo · recuperar quem parou no pagamento (lógica pura).
// Três toques no WhatsApp: logo depois, no dia seguinte e três dias depois. Tom de equipe, sem pressão,
// sem falar de chapa nem de prazo "para juntar pedidos". Depois do 3º toque, uma semana de espera e o pedido esfria.

export type Registro = { toques: string[]; arquivado?: { em: string; motivo: string } }
export type Recuperacao = Record<string, Registro>   // pedido id → registro (caixaria_config, chave "recuperacao")

export const MOTIVOS = ["Achou caro", "Prazo não serve", "Só estava pesquisando", "Comprou em outro lugar", "Medida não serve", "Não respondeu", "Outro"] as const

const H = 3_600_000
// Quando cada toque fica devido, contando do pedido (1º) ou do 1º toque (2º e 3º)
const ESPERA = [0.5 * H, 24 * H, 72 * H]
const ESFRIA = 7 * 24 * H

export type PedidoParado = {
  id: string; numero: string; criadoEm: string; total: number
  cliente: { nome: string; telefone: string }
  itens: { nome: string; qtd: number }[]
  recusado?: boolean
}

export type Situacao =
  | { tipo: "chamar"; toque: 1 | 2 | 3; desde: number }     // devido desde (ms)
  | { tipo: "esperar"; toque: 2 | 3; quando: number }
  | { tipo: "esfriou"; ultimo: number }
  | { tipo: "arquivado"; motivo: string }

export function situacao(p: PedidoParado, r: Registro | undefined, agora = Date.now()): Situacao {
  if (r?.arquivado) return { tipo: "arquivado", motivo: r.arquivado.motivo }
  const toques = (r?.toques ?? []).map(t => new Date(t).getTime()).sort((a, b) => a - b)
  const n = toques.length
  if (n >= 3) return { tipo: "esfriou", ultimo: toques[2] }
  const base = n === 0 ? new Date(p.criadoEm).getTime() : toques[0]
  const devido = base + ESPERA[n]
  const toque = (n + 1) as 1 | 2 | 3
  if (agora >= devido) {
    if (n === 0 && agora - devido > ESFRIA) return { tipo: "esfriou", ultimo: base }   // pedido antigo nunca chamado
    return { tipo: "chamar", toque, desde: devido }
  }
  return { tipo: "esperar", toque: toque as 2 | 3, quando: devido }
}

// Depois do 3º toque, uma semana sem pagar: sugere arquivar
export const esfriouDeVez = (s: Situacao, agora = Date.now()) => s.tipo === "esfriou" && agora - s.ultimo > ESFRIA

const resumo = (p: PedidoParado) => {
  const i = p.itens[0]
  if (!i) return ""
  const nome = i.nome.replace(/^Caixa para /, "caixas para ")
  return p.itens.length > 1 ? `${p.itens.length} modelos de caixa` : `${i.qtd.toLocaleString("pt-BR")} ${nome}`
}

export function mensagem(p: PedidoParado, toque: 1 | 2 | 3, site = "https://caixaria.com", agora = new Date()) {
  const nome = p.cliente.nome.trim().split(/\s+/)[0]
  const primeiro = nome ? nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase() : ""
  const link = `${site}/pedido/${p.numero}`
  const oi = primeiro ? `Oi, ${primeiro}!` : "Oi!"
  if (toque === 1 && p.recusado)
    return `${oi} Aqui é da Cartuxo. Vi que o pagamento do pedido ${p.numero} (${resumo(p)}) não passou, e nada foi cobrado. Quer tentar de novo? Pelo Pix costuma ser mais fácil: ${link}\n\nSe preferir, te ajudo por aqui.`
  if (toque === 1)
    return `${oi} Aqui é da Cartuxo. O seu pedido ${p.numero} (${resumo(p)}) ficou guardado, faltando só o pagamento. Ficou alguma dúvida sobre a caixa, o prazo ou a arte? Se estiver tudo certo, é só pagar por aqui: ${link}`
  if (toque === 2)
    return `${oi} Tudo bem? Passando para saber se você ainda quer as caixas do pedido ${p.numero}. Assim que o pagamento cair, nossa equipe de design já começa a sua arte. O pedido está aqui: ${link}`
  const ate = new Date(agora.getTime() + 7 * 24 * H).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
  return `${oi} Último toque sobre o pedido ${p.numero}: ele fica guardado com o mesmo preço até ${ate}. Se o tamanho ou a quantidade não for bem o que você precisa, me conta que a gente acha a caixa certa. ${link}`
}

export const linkWhats = (telefone: string, texto: string) => {
  const d = telefone.replace(/\D/g, "")
  const num = d.length <= 11 ? `55${d}` : d
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`
}

export function quandoTexto(ms: number, agora = Date.now()) {
  const d = Math.abs(agora - ms), fut = ms > agora
  const t = d < H ? `${Math.max(1, Math.round(d / 60_000))} min` : d < 24 * H ? `${Math.round(d / H)} h` : `${Math.round(d / (24 * H))} dia${Math.round(d / (24 * H)) > 1 ? "s" : ""}`
  return fut ? `em ${t}` : `há ${t}`
}
