import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { atualizarUsuario, registrarAuditoria } from "@/app/lib/acessoServidor"

// Troca papel, ativa/desativa e redefine a senha. Não apaga usuário: desativar basta. Só admin.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await auth()
  if (s?.papel !== "admin") return NextResponse.json({ erro: "Só o administrador acessa usuários e papéis." }, { status: 403 })
  const { id } = await params
  const b = await req.json().catch(() => ({})) as { papel?: string; ativo?: boolean; senha?: string }
  const r = await atualizarUsuario(id, { papel: b.papel, ativo: b.ativo, senha: b.senha })
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 })
  await registrarAuditoria({ usuario: s.usuario ?? "admin", papel: "admin", metodo: "PATCH", caminho: `/api/usuarios/${id}`, antes: null, depois: { papel: b.papel, ativo: b.ativo, senha: b.senha ? "(trocada)" : undefined } })
  return NextResponse.json({ ok: true })
}
