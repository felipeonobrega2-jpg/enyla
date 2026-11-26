import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { criarUsuario, lerAuditoria, lerInterruptores, listarUsuarios, registrarAuditoria } from "@/app/lib/acessoServidor"
import { INTERRUPTORES } from "@/app/lib/acesso"

// Administração de usuários: só o papel admin (o proxy já barra o diretor; aqui confere de novo).
async function soAdmin() {
  const s = await auth()
  return s?.papel === "admin" ? s : null
}
const NEGADO = () => NextResponse.json({ erro: "Só o administrador acessa usuários e papéis." }, { status: 403 })

export async function GET() {
  if (!(await soAdmin())) return NEGADO()
  const [usuarios, interruptores, auditoria] = await Promise.all([
    listarUsuarios().catch(() => null), lerInterruptores(true), lerAuditoria(100).catch(() => []),
  ])
  return NextResponse.json({
    usuarios, tabelaPronta: usuarios !== null, auditoria,
    interruptores: INTERRUPTORES.map(i => ({ id: i.id, nome: i.nome, ligado: interruptores[i.id] === true })),
  })
}

export async function POST(req: NextRequest) {
  const s = await soAdmin()
  if (!s) return NEGADO()
  const b = await req.json().catch(() => ({})) as { nome?: string; usuario?: string; senha?: string; papel?: string }
  const r = await criarUsuario({ nome: String(b.nome ?? ""), usuario: String(b.usuario ?? ""), senha: String(b.senha ?? ""), papel: String(b.papel ?? "") })
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 })
  await registrarAuditoria({ usuario: s.usuario ?? "admin", papel: "admin", metodo: "POST", caminho: "/api/usuarios", antes: null, depois: { usuario: r.usuario.usuario, papel: r.usuario.papel } })
  return NextResponse.json({ usuario: r.usuario })
}
