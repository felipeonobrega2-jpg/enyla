import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { clienteDaConversa, ligacaoForte, Vinculos } from "@/app/lib/vinculoWhatsapp"
import { normalizarTelefone } from "@/app/lib/contatos"
import { nomeChave } from "@/app/lib/negocio"
import { dadosDaConversa } from "@/app/lib/hoje"

// Para onde vai uma mensagem a um cliente do cadastro (envio da proposta): a conversa ligada a ele com segurança
// (a mais recente) ou, sem conversa, o telefone do cadastro. Com ?jid=, só o nome e o que a IA tirou da conversa
// (painel "Ver conversa" do orçamento). (Rota protegida pelo login.)
export async function GET(req: NextRequest) {
  const jid = req.nextUrl.searchParams.get("jid")?.trim()
  if (jid) {
    const { data } = await supabase.from("whatsapp_conversas").select("jid, nome, proxima_acao").eq("jid", jid).maybeSingle()
    return NextResponse.json(data ? { jid: data.jid, nome: data.nome, como: "conversa", dados: dadosDaConversa(data.proxima_acao) } : { jid: null })
  }
  const cliente = req.nextUrl.searchParams.get("cliente")?.trim()
  if (!cliente) return NextResponse.json({ erro: "cliente obrigatório" }, { status: 400 })
  const [{ data: convs }, { data: cad }, { data: cfgRow }] = await Promise.all([
    supabase.from("whatsapp_conversas").select("jid, nome, telefone, ultima_at").not("jid", "like", "%@g.us").order("ultima_at", { ascending: false }).limit(3000),
    supabase.from("Cliente").select("nome, telefone"),
    supabase.from("AppConfig").select("data").eq("id", 1).single(),
  ])
  const vinculos = ((cfgRow?.data as { vinculosWhatsapp?: Vinculos } | null)?.vinculosWhatsapp) ?? {}
  const k = nomeChave(cliente)
  const conversa = (convs ?? []).find(c => {
    const cli = clienteDaConversa(c, [cliente], vinculos)
    return !!cli && nomeChave(cli.nome) === k && ligacaoForte(c, cli)
  })
  if (conversa) {
    const { data } = await supabase.from("whatsapp_conversas").select("proxima_acao").eq("jid", conversa.jid).maybeSingle()
    return NextResponse.json({ jid: conversa.jid, nome: conversa.nome || cliente, como: "conversa", dados: dadosDaConversa(data?.proxima_acao) })
  }
  const tel = normalizarTelefone((cad ?? []).find(c => nomeChave(c.nome) === k)?.telefone)
  if (tel) return NextResponse.json({ jid: `${tel}@s.whatsapp.net`, nome: cliente, como: "telefone", telefone: tel })
  return NextResponse.json({ jid: null })
}
