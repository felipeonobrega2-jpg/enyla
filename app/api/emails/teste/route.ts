import { NextRequest, NextResponse } from "next/server"
import { enviarEmail } from "@/app/lib/email"
import { emailPedidoAprovado, emailSinalRecebido, emailArteParaAprovar, emailArteAprovada, emailPedidoEnviado } from "@/app/lib/emailsCliente"

// Amostra dos e-mails que vão para o cliente, com dados de exemplo, para o seu e-mail (exige o segredo do vigia)
export const maxDuration = 60
export async function POST(req: NextRequest) {
  const s = process.env.WHATSAPP_WEBHOOK_SECRET
  if (!s || req.headers.get("x-token") !== s) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })
  const para = process.env.RELATORIO_PARA || "felipeonobrega2@gmail.com"
  const agora = new Date().toISOString()
  const SITE = "https://app.enyla.com.br"
  const emails = [
    emailPedidoAprovado({ nome: "Ana Souza", numero: "ORC-2026-000", quantidade: 5000, preco: 9540, sinal: 4770, aprovadoPor: "Ana Souza", em: agora,
      descricao: "6 × 12 × 3 cm · Cartão 300g", prazo: "entrega prevista em 10/12/2026", linkPix: `${SITE}/pix/ORC-2026-000?v=4770.00&c=Exemplo`, linkRastreio: `${SITE}/track/ORC-2026-000` }),
    emailSinalRecebido({ nome: "João Exemplo", id: "DIG-0000", quantidade: 100, total: 619.95, sinal: 309.98, em: agora, link: SITE, prazo: "7 a 10 dias úteis" }),
    emailArteParaAprovar({ nome: "João Exemplo", id: "DIG-0000", versao: 2, link: SITE }),
    emailArteAprovada({ nome: "João Exemplo", id: "DIG-0000", em: agora, versao: 2, link: SITE, restante: 309.97 }),
    emailPedidoEnviado({ nome: "Ana Souza", numero: "ORC-2026-000", quantidade: 5000, link: `${SITE}/track/ORC-2026-000` }),
  ]
  const r = []
  for (const e of emails) r.push(await enviarEmail(para, { ...e, assunto: `[TESTE] ${e.assunto}` }))
  return NextResponse.json({ para, resultados: r.map(x => x.ok ? "ok" : x.erro) })
}
