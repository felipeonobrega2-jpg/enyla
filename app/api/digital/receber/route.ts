import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { digitalComVinculos } from "@/app/lib/digitalReceberServidor"
import { digitaisAReceber } from "@/app/lib/digitalReceber"

// A receber do Digital para a tela do Financeiro (rota protegida pelo login). Só leitura: não cobra, não baixa, não concilia.
export async function GET() {
  if (!(await auth().catch(() => null))) return NextResponse.json({ erro: "Entre no sistema." }, { status: 401 })
  const { pedidos, vinculados } = await digitalComVinculos()
  return NextResponse.json({ pedidos: digitaisAReceber(pedidos, vinculados) })
}
