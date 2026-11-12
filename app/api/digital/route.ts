import { NextRequest, NextResponse } from "next/server"
import { lerPedido, gravarPedido, linkPedido, linkDesigner, mandarArte, mandarParaVilla, avisarDesigner, conversaDoPedido, ContatosDigital } from "@/app/lib/digitalServidor"
import { seuNumero, enviar } from "@/app/lib/agenteAuto"
import { pedidoDeTeste, textoLinkPedido, opcoesDoPedido, trocarQuantidade, aprovarNegociacao, recusarNegociacao, textoNegociacaoAprovada, textoNegociacaoRecusada } from "@/app/lib/digital"
import { supabase } from "@/app/lib/supabase"
import { mudarStatus, trocarFrete, restanteUnico, arteAtual, acertoDaSemana, PedidoComBriefing, StatusDigital, DIAS_VALIDADE_DIGITAL } from "@/app/lib/digital"
import { mudarConfig } from "@/app/lib/configAtomica"

type Dados = { pedidosDigitais?: PedidoComBriefing[]; digitalContatos?: ContatosDigital; digital?: import("@/app/lib/precoDigital").RegraDigital }

// Painel do braço digital (rota protegida pelo login): os pedidos dos últimos 45 dias com o link e o que o cliente fez
export async function GET() {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const d = (data?.data ?? {}) as Dados
  const todos = d.pedidosDigitais ?? []
  const desde = Date.now() - 45 * 86_400_000
  const pedidos = todos.filter(p => new Date(p.em).getTime() >= desde || (p.villaEnviadoEm && !p.acertadoEm)).map(p => ({
    id: p.id, jid: p.jid, nome: p.nome, em: p.em, ml: p.ml, medidas: p.medidas, padrao: p.padrao, folha: p.folha,
    quantidade: p.quantidade, total: p.total, sinal: p.sinal, custo: p.custo, arte: p.arte, margem: p.margem,
    status: p.status, sinalPagoEm: p.sinalPagoEm ?? null, statusEm: p.statusEm ?? null,
    vistoEm: p.vistoEm ?? null, ultimaVista: p.ultimaVista ?? null, vistas: p.vistas ?? 0, lembretes: p.lembretes ?? [],
    briefing: p.briefing ? { marca: p.briefing.marca ?? "", cores: p.briefing.cores ?? "", referencias: p.briefing.referencias ?? "", laminacao: p.briefing.laminacao ?? "fosca", arquivos: (p.briefing.arquivos ?? []).length } : null,
    teste: !!p.teste,
    vence: new Date(new Date(p.em).getTime() + DIAS_VALIDADE_DIGITAL * 86_400_000).toISOString(),
    link: linkPedido(p.id), linkDesigner: linkDesigner(p.id),
    opcoes: p.status === "aguardando_sinal" ? opcoesDoPedido(p, d.digital) : [],
    arteAtual: arteAtual(p), versoes: (p.artes ?? []).length, arteEnviadaEm: p.arteEnviadaEm ?? null, arteAprovadaEm: p.arteAprovadaEm ?? null,
    ajustes: p.ajustes ?? [], designerAvisadoEm: p.designerAvisadoEm ?? null, villaEnviadoEm: p.villaEnviadoEm ?? null,
    frete: p.frete ?? null, restante: p.restante ?? null, restantePagoEm: p.restantePagoEm ?? null, entrega: p.entrega ?? null, acertadoEm: p.acertadoEm ?? null,
    negociacao: p.negociacao ?? null, termosAceitosEm: p.termos?.em ?? null,
  }))
  const acerto = acertoDaSemana(todos)
  return NextResponse.json({ pedidos, contatos: d.digitalContatos ?? {}, acerto: { ids: acerto.itens.map(p => p.id), total: acerto.total } })
}

