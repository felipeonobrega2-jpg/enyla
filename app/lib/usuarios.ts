// Usuários do sistema e interruptores do perfil diretor. Só roda no servidor.
// Tudo em `dados_sistema` (coleções "usuarios" e "acesso"): sem migration e sem nenhum usuário ou senha no código.
// A senha só existe como hash bcrypt. Quem cria o primeiro usuário é o Felipe, pela tela /usuarios.
import bcrypt from "bcryptjs"
import { supabase } from "./supabase"
import { PERFIS, normalizarInterruptores, type Interruptores, type Perfil } from "./acesso"

export type Usuario = { login: string; nome: string; perfil: Perfil; ativo: boolean; criadoEm: string }
type Registro = Usuario & { hash: string }

const COL_USUARIOS = "usuarios"
const COL_ACESSO = "acesso"
const ID_INTERRUPTORES = "interruptores"
export const LOGIN_VALIDO = /^[a-z0-9._-]{3,32}$/
export const SENHA_MINIMA = 10

const publico = ({ hash: _h, ...u }: Registro): Usuario => u

async function gravar(colecao: string, id: string, dados: unknown) {
  const { error } = await supabase.from("dados_sistema").upsert({ colecao, id, dados, v: 1, atualizado_em: new Date().toISOString() }, { onConflict: "colecao,id" })
  if (error) throw new Error(error.message)
}

export async function buscarUsuario(login: string): Promise<Registro | null> {
  const { data } = await supabase.from("dados_sistema").select("dados").eq("colecao", COL_USUARIOS).eq("id", login.trim().toLowerCase()).maybeSingle()
  return (data?.dados as Registro) ?? null
}

export async function listarUsuarios(): Promise<Usuario[]> {
  const { data } = await supabase.from("dados_sistema").select("dados").eq("colecao", COL_USUARIOS)
  return (data ?? []).map(r => publico(r.dados as Registro)).sort((a, b) => a.login.localeCompare(b.login))
}

// Confere login e senha. Sempre gasta um bcrypt, existindo o usuário ou não (não revela quem existe pelo tempo).
const HASH_FALSO = bcrypt.hashSync("sem-usuario", 10)
export async function conferirLogin(login: string, senha: string): Promise<Usuario | null> {
  const u = LOGIN_VALIDO.test(login.trim().toLowerCase()) ? await buscarUsuario(login) : null
  const ok = await bcrypt.compare(senha, u?.hash ?? HASH_FALSO).catch(() => false)
  if (!u || !ok || !u.ativo || !PERFIS.includes(u.perfil)) return null
  return publico(u)
}

export async function criarUsuario(e: { login: string; nome: string; senha: string; perfil: string }): Promise<Usuario> {
  const login = e.login.trim().toLowerCase()
  if (!LOGIN_VALIDO.test(login)) throw new Error("Usuário: 3 a 32 caracteres (letras minúsculas, números, ponto, hífen ou sublinhado).")
  if (!PERFIS.includes(e.perfil as Perfil)) throw new Error("Perfil inválido.")
  if (e.senha.length < SENHA_MINIMA) throw new Error(`A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`)
  if (await buscarUsuario(login)) throw new Error("Esse usuário já existe.")
  const r: Registro = { login, nome: e.nome.trim() || login, perfil: e.perfil as Perfil, ativo: true, criadoEm: new Date().toISOString(), hash: await bcrypt.hash(e.senha, 10) }
  await gravar(COL_USUARIOS, login, r)
  return publico(r)
}

export async function atualizarUsuario(login: string, mudanca: { ativo?: boolean; perfil?: string; senha?: string }): Promise<{ antes: Usuario; depois: Usuario }> {
  const u = await buscarUsuario(login)
  if (!u) throw new Error("Usuário não encontrado.")
  const antes = publico(u)
  if (mudanca.perfil !== undefined) { if (!PERFIS.includes(mudanca.perfil as Perfil)) throw new Error("Perfil inválido."); u.perfil = mudanca.perfil as Perfil }
  if (mudanca.ativo !== undefined) u.ativo = mudanca.ativo === true
  if (mudanca.senha !== undefined) {
    if (mudanca.senha.length < SENHA_MINIMA) throw new Error(`A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`)
    u.hash = await bcrypt.hash(mudanca.senha, 10)
  }
  await gravar(COL_USUARIOS, u.login, u)
  return { antes, depois: publico(u) }
}

export async function lerInterruptores(): Promise<Interruptores> {
  const { data } = await supabase.from("dados_sistema").select("dados").eq("colecao", COL_ACESSO).eq("id", ID_INTERRUPTORES).maybeSingle()
  return normalizarInterruptores(data?.dados)
}
export async function gravarInterruptores(novo: unknown): Promise<{ antes: Interruptores; depois: Interruptores }> {
  const antes = await lerInterruptores()
  const depois = normalizarInterruptores(novo)
  await gravar(COL_ACESSO, ID_INTERRUPTORES, depois)
  return { antes, depois }
}
