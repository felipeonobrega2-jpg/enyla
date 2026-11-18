// Auditor de dados: GET roda a conferência agora (e guarda o resumo); POST marca "está certo" ou desfaz
import { NextResponse } from "next/server"
import { rodarAuditoria, ignorarProblema } from "@/app/lib/auditoriaServidor"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET() {
  try { return NextResponse.json(await rodarAuditoria({ guardar: true })) }
  catch (e) { return NextResponse.json({ erro: String(e) }, { status: 500 }) }
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { acao?: string; id?: string }
  if (!b.id || typeof b.id !== "string" || b.id.length > 2000) return NextResponse.json({ erro: "id" }, { status: 400 })
  await ignorarProblema(b.id, b.acao === "voltar")
  return NextResponse.json({ ok: true })
}
