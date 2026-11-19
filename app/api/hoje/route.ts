import { NextResponse } from "next/server"
import { montarHoje } from "@/app/lib/hojeServidor"

// Painel → Hoje: bons negócios esperando você, o que o anúncio trouxe em 24 h, a ação do relatório e a reativação.
// (Rota protegida pelo login.)
// Cache de 60 s na instância: com celular e computador abertos, o Hoje era montado (AppConfig inteiro + 1.500
// conversas) várias vezes por minuto e estourou a cota de tráfego do Supabase (19/11). ?fresco=1 força montar de novo.
let cache: { em: number; dado: unknown } | null = null
export async function GET(req: Request) {
  const fresco = new URL(req.url).searchParams.has("fresco")
  if (!fresco && cache && Date.now() - cache.em < 60_000) return NextResponse.json(cache.dado)
  try { const dado = await montarHoje(); cache = { em: Date.now(), dado }; return NextResponse.json(dado) }
  catch (e) { return NextResponse.json({ erro: String(e instanceof Error ? e.message : e) }, { status: 500 }) }
}
