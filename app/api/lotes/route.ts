import { NextRequest, NextResponse } from "next/server"
import { criarLote } from "@/app/lib/lotes"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    return NextResponse.json(await criarLote(body.nomeCliente ?? "", body.descricao))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
