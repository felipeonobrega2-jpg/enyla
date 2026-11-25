// Gravação de situacaoArte e prazoEntrega num pedido Digital (porta externa `gravar_digital` e painel).
// Só esses dois campos + quem/quando (Brasília)/motivo. Não mexe em pagamento, status, custo nem mensagem.
import { DIRETORES } from "./diretoria"
import { mudarConfig } from "./configAtomica"
import { SITUACOES_ARTE } from "./digitalPrazo"
import type { SituacaoArte } from "./digital"

export type ResultadoGravarDigital = { ok: true; id: string; situacaoArte: SituacaoArte | null; prazoEntrega: string | null } | { ok: false; status: 400 | 404 | 500; erro: string }
type PedidoCfg = { id: string; situacaoArte?: SituacaoArte; prazoEntrega?: string; arteEPrazoGravado?: { por: string; em: string; motivo: string } } & Record<string, unknown>

const agoraBrasilia = () => new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })   // aaaa-mm-dd hh:mm:ss
const dataValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T12:00:00Z")) && new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s

/** Valida o corpo; devolve o erro ou os campos a gravar (prazoEntrega "" = limpar). */
export function validarGravacao(b: Record<string, unknown>): string | { id: string; motivo: string; situacaoArte?: SituacaoArte; prazoEntrega?: string } {
  const id = typeof b.id === "string" ? b.id.trim() : ""
  if (!/^DIG-\w+$/i.test(id)) return "id: obrigatório, no formato DIG-xxxx."
  const motivo = typeof b.motivo === "string" ? b.motivo.trim() : ""
  if (!motivo) return "motivo: obrigatório."
  if (motivo.length > 300) return "motivo: no máximo 300 caracteres."
  const out: { id: string; motivo: string; situacaoArte?: SituacaoArte; prazoEntrega?: string } = { id: id.toUpperCase(), motivo }
  if (b.situacaoArte !== undefined) {
    if (typeof b.situacaoArte !== "string" || !SITUACOES_ARTE.includes(b.situacaoArte as SituacaoArte)) return `situacaoArte: ${SITUACOES_ARTE.join(" | ")}.`
    out.situacaoArte = b.situacaoArte as SituacaoArte
  }
  if (b.prazoEntrega !== undefined) {
    const d = b.prazoEntrega === null ? "" : typeof b.prazoEntrega === "string" ? b.prazoEntrega.trim() : null
    if (d === null || (d !== "" && !dataValida(d))) return "prazoEntrega: data AAAA-MM-DD ou vazio."
    out.prazoEntrega = d
  }
  if (out.situacaoArte === undefined && out.prazoEntrega === undefined) return "Mande situacaoArte e/ou prazoEntrega."
  return out
}

export async function gravarArtePrazo(por: string, b: Record<string, unknown>): Promise<ResultadoGravarDigital> {
  const v = validarGravacao(b)
  if (typeof v === "string") return { ok: false, status: 400, erro: v }
  let achado: PedidoCfg | null = null
  try {
    await mudarConfig<{ pedidosDigitais?: PedidoCfg[] }>(d => {
      achado = null
      const todos = d.pedidosDigitais ?? []
      if (!todos.some(p => p.id === v.id)) return null
      return { pedidosDigitais: todos.map(p => {
        if (p.id !== v.id) return p
        const n: PedidoCfg = { ...p, arteEPrazoGravado: { por, em: agoraBrasilia(), motivo: v.motivo } }
        if (v.situacaoArte !== undefined) n.situacaoArte = v.situacaoArte
        if (v.prazoEntrega !== undefined) { if (v.prazoEntrega) n.prazoEntrega = v.prazoEntrega; else delete n.prazoEntrega }
        achado = n
        return n
      }) }
    })
  } catch { return { ok: false, status: 500, erro: "Erro ao gravar o pedido Digital." } }
  if (!achado) return { ok: false, status: 404, erro: `Pedido ${v.id} não encontrado.` }
  const p = achado as PedidoCfg
  return { ok: true, id: p.id, situacaoArte: p.situacaoArte ?? null, prazoEntrega: p.prazoEntrega ?? null }
}

export const nomeDoDiretor = (diretor: string) => DIRETORES.find(d => d.id === diretor)?.nome ?? diretor
export const gravarDigitalExterno = (diretor: string, b: Record<string, unknown>) => gravarArtePrazo(nomeDoDiretor(diretor), b)
