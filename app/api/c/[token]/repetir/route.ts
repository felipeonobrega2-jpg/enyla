import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { carregarPortal } from "@/app/lib/portalCliente"
import { criarLote } from "@/app/lib/lotes"
import { SINAL_PCT_PADRAO } from "@/app/lib/aprovacao"
import { somarDiasUteis, definirFeriadosLocais } from "@/app/lib/diasUteis"
import { normalizarProducao } from "@/app/lib/producao"
import { CONFIG_PADRAO } from "@/app/config"
import { AprovacaoOnline, COL_FECHADO, COLUNAS_KANBAN } from "@/app/types"

// Cliente repete um pedido pela página dele.
//   Mesma quantidade → pedido novo fechado com o preço do último pedido (+ Pix do sinal)
//   Outra quantidade → pedido de recompra para a Enyla orçar (Painel avisa)
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json().catch(() => ({})) as { key?: string; quantidade?: number; obs?: string }
  const portal = await carregarPortal(token)
  if (!portal) return NextResponse.json({ erro: "Link inválido." }, { status: 403 })
  const origem = portal.pedidos.find(p => p.key === body.key && p.coluna >= COL_FECHADO)
  if (!origem) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 })

  const { data: cfgRow } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (cfgRow?.data ?? {}) as Record<string, unknown>
  const avisar = async (a: AprovacaoOnline) => {
    const lista = [a, ...((cfg.aprovacoesOnline as AprovacaoOnline[] | undefined) ?? [])].slice(0, 100)
    await supabase.from("AppConfig").update({ data: { ...cfg, aprovacoesOnline: lista } }).eq("id", 1)
  }
  const agora = new Date()
  const hoje = agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
  const dataBR = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
  const qtdPedida = Math.round(Number(body.quantidade) || origem.quantidade)

  // Outra quantidade: a Enyla orça (o preço do último pedido vale para a mesma quantidade)
  if (qtdPedida !== origem.quantidade) {
    await avisar({
      tipo: "recompra_qtd", numero: origem.numero, cardId: origem.cards[0].id, nomeCliente: portal.nome,
      aprovadoPor: portal.nome, quantidade: qtdPedida, preco: 0, sinal: 0, em: agora.toISOString(), pedidoOrigem: origem.numero,
    })
    return NextResponse.json({ ok: true, tipo: "orcamento" })
  }

  // Mesma quantidade: pedido novo, fechado, preço do último pedido
  const { data: cont } = await supabase.from("Contador").select("valor").eq("chave", "rep").maybeSingle()
  let seq = (cont?.valor as number | undefined) ?? 0
  const ano = agora.getFullYear()
  const { data: originais } = await supabase.from("KanbanCard").select("*").in("id", origem.cards.map(c => c.id))
  const prod = normalizarProducao(cfg.producao as never)
  definirFeriadosLocais((cfg.feriados ?? CONFIG_PADRAO.feriados) as never)
  const lote = await criarLote(portal.nome, `Recompra de ${origem.numero}`)
  const entrega = somarDiasUteis(hoje, prod.prazoEntregaPadraoDias)

  const novos: { id: string; numero: string; preco: number; quantidade: number }[] = []
  for (const o of originais ?? []) {
    seq++
    const numero = `REP-${ano}-${String(seq).padStart(3, "0")}`
    const id = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`
    const { createdAt: _c, id: _i, numero: _n, ...copia } = o as Record<string, unknown>
    void _c; void _i; void _n
    // Metadados guardados em opcoes._x: prazos e prazo interno são do pedido antigo, não da recompra
    const op = copia.opcoes as { _items?: unknown[]; _x?: Record<string, unknown> } | unknown[] | null
    if (op && !Array.isArray(op) && op._x) {
      const x = { ...op._x }; delete x.prazos; delete x.prazoRecebimentoInterno
      copia.opcoes = Object.keys(x).length ? { ...op, _x: x } : (op._items ?? null)
    }
    const { error } = await supabase.from("KanbanCard").insert({
      ...copia, id, numero, data: dataBR, coluna: COL_FECHADO, dataFechamento: hoje, dataEntregaPrevista: entrega,
      dataEntregaReal: null, motivoPerdido: null, loteId: lote.id, loteNumero: lote.numero,
    })
    if (error) {
      console.error("recompra: falha ao criar card", error)
      return NextResponse.json({ erro: "Não deu para registrar a recompra agora. Fale com a Enyla." }, { status: 500 })
    }
    // Orçamento original copiado: motor, custos de produção e calibragem continuam valendo
    const { data: hist } = await supabase.from("HistoricoItem").select("form, calculo").eq("numero", o.numero).maybeSingle()
    if (hist) await supabase.from("HistoricoItem").upsert({ id: crypto.randomUUID(), numero, form: hist.form, calculo: hist.calculo, data: dataBR }, { onConflict: "numero" })
    await supabase.from("Tracking").upsert({
      numero, nomeCliente: portal.nome, descricao: o.dimensoes ?? "", materialNome: o.materialNome ?? "", quantidade: o.quantidade, preco: o.preco,
      colunaAtual: COL_FECHADO, dataEntregaPrevista: entrega, criadoEm: dataBR,
      etapas: [
        { coluna: 0, nome: "Recompra pedida pelo cliente", dataHora: dataBR, tipo: "criacao", detalhe: `repetição de ${origem.numero}` },
        { coluna: COL_FECHADO, nome: COLUNAS_KANBAN[COL_FECHADO], dataHora: dataBR, tipo: "coluna" },
      ],
    }, { onConflict: "numero" })
    novos.push({ id, numero, preco: Number(o.preco) || 0, quantidade: Number(o.quantidade) || 0 })
  }
  await supabase.from("Contador").upsert({ chave: "rep", valor: seq }, { onConflict: "chave" })

  const total = novos.reduce((s, n) => s + n.preco, 0)
  const sinal = Math.round(total * ((cfg.sinalPct as number | undefined) ?? SINAL_PCT_PADRAO)) / 100
  await avisar({
    tipo: "recompra", numero: lote.numero, cardId: novos[0]?.id ?? "", nomeCliente: portal.nome, aprovadoPor: portal.nome,
    quantidade: novos.reduce((s, n) => s + n.quantidade, 0), preco: total, sinal, em: agora.toISOString(), pedidoOrigem: origem.numero,
  })
  const pix = `/pix/${encodeURIComponent(lote.numero)}?v=${sinal.toFixed(2)}&c=${encodeURIComponent(portal.nome)}`
  return NextResponse.json({ ok: true, tipo: "pedido", numero: lote.numero, total, sinal, pix })
}
