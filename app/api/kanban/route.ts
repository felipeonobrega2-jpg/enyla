import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    await prisma.kanbanCard.upsert({
      where:  { id: body.id },
      update: {
        numero:        body.numero,
        nomeCliente:   body.nomeCliente,
        dimensoes:     body.dimensoes,
        materialNome:  body.materialNome,
        preco:         body.preco,
        quantidade:    body.quantidade,
        data:          body.data,
        coluna:        body.coluna ?? 0,
        motivoPerdido: body.motivoPerdido ?? null,
        opcoes:        body.opcoes ?? undefined,
      },
      create: {
        id:            body.id,
        numero:        body.numero,
        nomeCliente:   body.nomeCliente,
        dimensoes:     body.dimensoes,
        materialNome:  body.materialNome,
        preco:         body.preco,
        quantidade:    body.quantidade,
        data:          body.data,
        coluna:        body.coluna ?? 0,
        motivoPerdido: body.motivoPerdido ?? null,
        opcoes:        body.opcoes ?? undefined,
      },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
