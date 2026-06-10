import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    await prisma.appConfig.upsert({
      where:  { id: 1 },
      update: { data: body },
      create: { id: 1, data: body },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
