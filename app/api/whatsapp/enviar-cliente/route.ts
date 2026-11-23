import { NextRequest, NextResponse } from "next/server"
import { enviarAoCliente } from "@/app/lib/enviarCliente"

// Envia uma mensagem a um cliente do cadastro pelo seu número (Painel, celular, agente). Rota protegida pelo login.
// Destino: o telefone do cadastro; sem telefone, a conversa do WhatsApp ligada ao cliente (vínculo ou nome).
export async function POST(req: NextRequest) {
  const { cliente, texto } = await req.json().catch(() => ({})) as { cliente?: string; texto?: string }
  const r = await enviarAoCliente(cliente ?? "", texto ?? "")
  return r.ok ? NextResponse.json({ ok: true, jid: r.jid }) : NextResponse.json({ erro: r.erro }, { status: r.status })
}
