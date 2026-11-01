import { NextRequest, NextResponse } from "next/server"
import { tokenCliente } from "@/app/lib/portalCliente"

// Abre o WhatsApp com a mensagem pronta e o link da página do cliente (que só o servidor sabe gerar).
// Rota protegida pelo login: o Painel e o celular usam como link direto.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const nome = q.get("nome")?.trim()
  if (!nome) return NextResponse.json({ erro: "nome obrigatório" }, { status: 400 })
  const link = `${req.nextUrl.origin}/c/${tokenCliente(nome)}`
  const primeiro = nome.split(" ")[0]
  const numero = q.get("numero") ?? ""
  const textos: Record<string, string> = {
    "reposicao": `Oi, ${primeiro}! Tudo bem? Passando para ver como estão as embalagens por aí. Se estiver na hora de repor, dá para repetir o último pedido em 1 toque, pelo mesmo preço:\n${link}`,
    "como-ficou": `Oi, ${primeiro}! Tudo bem? Suas embalagens do pedido ${numero} chegaram. Como ficou? Conta pra gente com uma nota rapidinha aqui:\n${link}\n\nE se puder mandar uma foto delas em uso, a gente adora ver!`,
  }
  const texto = textos[q.get("modelo") ?? ""] ?? link
  const tel = (q.get("tel") ?? "").replace(/\D/g, "")
  const destino = tel ? (tel.length <= 11 ? "55" + tel : tel) : ""
  return NextResponse.redirect(`https://wa.me/${destino}?text=${encodeURIComponent(texto)}`)
}
