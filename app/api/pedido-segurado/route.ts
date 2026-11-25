import { NextRequest, NextResponse } from "next/server"
import { lerSegurados, segurar, liberar } from "@/app/lib/pedidoSeguradoServidor"

// Marca "aguardando pagamento" para a tela (rota protegida pelo login). Só liga e desliga a marca: não cobra nem avisa ninguém.
export async function GET() {
  return NextResponse.json({ segurados: await lerSegurados() })
}

// POST { numero, segurar: boolean, motivo? }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as { numero?: string; segurar?: boolean; motivo?: string } | null
  const numero = b?.numero?.trim()
  if (!numero) return NextResponse.json({ erro: "Faltou o número do pedido." }, { status: 400 })
  if (b?.segurar) await segurar(numero, "felipe", b.motivo)
  else await liberar(numero, "felipe")
  return NextResponse.json({ segurados: await lerSegurados() })
}
