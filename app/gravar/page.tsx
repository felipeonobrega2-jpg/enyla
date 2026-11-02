import { lerTokenGravacao } from "@/app/lib/tokenGravacao"
import { GravarClient } from "./GravarClient"

export const metadata = { title: "Gravar áudio · ENYLA" }

// Página aberta pelo QR code da conversa: grava no celular e envia como áudio de voz pelo seu número.
export default async function GravarPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  const alvo = lerTokenGravacao(t)
  return <GravarClient token={t ?? ""} nome={alvo?.nome ?? null} expira={alvo?.expira ?? null} />
}
