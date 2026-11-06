import { NextResponse } from "next/server"
import { montarHoje } from "@/app/lib/hojeServidor"

// Painel → Hoje: bons negócios esperando você, o que o anúncio trouxe em 24 h, a ação do relatório e a reativação.
// (Rota protegida pelo login.)
export async function GET() {
  try { return NextResponse.json(await montarHoje()) }
  catch (e) { return NextResponse.json({ erro: String(e instanceof Error ? e.message : e) }, { status: 500 }) }
}
