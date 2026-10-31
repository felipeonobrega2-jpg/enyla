import { tokenValido, SINAL_PCT_PADRAO } from "@/app/lib/aprovacao"
import { supabase } from "@/app/lib/supabase"
import { carregarProposta } from "@/app/lib/propostaPublica"
import AprovarClient from "./AprovarClient"
import { isAberto } from "@/app/lib/negocio"

export const dynamic = "force-dynamic"

export default async function AprovarPage({ params, searchParams }: {
  params: Promise<{ numero: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const numero = decodeURIComponent((await params).numero)
  const { t } = await searchParams
  const p = tokenValido(numero, t) ? await carregarProposta(numero) : null
  const { data: cfg } = p ? await supabase.from("AppConfig").select("data").eq("id", 1).single() : { data: null }
  const sinalPct = ((cfg?.data as { sinalPct?: number } | undefined)?.sinalPct) ?? SINAL_PCT_PADRAO
  return (
    <AprovarClient numero={numero} token={t ?? ""}
      proposta={p && {
        nomeCliente: p.card.nomeCliente, opcoes: p.opcoes, especificacoes: p.especificacoes, observacao: p.observacao,
        validaAte: p.validaAte, vencida: p.vencida, jaAprovado: !isAberto(p.card), sinalPct,
      }} />
  )
}
