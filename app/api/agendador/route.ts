import { NextResponse } from "next/server"
import { ROTINAS, lerExecucoes, situacaoRotina, type Execucao } from "@/app/lib/agendador"
import { lerCampos } from "@/app/lib/configAtomica"
import { dentroDoHorario } from "@/app/lib/agenteLeads"

// Agendador (rota protegida pelo login): todas as rotinas automáticas, quando rodaram e como estão
export async function GET() {
  const [ex, cfg] = await Promise.all([lerExecucoes(), lerCampos<{
    agenteAprendeuEm?: string; metaTokenVerificadoEm?: string; rotinaEnviada?: Record<string, string>; agenteAuto?: { horario?: Parameters<typeof dentroDoHorario>[0] }
  }>(["agenteAprendeuEm", "metaTokenVerificadoEm", "rotinaEnviada", "agenteAuto"])])
  // Rotinas que já guardavam a hora no AppConfig antes do agendador
  const doCfg = (rotina: string, em?: string): Execucao | undefined => em ? { rotina, em, resultado: "ok" } : undefined
  const ultimoResumo = Object.values(cfg.rotinaEnviada ?? {}).sort().pop()
  const extras: Record<string, Execucao | undefined> = {
    aprendizado: doCfg("aprendizado", cfg.agenteAprendeuEm), metaToken: doCfg("metaToken", cfg.metaTokenVerificadoEm),
    resumo: ex.resumo ?? doCfg("resumo", ultimoResumo),
  }
  const agora = Date.now()
  const noHorario = dentroDoHorario(cfg.agenteAuto?.horario)
  const rotinas = ROTINAS.map(r => {
    const e = ex[r.id] ?? extras[r.id]
    return { ...r, ultima: e ?? null, situacao: situacaoRotina(r, e, agora, noHorario) }
  })
  return NextResponse.json({ rotinas, noHorario })
}
