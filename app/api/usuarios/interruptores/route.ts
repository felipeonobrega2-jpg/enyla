import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { ehInterruptor } from "@/app/lib/acesso"
import { gravarInterruptor, lerInterruptores, registrarAuditoria } from "@/app/lib/acessoServidor"

// Liga ou desliga um bloqueio do perfil diretor, sem deploy. Só admin. Todos nascem desligados.
export async function POST(req: NextRequest) {
  const s = await auth()
  if (s?.papel !== "admin") return NextResponse.json({ erro: "Só o administrador liga ou desliga bloqueios." }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { id?: string; ligado?: boolean }
  if (!ehInterruptor(b.id) || typeof b.ligado !== "boolean") return NextResponse.json({ erro: "Informe id (um dos 7 bloqueios) e ligado (true ou false)." }, { status: 400 })
  const antes = (await lerInterruptores(true))[b.id] === true
  const cfg = await gravarInterruptor(b.id, b.ligado)
  await registrarAuditoria({ usuario: s.usuario ?? "admin", papel: "admin", metodo: "POST", caminho: "/api/usuarios/interruptores", antes: { [b.id]: antes }, depois: { [b.id]: b.ligado } })
  return NextResponse.json({ interruptores: cfg })
}
