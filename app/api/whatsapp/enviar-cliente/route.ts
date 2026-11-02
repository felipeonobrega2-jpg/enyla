import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { evo } from "@/app/lib/evolution"
import { gravarLote, WaMessage } from "@/app/lib/whatsappDados"
import { clienteDaConversa, Vinculos } from "@/app/lib/vinculoWhatsapp"
import { nomeChave } from "@/app/lib/negocio"

// Envia uma mensagem a um cliente do cadastro pelo seu número (Painel, celular, agente). Rota protegida pelo login.
// Destino: o telefone do cadastro; sem telefone, a conversa do WhatsApp ligada ao cliente (vínculo ou nome).
export async function POST(req: NextRequest) {
  const { cliente, texto } = await req.json().catch(() => ({})) as { cliente?: string; texto?: string }
  if (!cliente || !texto?.trim()) return NextResponse.json({ erro: "Cliente e mensagem são obrigatórios." }, { status: 400 })

  const { data: cad } = await supabase.from("Cliente").select("nome, telefone")
  const tel = (cad ?? []).find(c => nomeChave(c.nome) === nomeChave(cliente))?.telefone?.replace(/\D/g, "")
  let destino: string | null = tel ? (tel.length <= 11 ? "55" + tel : tel) : null
  let jid: string | null = null
  if (!destino) {
    const { data: cfgRow } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
    const vinculos = ((cfgRow?.data as { vinculosWhatsapp?: Vinculos } | null)?.vinculosWhatsapp) ?? {}
    const { data: conversas } = await supabase.from("whatsapp_conversas").select("jid, nome, ultima_at").order("ultima_at", { ascending: false })
    jid = (conversas ?? []).find(c => clienteDaConversa(c, [cliente], vinculos)?.nome === cliente)?.jid ?? null
    destino = jid
  }
  if (!destino) return NextResponse.json({ erro: `Sem telefone de ${cliente} no cadastro e nenhuma conversa ligada a ele.` }, { status: 404 })

  const r = await evo<WaMessage>("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text: texto.trim() }) })
  if (!r.ok || !r.corpo?.key?.id) return NextResponse.json({ erro: `Não enviou (${r.status}). Confira a conexão do WhatsApp.` }, { status: 502 })
  const remoteJid = jid ?? r.corpo.key.remoteJid
  await gravarLote([{ ...r.corpo, key: { ...r.corpo.key, remoteJid, fromMe: true } }])
  return NextResponse.json({ ok: true, jid: remoteJid })
}
