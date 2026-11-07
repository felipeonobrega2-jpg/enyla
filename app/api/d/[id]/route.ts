import { NextRequest, NextResponse, after } from "next/server"
import { auth } from "@/auth"
import { lerPedido, gravarPedido, tokenDigitalValido, conferirSinais } from "@/app/lib/digitalServidor"
import { opcoesDoPedido, trocarQuantidade, PedidoComBriefing } from "@/app/lib/digital"
import type { RegraDigital } from "@/app/lib/precoDigital"

// Página pública do pedido digital (/d/DIG-0001?t=…): só com o link assinado. Nunca devolve custo nem margem.
const publico = (p: PedidoComBriefing, regra?: RegraDigital) => ({
  id: p.id, nome: p.nome, ml: p.ml, produto: p.produto, medidas: p.medidas, padrao: p.padrao, folha: p.folha,
  quantidade: p.quantidade, total: p.total, sinal: p.sinal, status: p.status, sinalPagoEm: p.sinalPagoEm ?? null,
  briefing: { marca: p.briefing?.marca ?? "", cores: p.briefing?.cores ?? "", referencias: p.briefing?.referencias ?? "", arquivos: p.briefing?.arquivos ?? [] },
  opcoes: opcoesDoPedido(p, regra),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id)
  if (!tokenDigitalValido(id, req.nextUrl.searchParams.get("t"))) return NextResponse.json({ erro: "Link inválido." }, { status: 403 })
  const { pedido, cfg } = await lerPedido(id)
  if (!pedido || pedido.status === "cancelado") return NextResponse.json({ erro: "Este orçamento não está mais disponível. Fale com a gente no WhatsApp." }, { status: 404 })
  // Quando o cliente abriu a página (para o seu painel; no máximo uma gravação a cada 10 min)
  // Você logado (abrindo pelo painel) não conta
  const voce = !!(await auth().catch(() => null))
  if (!voce && (!pedido.ultimaVista || Date.now() - new Date(pedido.ultimaVista).getTime() > 10 * 60_000))
    after(() => gravarPedido(id, p => ({ ...p, vistoEm: p.vistoEm ?? new Date().toISOString(), ultimaVista: new Date().toISOString(), vistas: (p.vistas ?? 0) + 1 })).then(() => undefined).catch(() => undefined))
  return NextResponse.json(publico(pedido, cfg.digital))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id)
  const b = await req.json().catch(() => ({})) as { t?: string; acao?: string; quantidade?: number; marca?: string; cores?: string; referencias?: string }
  if (!tokenDigitalValido(id, b.t)) return NextResponse.json({ erro: "Link inválido." }, { status: 403 })
  const { pedido, cfg } = await lerPedido(id)
  if (!pedido || pedido.status === "cancelado") return NextResponse.json({ erro: "Orçamento indisponível." }, { status: 404 })

  if (b.acao === "quantidade") {
    const novo = await gravarPedido(id, (p, todos) => trocarQuantidade(todos, p, Number(b.quantidade), cfg.digital) as PedidoComBriefing | null)
    if (!novo) return NextResponse.json({ erro: pedido.status === "aguardando_sinal" ? "Escolha uma das quantidades." : "O sinal já foi pago: para mudar a quantidade, fale com a gente." }, { status: 400 })
    return NextResponse.json(publico(novo, cfg.digital))
  }
  if (b.acao === "briefing") {
    const corta = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n)
    const novo = await gravarPedido(id, p => ({ ...p, briefing: { ...(p.briefing ?? {}), marca: corta(b.marca, 80), cores: corta(b.cores, 200), referencias: corta(b.referencias, 1000), em: new Date().toISOString() } }))
    return NextResponse.json(publico(novo ?? pedido, cfg.digital))
  }
  if (b.acao === "conferir") {
    await conferirSinais({ forcar: true }).catch(() => null)
    const { pedido: atual } = await lerPedido(id)
    return NextResponse.json(publico(atual ?? pedido, cfg.digital))
  }
  return NextResponse.json({ erro: "Ação desconhecida." }, { status: 400 })
}
