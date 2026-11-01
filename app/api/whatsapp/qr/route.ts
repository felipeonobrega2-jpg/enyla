import { NextRequest, NextResponse } from "next/server"
import { evo, diagnosticar } from "@/app/lib/evolution"

// QR code para parear o WhatsApp com a instância do Evolution (rota protegida pelo login).
// A tela chama de novo a cada poucos segundos: devolve o QR atual ou avisa que já conectou.
export async function GET(req: NextRequest) {
  const d = await diagnosticar(req.nextUrl.origin)
  if (d.conectado) return NextResponse.json({ conectado: true, evolution: d })
  const r = await evo<{ base64?: string; code?: string; pairingCode?: string }>("/instance/connect/{i}")
  if (!r.ok || !r.corpo?.base64) return NextResponse.json({ conectado: false, erro: `O Evolution não gerou o QR (${r.status}).`, evolution: d }, { status: 502 })
  return NextResponse.json({ conectado: false, qr: r.corpo.base64, evolution: d })
}
