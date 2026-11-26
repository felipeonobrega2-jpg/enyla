// Servidor do controle de acesso: usuários (tabela "Usuario"), interruptores do diretor (AppConfig.interruptoresDiretor)
// e auditoria (tabela "AuditoriaDiretor"). Nenhum usuário nem senha nasce no código ou na migration.
import bcrypt from "bcryptjs"
import { supabase } from "./supabase"
import { lerCampos, gravarCampos } from "./configAtomica"
import { ehPapel, type Interruptores, type InterruptorId, type Papel, INTERRUPTORES } from "./acesso"

export type Usuario = { id: string; nome: string; usuario: string; papel: Papel; ativo: boolean; criadoEm: string }
const COLUNAS = "id, nome, usuario, papel, ativo, criadoEm"
export const normalizarUsuario = (u: string) => u.trim().toLowerCase()
const USUARIO_VALIDO = /^[a-z0-9._-]{3,32}$/

// Confere usuário e senha. Tabela ausente (migration ainda não rodou) ou erro de banco = null: o login por usuário
// não funciona, mas a senha única do admin continua entrando (ver auth.ts).
export async function conferirLogin(usuario: string, senha: string): Promise<Usuario | null> {
  const u = normalizarUsuario(usuario)
  if (!u || !senha) return null
  try {
    const { data, error } = await supabase.from("Usuario").select(`${COLUNAS}, senhaHash`).eq("usuario", u).maybeSingle()
    if (error || !data || !data.ativo || !ehPapel(data.papel)) return null
    if (!(await bcrypt.compare(senha, String(data.senhaHash)))) return null
    const { senhaHash: _s, ...resto } = data as Usuario & { senhaHash: string }
    void _s
    return resto
  } catch { return null }
}

export async function listarUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase.from("Usuario").select(COLUNAS).order("criadoEm", { ascending: true })
  if (error) throw new Error(`usuarios: ${error.message}`)
  return (data ?? []) as Usuario[]
}

export type ResultadoCriar = { ok: true; usuario: Usuario } | { ok: false; erro: string }
export async function criarUsuario(a: { nome: string; usuario: string; senha: string; papel: string }): Promise<ResultadoCriar> {
  const nome = a.nome.trim(), usuario = normalizarUsuario(a.usuario)
  if (!nome) return { ok: false, erro: "Informe o nome." }
  if (!USUARIO_VALIDO.test(usuario)) return { ok: false, erro: "Usuário de 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado." }
  if (a.senha.length < 10) return { ok: false, erro: "A senha precisa de pelo menos 10 caracteres." }
  if (!ehPapel(a.papel)) return { ok: false, erro: "Papel inválido (admin ou diretor)." }
  const senhaHash = await bcrypt.hash(a.senha, 12)
  const { data, error } = await supabase.from("Usuario")
    .insert({ id: crypto.randomUUID(), nome, usuario, senhaHash, papel: a.papel, ativo: true, criadoEm: new Date().toISOString() })
    .select(COLUNAS).single()
  if (error) return { ok: false, erro: error.code === "23505" ? "Esse usuário já existe." : `Não gravou: ${error.message}` }
  return { ok: true, usuario: data as Usuario }
}

// Troca papel, ativa/desativa. Não apaga usuário (desativar basta). Não deixa o sistema sem admin por usuário.
export async function atualizarUsuario(id: string, mudanca: { papel?: string; ativo?: boolean; senha?: string }): Promise<{ ok: true } | { ok: false; erro: string }> {
  const set: Record<string, unknown> = {}
  if (mudanca.papel !== undefined) { if (!ehPapel(mudanca.papel)) return { ok: false, erro: "Papel inválido." }; set.papel = mudanca.papel }
  if (mudanca.ativo !== undefined) set.ativo = !!mudanca.ativo
  if (mudanca.senha !== undefined) {
    if (mudanca.senha.length < 10) return { ok: false, erro: "A senha precisa de pelo menos 10 caracteres." }
    set.senhaHash = await bcrypt.hash(mudanca.senha, 12)
  }
  if (!Object.keys(set).length) return { ok: false, erro: "Nada para mudar." }
  const { error } = await supabase.from("Usuario").update(set).eq("id", id)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

// ── Interruptores (todos desligados por padrão) ─────────────────────────────
let cache: { em: number; cfg: Interruptores } | null = null
export async function lerInterruptores(fresco = false): Promise<Interruptores> {
  if (!fresco && cache && Date.now() - cache.em < 5000) return cache.cfg
  const r = await lerCampos<{ interruptoresDiretor?: Interruptores }>(["interruptoresDiretor"])
  const cfg: Interruptores = {}
  for (const i of INTERRUPTORES) if (r.interruptoresDiretor?.[i.id] === true) cfg[i.id] = true
  cache = { em: Date.now(), cfg }
  return cfg
}
export async function gravarInterruptor(id: InterruptorId, ligado: boolean): Promise<Interruptores> {
  const atual = await lerInterruptores(true)
  const novo = { ...atual, [id]: ligado }
  await gravarCampos({ interruptoresDiretor: novo })
  cache = null
  return lerInterruptores(true)
}

// ── Auditoria: toda escrita de diretor (quem, quando, antes, depois) ─────────
export type RegistroAuditoria = { usuario: string; papel: Papel; metodo: string; caminho: string; antes: unknown; depois: unknown; status?: number | null }
export async function registrarAuditoria(r: RegistroAuditoria): Promise<void> {
  try {
    await supabase.from("AuditoriaDiretor").insert({
      id: crypto.randomUUID(), em: new Date().toISOString(), usuario: r.usuario, papel: r.papel,
      metodo: r.metodo, caminho: r.caminho, antes: r.antes ?? null, depois: r.depois ?? null,
    })
  } catch { /* auditoria nunca derruba a operação */ }
}

export async function lerAuditoria(limite = 100) {
  const { data, error } = await supabase.from("AuditoriaDiretor").select("id, em, usuario, papel, metodo, caminho, antes, depois").order("em", { ascending: false }).limit(limite)
  if (error) throw new Error(`auditoria: ${error.message}`)
  return data ?? []
}

// Usuário ainda ativo? (a sessão dura dias: desativar o usuário precisa valer logo). Guardado 20 s.
const ativos = new Map<string, { em: number; ativo: boolean }>()
export async function usuarioAtivo(usuario: string): Promise<boolean> {
  const g = ativos.get(usuario)
  if (g && Date.now() - g.em < 20_000) return g.ativo
  const { data, error } = await supabase.from("Usuario").select("ativo").eq("usuario", usuario).maybeSingle()
  if (error) throw new Error(error.message)
  const ativo = !!data?.ativo
  ativos.set(usuario, { em: Date.now(), ativo })
  return ativo
}

// "Antes" de uma escrita em /api/<recurso>/<id>: a linha como estava, lida antes da rota rodar. Rota sem tabela
// conhecida ou sem linha: null (o log guarda só o "depois", o corpo enviado).
const TABELA_POR_ROTA: Record<string, string> = { kanban: "KanbanCard", clientes: "Cliente", lancamentos: "LancamentoFinanceiro", historico: "HistoricoItem" }
export async function lerAntes(caminho: string): Promise<unknown> {
  const m = caminho.match(/^\/api\/([a-z-]+)\/([^/]+)$/)
  const tabela = m && TABELA_POR_ROTA[m[1]]
  if (!tabela) return null
  try {
    const { data } = await supabase.from(tabela).select("*").eq("id", decodeURIComponent(m[2])).maybeSingle()
    return data ?? null
  } catch { return null }
}
