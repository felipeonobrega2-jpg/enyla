import { NextRequest } from "next/server"
import { descadastrarPorToken } from "@/app/lib/prospectorEventosServidor"

// Descadastro do e-mail do Prospector. Rota fora do login (proxy.ts): o token aleatório do envio é a identificação.
// GET só mostra a confirmação (leitor de link de antivírus não descadastra sozinho); POST grava a exclusão (também serve ao List-Unsubscribe-Post).
const pagina = (titulo: string, corpo: string, status = 200) =>
  new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head><body style="font-family:sans-serif;max-width:480px;margin:48px auto;padding:0 16px"><h1 style="font-size:20px">${titulo}</h1>${corpo}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return pagina("Sair da lista de e-mails da ENYLA", `<p>Confirme para não receber mais e-mails da ENYLA.</p><form method="post" action="/api/prospector/sair/${encodeURIComponent(token)}"><button type="submit" style="padding:10px 16px">Sair da lista</button></form>`)
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (await descadastrarPorToken(token))
    ? pagina("Pronto", "<p>Você não receberá mais e-mails da ENYLA.</p>")
    : pagina("Link inválido", "<p>Não encontramos este cadastro. Se precisar, responda o e-mail pedindo para sair.</p>", 404)
}
