import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { atualizarUsuario, criarUsuario, listarUsuarios } from "@/app/lib/usuarios"
import { registrarAuditoria } from "@/app/lib/auditoriaDiretor"

// Administração de usuários. O proxy já barra o diretor quando o interruptor "configuracao" está ligado.
// Diretor não cria nem promove admin: só admin dá o perfil admin.
async function quem() {
  const s = await auth()
  const u = s?.user as { login?: string; name?: string | null; perfil?: string } | undefined
  return { login: u?.login ?? "?", nome: u?.name ?? "", perfil: u?.perfil ?? "" }
}

export async function GET() {
  return NextResponse.json({ usuarios: await listarUsuarios() })
}

export async function POST(req: NextRequest) {
  const q = await quem()
  try {
    const b = await req.json() as { login?: string; nome?: string; senha?: string; perfil?: string }
    if (q.perfil !== "admin" && b.perfil === "admin") return NextResponse.json({ erro: "Só o admin cria usuário admin." }, { status: 403 })
    const u = await criarUsuario({ login: b.login ?? "", nome: b.nome ?? "", senha: b.senha ?? "", perfil: b.perfil ?? "" })
    if (q.perfil === "admin") await registrarAuditoria({ quem: q.login, nome: q.nome, perfil: q.perfil, metodo: "POST", caminho: "/api/usuarios", resultado: "liberado", antes: null, depois: u }).catch(() => {})
    return NextResponse.json({ usuario: u })
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "erro" }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  const q = await quem()
  try {
    const b = await req.json() as { login?: string; ativo?: boolean; perfil?: string; senha?: string }
    if (q.perfil !== "admin" && b.perfil === "admin") return NextResponse.json({ erro: "Só o admin dá o perfil admin." }, { status: 403 })
    const { antes, depois } = await atualizarUsuario(b.login ?? "", { ativo: b.ativo, perfil: b.perfil, senha: b.senha })
    if (q.perfil === "admin") await registrarAuditoria({ quem: q.login, nome: q.nome, perfil: q.perfil, metodo: "PATCH", caminho: "/api/usuarios", resultado: "liberado", antes, depois }).catch(() => {})
    return NextResponse.json({ usuario: depois })
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "erro" }, { status: 400 })
  }
}
