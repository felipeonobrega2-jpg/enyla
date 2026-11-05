import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { lerCfg } from "@/app/lib/agenteAuto"
import { candidatos, preparar, enviarRetomada, pular, enviadasHoje, CfgReativacao } from "@/app/lib/reativacaoServidor"
import { POR_DIA_PADRAO } from "@/app/lib/reativacao"

export const maxDuration = 60

// Reativação (Configurações): fila dos bons negócios parados e o modo sozinho.
//   GET                            → { auto, fila, hoje, registro }
//   POST { preparar: jid }         → a retomada que a IA escreveria (não envia)
//   POST { enviar: jid, texto }    → envia como você
//   POST { pular: jid }            → sai da fila por 45 dias
//   POST { ligado, porDia }        → liga/desliga o modo sozinho
// (Rota protegida pelo login.)

export async function GET() {
  const cfg = await lerCfg() as Awaited<ReturnType<typeof lerCfg>> & CfgReativacao
  const registro = (cfg.agenteLog ?? []).filter(l => l.passo?.startsWith("Reativação") || l.passo === "Respondeu").slice(0, 40)
  return NextResponse.json({ auto: cfg.reativacaoAuto ?? { ligado: false, porDia: POR_DIA_PADRAO }, fila: await candidatos(cfg), hoje: enviadasHoje(cfg), registro })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { preparar?: string; enviar?: string; texto?: string; pular?: string; ligado?: boolean; porDia?: number }
  if (b.preparar) return NextResponse.json(await preparar(b.preparar))
  if (b.enviar) {
    if (!b.texto?.trim()) return NextResponse.json({ ok: false, erro: "Mensagem vazia." }, { status: 400 })
    return NextResponse.json(await enviarRetomada(b.enviar, b.texto.slice(0, 1500), "voce"))
  }
  if (b.pular) { await pular(b.pular); return NextResponse.json({ ok: true }) }
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const d = (data?.data ?? {}) as Record<string, unknown> & CfgReativacao
  const auto = {
    ...(d.reativacaoAuto ?? { ligado: false }),
    ...(typeof b.ligado === "boolean" ? { ligado: b.ligado } : {}),
    ...(b.porDia ? { porDia: Math.min(10, Math.max(1, Math.round(b.porDia))) } : {}),
  }
  await supabase.from("AppConfig").update({ data: { ...d, reativacaoAuto: auto } }).eq("id", 1)
  return NextResponse.json({ auto })
}
