import { NextRequest, NextResponse } from "next/server"
import { pendenciasDoFelipe, resolverItem, dispensarItem, assumirItem, avisarNovos } from "@/app/lib/pendenciasFelipeServidor"

// "Pendências do Felipe" (rota protegida pelo login): no máximo 5 itens, por valor × urgência
export async function GET() {
  const { itens, total } = await pendenciasDoFelipe()
  return NextResponse.json({ itens, total })
}

// POST { op:'resolver'|'dispensar'|'assumir', chave, motivo?, titulo?, jid? }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { op?: string; chave?: string; motivo?: string; titulo?: string; jid?: string }
  const chave = typeof b.chave === "string" ? b.chave : ""
  if (b.op === "assumir") {
    if (!b.jid) return NextResponse.json({ erro: "Faltou a conversa." }, { status: 400 })
    await assumirItem(b.jid)
  } else if (b.op === "resolver" || b.op === "dispensar") {
    if (!chave) return NextResponse.json({ erro: "Faltou o item." }, { status: 400 })
    const r = b.op === "resolver" ? await resolverItem(chave, "felipe") : await dispensarItem(chave, b.titulo ?? chave, b.motivo ?? "", "felipe")
    if (!r.ok) return NextResponse.json({ erro: (r as { erro: string }).erro }, { status: 400 })
  } else return NextResponse.json({ erro: "op: resolver, dispensar ou assumir." }, { status: 400 })
  await avisarNovos().catch(() => null)   // o que entrou no lugar do resolvido avisa na hora
  return NextResponse.json({ ok: true, ...await pendenciasDoFelipe().then(({ itens, total }) => ({ itens, total })) })
}
