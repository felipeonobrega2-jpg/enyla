// Porta externa, ação gravar_digital: grava só situacaoArte e/ou prazoEntrega num pedido Digital (DIG-xxxx), com quem, quando e o motivo.
// Não mexe em pagamento, status, custo nem mensagem; não manda nada ao cliente.
import { mudarConfig } from "./configAtomica"
import { DIRETORES } from "./diretoria"
import { validarGravarDigital, aplicarGravacaoDigital } from "./digitalPrazo"
import type { PedidoDigital } from "./digital"

export type ResultadoGravarDigital = { ok: true; id: string; situacaoArte: string; prazoEntrega: string; resultado: string } | { ok: false; status: 400 | 404; erro: string }

export async function gravarDigitalExterno(diretor: string, b: Record<string, unknown>): Promise<ResultadoGravarDigital> {
  const v = validarGravarDigital(b)
  if ("erro" in v) return { ok: false, status: 400, erro: v.erro }
  const por = DIRETORES.find(d => d.id === diretor)?.nome ?? diretor
  let achado: PedidoDigital | null = null
  await mudarConfig<{ pedidosDigitais?: PedidoDigital[] }>(d => {
    const todos = d.pedidosDigitais ?? []
    if (!todos.some(p => p.id === v.id)) return null
    return { pedidosDigitais: todos.map(p => { if (p.id !== v.id) return p; achado = aplicarGravacaoDigital(p, v, por); return achado }) }
  })
  const p = achado as PedidoDigital | null
  if (!p) return { ok: false, status: 404, erro: `Pedido ${v.id} não encontrado.` }
  return { ok: true, id: p.id, situacaoArte: p.situacaoArte ?? "", prazoEntrega: p.prazoEntrega ?? "", resultado: `${p.id} gravado por ${por} (${v.motivo}).` }
}
