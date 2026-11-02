// Atendente do WhatsApp: o que a IA devolve para uma conversa e como isso vira orçamento pré-preenchido.

import type { FormData } from "../types"

export type AlertaAtendimento = "nenhum" | "desconto" | "preco" | "prazo" | "reclamacao" | "decisao_sua"

export type DadosPedido = {
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
