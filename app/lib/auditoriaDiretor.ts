// Registro de auditoria das alterações feitas por usuário com perfil diretor: quem, quando, antes e depois.
// Fica em `dados_sistema` (coleção "auditoria_diretor"), uma linha por alteração. Só roda no servidor.
import { randomBytes } from "node:crypto"
import { supabase } from "./supabase"

export type RegistroAuditoria = {
  quem: string            // login do usuário
  nome: string
  perfil: string
  quando: string          // ISO
  metodo: string
  caminho: string
  resultado: "liberado" | "barrado"
  bloqueio?: string       // qual interruptor barrou
  antes: unknown
  depois: unknown
}

const TETO = 8000   // caracteres guardados de cada lado (antes/depois)
export function limitar(v: unknown): unknown {
  if (v === undefined) return null
  const s = typeof v === "string" ? v : JSON.stringify(v)
  if (s.length <= TETO) return v
  return { truncado: true, tamanho: s.length, inicio: s.slice(0, TETO) }
}

export async function registrarAuditoria(r: Omit<RegistroAuditoria, "quando" | "antes" | "depois"> & { antes?: unknown; depois?: unknown }) {
  const quando = new Date().toISOString()
  const dados: RegistroAuditoria = { ...r, quando, antes: limitar(r.antes), depois: limitar(r.depois) }
  try {
    const { error } = await supabase.from("dados_sistema").insert({ colecao: "auditoria_diretor", id: `${quando}-${randomBytes(3).toString("hex")}`, dados, v: 1, atualizado_em: quando })
    if (error) throw new Error(error.message)
  } catch (e) {
    console.error("auditoria do diretor não gravada:", e instanceof Error ? e.message : e)
    throw e   // quem chama decide: sem registro, a alteração do diretor não passa
  }
}

export async function listarAuditoria(limite = 100): Promise<RegistroAuditoria[]> {
  const { data } = await supabase.from("dados_sistema").select("dados").eq("colecao", "auditoria_diretor").order("id", { ascending: false }).limit(limite)
  return (data ?? []).map(r => r.dados as RegistroAuditoria)
}
