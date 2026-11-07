import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { mudarConfig } from "@/app/lib/configAtomica"
import { gastosAtuais } from "@/app/lib/gastosServidor"
import { pendencias } from "@/app/lib/pendenciasDono"

// "Depende de você" (rota protegida pelo login): o que está parado esperando conta, chave, arquivo ou decisão sua
type Dados = {
  pendenciasDono?: Record<string, string>; digitalContatos?: { villa?: string; designer?: string }; midiaAgente?: { tipo: string; ativo?: boolean }[]
  metaTokenExpiry?: string | number; metaTokenTipo?: string; gastosCfg?: { recargaIA?: { em: string } | null }; pluggy?: { itens?: unknown[] }
}

export async function GET() {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const d = (data?.data ?? {}) as Dados
  const g = await gastosAtuais().catch(() => null)
  const exp = d.metaTokenExpiry ? new Date(typeof d.metaTokenExpiry === "number" && d.metaTokenExpiry < 1e12 ? d.metaTokenExpiry * 1000 : d.metaTokenExpiry) : null
  const lista = pendencias({
    env: { asaas: !!process.env.ASAAS_API_KEY, pluggy: !!(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET), lalamoveProducao: process.env.LALAMOVE_AMBIENTE === "producao", cronSecret: !!process.env.CRON_SECRET },
    pluggyItens: d.pluggy?.itens?.length ?? 0,
    metaSaldo: g?.meta?.restante ?? null, metaDiasRestantes: g?.meta?.diasRestantes ?? null,
    metaTokenExpira: exp && !isNaN(exp.getTime()) ? exp.toISOString() : null, metaTokenTipo: d.metaTokenTipo ?? null,
    iaRecargaEm: d.gastosCfg?.recargaIA?.em ?? null, iaDiasRestantes: g?.ia?.diasRestantes ?? null,
    designer: !!d.digitalContatos?.designer, villa: !!d.digitalContatos?.villa,
    videos: (d.midiaAgente ?? []).filter(m => m.tipo === "video" && m.ativo !== false).length,
    feitos: d.pendenciasDono ?? {},
  })
  return NextResponse.json({ pendencias: lista })
}

// POST { id, feito } marca (ou desmarca) um item manual
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { id?: string; feito?: boolean }
  if (!b.id) return NextResponse.json({ erro: "Faltou o item." }, { status: 400 })
  await mudarConfig(d => {
    const f = { ...((d as Dados).pendenciasDono ?? {}) }
    if (b.feito) f[b.id!] = new Date().toISOString(); else delete f[b.id!]
    return { pendenciasDono: f }
  })
  return GET()
}
