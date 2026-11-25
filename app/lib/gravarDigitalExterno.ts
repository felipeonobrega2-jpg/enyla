// Porta externa, ação gravar_digital: grava SÓ situacaoArte e/ou prazoEntrega num pedido Digital (DIG-xxxx), qualquer diretor.
// Motivo obrigatório. Registra quem gravou, quando (Brasília) e o motivo. Não mexe em pagamento, status, custo nem mensagem.
import { DIRETORES } from "./diretoria"
import { SITUACOES_ARTE } from "./prazoDigital"

export type ResultadoGravarDigital = { ok: true; id: string; situacaoArte: string | null; prazoEntrega: string | null } | { ok: false; status: 400 | 404 | 409 | 500; erro: string }

const dataValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s

/** Valida o corpo; devolve o erro ou os campos a gravar (null = não mexe; "" = limpa). */
export function validarGravarDigital(b: Record<string, unknown>): { erro: string } | { id: string; motivo: string; situacaoArte?: string; prazoEntrega?: string } {
  const id = typeof b.id === "string" ? b.id.trim().toUpperCase() : ""
  if (!/^DIG-\d+$/.test(id)) return { erro: "id: obrigatório, no formato DIG-0001." }
  const motivo = typeof b.motivo === "string" ? b.motivo.trim() : ""
  if (!motivo) return { erro: "motivo: obrigatório." }
  if (motivo.length > 300) return { erro: "motivo: no máximo 300 caracteres." }
  const out: { id: string; motivo: string; situacaoArte?: string; prazoEntrega?: string } = { id, motivo }
  if (b.situacaoArte !== undefined) {
    if (typeof b.situacaoArte !== "string" || !(SITUACOES_ARTE as readonly string[]).includes(b.situacaoArte)) return { erro: `situacaoArte: ${SITUACOES_ARTE.join(" | ")}.` }
    out.situacaoArte = b.situacaoArte
  }
  if (b.prazoEntrega !== undefined) {
    if (typeof b.prazoEntrega !== "string" || (b.prazoEntrega !== "" && !dataValida(b.prazoEntrega))) return { erro: "prazoEntrega: data aaaa-mm-dd (ou vazio para limpar)." }
    out.prazoEntrega = b.prazoEntrega
  }
  if (out.situacaoArte === undefined && out.prazoEntrega === undefined) return { erro: "informe situacaoArte e/ou prazoEntrega." }
  return out
}

export async function gravarDigitalExterno(diretor: string, b: Record<string, unknown>): Promise<ResultadoGravarDigital> {
  return gravarDigital(DIRETORES.find(d => d.id === diretor)?.nome ?? diretor, b)
}

/** Mesma gravação, para a tela interna (por = quem está logado). */
export async function gravarDigital(por: string, b: Record<string, unknown>): Promise<ResultadoGravarDigital> {
  const v = validarGravarDigital(b)
  if ("erro" in v) return { ok: false, status: 400, erro: v.erro }
  const { lerPedido, gravarPedido } = await import("./digitalServidor")
  const { pedido } = await lerPedido(v.id)
  if (!pedido) return { ok: false, status: 404, erro: `Pedido ${v.id} não encontrado.` }
  const em = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
  const novo = await gravarPedido(v.id, p => ({
    ...p,
    ...(v.situacaoArte !== undefined ? { situacaoArte: v.situacaoArte as (typeof p)["situacaoArte"] } : {}),
    ...(v.prazoEntrega !== undefined ? { prazoEntrega: v.prazoEntrega || undefined } : {}),
    gravadoArtePrazo: [...(p.gravadoArtePrazo ?? []), { por, em, motivo: v.motivo }],
  }))
  if (!novo) return { ok: false, status: 500, erro: `Erro ao gravar ${v.id}.` }
  return { ok: true, id: v.id, situacaoArte: novo.situacaoArte ?? null, prazoEntrega: novo.prazoEntrega ?? null }
}
