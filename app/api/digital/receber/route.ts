import { NextResponse } from "next/server"
import { receberDigital } from "@/app/lib/digitalReceber"
import { lerPedidosDigitais, lerVinculosDigital } from "@/app/lib/digitalReceberServidor"

// A receber do Digital para a tela do Financeiro (só leitura; mesma proteção de login das outras rotas do painel).
export async function GET() {
  const itens = receberDigital(await lerPedidosDigitais(), await lerVinculosDigital())
  return NextResponse.json({ pedidos: itens, aReceber: itens.reduce((s, i) => s + i.saldo, 0), pago: itens.reduce((s, i) => s + i.pago, 0) })
}
