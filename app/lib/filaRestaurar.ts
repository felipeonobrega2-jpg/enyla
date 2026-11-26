// Porta externa: acao 'restaurar_fila' { ids: string[] }. Tira os ids de AppConfig.data.filaDispensados e o item
// volta à Fila para envio manual. NÃO envia nada. Grava o mapa novo inteiro (sem as chaves) e um registro de quem
// devolveu e quando em filaRestaurados (campo do servidor, últimos 100).
import { mudarConfig } from "./configAtomica"
import { restaurarDispensados } from "./filaMensagens"
import type { IdDiretor } from "./diretoria"

type Resultado = { status: number; corpo: Record<string, unknown> }
export type RegistroRestaurar = { ids: string[]; por: string; em: string }

export async function acaoRestaurarFila(diretor: IdDiretor, b: Record<string, unknown>): Promise<Resultado> {
  if (!Array.isArray(b.ids) || b.ids.length === 0 || b.ids.some(i => typeof i !== "string")) return { status: 400, corpo: { erro: "ids: lista de textos (ids da Fila), obrigatória." } }
  if (b.ids.length > 500) return { status: 400, corpo: { erro: "ids: no máximo 500 por vez." } }
  let devolvidos: string[] = []
  await mudarConfig(d => {
    const r = restaurarDispensados(d.filaDispensados as Record<string, string> | undefined, b.ids)
    devolvidos = r.devolvidos
    if (!r.devolvidos.length) return null
    const log = (d.filaRestaurados as RegistroRestaurar[] | undefined) ?? []
    return { filaDispensados: r.mapa, filaRestaurados: [{ ids: r.devolvidos, por: diretor, em: new Date().toISOString() }, ...log].slice(0, 100) }
  })
  return { status: 200, corpo: { ok: true, devolvidos: devolvidos.length, ids: devolvidos, resultado: `${devolvidos.length} ${devolvidos.length === 1 ? "item devolvido" : "itens devolvidos"} à Fila. Nada foi enviado.` } }
}
