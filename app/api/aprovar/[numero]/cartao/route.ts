import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { tokenValido } from "@/app/lib/aprovacao"
import { carregarProposta } from "@/app/lib/propostaPublica"
import { gravarCampos } from "@/app/lib/configAtomica"
import { isAberto } from "@/app/lib/negocio"
import { infinitePayConfigurado, criarLinkInfinitePay, orderNsu, VERSAO_LINK } from "@/app/lib/infinitePay"
import { LINK_SISTEMA } from "@/app/lib/notificar"
import type { PagamentoCartao } from "@/app/lib/cartaoAprovacao"

// Abre o pagamento do pedido inteiro (100%) na InfinitePay e devolve o link. O valor é sempre o do pedido.
// Reaproveita o link aberto há menos de 2 h com o mesmo valor (cliente que volta e tenta de novo).
export async function POST(req: NextRequest, { params }: { params: Promise<{ numero: string }> }) {
  const numero = decodeURIComponent((await params).numero)
  const body = await req.json().catch(() => ({})) as { t?: string; nome?: string }
  if (!tokenValido(numero, body.t)) return NextResponse.json({ erro: "Link inválido." }, { status: 403 })
  if (!infinitePayConfigurado()) return NextResponse.json({ erro: "Pagamento no cartão indisponível agora. Pague pelo Pix ou fale com a Enyla." }, { status: 503 })

  const p = await carregarProposta(numero)
  if (!p) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 })
  if (isAberto(p.card)) return NextResponse.json({ erro: "Aprove a proposta antes de pagar." }, { status: 409 })
  const total = Math.round(Number(p.card.preco) * 100) / 100
  if (!(total > 0)) return NextResponse.json({ erro: "Pedido sem valor. Fale com a Enyla." }, { status: 400 })

  const { data: cfgRow } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const pagamentos = ((cfgRow?.data as Record<string, unknown> | null)?.pagamentosCartao ?? {}) as Record<string, PagamentoCartao>
  const atual = pagamentos[numero]
  if (atual?.baixado) return NextResponse.json({ erro: "Este pedido já está pago.", jaPago: true }, { status: 409 })
  if (atual?.url && atual.v === VERSAO_LINK && atual.valor === total && atual.em && Date.now() - new Date(atual.em).getTime() < 2 * 3600_000) return NextResponse.json({ ok: true, url: atual.url })

  const nsu = orderNsu(numero)
  const voltarPara = `${LINK_SISTEMA}/aprovar/${encodeURIComponent(numero)}?t=${encodeURIComponent(body.t!)}`
  const link = await criarLinkInfinitePay({
    numero, nsu, valor: total, voltarPara,
    descricao: `Pedido ${numero} · ${(p.card.quantidade ?? 0).toLocaleString("pt-BR")} embalagens Enyla`,
    // A InfinitePay recusa nome com menos de 3 letras: usa o do pedido, e só manda se for válido
    cliente: (() => { const n = [String(body.nome ?? ""), String(p.card.nomeCliente ?? "")].map(x => x.trim().replace(/\s+/g, " ")).find(x => x.length >= 3 && /[a-zA-ZÀ-ú]/.test(x)); return n ? { name: n.slice(0, 80) } : undefined })(),
  })
  if ("erro" in link) return NextResponse.json({ erro: link.erro }, { status: 502 })
  await gravarCampos({ pagamentosCartao: { ...pagamentos, [numero]: { v: VERSAO_LINK, orderNsu: nsu, url: link.url, status: "aguardando", valor: total, em: new Date().toISOString() } } })
  return NextResponse.json({ ok: true, url: link.url })
}
