import { NextResponse } from "next/server"
import { asaas, asaasConfigurado } from "@/app/lib/asaas"

// Qual conta do Asaas está ligada ao sistema (rota protegida pelo login). Só nome, e-mail, documento e ambiente:
// a chave nunca sai do servidor.
type Comercial = { name?: string; companyName?: string; email?: string; cpfCnpj?: string; personType?: string }
export async function GET() {
  if (!asaasConfigurado()) return NextResponse.json({ erro: "Asaas não configurado na Vercel." }, { status: 404 })
  const r = await asaas<Comercial>("/myAccount/commercialInfo/")
  if (!r.ok || !r.corpo) return NextResponse.json({ erro: `O Asaas não respondeu (${r.status}).` }, { status: 502 })
  const c = r.corpo
  return NextResponse.json({
    nome: c.companyName || c.name || null, email: c.email ?? null, documento: c.cpfCnpj ?? null,
    ambiente: process.env.ASAAS_AMBIENTE === "sandbox" ? "sandbox (teste)" : "produção",
  })
}
