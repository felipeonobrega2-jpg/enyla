import { NextRequest, NextResponse, after } from "next/server"
import { DIRETORES, type IdDiretor } from "@/app/lib/diretoria"
import { lerConversa, apagarConversa } from "@/app/lib/diretoriaServidor"
import { aquecerFoto, conversar, responderAcao } from "@/app/lib/conversaDiretor"
import { erroClaude } from "@/app/lib/claude"

// Conversa 1:1 do Felipe com um diretor (rota protegida pelo login). GET ?diretor= ; POST { diretor, texto };
// PATCH { diretor, acao, resposta: aprovo|descartar } (cartão de mensagem a cliente); DELETE ?diretor= (começar do zero)
export const maxDuration = 300
const ehDiretor = (x: unknown): x is IdDiretor => DIRETORES.some(d => d.id === x)

export async function GET(req: NextRequest) {
  const d = req.nextUrl.searchParams.get("diretor")
  if (!ehDiretor(d)) return NextResponse.json({ erro: "diretor" }, { status: 400 })
  after(aquecerFoto)   // a tela abriu a conversa: se a foto da empresa está velha, monta outra antes da primeira pergunta
  return NextResponse.json({ mensagens: await lerConversa(d) })
}

// POST { diretor, texto, voz?, aoVivo? }. aoVivo: responde em linhas JSON enquanto o diretor escreve
// ({ d: pedaço do texto } ... e no fim { mensagens } ou { erro }), para a tela mostrar e falar desde a primeira frase.
export async function POST(req: NextRequest) {
  const { diretor, texto, voz, aoVivo } = await req.json().catch(() => ({})) as { diretor?: string; texto?: string; voz?: boolean; aoVivo?: boolean }
  if (!ehDiretor(diretor) || !texto?.trim()) return NextResponse.json({ erro: "Escreva a mensagem." }, { status: 400 })
  after(aquecerFoto)   // depois de responder, deixa a foto da empresa fresca para a próxima fala
  if (!aoVivo) {
    try { return NextResponse.json({ mensagens: await conversar(diretor, texto.trim(), { voz: !!voz }) }) }
    catch (e) { const r = erroClaude(e); return NextResponse.json({ erro: r.error }, { status: r.status }) }
  }
  const cod = new TextEncoder()
  const corpo = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const linha = (x: unknown) => ctrl.enqueue(cod.encode(JSON.stringify(x) + "\n"))
      try { linha({ mensagens: await conversar(diretor, texto.trim(), { voz: !!voz, aoVivo: d => linha({ d }) }) }) }
      catch (e) { linha({ erro: erroClaude(e).error }) }
      ctrl.close()
    },
  })
  return new Response(corpo, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } })
}

export async function PATCH(req: NextRequest) {
  const { diretor, acao, resposta, texto } = await req.json().catch(() => ({})) as { diretor?: string; acao?: string; resposta?: string; texto?: string }
  if (!ehDiretor(diretor) || !acao || (resposta !== "aprovo" && resposta !== "descartar")) return NextResponse.json({ erro: "diretor/acao/resposta" }, { status: 400 })
  return NextResponse.json({ mensagens: await responderAcao(diretor, acao, resposta, texto) })
}

export async function DELETE(req: NextRequest) {
  const d = req.nextUrl.searchParams.get("diretor")
  if (!ehDiretor(d)) return NextResponse.json({ erro: "diretor" }, { status: 400 })
  await apagarConversa(d)
  return NextResponse.json({ mensagens: [] })
}
