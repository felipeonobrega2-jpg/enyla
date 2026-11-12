import { NextRequest, NextResponse } from "next/server"
import { lerDxf } from "@/app/lib/bibliotecaServidor"

// O DXF de um desenho da biblioteca (rota protegida pelo login): a tela desenha e usa no orçamento; ?baixar=1 baixa
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id
  const texto = await lerDxf(id)
  if (texto == null) return NextResponse.json({ erro: "Desenho não encontrado." }, { status: 404 })
  const nome = (req.nextUrl.searchParams.get("nome") ?? `${id}.dxf`).replace(/[^\w.\- ]/g, "_")
  return new NextResponse(texto, { headers: {
    "Content-Type": "application/dxf",
    ...(req.nextUrl.searchParams.get("baixar") ? { "Content-Disposition": `attachment; filename="${nome}"` } : {}),
    "Cache-Control": "private, max-age=86400",
  } })
}
