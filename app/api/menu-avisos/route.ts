// Avisos do menu: só o que pede uma ação sua agora (parceiros para aprovar, digital parado, dados graves,
// agente travado). Leve: lê só o AppConfig.
import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { digitalParado } from "@/app/lib/resolverServidor"

export const dynamic = "force-dynamic"

export async function GET() {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (data?.data ?? {}) as {
    cadastrosParceiros?: { status: string }[]; pedidosDigitais?: never[]
    auditoriaDados?: { graves?: number }; whatsappConexao?: { estado?: string }; agenteSemCreditoEm?: string; vigiaRodouEm?: string
  }
  const agora = Date.now()
  const whatsFora = !!cfg.whatsappConexao?.estado && !/open|conectad/i.test(cfg.whatsappConexao.estado)
  const semCredito = !!cfg.agenteSemCreditoEm && agora - new Date(cfg.agenteSemCreditoEm).getTime() < 3 * 3_600_000
  const vigiaParado = !!cfg.vigiaRodouEm && agora - new Date(cfg.vigiaRodouEm).getTime() > 30 * 60_000
  return NextResponse.json({
    parceirosNovos: (cfg.cadastrosParceiros ?? []).filter(c => c.status === "novo").length,
    digitalParados: digitalParado(cfg.pedidosDigitais ?? [], agora).filter(x => x.nivel !== "info").length,
    dadosGraves: cfg.auditoriaDados?.graves ?? 0,
    agenteTravado: whatsFora || semCredito || vigiaParado,
  })
}
