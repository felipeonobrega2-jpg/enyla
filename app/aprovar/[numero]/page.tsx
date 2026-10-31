import { tokenValido, SINAL_PCT_PADRAO } from "@/app/lib/aprovacao"
import { carregarProposta } from "@/app/lib/propostaPublica"
import AprovarClient from "./AprovarClient"

export const dynamic = "force-dynamic"

export default async function AprovarPage({ params, searchParams }: {
  params: Promise<{ numero: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const numero = decodeURIComponent((await params).numero)
  const { t } = await searchParams
  const p = tokenValido(numero, t) ? await carregarProposta(numero) : null
  return (
    <AprovarClient numero={numero} token={t ?? ""}
      proposta={p && {
        nomeCliente: p.card.nomeCliente, opcoes: p.opcoes, especificacoes: p.especificacoes, observacao: p.observacao,
        validaAte: p.validaAte, vencida: p.vencida, jaAprovado: p.card.coluna !== 0, sinalPct: SINAL_PCT_PADRAO,
      }} />
  )
}
