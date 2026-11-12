// Atendente do WhatsApp: o que a IA devolve para uma conversa e como isso vira orçamento pré-preenchido.

import type { FormData } from "../types"

export type AlertaAtendimento = "nenhum" | "desconto" | "preco" | "prazo" | "reclamacao" | "decisao_sua"

// Uma caixa do pedido quando o cliente quer mais de um tamanho/modelo (ex.: a de 30 ml e a de 50 ml)
export type ItemPedido = {
  rotulo: string                    // como identificar para o cliente ("30 ml", "difusor", "caixa do kit")
  volume_ml: number | null
  caixa_cm: { frente: number; lateral: number; altura: number } | null
  frasco_cm: string | null
  quantidade: number | null
}

export type DadosPedido = {
  itens?: ItemPedido[]              // 2 ou mais caixas diferentes; vazio quando é uma caixa só
  produto: string
  volume_ml: number | null
  caixa_cm: { frente: number; lateral: number; altura: number } | null
  frasco_cm: string | null
  quantidade: number | null
  tem_arte: boolean | null
  resumo: string
}

export type Atendimento = {
  resposta: string
  etapa: string
  alerta: AlertaAtendimento
  motivo_alerta: string
  sugere_video: boolean
  dados: DadosPedido
  ultimaId: string            // última mensagem lida: se chegar outra, a sugestão fica velha
}

export const ROTULO_ALERTA: Record<Exclude<AlertaAtendimento, "nenhum">, string> = {
  desconto: "Pediu desconto: decisão sua",
  preco: "Pediu preço",
  prazo: "Pergunta de prazo",
  reclamacao: "Reclamação",
  decisao_sua: "Decisão sua",
}

// Medida plausível de caixa em cm (descarta "100" de 100ml lido como medida)
const ok = (n: number | undefined | null) => typeof n === "number" && n > 0.5 && n < 80

// O que o cliente contou → campos do orçamento (só o que veio; o resto fica como está)
export function formDoAtendimento(d: DadosPedido): Partial<FormData> {
  const f: Partial<FormData> = {}
  const c = d.caixa_cm
  if (c && ok(c.frente) && ok(c.lateral) && ok(c.altura)) { f.frente = c.frente; f.lateral = c.lateral; f.alturaBox = c.altura }
  if (d.quantidade && d.quantidade >= 50 && d.quantidade <= 1_000_000) f.quantidades = [Math.round(d.quantidade)]
  const obs = [
    d.resumo,
    d.frasco_cm ? `Frasco: ${d.frasco_cm}` : "",
    d.tem_arte === true ? "Cliente já tem arte" : d.tem_arte === false ? "Arte por nossa conta" : "",
  ].filter(Boolean).join(" · ")
  if (obs) f.obsInterna = obs
  return f
}

// Tem algo do pedido que valha mostrar/pré-preencher?
export const temDados = (d: DadosPedido | undefined) =>
  !!d && !!(d.produto || d.caixa_cm || d.frasco_cm || d.quantidade || d.volume_ml)

// ── Cumprimento do horário (São Paulo) ─────────────────────────────────────────
// A IA não sabe que horas são e às vezes copia o "bom dia" do cliente: o sistema diz a hora e corrige antes de enviar.
// Bom dia até 11h59, boa tarde até 17h59, boa noite depois (e de madrugada).
export function horaEmSP(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", minute: "2-digit", hour12: false }).formatToParts(d).map(x => [x.type, x.value]))
  return { h: Number(p.hour) % 24, m: Number(p.minute) }
}
export function cumprimentoDoHorario(d = new Date()): "bom dia" | "boa tarde" | "boa noite" {
  const { h } = horaEmSP(d)
  return h >= 5 && h < 12 ? "bom dia" : h >= 12 && h < 18 ? "boa tarde" : "boa noite"
}

// Troca o cumprimento errado no começo de cada mensagem ("Bom dia!", "Oi, boa tarde, tudo bem?"); o resto não mexe
export function corrigirCumprimento(texto: string, d = new Date()) {
  const certo = cumprimentoDoHorario(d)
  return texto.split(/(\n\s*\n)/).map(parte => parte.replace(/^(\s*(?:oi|olá|ola|opa|e aí|e ai)?[\s,!.]*)(bom dia|boa tarde|boa noite)/i, (_, antes: string, usado: string) => {
    if (usado.toLowerCase() === certo) return antes + usado
    return antes + (usado[0] === usado[0].toUpperCase() ? certo[0].toUpperCase() + certo.slice(1) : certo)
  })).join("")
}

// Linha para a IA: dia, hora e o cumprimento certo
export function agoraParaIA(d = new Date()) {
  const dia = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit" })
  const { h, m } = horaEmSP(d)
  return `Agora: ${dia}, ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} em São Paulo. Se for cumprimentar pelo horário, use "${cumprimentoDoHorario(d)}" (mesmo que o cliente tenha usado outro).`
}
