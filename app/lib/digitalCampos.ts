// Campos de acompanhamento do pedido Digital (#164): situacaoArte e prazoEntrega, com quem gravou, quando (Brasília) e o motivo.
// Puro: valida e devolve o pedido novo. Não mexe em pagamento, status, custo nem mensagem.
import { ehDataIso, ehSituacaoArte, SITUACOES_ARTE } from "./digitalPrazo"
import type { PedidoDigital } from "./digital"

export type EntradaCampos = { situacaoArte?: unknown; prazoEntrega?: unknown; motivo?: unknown }
export type CamposValidos = { situacaoArte?: NonNullable<PedidoDigital["situacaoArte"]>; prazoEntrega?: string; motivo: string }

export const agoraBrasilia = (d = new Date()) => d.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T") + "-03:00"

export function validarCampos(b: EntradaCampos): CamposValidos | string {
  const motivo = typeof b.motivo === "string" ? b.motivo.trim() : ""
  if (!motivo) return "motivo: obrigatório."
  if (motivo.length > 300) return "motivo: no máximo 300 caracteres."
  const temArte = b.situacaoArte !== undefined, temPrazo = b.prazoEntrega !== undefined
  if (!temArte && !temPrazo) return "situacaoArte e/ou prazoEntrega: informe ao menos um."
  const out: CamposValidos = { motivo }
  if (temArte) {
    if (!ehSituacaoArte(b.situacaoArte)) return `situacaoArte: ${SITUACOES_ARTE.join(" | ")}.`
    out.situacaoArte = b.situacaoArte
  }
  if (temPrazo) {
    if (b.prazoEntrega !== "" && b.prazoEntrega !== null && !ehDataIso(b.prazoEntrega)) return "prazoEntrega: data AAAA-MM-DD ou vazio."
    out.prazoEntrega = (b.prazoEntrega as string | null) ?? ""
  }
  return out
}

export function aplicarCampos<T extends PedidoDigital>(p: T, c: CamposValidos, por: string, agora = agoraBrasilia()): T {
  const reg = { por, em: agora, motivo: c.motivo, ...(c.situacaoArte !== undefined ? { situacaoArte: c.situacaoArte } : {}), ...(c.prazoEntrega !== undefined ? { prazoEntrega: c.prazoEntrega } : {}) }
  return { ...p, ...(c.situacaoArte !== undefined ? { situacaoArte: c.situacaoArte } : {}), ...(c.prazoEntrega !== undefined ? { prazoEntrega: c.prazoEntrega } : {}),
    camposGravados: [...(p.camposGravados ?? []), reg].slice(-20) }
}
