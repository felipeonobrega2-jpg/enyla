import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ numero: string }> }
) {
  try {
    const { numero } = await params
    const entry = await prisma.tracking.findUnique({
      where: { numero: decodeURIComponent(numero) },
    })
    if (!entry) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
    return NextResponse.json(entry)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ numero: string }> }
) {
  try {
    const { numero } = await params
    const body = await req.json()
    const key = decodeURIComponent(numero)
    await prisma.tracking.upsert({
      where:  { numero: key },
      update: {
        nomeCliente:  body.nomeCliente,
        descricao:    body.descricao,
        materialNome: body.materialNome,
        quantidade:   body.quantidade,
        preco:        body.preco,
        colunaAtual:  body.colunaAtual,
        etapas:       body.etapas,
        criadoEm:     body.criadoEm,
      },
      create: {
        numero:       key,
        nomeCliente:  body.nomeCliente  ?? "",
        descricao:    body.descricao,
        materialNome: body.materialNome,
        quantidade:   body.quantidade   ?? 0,
        preco:        body.preco        ?? 0,
        colunaAtual:  body.colunaAtual  ?? 0,
        etapas:       body.etapas       ?? [],
        criadoEm:     body.criadoEm     ?? "",
      },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
