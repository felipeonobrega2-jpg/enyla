import { NextRequest, NextResponse } from "next/server"
import { htmlRelatorioSemanal, semanaPassada } from "@/app/lib/relatorioSemanal"
import { enviarEmail } from "@/app/lib/email"
import { moldura, paragrafo, botao } from "@/app/lib/emailsEnyla"

// Relatório semanal por e-mail. O servidor da ENYLA (VPS), toda segunda às 8h:
//   GET  → o HTML do relatório da semana passada (ele imprime em PDF com o Chrome)
//   POST → manda o PDF (corpo da requisição) para o seu e-mail
// Protegido pelo mesmo segredo do vigia (cabeçalho x-token).
export const maxDuration = 60
export const dynamic = "force-dynamic"
const autorizado = (req: NextRequest) => { const s = process.env.WHATSAPP_WEBHOOK_SECRET; return !!s && (req.headers.get("x-token") === s || req.nextUrl.searchParams.get("token") === s) }

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })
  const { html } = await htmlRelatorioSemanal()
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })
  const pdf = Buffer.from(await req.arrayBuffer())
  if (pdf.length < 1000 || pdf.subarray(0, 4).toString() !== "%PDF") return NextResponse.json({ erro: "PDF inválido" }, { status: 400 })
  const per = semanaPassada()
  const para = process.env.RELATORIO_PARA || "felipeonobrega2@gmail.com"
  const r = await enviarEmail(para, {
    assunto: `Relatório da ENYLA · ${per.nome}`,
    html: moldura({ preheader: `Vendas, caixa, leads e digital da ${per.nome.toLowerCase()}.`, titulo: "Relatório da semana",
      corpo: paragrafo(`Bom dia! Segue o relatório gerencial da ${per.nome.toLowerCase()}, em PDF: vendas, caixa, margem, leads, digital, anúncios e a confiança dos dados, com a comparação com a semana anterior.`)
        + botao("Abrir os relatórios no sistema", "https://app.enyla.com.br/?aba=dashboard"),
      assinatura: `<b style="color:#1d1a29;">Sistema ENYLA</b><br>Toda segunda às 8h`, rodapeExtra: "E-mail automático do sistema da ENYLA." }),
    texto: `Relatório gerencial da ${per.nome} em anexo (PDF).`,
  }, [{ nome: `relatorio-enyla-${per.de.toISOString().slice(0, 10)}.pdf`, base64: pdf.toString("base64") }])
  await import("@/app/lib/agendador").then(m => m.marcarRotina("relatorioSemanal", r.ok ? `enviado para ${para}` : `erro: ${r.erro}`)).catch(() => null)
  return NextResponse.json(r.ok ? { ok: true, id: r.id, para } : { erro: r.erro }, { status: r.ok ? 200 : 502 })
}
