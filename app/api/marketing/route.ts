import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { gerarRelatorio } from "@/app/lib/marketingServidor"
import type { Relatorio } from "@/app/lib/marketing"

export const maxDuration = 60

// Agente de marketing (página Campanhas): relatórios diários guardados e geração na hora.
//   GET                        → { relatorios } (mais recente primeiro)
//   POST { dia?, leitura? }    → gera (ou refaz) o relatório do dia (padrão: ontem); leitura false = só os números
// (Rota protegida pelo login.)

export async function GET() {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  return NextResponse.json({ relatorios: ((data?.data ?? {}) as { marketingRelatorios?: Relatorio[] }).marketingRelatorios ?? [] })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { dia?: string; leitura?: boolean }
  const dia = b.dia && /^\d{4}-\d{2}-\d{2}$/.test(b.dia) ? b.dia : undefined
  try {
    return NextResponse.json({ relatorio: await gerarRelatorio(dia, { comLeitura: b.leitura !== false }) })
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
