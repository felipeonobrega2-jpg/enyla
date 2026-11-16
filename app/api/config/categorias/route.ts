import { NextRequest, NextResponse } from "next/server"
import { mudarConfig } from "@/app/lib/configAtomica"
import type { CategoriaFinanceira } from "@/app/config"

// Categoria ou subcategoria nova, criada no próprio lançamento (digitou uma que não existe). Grava só esse acréscimo
// no servidor, sem depender da configuração inteira que a tela carregou. (Rota protegida pelo login.)
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "categoria"

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { tipo?: "despesa" | "receita"; nova?: string; categoriaId?: string; sub?: string }
  const campo = b.tipo === "receita" ? "categoriasReceita" : "categoriasDespesa"
  const nova = b.nova?.trim().slice(0, 60), sub = b.sub?.trim().slice(0, 60)
  if (!nova && !(b.categoriaId && sub)) return NextResponse.json({ erro: "nova categoria ou categoriaId + sub" }, { status: 400 })
  let id = b.categoriaId ?? ""
  let resultado: { categoriasDespesa: CategoriaFinanceira[]; categoriasReceita: CategoriaFinanceira[] } | null = null
  await mudarConfig((d: Record<string, unknown> & { categoriasDespesa?: CategoriaFinanceira[]; categoriasReceita?: CategoriaFinanceira[] }) => {
    let lista = [...(d[campo] ?? [])]
    if (nova) {
      const existe = lista.find(c => c.nome.trim().toLowerCase() === nova.toLowerCase())
      if (existe) id = existe.id
      else {
        id = slug(nova)
        for (let i = 2; lista.some(c => c.id === id); i++) id = `${slug(nova)}-${i}`
        lista = [...lista, { id, nome: nova }]
      }
    }
    if (sub && id) lista = lista.map(c => c.id !== id || (c.subcategorias ?? []).some(x => x.toLowerCase() === sub.toLowerCase()) ? c : { ...c, subcategorias: [...(c.subcategorias ?? []), sub] })
    resultado = { categoriasDespesa: campo === "categoriasDespesa" ? lista : d.categoriasDespesa ?? [], categoriasReceita: campo === "categoriasReceita" ? lista : d.categoriasReceita ?? [] }
    return { [campo]: lista, categoriasMudadasEm: new Date().toISOString() }
  })
  return NextResponse.json({ ok: true, id, ...resultado! })
}
