import { NextResponse } from "next/server"
import { reservarNumeroOrc } from "@/app/lib/propostaProntaServidor"

// Reserva o próximo número de orçamento (ORC-aaaa-nnn) no banco: a tela e o agente nunca pegam o mesmo
export async function POST() {
  try {
    const numero = await reservarNumeroOrc()
    const valor = Number(numero.split("-")[2])
    return NextResponse.json({ numero, contador: valor })
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 })
  }
}
