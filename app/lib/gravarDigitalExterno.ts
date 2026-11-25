// Porta externa, ação gravar_digital: grava só situacaoArte e/ou prazoEntrega de um pedido Digital (DIG-xxxx), com quem,
// quando (Brasília) e o motivo. Não mexe em pagamento, status, custo nem mensagem. Não manda nada a cliente.
import { lerConfigLinha, mudarConfig } from "./configAtomica"
import { DIRETORES } from "./diretoria"
import { aplicarCampos, validarCampos } from "./digitalCampos"
import type { PedidoDigital } from "./digital"

export type ResultadoGravarDigital = { ok: true; id: string; situacaoArte: string | null; prazoEntrega: string | null; resultado: string } | { ok: false; status: 400 | 404 | 409; erro: string }
type Dados = { pedidosDigitais?: PedidoDigital[] }

export async function gravarDigitalExterno(diretor: string, b: Record<string, unknown>): Promise<ResultadoGravarDigital> {
  const id = typeof b.id === "string" ? b.id.trim().toUpperCase() : ""
  if (!/^DIG-\d+$/.test(id)) return { ok: false, status: 400, erro: "id: pedido Digital no formato DIG-0001." }
  const campos = validarCampos(b)
  if (typeof campos === "string") return { ok: false, status: 400, erro: campos }
  const { data } = await lerConfigLinha()
  if (!((data?.data as Dados | undefined)?.pedidosDigitais ?? []).some(p => p.id === id)) return { ok: false, status: 404, erro: `Pedido ${id} não encontrado.` }
  const por = DIRETORES.find(d => d.id === diretor)?.nome ?? diretor
  let novo: PedidoDigital | null = null
  await mudarConfig(d => {
    const todos = (d as Dados).pedidosDigitais ?? []
    return { pedidosDigitais: todos.map(p => { if (p.id !== id) return p; novo = aplicarCampos(p, campos, por); return novo }) }
  })
  const n = novo as PedidoDigital | null
  if (!n) return { ok: false, status: 409, erro: `Pedido ${id} mudou durante a gravação; tente de novo.` }
  return { ok: true, id, situacaoArte: n.situacaoArte ?? null, prazoEntrega: n.prazoEntrega || null, resultado: `${id} gravado (${campos.motivo}).` }
}
