import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { form, calculo, data, numero, contador } = body

    await Promise.all([
      prisma.historicoItem.upsert({
        where:  { numero: numero ?? "__none__" },
        update: { form, calculo, data },
        create: { form, calculo, data, numero },
      }),
      contador !== undefined
        ? prisma.contador.upsert({
            where:  { chave: "orc" },
            update: { valor: contador },
            create: { chave: "orc", valor: contador },
          })
        : Promise.resolve(),
    ])

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
