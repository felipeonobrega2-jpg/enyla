import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { contatosImportantes, descobrirTelefones } from "@/app/lib/contatosServidor"
import { csv, vcf, normalizarTelefone } from "@/app/lib/contatos"

export const maxDuration = 60

// Contatos importantes (MQL, ICP, oportunidade, clientes) guardados no sistema (rota protegida pelo login):
//   GET                  → { lista, total, comTelefone }
//   GET ?formato=vcf|csv → arquivo para baixar (vcf importa no celular)
//   POST { descobrir }   → procura os telefones que faltam (cadastro de clientes e Evolution)
//   POST { jid, telefone } → você informa o telefone de um contato
export async function GET(req: NextRequest) {
  const lista = await contatosImportantes()
  const formato = req.nextUrl.searchParams.get("formato")
  const dia = new Date().toISOString().slice(0, 10)
  if (formato === "vcf") return new NextResponse(vcf(lista), { headers: { "Content-Type": "text/vcard; charset=utf-8", "Content-Disposition": `attachment; filename="contatos-enyla-${dia}.vcf"` } })
  if (formato === "csv") return new NextResponse("﻿" + csv(lista), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="contatos-enyla-${dia}.csv"` } })
  return NextResponse.json({ lista, total: lista.length, comTelefone: lista.filter(c => c.telefone).length })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { descobrir?: boolean; jid?: string; telefone?: string }
  if (b.descobrir) return NextResponse.json(await descobrirTelefones(40))
  if (b.jid) {
    const tel = normalizarTelefone(b.telefone)
    if (!tel) return NextResponse.json({ erro: "Telefone inválido. Use DDD + número." }, { status: 400 })
    await supabase.from("whatsapp_conversas").update({ telefone: tel }).eq("jid", b.jid)
    return NextResponse.json({ ok: true, telefone: tel })
  }
  return NextResponse.json({ erro: "Nada a fazer." }, { status: 400 })
}
