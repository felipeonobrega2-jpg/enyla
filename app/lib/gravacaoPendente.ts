// "Gravar no celular": o computador pede, o celular (com o sistema aberto) vê o pedido em ~2 s e abre o gravador.
// Um pedido por vez, guardado no AppConfig (campo do servidor). Só roda no servidor.

import { randomUUID } from "crypto"
import { supabase } from "./supabase"
import { criarTokenGravacao } from "./tokenGravacao"

export type EstadoGravacao = "aguardando" | "aberto" | "enviado" | "cancelado"
export type GravacaoPendente = { id: string; jid: string; nome: string; token: string; expira: number; criadoEm: number; estado: EstadoGravacao }

export const VALIDADE_PEDIDO_MS = 2 * 60_000   // o celular só abre pedidos recentes

async function lerConfig() {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  return (data?.data ?? {}) as Record<string, unknown>
}
async function salvar(g: GravacaoPendente | null) {
  const cfg = await lerConfig()
  await supabase.from("AppConfig").update({ data: { ...cfg, gravacaoPendente: g } }).eq("id", 1)
}

export async function lerGravacao(): Promise<GravacaoPendente | null> {
  return ((await lerConfig()).gravacaoPendente as GravacaoPendente | null) ?? null
}

export async function pedirGravacao(jid: string, nome: string): Promise<GravacaoPendente> {
  const { token, expira } = criarTokenGravacao(jid, nome)
  const g: GravacaoPendente = { id: randomUUID(), jid, nome, token, expira, criadoEm: Date.now(), estado: "aguardando" }
  await salvar(g)
  return g
}

export async function mudarEstado(id: string | null, estado: EstadoGravacao, token?: string) {
  const g = await lerGravacao()
  if (!g || (id && g.id !== id) || (token && g.token !== token)) return
  await salvar({ ...g, estado })
}
