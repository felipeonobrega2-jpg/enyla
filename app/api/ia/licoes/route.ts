import { NextRequest, NextResponse } from "next/server"
import { ehArea, adicionarLicao, editarLicao, tirarLicao, correcaoDeMensagem } from "@/app/lib/licoesIA"
import { lerLicoesIA, mudarLicoesIA } from "@/app/lib/licoesIAServidor"

// O que você ensinou a cada IA do sistema. (Rota protegida.)
export async function GET(req: NextRequest) {
  const area = req.nextUrl.searchParams.get("area")
  if (!ehArea(area)) return NextResponse.json({ erro: "Área desconhecida." }, { status: 400 })
  return NextResponse.json({ licoes: await lerLicoesIA(area) })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { area?: string; nova?: string; editar?: { id: string; texto: string }; tirar?: string; correcao?: { ia: string; voce: string } }
  if (!ehArea(b.area)) return NextResponse.json({ erro: "Área desconhecida." }, { status: 400 })
  const area = b.area
  let licoes
  if (b.nova?.trim()) licoes = await mudarLicoesIA(area, l => adicionarLicao(l, b.nova!, "voce"))
  else if (b.editar?.id) licoes = await mudarLicoesIA(area, l => editarLicao(l, b.editar!.id, String(b.editar!.texto ?? "")))
  else if (b.tirar) licoes = await mudarLicoesIA(area, l => tirarLicao(l, b.tirar!))
  else if (b.correcao) {
    const t = correcaoDeMensagem(String(b.correcao.ia ?? ""), String(b.correcao.voce ?? ""))
    licoes = t ? await mudarLicoesIA(area, l => adicionarLicao(l, t, "correcao")) : await lerLicoesIA(area)
  } else licoes = await lerLicoesIA(area)
  return NextResponse.json({ licoes })
}
