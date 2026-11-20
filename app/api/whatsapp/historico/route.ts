import { NextRequest, NextResponse } from "next/server"
import { evo } from "@/app/lib/evolution"
import { gravarLote, WaMessage } from "@/app/lib/whatsappDados"

// Completa o histórico das conversas com o que o Evolution guardou (sincronização do celular), uma página por chamada.
// Chamada pelo servidor da ENYLA (VPS) com o segredo do vigia. Diferente da importação da tela, NÃO zera as não lidas.
// Gravar de novo é inofensivo: mensagem repetida é ignorada e a "última mensagem" da conversa só avança.
export const maxDuration = 60
let cacheNomes: { em: number; nomes: Map<string, string> } | null = null

export async function POST(req: NextRequest) {
  const s = process.env.WHATSAPP_WEBHOOK_SECRET
  if (!s || req.headers.get("x-token") !== s) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })
  const { pagina = 1 } = await req.json().catch(() => ({})) as { pagina?: number }
  const POR_PAGINA = 400
  if (!cacheNomes || Date.now() - cacheNomes.em > 10 * 60_000) {
    const contatos = await evo<{ remoteJid?: string; pushName?: string }[]>("/chat/findContacts/{i}", { method: "POST", body: JSON.stringify({ where: {} }) })
    cacheNomes = { em: Date.now(), nomes: new Map((Array.isArray(contatos.corpo) ? contatos.corpo : []).filter(c => c.remoteJid && c.pushName).map(c => [c.remoteJid!, c.pushName!])) }
  }
  const r = await evo<{ messages?: { total?: number; pages?: number; records?: WaMessage[] } }>(
    "/chat/findMessages/{i}", { method: "POST", body: JSON.stringify({ where: {}, page: pagina, offset: POR_PAGINA }) })
  if (!r.ok || !r.corpo?.messages) return NextResponse.json({ erro: `O Evolution não devolveu o histórico (${r.status}).` }, { status: 502 })
  const { total = 0, pages = 0, records = [] } = r.corpo.messages
  const gravadas = await gravarLote(records, { nomes: cacheNomes.nomes })
  return NextResponse.json({ pagina, paginas: pages, total, lidas: records.length, gravadas, fim: pagina >= pages })
}
