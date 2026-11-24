import { NextRequest, NextResponse, after } from "next/server"
import { renovarFotoDepois } from "@/app/lib/pendenciaExterna"
import { dispensar, reabrir, dispensadasVigentes } from "@/app/lib/pendenciaDispensada"

// Dispensar pendência com motivo (rota protegida pelo login). Nada é apagado: reabrir só marca a dispensa como reaberta.
// GET: as dispensadas em vigor. POST { acao: "dispensar", chave, titulo, motivo, ate? } | { acao: "reabrir", chave }.
export async function GET() {
  return NextResponse.json({ dispensadas: await dispensadasVigentes() })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as { acao?: string; chave?: string; titulo?: string; motivo?: string; ate?: string } | null
  if (b?.acao === "dispensar") {
    const r = await dispensar(b, "Felipe")
    if (r.ok) after(renovarFotoDepois)
    return r.ok ? NextResponse.json({ ok: true, dispensada: r.dispensada }) : NextResponse.json({ erro: r.erro }, { status: r.status })
  }
  if (b?.acao === "reabrir") {
    const r = await reabrir(b.chave, "Felipe")
    if (r.ok) after(renovarFotoDepois)
    return r.ok ? NextResponse.json({ ok: true, chave: r.chave }) : NextResponse.json({ erro: r.erro }, { status: r.status })
  }
  return NextResponse.json({ erro: "acao: dispensar ou reabrir" }, { status: 400 })
}
