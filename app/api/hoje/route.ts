import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { lerCfg } from "@/app/lib/agenteAuto"
import { candidatos, enviadasHoje, CfgReativacao } from "@/app/lib/reativacaoServidor"
import { POR_DIA_PADRAO } from "@/app/lib/reativacao"
import { DIAS_PERDIDO } from "@/app/lib/funilWhatsapp"
import { total, custoPor, Relatorio } from "@/app/lib/marketing"
import { marcosDoRegistro } from "@/app/lib/agenteLeads"
import { quemResponder, doAnuncio, ConvHoje, Hoje } from "@/app/lib/hoje"

// Painel → Hoje: bons negócios esperando você, o que o anúncio trouxe em 24 h, a ação do relatório e a reativação.
// (Rota protegida pelo login.)
export async function GET() {
  const desde = new Date(Date.now() - DIAS_PERDIDO * 86_400_000).toISOString()
  const [cfg, { data, error }] = await Promise.all([
    lerCfg() as Promise<Awaited<ReturnType<typeof lerCfg>> & CfgReativacao & { marketingRelatorios?: Relatorio[] }>,
    supabase.from("whatsapp_conversas")
      .select("jid, nome, ultima_msg, ultima_recebida_at, ultima_enviada_at, fechada_em, status_lead, etiquetas, campanha, criado_em, proxima_acao")
      .not("jid", "like", "%@g.us").gte("ultima_at", desde).order("ultima_at", { ascending: false }).limit(1500),
  ])
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  const convs = (data ?? []) as ConvHoje[]
  const { responder, outros } = quemResponder(convs, cfg.agenteMarcos ?? marcosDoRegistro(cfg.agenteLog ?? []), Date.now(), cfg.vinculosWhatsapp)
  const rel = (cfg.marketingRelatorios ?? [])[0]
  const t = rel ? total(rel.dia1) : null
  const auto = cfg.reativacaoAuto ?? { ligado: false, porDia: POR_DIA_PADRAO }
  const fila = await candidatos(cfg).then(l => l.length).catch(() => 0)
  const hoje: Hoje = {
    responder, outrosEsperando: outros, anuncio: doAnuncio(convs),
    marketing: rel?.leitura?.acao ? { dia: rel.dia, acao: rel.leitura.acao, custoMql: t ? custoPor(t.gasto, t.mql) : null } : null,
    reativacao: { ligado: !!auto.ligado, porDia: auto.porDia ?? POR_DIA_PADRAO, hoje: enviadasHoje(cfg), fila },
  }
  return NextResponse.json(hoje)
}
