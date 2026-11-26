import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { gravarInterruptores, lerInterruptores } from "@/app/lib/usuarios"
import { registrarAuditoria } from "@/app/lib/auditoriaDiretor"

export async function GET() {
  return NextResponse.json({ interruptores: await lerInterruptores() })
}

// Só o admin liga ou desliga os bloqueios do perfil diretor (se o diretor pudesse, o bloqueio não valeria nada)
export async function POST(req: NextRequest) {
  const s = await auth()
  const u = s?.user as { login?: string; name?: string | null; perfil?: string } | undefined
  if (u?.perfil !== "admin") return NextResponse.json({ erro: "Só o admin muda os interruptores do perfil diretor." }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { interruptores?: unknown }
  const { antes, depois } = await gravarInterruptores(b.interruptores)
  await registrarAuditoria({ quem: u.login ?? "admin", nome: u.name ?? "", perfil: "admin", metodo: "POST", caminho: "/api/usuarios/interruptores", resultado: "liberado", antes, depois }).catch(() => {})
  return NextResponse.json({ interruptores: depois })
}
