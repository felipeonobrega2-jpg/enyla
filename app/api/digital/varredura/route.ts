import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { supabase } from "@/app/lib/supabase"
import { lerCfg, gravarCfg, enviar, type Conversa } from "@/app/lib/agenteAuto"
import { cotarDigital, montarPedido, textoLinkPedido, itensDoLembrete, textoReenvioDigital, pedidosDoGrupo, type PedidoDigital } from "@/app/lib/digital"
import { linkPedido } from "@/app/lib/digitalLink"
import { dadosDaConversa } from "@/app/lib/hoje"

export const maxDuration = 60

// Varredura do digital (rota do sistema, com login ou com o segredo do webhook):
//   { acao: "orcar", jid }       → monta o orçamento digital com o que a conversa já tem e manda (como o agente faria)
//   { acao: "reenviar", jid }    → manda de novo, com os valores na mensagem, o orçamento esperando o sinal
//   { acao: "proposta", jid }    → MQL com medida e quantidade: monta a proposta para você revisar e enviar (não envia)
//   { acao: "responder", jid }   → o agente responde agora a última mensagem do lead que ficou sem resposta (com
//                                  "desculpa a demora"), com as travas de sempre
// Sai pelo agente: a mensagem conta como dele e ele segue atendendo a conversa.
async function autorizado(req: NextRequest) {
  const segredo = process.env.WHATSAPP_WEBHOOK_SECRET
  if (segredo && req.headers.get("x-token") === segredo) return true
  return !!(await auth())
}

export async function POST(req: NextRequest) {
  if (!await autorizado(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })
  const { acao, jid } = await req.json().catch(() => ({})) as { acao?: string; jid?: string }
  if (!jid || !["orcar", "reenviar", "responder", "proposta"].includes(acao ?? "")) return NextResponse.json({ erro: "acao (orcar|reenviar|responder|proposta) e jid" }, { status: 400 })
  if (acao === "proposta") {
    const { atender } = await import("@/app/lib/atendenteServidor")
    const { prepararProposta } = await import("@/app/lib/propostaProntaServidor")
    const a = await atender(jid, { automatico: true }).catch(e => ({ ok: false as const, erro: String(e), status: 500 }))
    if (!a.ok) return NextResponse.json({ ok: false, erro: a.erro }, { status: 502 })
    if (a.conversa.clienteCadastrado) return NextResponse.json({ ok: false, motivo: "cliente da casa: o preço é seu" })
    const r = await prepararProposta(jid, a.r.dados, a.conversa.nome).catch(e => ({ ok: false as const, motivo: String(e) }))
    return NextResponse.json(r.ok ? { ok: true, proposta: r.proposta.id, nova: r.nova } : { ok: false, motivo: r.motivo })
  }
  if (acao === "responder") {
    const { data: ult } = await supabase.from("whatsapp_mensagens").select("id, from_me").eq("jid", jid).order("criado_em", { ascending: false }).limit(1).maybeSingle()
    if (!ult || ult.from_me) return NextResponse.json({ ok: true, enviou: false, motivo: "a última mensagem já é nossa" })
    const { responderSozinho } = await import("@/app/lib/agenteAuto")
    await responderSozinho(ult.id, { atrasada: true })
    const { data: depois } = await supabase.from("whatsapp_mensagens").select("from_me, corpo").eq("jid", jid).order("criado_em", { ascending: false }).limit(1).maybeSingle()
    return NextResponse.json({ ok: true, enviou: !!depois?.from_me, texto: depois?.from_me ? String(depois.corpo ?? "").slice(0, 160) : null })
  }
  const { data: conv } = await supabase.from("whatsapp_conversas").select("jid, nome, telefone, etiquetas, status_lead, proxima_acao").eq("jid", jid).maybeSingle()
  if (!conv) return NextResponse.json({ erro: "conversa não encontrada" }, { status: 404 })
  const c: Conversa = { jid: conv.jid, nome: conv.nome, telefone: conv.telefone, etiquetas: conv.etiquetas, status_lead: conv.status_lead }
  const cfg = await lerCfg()
  const abertos = (cfg.pedidosDigitais ?? []).filter(p => p.jid === jid && p.status === "aguardando_sinal")

  if (acao === "orcar") {
    if (abertos.length) return NextResponse.json({ erro: `já tem orçamento esperando o sinal (${abertos.map(p => p.id).join(", ")})` }, { status: 409 })
    const dados = dadosDaConversa(conv.proxima_acao)
    if (dados?.itens?.length) return NextResponse.json({ erro: "mais de uma caixa: orce pela conversa" }, { status: 422 })
    const cot = cotarDigital(dados, cfg.digital)
    if (!cot.ok) return NextResponse.json({ erro: cot.motivo }, { status: 422 })
    const novo = montarPedido(cfg.pedidosDigitais ?? [], jid, conv.nome, dados, cot)
    const env = await enviar(c, textoLinkPedido(novo, linkPedido(novo.id)), undefined, { proativo: true })
    if (!env.ids.length) return NextResponse.json({ erro: env.erro ?? "não enviou" }, { status: 502 })
    await gravarCfg(d => ({ pedidosDigitais: [novo, ...(d.pedidosDigitais ?? [])].slice(0, 500) }))
    return NextResponse.json({ ok: true, pedido: novo.id, total: novo.total })
  }

  // reenviar
  if (!abertos.length) return NextResponse.json({ erro: "nenhum orçamento esperando o sinal" }, { status: 404 })
  const base = abertos[0]
  const doGrupo = pedidosDoGrupo(cfg.pedidosDigitais, base).filter(p => p.status === "aguardando_sinal")
  const lista: PedidoDigital[] = doGrupo.length > 1 ? doGrupo : abertos
  const env = await enviar(c, textoReenvioDigital(conv.nome, itensDoLembrete(lista, linkPedido)), undefined, { proativo: true })
  if (!env.ids.length) return NextResponse.json({ erro: env.erro ?? "não enviou" }, { status: 502 })
  const ids = new Set(lista.map(p => p.id)), em = new Date().toISOString()
  await gravarCfg(d => ({ pedidosDigitais: (d.pedidosDigitais ?? []).map(p => ids.has(p.id) ? { ...p, reenviadoEm: em } : p) }))
  return NextResponse.json({ ok: true, pedidos: [...ids] })
}
