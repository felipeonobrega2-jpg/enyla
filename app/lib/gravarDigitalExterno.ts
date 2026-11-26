// Porta externa, ação gravar_digital: grava SÓ situacaoArte e/ou prazoEntrega num pedido Digital (DIG-xxxx), com quem, quando e motivo.
// Não mexe em pagamento, status, custo nem mensagem. Não manda nada ao cliente.
import { DIRETORES } from "./diretoria"
import { SITUACOES_ARTE, dataValida, type SituacaoArte } from "./digitalPrazo"

export type ResultadoGravarDigital =
  | { ok: true; resultado: string; id: string; situacaoArte: string | null; prazoEntrega: string | null }
  | { ok: false; status: 400 | 404 | 500; erro: string }

export const agoraBrasilia = () => new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T")

export function validarGravarDigital(b: Record<string, unknown>): { erro: string } | { id: string; situacaoArte?: SituacaoArte; prazoEntrega?: string; motivo: string } {
  const id = typeof b.id === "string" ? b.id.trim().toUpperCase() : ""
  if (!/^DIG-\d+$/.test(id)) return { erro: "id: pedido Digital no formato DIG-0000." }
  const motivo = typeof b.motivo === "string" ? b.motivo.trim() : ""
  if (!motivo) return { erro: "motivo: obrigatório." }
  if (motivo.length > 300) return { erro: "motivo: no máximo 300 caracteres." }
  const temArte = b.situacaoArte !== undefined, temPrazo = b.prazoEntrega !== undefined
  if (!temArte && !temPrazo) return { erro: "situacaoArte e/ou prazoEntrega: informe ao menos um." }
  let situacaoArte: SituacaoArte | undefined, prazoEntrega: string | undefined
  if (temArte) {
    if (typeof b.situacaoArte !== "string" || !(SITUACOES_ARTE as readonly string[]).includes(b.situacaoArte)) return { erro: `situacaoArte: ${SITUACOES_ARTE.join(" | ")}.` }
    situacaoArte = b.situacaoArte as SituacaoArte
  }
  if (temPrazo) {
    if (typeof b.prazoEntrega !== "string" || (b.prazoEntrega !== "" && !dataValida(b.prazoEntrega))) return { erro: "prazoEntrega: data YYYY-MM-DD ou vazio." }
    prazoEntrega = b.prazoEntrega
  }
  return { id, situacaoArte, prazoEntrega, motivo }
}

export async function gravarDigitalExterno(diretor: string, b: Record<string, unknown>): Promise<ResultadoGravarDigital> {
  const v = validarGravarDigital(b)
  if ("erro" in v) return { ok: false, status: 400, erro: v.erro }
  const { lerPedido, gravarPedido } = await import("./digitalServidor")
  const { pedido } = await lerPedido(v.id)
  if (!pedido) return { ok: false, status: 404, erro: `Pedido ${v.id} não encontrado.` }
  const por = DIRETORES.find(d => d.id === diretor)?.nome ?? diretor
  const novo = await gravarPedido(v.id, p => ({
    ...p,
    ...(v.situacaoArte !== undefined ? { situacaoArte: v.situacaoArte } : {}),
    ...(v.prazoEntrega !== undefined ? (v.prazoEntrega ? { prazoEntregaEm: v.prazoEntrega } : { prazoEntregaEm: undefined }) : {}),
    edicaoAcomp: { por, em: agoraBrasilia(), motivo: v.motivo },
  }))
  if (!novo) return { ok: false, status: 500, erro: `Erro ao gravar ${v.id}.` }
  return { ok: true, id: v.id, situacaoArte: novo.situacaoArte ?? null, prazoEntrega: novo.prazoEntregaEm ?? null,
    resultado: `${v.id}: ${[v.situacaoArte !== undefined ? `arte "${v.situacaoArte}"` : "", v.prazoEntrega !== undefined ? `prazo ${v.prazoEntrega || "vazio (a confirmar)"}` : ""].filter(Boolean).join(", ")} (${v.motivo}).` }
}
