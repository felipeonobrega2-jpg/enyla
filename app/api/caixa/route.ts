import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { lerCampos } from "@/app/lib/configAtomica"

// Caixa de entrada do Painel: o que você marcou como resolvido ou mandou lembrar depois. Fica na tabela leve
// (agente_tratadas, linhas "caixa|<até>|<chave>"), não no AppConfig. "sempre" = resolvido (a chave do item muda
// quando a situação muda, e aí ele volta); data = escondido até lá.
const PREFIXO = "caixa|"

export async function GET() {
  const { data } = await supabase.from("agente_tratadas").select("id").gte("id", PREFIXO).lt("id", "caixa}").limit(3000)
  const agora = new Date().toISOString()
  const ocultos: Record<string, string> = {}
  const vencidos: string[] = []
  for (const { id } of data ?? []) {
    const [, ate, ...resto] = (id as string).split("|")
    const chave = decodeURIComponent(resto.join("|"))
    if (ate !== "sempre" && ate < agora) { vencidos.push(id as string); continue }
    ocultos[chave] = ate
  }
  if (vencidos.length) await supabase.from("agente_tratadas").delete().in("id", vencidos.slice(0, 200))
  const { regrasCaixa } = await lerCampos<{ regrasCaixa?: unknown[] }>(["regrasCaixa"]).catch(() => ({ regrasCaixa: [] as unknown[] }))
  return NextResponse.json({ ocultos, regras: regrasCaixa ?? [] })
}

export async function POST(req: NextRequest) {
  const { chave, ate, desfazer } = await req.json().catch(() => ({})) as { chave?: string; ate?: string; desfazer?: boolean }
  if (!chave) return NextResponse.json({ erro: "chave" }, { status: 400 })
  const c = encodeURIComponent(chave)
  // Uma marca por item: tira a anterior antes
  const { data } = await supabase.from("agente_tratadas").select("id").like("id", `${PREFIXO}%|${c}`).limit(10)
  if (data?.length) await supabase.from("agente_tratadas").delete().in("id", data.map(x => x.id))
  if (!desfazer) {
    const valido = ate === "sempre" || (!!ate && !isNaN(Date.parse(ate)))
    if (!valido) return NextResponse.json({ erro: "ate" }, { status: 400 })
    await supabase.from("agente_tratadas").insert({ id: `${PREFIXO}${ate === "sempre" ? "sempre" : new Date(ate!).toISOString()}|${c}` })
  }
  return NextResponse.json({ ok: true })
}
