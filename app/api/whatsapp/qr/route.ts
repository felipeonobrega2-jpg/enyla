import { NextRequest, NextResponse } from "next/server"
import { evo, diagnosticar } from "@/app/lib/evolution"

// QR code para parear o WhatsApp com a instância do Evolution (rota protegida pelo login).
// A tela chama de novo a cada poucos segundos: devolve o QR atual ou avisa que já conectou.
// Com ?novo=1 (primeira chamada) limpa a sessão anterior antes de gerar o QR.
export async function GET(req: NextRequest) {
  const d = await diagnosticar(req.nextUrl.origin)
  if (d.conectado) return NextResponse.json({ conectado: true, evolution: d })
  // Primeira chamada de um pareamento: encerra a sessão anterior (meio sincronizada) para começar limpo
  if (req.nextUrl.searchParams.get("novo") === "1") await evo("/instance/logout/{i}", { method: "DELETE" })
  const r = await evo<{ base64?: string; code?: string; pairingCode?: string }>("/instance/connect/{i}")
  if (!r.ok || !r.corpo?.base64) return NextResponse.json({ conectado: false, erro: `O Evolution não gerou o QR (${r.status}).`, evolution: d }, { status: 502 })
  return NextResponse.json({ conectado: false, qr: r.corpo.base64, evolution: d })
}
