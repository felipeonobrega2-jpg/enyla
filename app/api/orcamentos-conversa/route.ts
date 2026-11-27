import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import type { MapaConversas } from "@/app/lib/diasParado"

// Só leitura (rota protegida pelo login): por card, quando o cliente escreveu e quando nós escrevemos pela última vez,
// na conversa do WhatsApp ligada ao card (`kanban_card_id`). Sem escrita e sem migração.
export async function GET() {
  try {
    const mapa: MapaConversas = {}
    for (let de = 0; de < 20_000; de += 1000) {
      const { data, error } = await supabase.from("whatsapp_conversas")
        .select("kanban_card_id, ultima_recebida_at, ultima_enviada_at").not("kanban_card_id", "is", null).range(de, de + 999)
      if (error) throw new Error(error.message)
      for (const c of data ?? []) {
        const id = c.kanban_card_id as string
        const a = mapa[id] ?? { recebida: null, enviada: null }
        const maior = (x: string | null, y: string | null) => (x && y ? (x > y ? x : y) : x ?? y)
        mapa[id] = { recebida: maior(a.recebida, c.ultima_recebida_at), enviada: maior(a.enviada, c.ultima_enviada_at) }
      }
      if (!data || data.length < 1000) break
    }
    return NextResponse.json(mapa)
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 })
  }
}
