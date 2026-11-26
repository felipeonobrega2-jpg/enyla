import { NextResponse } from "next/server"
import { listarAuditoria } from "@/app/lib/auditoriaDiretor"

export async function GET() {
  return NextResponse.json({ registros: await listarAuditoria(100) })
}
