import { NextRequest, NextResponse } from "next/server"
import { lerIndice, guardarDesenho, editarDesenho, apagar } from "@/app/lib/bibliotecaServidor"
import { lerTags } from "@/app/lib/biblioteca"

// Biblioteca de facas (rota protegida pelo login): GET a lista · POST (form) guarda um DXF · PATCH { id, apelido?, tags? } · DELETE ?id=
export async function GET() {
  return NextResponse.json({ desenhos: await lerIndice() })
}

export async function POST(req: NextRequest) {
  const fd = await req.formData().catch(() => null)
  const arq = fd?.get("arquivo")
  const meta = JSON.parse(String(fd?.get("meta") ?? "{}")) as { nome?: string; modelo?: string; caixa?: { largura: number; altura: number; profundidade: number } | null; blank?: { largura: number; altura: number } }
  if (!(arq instanceof Blob) || !meta.blank?.largura || !meta.blank?.altura) return NextResponse.json({ erro: "Faltou o arquivo ou as medidas." }, { status: 400 })
  if (arq.size > 5_000_000) return NextResponse.json({ erro: "DXF grande demais (máx. 5 MB)." }, { status: 413 })
  try {
    const r = await guardarDesenho(await arq.text(), { nome: (meta.nome ?? "desenho.dxf").slice(0, 120), modelo: meta.modelo, caixa: meta.caixa ?? null, blank: meta.blank })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { id?: string; apelido?: string; tags?: string[] | string }
  if (!b.id || (b.apelido === undefined && b.tags === undefined)) return NextResponse.json({ erro: "Faltou o nome ou as palavras-chave." }, { status: 400 })
  const tags = b.tags === undefined ? undefined : lerTags(Array.isArray(b.tags) ? b.tags.join(",") : String(b.tags))
  return (await editarDesenho(b.id, { apelido: b.apelido === undefined ? undefined : String(b.apelido), tags }))
    ? NextResponse.json({ ok: true }) : NextResponse.json({ erro: "Não achei esse desenho." }, { status: 404 })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ erro: "Faltou o desenho." }, { status: 400 })
  await apagar(id)
  return NextResponse.json({ ok: true })
}
