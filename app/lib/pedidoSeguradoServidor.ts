// Marca "aguardando pagamento" no servidor: dados_sistema, coleção pedidoSegurado, id = número do pedido.
// Liberar não apaga a linha: grava liberadoEm. Só roda no servidor.
import { supabase } from "./supabase"
import { MOTIVO_PADRAO, marcaAtiva, type LinhaSegurado, type MapaSegurados, type Segurado } from "./pedidoSegurado"

const COLECAO = "pedidoSegurado"

export async function lerSegurados(): Promise<MapaSegurados> {
  const { data } = await supabase.from("dados_sistema").select("id, dados").eq("colecao", COLECAO)
  const mapa: MapaSegurados = {}
  for (const r of data ?? []) {
    const l = r.dados as LinhaSegurado
    if (marcaAtiva(l)) mapa[r.id as string] = { desde: l.desde, motivo: l.motivo, por: l.por }
  }
  return mapa
}

async function gravar(numero: string, dados: LinhaSegurado) {
  const { error } = await supabase.from("dados_sistema").upsert({ colecao: COLECAO, id: numero, dados, v: 1, atualizado_em: new Date().toISOString() }, { onConflict: "colecao,id" })
  if (error) throw new Error(error.message)
}

/** Marca o pedido; se já estava marcado, mantém a data original. */
export async function segurar(numero: string, por: string, motivo?: string): Promise<Segurado> {
  const { data } = await supabase.from("dados_sistema").select("dados").eq("colecao", COLECAO).eq("id", numero).maybeSingle()
  const atual = data?.dados as LinhaSegurado | undefined
  if (marcaAtiva(atual)) return { desde: atual.desde, motivo: atual.motivo, por: atual.por }
  const s: Segurado = { desde: new Date().toISOString(), motivo: motivo?.trim().slice(0, 200) || MOTIVO_PADRAO, por }
  await gravar(numero, s)
  return s
}

export async function liberar(numero: string, por: string): Promise<boolean> {
  const { data } = await supabase.from("dados_sistema").select("dados").eq("colecao", COLECAO).eq("id", numero).maybeSingle()
  const atual = data?.dados as LinhaSegurado | undefined
  if (!marcaAtiva(atual)) return false
  await gravar(numero, { ...atual, liberadoEm: new Date().toISOString(), liberadoPor: por })
  return true
}
