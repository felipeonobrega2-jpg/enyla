import { tokenValido, SINAL_PCT_PADRAO } from "@/app/lib/aprovacao"
import { supabase } from "@/app/lib/supabase"
import { carregarProposta } from "@/app/lib/propostaPublica"
import AprovarClient from "./AprovarClient"
import { isAberto } from "@/app/lib/negocio"
import { auth } from "@/auth"
import { somarDiasUteis, definirFeriadosLocais } from "@/app/lib/diasUteis"
import { normalizarProducao } from "@/app/lib/producao"
import { CONFIG_PADRAO } from "@/app/config"
import type { VisitaProposta } from "@/app/types"

// Registra que o cliente abriu a proposta (não quando é a Enyla logada; no máximo uma vez a cada 30 min):
// conta em config.visitasProposta (o Painel avisa) e deixa a marca no rastreio do pedido
async function registrarVisita(numero: string) {
  const { data: cfgRow } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (cfgRow?.data ?? {}) as Record<string, unknown>
  const visitas = { ...((cfg.visitasProposta as Record<string, VisitaProposta> | undefined) ?? {}) }
  const agora = new Date()
  const v = visitas[numero]
  if (v && agora.getTime() - new Date(v.ultima).getTime() < 30 * 60_000) return
  visitas[numero] = { primeira: v?.primeira ?? agora.toISOString(), ultima: agora.toISOString(), vezes: (v?.vezes ?? 0) + 1 }
  // Esquece visitas de mais de 60 dias
  for (const [n, x] of Object.entries(visitas)) if (agora.getTime() - new Date(x.ultima).getTime() > 60 * 86_400_000) delete visitas[n]
  await supabase.from("AppConfig").update({ data: { ...cfg, visitasProposta: visitas } }).eq("id", 1)

  const { data: t } = await supabase.from("Tracking").select("etapas, colunaAtual").eq("numero", numero).maybeSingle()
  if (!t) return
  const dataHora = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
  await supabase.from("Tracking").update({ etapas: [...(t.etapas ?? []), { coluna: t.colunaAtual ?? 0, nome: "Cliente abriu a proposta", dataHora, tipo: "visualizacao" }] }).eq("numero", numero)
}

export const dynamic = "force-dynamic"

export default async function AprovarPage({ params, searchParams }: {
  params: Promise<{ numero: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const numero = decodeURIComponent((await params).numero)
  const { t } = await searchParams
  const p = tokenValido(numero, t) ? await carregarProposta(numero) : null
  const { data: cfg } = p ? await supabase.from("AppConfig").select("data").eq("id", 1).single() : { data: null }
  const config = (cfg?.data ?? {}) as { sinalPct?: number; producao?: unknown; feriados?: unknown }
  const sinalPct = config.sinalPct ?? SINAL_PCT_PADRAO
  // Se aprovar hoje, entrega até: prazo padrão em dias úteis
  definirFeriadosLocais((config.feriados ?? CONFIG_PADRAO.feriados) as never)
  const entregaSeAprovarHoje = p ? somarDiasUteis(new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }), normalizarProducao(config.producao as never).prazoEntregaPadraoDias) : null
  if (p && isAberto(p.card) && !(await auth())) await registrarVisita(numero).catch(() => {})
  return (
    <AprovarClient numero={numero} token={t ?? ""}
      proposta={p && {
        nomeCliente: p.card.nomeCliente, opcoes: p.opcoes, especificacoes: p.especificacoes, observacao: p.observacao,
        validaAte: p.validaAte, vencida: p.vencida, jaAprovado: !isAberto(p.card), sinalPct,
        caixa: p.caixa, entregaSeAprovarHoje,
      }} />
  )
}