// POST { id, status } avança ou cancela · { id, acao } frete, arte, Villa, designer · { acertar: ids } · { contatos }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { teste?: boolean; id?: string; status?: StatusDigital; acao?: string; frete?: number; quantidade?: number; enviar?: boolean; acertar?: string[]; contatos?: ContatosDigital; decisao?: "aprovar" | "recusar" | "eu"; total?: number }

  // Pedido de teste: na sua conversa com você mesmo, com o link do pedido
  if (b.teste) {
    const num = await seuNumero()
    if (!num) return NextResponse.json({ erro: "Não achei o seu número no WhatsApp conectado." }, { status: 400 })
    const jid = `${num}@s.whatsapp.net`
    let novo: PedidoComBriefing | null = null
    await mudarConfig(d => { const todos = (d as Dados).pedidosDigitais ?? []; novo = pedidoDeTeste(todos, jid) as PedidoComBriefing; return { pedidosDigitais: [...todos, novo] } })
    const p = novo as unknown as PedidoComBriefing
    await enviar({ jid, nome: "Você", telefone: num, etiquetas: null, status_lead: null }, `*Teste* · ${textoLinkPedido(p, linkPedido(p.id))}`).catch(() => null)
    return NextResponse.json({ ok: true, id: p.id, link: linkPedido(p.id), linkDesigner: linkDesigner(p.id) })
  }
  if (b.contatos) {
    const num = (s?: string) => (s ?? "").replace(/\D/g, "").slice(0, 15)
    const c: ContatosDigital = { villa: num(b.contatos.villa), designer: num(b.contatos.designer), designerNome: (b.contatos.designerNome ?? "").trim().slice(0, 60) }
    await mudarConfig(() => ({ digitalContatos: c }))
    return NextResponse.json({ ok: true, contatos: c })
  }
  if (b.acertar?.length) {
    const ids = new Set(b.acertar)
    const em = new Date().toISOString()
    await mudarConfig(d => ({ pedidosDigitais: ((d as Dados).pedidosDigitais ?? []).map(p => ids.has(p.id) && p.villaEnviadoEm && !p.acertadoEm ? { ...p, acertadoEm: em } : p) }))
    return NextResponse.json({ ok: true })
  }

  if (!b.id) return NextResponse.json({ erro: "Faltou o pedido." }, { status: 400 })
  const { pedido, cfg } = await lerPedido(b.id)
  if (!pedido) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 })

  if (b.acao === "frete") {
    const novo = await gravarPedido(b.id, (p, todos) => trocarFrete(p, todos, Number(b.frete)) as PedidoComBriefing | null)
    return novo ? NextResponse.json({ ok: true }) : NextResponse.json({ erro: "Não dá para mudar o frete agora (restante já pago?)." }, { status: 400 })
  }
  // Você muda a quantidade (antes do sinal) e, se quiser, o cliente recebe o orçamento novo com o link
  if (b.acao === "quantidade") {
    const novo = await gravarPedido(b.id, (p, todos) => trocarQuantidade(todos, p, Number(b.quantidade), cfg.digital) as PedidoComBriefing | null)
    if (!novo) return NextResponse.json({ erro: "Não dá para mudar a quantidade (sinal já pago, ou quantidade fora da tabela)." }, { status: 400 })
    if (b.enviar) {
      const c = await conversaDoPedido(novo.jid)
      const env = c ? await enviar(c, textoLinkPedido(novo, linkPedido(novo.id)), undefined, { essencial: true }) : { ids: [], erro: "conversa não encontrada" }
      if (!env.ids.length) return NextResponse.json({ erro: `Quantidade mudou, mas a mensagem não saiu (${env.erro ?? "erro"}). Mande o link à mão.` }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  }
  // Negociação: aprova um valor (o pedido muda e o cliente recebe o valor novo pelo mesmo link), recusa (o cliente
  // recebe que esse já é o melhor valor) ou "eu" (você responde na conversa; só tira do painel)
  if (b.acao === "negociacao") {
    if (b.decisao === "aprovar") {
      const novo = await gravarPedido(b.id, (p, todos) => aprovarNegociacao(p, todos, Number(b.total)) as PedidoComBriefing | null)
      if (!novo) return NextResponse.json({ erro: "Não deu para mudar o valor (sinal já pago ou valor inválido)." }, { status: 400 })
      const c = await conversaDoPedido(novo.jid)
      const env = c ? await enviar(c, textoNegociacaoAprovada(novo, linkPedido(novo.id)), undefined, { essencial: true }) : { ids: [], erro: "conversa não encontrada" }
      return env.ids.length ? NextResponse.json({ ok: true }) : NextResponse.json({ erro: `Valor mudou, mas a mensagem não saiu (${env.erro ?? "erro"}). Avise o cliente à mão.` }, { status: 502 })
    }
    const novo = await gravarPedido(b.id, p => recusarNegociacao(p) as PedidoComBriefing | null)
    if (!novo) return NextResponse.json({ erro: "Essa negociação já foi decidida." }, { status: 400 })
    if (b.decisao === "recusar") {
      const c = await conversaDoPedido(novo.jid)
      const env = c ? await enviar(c, textoNegociacaoRecusada(novo, linkPedido(novo.id)), undefined, { essencial: true }) : { ids: [], erro: "conversa não encontrada" }
      if (!env.ids.length) return NextResponse.json({ erro: `A mensagem não saiu (${env.erro ?? "erro"}). Responda à mão.` }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  }
  if (b.acao === "mandarArte") {
    const r = await mandarArte(b.id)
    return r.erro ? NextResponse.json({ erro: r.erro }, { status: 400 }) : NextResponse.json({ ok: true })
  }
  if (b.acao === "villa") {
    if (!pedido.arteAprovadaEm) return NextResponse.json({ erro: "A arte ainda não foi aprovada." }, { status: 400 })
    await mandarParaVilla(cfg, pedido)
    return NextResponse.json({ ok: true })
  }
  if (b.acao === "designer") {
    const ok = await avisarDesigner(cfg, pedido)
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ erro: "Cadastre o WhatsApp da designer em Contatos." }, { status: 400 })
  }

  if (!b.status) return NextResponse.json({ erro: "Faltou o status." }, { status: 400 })
  // Arte → produção pelo painel = o cliente aprovou com você (no WhatsApp): o restante é calculado igual
  const novo = await gravarPedido(b.id, (p, todos) => {
    const n = mudarStatus(p, b.status!) as PedidoComBriefing | null
    if (!n || n.status !== "producao" || n.restante != null) return n
    return { ...n, arteAprovadaEm: n.arteAprovadaEm ?? new Date().toISOString(), restante: restanteUnico(n, todos) }
  })
  if (!novo) return NextResponse.json({ erro: "Esse status não vem agora." }, { status: 400 })
  return NextResponse.json({ ok: true, status: novo.status })
}
