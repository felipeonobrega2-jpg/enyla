// Porta externa, ação gravar_digital: grava SÓ situacaoArte, prazoEntrega e/ou arteAprovadaEm (este só CTO e COO) num pedido Digital (DIG-xxxx), com quem, quando e motivo.
// Não mexe em pagamento, status, custo nem mensagem. Não manda nada ao cliente.
import { DIRETORES } from "./diretoria"
import { SITUACOES_ARTE, dataValida, type SituacaoArte } from "./digitalPrazo"
import type { EdicaoAcomp } from "./digital"

export type ResultadoGravarDigital =
  | { ok: true; resultado: string; id: string; situacaoArte: string | null; prazoEntrega: string | null; arteAprovadaEm: string | null }
  | { ok: false; status: 400 | 403 | 404 | 500; erro: string }

export const agoraBrasilia = () => new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T")

// Quem pode corrigir a aprovação da arte (a data que o acompanhamento usa para prever a entrega)
export const PODEM_GRAVAR_ARTE_APROVADA = ["cto", "coo"]
const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

export function validarGravarDigital(b: Record<string, unknown>): { erro: string } | { id: string; situacaoArte?: SituacaoArte; prazoEntrega?: string; arteAprovadaEm?: string; motivo: string } {
  const id = typeof b.id === "string" ? b.id.trim().toUpperCase() : ""
  if (!/^DIG-\d+$/.test(id)) return { erro: "id: pedido Digital no formato DIG-0000." }
  const motivo = typeof b.motivo === "string" ? b.motivo.trim() : ""
  if (!motivo) return { erro: "motivo: obrigatório." }
  if (motivo.length > 300) return { erro: "motivo: no máximo 300 caracteres." }
  const temArte = b.situacaoArte !== undefined, temPrazo = b.prazoEntrega !== undefined, temAprov = b.arteAprovadaEm !== undefined
  if (!temArte && !temPrazo && !temAprov) return { erro: "situacaoArte, prazoEntrega e/ou arteAprovadaEm: informe ao menos um." }
  let situacaoArte: SituacaoArte | undefined, prazoEntrega: string | undefined, arteAprovadaEm: string | undefined
  if (temAprov) {
    if (typeof b.arteAprovadaEm !== "string" || !ISO_COM_FUSO.test(b.arteAprovadaEm) || isNaN(Date.parse(b.arteAprovadaEm))) return { erro: "arteAprovadaEm: instante ISO com fuso, ex.: 2026-11-13T14:00:00.000Z." }
    arteAprovadaEm = new Date(b.arteAprovadaEm).toISOString()
  }
  if (temArte) {
    if (typeof b.situacaoArte !== "string" || !(SITUACOES_ARTE as readonly string[]).includes(b.situacaoArte)) return { erro: `situacaoArte: ${SITUACOES_ARTE.join(" | ")}.` }
    situacaoArte = b.situacaoArte as SituacaoArte
  }
  if (temPrazo) {
    if (typeof b.prazoEntrega !== "string" || (b.prazoEntrega !== "" && !dataValida(b.prazoEntrega))) return { erro: "prazoEntrega: data YYYY-MM-DD ou vazio." }
    prazoEntrega = b.prazoEntrega
  }
  return { id, situacaoArte, prazoEntrega, arteAprovadaEm, motivo }
}

/** Acumula a edição (nunca apaga): a primeira gravação de um pedido que só tem edicaoAcomp copia esse registro para a lista antes de acrescentar. */
export function registrarEdicao(p: { edicaoAcomp?: EdicaoAcomp; edicoesAcomp?: EdicaoAcomp[] }, e: EdicaoAcomp) {
  const antes = p.edicoesAcomp ?? (p.edicaoAcomp ? [p.edicaoAcomp] : [])
  return { edicaoAcomp: e, edicoesAcomp: [...antes, e] }
}

export async function gravarDigitalExterno(diretor: string, b: Record<string, unknown>): Promise<ResultadoGravarDigital> {
  if (b.arteAprovadaEm !== undefined && !PODEM_GRAVAR_ARTE_APROVADA.includes(diretor)) return { ok: false, status: 403, erro: "arteAprovadaEm: só o CTO e o COO podem gravar. Nada foi alterado." }
  const v = validarGravarDigital(b)
  if ("erro" in v) return { ok: false, status: 400, erro: v.erro }
  const { lerPedido, gravarPedido } = await import("./digitalServidor")
  const { pedido } = await lerPedido(v.id)
  if (!pedido) return { ok: false, status: 404, erro: `Pedido ${v.id} não encontrado.` }
  if (v.arteAprovadaEm !== undefined) {
    const t = Date.parse(v.arteAprovadaEm), criado = typeof pedido.em === "string" ? Date.parse(pedido.em) : NaN
    if (t > Date.now()) return { ok: false, status: 400, erro: "arteAprovadaEm: não pode ser no futuro." }
    if (!isNaN(criado) && t < criado) return { ok: false, status: 400, erro: "arteAprovadaEm: não pode ser anterior à criação do pedido." }
  }
  const por = DIRETORES.find(d => d.id === diretor)?.nome ?? diretor
  const novo = await gravarPedido(v.id, p => ({
    ...p,
    ...(v.situacaoArte !== undefined ? { situacaoArte: v.situacaoArte } : {}),
    ...(v.prazoEntrega !== undefined ? (v.prazoEntrega ? { prazoEntregaEm: v.prazoEntrega } : { prazoEntregaEm: undefined }) : {}),
    ...(v.arteAprovadaEm !== undefined ? { arteAprovadaEm: v.arteAprovadaEm } : {}),
    ...registrarEdicao(p, { por, em: agoraBrasilia(), motivo: v.motivo,
      ...(v.arteAprovadaEm !== undefined ? { arteAprovadaAntes: p.arteAprovadaEm ?? null } : {}),
      ...(v.situacaoArte !== undefined ? { situacaoArteAntes: p.situacaoArte ?? null } : {}),
      ...(v.prazoEntrega !== undefined ? { prazoEntregaAntes: p.prazoEntregaEm ?? null } : {}) }),
  }))
  if (!novo) return { ok: false, status: 500, erro: `Erro ao gravar ${v.id}.` }
  return { ok: true, id: v.id, situacaoArte: novo.situacaoArte ?? null, prazoEntrega: novo.prazoEntregaEm ?? null, arteAprovadaEm: novo.arteAprovadaEm ?? null,
    resultado: `${v.id}: ${[v.situacaoArte !== undefined ? `arte "${v.situacaoArte}"` : "", v.prazoEntrega !== undefined ? `prazo ${v.prazoEntrega || "vazio (a confirmar)"}` : "", v.arteAprovadaEm !== undefined ? `arte aprovada em ${v.arteAprovadaEm}` : ""].filter(Boolean).join(", ")} (${v.motivo}).` }
}
