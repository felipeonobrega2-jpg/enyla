// Sugestão do atendente na tela do WhatsApp: só é gerada quando o Felipe clica em "Gerar sugestão".
import type { Atendimento } from "./atendente"

type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>

// Sugestão guardada só vale enquanto a última mensagem for a mesma para a qual foi gerada.
export function sugestaoVelha(guardada: { ultimaId?: string } | undefined, ultima: { id: string } | undefined): boolean {
  return !!guardada && !!ultima && guardada.ultimaId !== ultima.id
}

// Única chamada à IA da tela: /api/whatsapp/atender (origem tela-whatsapp).
export async function pedirSugestao(fetcher: Fetcher, jid: string, outra?: boolean): Promise<{ at?: Atendimento; erro?: string }> {
  const r = await fetcher("/api/whatsapp/atender", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jid, outra: outra === true }) }).catch(() => null)
  const d = (r ? await r.json().catch(() => null) : null) as (Atendimento & { erro?: string }) | null
  if (r?.ok && d?.resposta !== undefined) return { at: d }
  return { erro: d?.erro ?? "A IA não respondeu." }
}
