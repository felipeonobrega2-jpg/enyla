import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    await prisma.cliente.upsert({
      where:  { id: body.id },
      update: { nome: body.nome, telefone: body.telefone, email: body.email, cnpj: body.cnpj, notas: body.notas },
      create: { id: body.id, nome: body.nome, telefone: body.telefone, email: body.email, cnpj: body.cnpj, notas: body.notas, criadoEm: body.criadoEm },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
