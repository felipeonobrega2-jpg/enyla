import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { evo } from "@/app/lib/evolution"
import { gravarLote, WaMessage } from "@/app/lib/whatsappDados"

export const maxDuration = 60

// Importa o histórico que o Evolution guardou no banco da VPS, uma página por chamada (rota protegida pelo login).
// A tela chama página 1, 2, 3… até o fim. Gravar de novo é inofensivo (mensagem repetida é ignorada).
export async function POST(req: NextRequest) {
  const { pagina = 1 } = await req.json().catch(() => ({})) as { pagina?: number }
  const POR_PAGINA = 400

  // Nomes dos contatos (completa as conversas que só têm o número)
  const contatos = await evo<{ remoteJid?: string; pushName?: string }[]>("/chat/findContacts/{i}", { method: "POST", body: JSON.stringify({ where: {} }) })
  const nomes = new Map((Array.isArray(contatos.corpo) ? contatos.corpo : []).filter(c => c.remoteJid && c.pushName).map(c => [c.remoteJid!, c.pushName!]))

  const r = await evo<{ messages?: { total?: number; pages?: number; currentPage?: number; records?: WaMessage[] } }>(
    "/chat/findMessages/{i}", { method: "POST", body: JSON.stringify({ where: {}, page: pagina, offset: POR_PAGINA }) })
  if (!r.ok || !r.corpo?.messages) return NextResponse.json({ erro: `O Evolution não devolveu o histórico (${r.status}).` }, { status: 502 })
  const { total = 0, pages = 0, records = [] } = r.corpo.messages

  // Histórico não é "não lida": zera a contagem inflada pela sincronização, na primeira página
  if (pagina === 1) await supabase.from("whatsapp_conversas").update({ nao_lidas: 0 }).gt("nao_lidas", 0)

  const gravadas = await gravarLote(records, { nomes })
  return NextResponse.json({ pagina, paginas: pages, total, gravadas, fim: pagina >= pages })
}
