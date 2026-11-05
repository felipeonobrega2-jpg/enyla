import { NextRequest, NextResponse } from "next/server"
import { diagnosticar } from "@/app/lib/evolution"
import { registrarConexao } from "@/app/lib/whatsappEventos"
import { classificarOrigens } from "@/app/lib/origensWhatsappServidor"
import { juntarGemeas } from "@/app/lib/juntarConversas"
import { sincronizar as sincronizarBanco } from "@/app/lib/bancoServidor"
import { ligarPorTelefone } from "@/app/lib/contatosServidor"

// Agendado na Vercel (vercel.json), todo dia: confere a conexão do número, mesmo que o aviso da hora não tenha chegado.
// Rota fora do login (proxy.ts): com CRON_SECRET exige a senha; sem ele, só o agendador da Vercel.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const autorizado = cronSecret
    ? req.headers.get("authorization") === `Bearer ${cronSecret}`
    : /^vercel-cron\//.test(req.headers.get("user-agent") ?? "")
  if (!autorizado) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const d = await diagnosticar(req.nextUrl.origin)
  await registrarConexao(!d.alcancavel ? "servidor fora do ar" : !d.autorizado ? "chave recusada" : d.estado ?? "desconhecido")
  // Conversas novas do dia: anúncio/campanha e site
  const origens = await classificarOrigens().catch(() => null)
  // Mesma pessoa em duas conversas (número e @lid com o mesmo nome): junta
  const juntadas = await juntarGemeas().catch(() => null)
  // Conversa com o telefone de um cliente do cadastro: fica ligada a ele (orçamentos, pedidos, reativação, marketing)
  const ligadas = await ligarPorTelefone().catch(() => null)
  // Extrato do banco (Pluggy): puxa o do dia e prepara as sugestões para você conferir
  const banco = await sincronizarBanco().catch(e => ({ ok: false, erro: String(e) }))
  return NextResponse.json({ ok: true, conectado: d.conectado, origens, juntadas, ligadas, banco })
}
