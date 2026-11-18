// Escritório dos agentes: o que cada um está fazendo agora e o que fez hoje
import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { lerRegistros } from "@/app/lib/registroAgente"
import { dentroDoHorario } from "@/app/lib/agenteLeads"
import { montarEscritorio, type CfgEscritorio } from "@/app/lib/escritorio"

export const dynamic = "force-dynamic"

export async function GET() {
  const desde = new Date(Date.now() - 24 * 3_600_000).toISOString()
  const [regs, c] = await Promise.all([
    lerRegistros(600, { desde }),
    supabase.from("AppConfig").select("data").eq("id", 1).single(),
  ])
  const cfg = (c.data?.data ?? {}) as CfgEscritorio & { agenteLog?: never[]; agenteAuto?: { ligado?: boolean; horario?: never } }
  const registros = regs ?? (cfg.agenteLog ?? [])
  // Nome de quem a IA fechou a conversa (o registro guarda só o número)
  const jids = [...new Set((cfg.fechadasPelaIA ?? []).filter(f => Date.now() - new Date(f.em).getTime() < 24 * 3_600_000).map(f => f.jid))].slice(0, 100)
  const nomes: Record<string, string> = {}
  if (jids.length) {
    const { data } = await supabase.from("whatsapp_conversas").select("jid, nome").in("jid", jids)
    for (const x of data ?? []) if (x.nome) nomes[x.jid] = x.nome
  }
  return NextResponse.json(montarEscritorio({ registros, cfg, nomes, noHorario: dentroDoHorario(cfg.agenteAuto?.horario) }))
}
