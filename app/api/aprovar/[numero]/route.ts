import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { tokenValido, AprovacaoOnline, SINAL_PCT_PADRAO } from "@/app/lib/aprovacao"
import { carregarProposta } from "@/app/lib/propostaPublica"
import { somarDiasUteis, definirFeriadosLocais } from "@/app/lib/diasUteis"
import { CONFIG_PADRAO } from "@/app/config"
import { normalizarProducao } from "@/app/lib/producao"
import { COL_FECHADO, COL_HOT, COLUNAS_KANBAN } from "@/app/types"
import { isAberto } from "@/app/lib/negocio"
import { gravarCampos } from "@/app/lib/configAtomica"
import { criarLote } from "@/app/lib/lotes"
import { notificar, LINK_SISTEMA } from "@/app/lib/notificar"
import type { KanbanCard } from "@/app/types"
import { VERSAO_TERMOS_OFFSET } from "@/app/lib/termosOffset"

// Fechamento automático: cria o lote (se o card não tem) e a cobrança do sinal pendente no lote.
// Quando o Pix cai no banco, a conciliação reconhece essa cobrança e marca como paga.
async function fecharSozinho(card: KanbanCard, numero: string, sinal: number, hoje: string) {
  let loteId = card.loteId, loteNumero = card.loteNumero
  if (!loteId) {
    const l = await criarLote(card.nomeCliente)
    loteId = l.id; loteNumero = l.numero
    await supabase.from("KanbanCard").update({ loteId, loteNumero }).eq("id", card.id)
  }
  if (!(sinal > 0)) return { loteId, loteNumero }
  const id = crypto.randomUUID()
  const { error } = await supabase.from("LancamentoFinanceiro").insert({
    id, tipo: "receita", descricao: `Sinal · ${numero}`, valor: sinal, dataVencimento: hoje, dataPagamento: null,
    status: "pendente", cardId: null, cardNumero: numero, nomeCliente: card.nomeCliente, loteId, loteNumero,
    categoria: "sinal", formaPagamento: "pix", obs: "Criado ao aprovar online", criadoEm: new Date().toISOString(),
  })
  return error ? { loteId, loteNumero } : { loteId, loteNumero, lancamentoSinal: id }
}

// Cliente aprova o orçamento pela página pública. Fecha o card, registra no rastreio
// e deixa a aprovação para o painel avisar (sinal e lote ficam com a Enyla).
export async function POST(req: NextRequest, { params }: { params: Promise<{ numero: string }> }) {
  const numero = decodeURIComponent((await params).numero)
  const body = await req.json().catch(() => ({})) as { t?: string; quantidade?: number; nome?: string; termos?: string }
  if (!tokenValido(numero, body.t)) return NextResponse.json({ erro: "Link inválido." }, { status: 403 })

  const p = await carregarProposta(numero)
  if (!p) return NextResponse.json({ erro: "Orçamento não encontrado." }, { status: 404 })
  if (!isAberto(p.card)) return NextResponse.json({ erro: "Este orçamento já foi aprovado.", jaAprovado: true }, { status: 409 })
  if (p.vencida) return NextResponse.json({ erro: "Esta proposta venceu. Fale com a gente para atualizar os valores." }, { status: 410 })
  const opcao = p.opcoes.find(o => o.quantidade === Number(body.quantidade))
  if (!opcao) return NextResponse.json({ erro: "Escolha uma das quantidades da proposta." }, { status: 400 })
  const nome = String(body.nome ?? "").trim().slice(0, 80)
  if (nome.length < 2) return NextResponse.json({ erro: "Informe o seu nome." }, { status: 400 })
  // Os termos aceitos são os desta versão (página aberta antes de uma mudança: pede para recarregar)
  if (body.termos !== VERSAO_TERMOS_OFFSET) return NextResponse.json({ erro: "Os termos do pedido foram atualizados. Recarregue a página e aprove de novo." }, { status: 409 })
  const termos = { versao: VERSAO_TERMOS_OFFSET, em: new Date().toISOString() }

  const { data: cfgRow } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (cfgRow?.data ?? {}) as Record<string, unknown>
  const prod = normalizarProducao(cfg.producao as never)
  definirFeriadosLocais((cfg.feriados ?? CONFIG_PADRAO.feriados) as never)
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

  const patch: Record<string, unknown> = { coluna: COL_FECHADO, preco: opcao.preco, quantidade: opcao.quantidade, dataFechamento: hoje }
  if (prod.automacoes.prazoEntrega && !p.card.dataEntregaPrevista) patch.dataEntregaPrevista = somarDiasUteis(hoje, prod.prazoEntregaPadraoDias)
  // Só fecha se ainda estiver em aberto (orçamento ou lead quente) (evita aprovar duas vezes em cliques simultâneos)
  const { data: atualizado } = await supabase.from("KanbanCard").update(patch).eq("numero", numero).in("coluna", [0, COL_HOT]).select("id")
  if (!atualizado?.length) return NextResponse.json({ erro: "Este orçamento já foi aprovado.", jaAprovado: true }, { status: 409 })

  // Rastreio: etapa de fechamento com quem aprovou
  const { data: track } = await supabase.from("Tracking").select("*").eq("numero", numero).maybeSingle()
  if (track) {
    const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    const etapas = [...(track.etapas ?? []),
      { coluna: COL_FECHADO, nome: COLUNAS_KANBAN[COL_FECHADO], dataHora, tipo: "coluna" },
      { coluna: COL_FECHADO, nome: "Aprovado pelo cliente", dataHora, tipo: "aprovacao", detalhe: `${nome} · ${opcao.quantidade.toLocaleString("pt-BR")} un · termos ${termos.versao} aceitos` }]
    await supabase.from("Tracking").update({
      colunaAtual: COL_FECHADO, etapas, preco: opcao.preco, quantidade: opcao.quantidade,
      ...(patch.dataEntregaPrevista ? { dataEntregaPrevista: patch.dataEntregaPrevista } : {}),
    }).eq("numero", numero)
  }

  // Aviso para o painel (campo do servidor: salvar a configuração na tela não apaga)
  const sinal = Math.round(opcao.preco * ((cfg.sinalPct as number | undefined) ?? SINAL_PCT_PADRAO)) / 100
  const aprovacao: AprovacaoOnline = {
    numero, cardId: p.card.id, nomeCliente: p.card.nomeCliente, aprovadoPor: nome,
    quantidade: opcao.quantidade, preco: opcao.preco, sinal, em: new Date().toISOString(), termos,
    ...(await fecharSozinho(p.card, numero, sinal, hoje).catch(() => ({}))),
  }
  const lista = [aprovacao, ...((cfg.aprovacoesOnline as AprovacaoOnline[] | undefined) ?? [])].slice(0, 100)
  await gravarCampos({ aprovacoesOnline: lista })

  await notificar("Proposta aprovada pelo cliente", `${opcao.quantidade.toLocaleString("pt-BR")} caixas · ${opcao.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · sinal ${sinal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`, { prioridade: "alta", tags: ["tada"], link: `${LINK_SISTEMA}/?aba=painel` }).catch(() => null)

  const pix = `/pix/${encodeURIComponent(numero)}?v=${sinal.toFixed(2)}&c=${encodeURIComponent(p.card.nomeCliente)}`
  return NextResponse.json({ ok: true, sinal, pix, rastreio: `/track/${encodeURIComponent(numero)}` })
}
