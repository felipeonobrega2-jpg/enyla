import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { contadorProp, ...p } = body
    await Promise.all([
      prisma.propostaCustom.upsert({
        where:  { id: p.id },
        update: { numero: p.numero, nomeCliente: p.nomeCliente, descricao: p.descricao, material: p.material, dimensoes: p.dimensoes, incluirVerniz: p.incluirVerniz, comFaca: p.comFaca, valorFaca: p.valorFaca, numSKUs: p.numSKUs, validadeDias: p.validadeDias, obsCliente: p.obsCliente, data: p.data, linhas: p.linhas, parcFator: p.parcFator, cardId: p.cardId },
        create: { id: p.id, numero: p.numero, nomeCliente: p.nomeCliente, descricao: p.descricao, material: p.material, dimensoes: p.dimensoes, incluirVerniz: p.incluirVerniz, comFaca: p.comFaca, valorFaca: p.valorFaca, numSKUs: p.numSKUs, validadeDias: p.validadeDias, obsCliente: p.obsCliente, data: p.data, linhas: p.linhas, parcFator: p.parcFator, cardId: p.cardId },
      }),
      contadorProp !== undefined
        ? prisma.contador.upsert({
            where:  { chave: "prop" },
            update: { valor: contadorProp },
            create: { chave: "prop", valor: contadorProp },
          })
        : Promise.resolve(),
    ])
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
