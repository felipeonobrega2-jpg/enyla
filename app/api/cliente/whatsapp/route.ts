import { NextRequest, NextResponse } from "next/server"
import { textoModelo } from "@/app/lib/modelosWhatsapp"

// Abre o WhatsApp com a mensagem pronta e o link da página do cliente (que só o servidor sabe gerar).
// Rota protegida pelo login: o Painel e o celular usam como link direto.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const nome = q.get("nome")?.trim()
  if (!nome) return NextResponse.json({ erro: "nome obrigatório" }, { status: 400 })
  const texto = textoModelo(q.get("modelo") ?? "", nome, q.get("numero") ?? "", req.nextUrl.origin)
  // ?formato=json: só o texto, para a janela de envio pelo sistema mostrar e deixar editar
  if (q.get("formato") === "json") return NextResponse.json({ texto })
  const tel = (q.get("tel") ?? "").replace(/\D/g, "")
  const destino = tel ? (tel.length <= 11 ? "55" + tel : tel) : ""
  return NextResponse.redirect(`https://wa.me/${destino}?text=${encodeURIComponent(texto)}`)
}
