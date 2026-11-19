// Captador de parceiros (só a equipe): candidatos e convites; convidar os que você escolheu, colar uma lista, tirar da fila
import { NextResponse } from "next/server"
import { listarCaptacao, convidar, convidarLista, mudarConvite } from "@/app/lib/captacaoServidor"

export const dynamic = "force-dynamic"

export async function GET() { return NextResponse.json(await listarCaptacao()) }

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { acao?: string; itens?: { jid: string; nome: string | null; origem: "whatsapp" | "fornecedor" | "manual" }[]; texto?: string; template?: string; id?: string }
  if (b.acao === "convidar" && Array.isArray(b.itens)) return NextResponse.json({ ok: true, n: await convidar(b.itens, b.template) })
  if (b.acao === "lista" && typeof b.texto === "string") return NextResponse.json({ ok: true, n: await convidarLista(b.texto, b.template) })
  if (b.acao === "cancelar" && b.id) { await mudarConvite(b.id, { status: "sem_interesse", erro: "tirado da fila" }); return NextResponse.json({ ok: true }) }
  if (b.acao === "sem_interesse" && b.id) { await mudarConvite(b.id, { status: "sem_interesse" }); return NextResponse.json({ ok: true }) }
  return NextResponse.json({ erro: "ação" }, { status: 400 })
}
