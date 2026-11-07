import { NextRequest, NextResponse } from "next/server"
import { atualizarFrete } from "@/app/lib/freteServidor"
import { supabase } from "@/app/lib/supabase"
import { gravarCampos } from "@/app/lib/configAtomica"

// Aviso da Lalamove (status, motorista, valor, saldo da carteira). Rota pública: o conteúdo não é confiável (sem
// assinatura documentada), então para corridas só usamos o número e buscamos a situação real na API com as nossas chaves.
// O saldo da carteira só chega por aqui (a API não tem consulta de saldo): guardamos o último para mostrar em Entregas.
function achar(x: unknown, teste: (k: string, v: unknown) => boolean, fundo = 0): unknown {
  if (!x || typeof x !== "object" || fundo > 5) return undefined
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (teste(k, v)) return v
    const dentro = achar(v, teste, fundo + 1)
    if (dentro !== undefined) return dentro
  }
  return undefined
}

export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => null) as Record<string, unknown> | null
  const tipo = String(achar(corpo, k => k === "eventType" || k === "type") ?? "")
  const id = achar(corpo, (k, v) => k === "orderId" && (typeof v === "string" || typeof v === "number"))
  if (id && /^[\w-]{4,64}$/.test(String(id))) await atualizarFrete(String(id)).catch(() => null)

  // Saldo da carteira e os últimos avisos (para conferir o formato que a Lalamove manda)
  const saldo = achar(corpo, (k, v) => /balance/i.test(k) && (typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v))))
  const { data: cfgRow } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (cfgRow?.data ?? {}) as Record<string, unknown>
  const eventos = [{ tipo, em: new Date().toISOString(), dados: JSON.stringify(corpo ?? {}).slice(0, 1500) }, ...((cfg.lalamoveEventos as unknown[]) ?? [])].slice(0, 15)
  const novo: Record<string, unknown> = { lalamoveEventos: eventos }
  if (saldo !== undefined && /WALLET/i.test(tipo + JSON.stringify(corpo ?? {}).slice(0, 300)))
    novo.lalamoveCarteira = { saldo: Number(saldo), moeda: String(achar(corpo, k => k === "currency") ?? "BRL"), em: new Date().toISOString() }
  await gravarCampos(novo)
  return NextResponse.json({ ok: true })   // a Lalamove exige 200
}
// A Lalamove testa a URL ao cadastrar
export const GET = () => NextResponse.json({ ok: true })
