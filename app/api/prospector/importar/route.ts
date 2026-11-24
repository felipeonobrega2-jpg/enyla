import { NextRequest, NextResponse } from "next/server"
import { gravarCampos } from "@/app/lib/configAtomica"
import { importar } from "@/app/lib/prospectorImportadorServidor"

// Agendado na Vercel (vercel.json). Importa uma fatia dos dados abertos de CNPJ para o Prospector e guarda o cursor.
// Rota fora do login (proxy.ts): com CRON_SECRET exige a senha (a mesma que a Vercel já usa nos crons); sem ele, só o agendador da Vercel.
// Não envia mensagem de nenhum canal.
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const autorizado = cronSecret
    ? req.headers.get("authorization") === `Bearer ${cronSecret}`
    : /^vercel-cron\//.test(req.headers.get("user-agent") ?? "")
  if (!autorizado) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // Rastro da última chamada (AppConfig.prospectorImportadorUltima): sem ele, uma falha antes do cursor não deixa nada no banco.
  const quando = new Date().toISOString()
  const rastro = (v: object) => gravarCampos({ prospectorImportadorUltima: { quando, ...v } }).catch(() => {})
  await rastro({ estado: "iniciou" })
  try {
    const r = await importar()
    await rastro({ estado: r.ok ? "ok" : "falhou", erro: r.erro ?? null, lidos: r.lidos, inseridos: r.inseridos, atualizados: r.atualizados, semCadastro: r.semCadastro, cursor: r.cursor })
    return NextResponse.json(r, { status: r.ok ? 200 : 502 })
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    await rastro({ estado: "erro", erro })
    return NextResponse.json({ ok: false, erro }, { status: 500 })
  }
}
