// "Precisa de você": o que pede ação agora, em ordem de urgência.
// Fonte única para o Painel (computador) e para o celular.

import { KanbanCard, LancamentoFinanceiro, PropostaCustom, Cliente, FormData, COL_FECHADO, COL_PERDIDO, COL_HOT } from "../types"
import { Configuracoes } from "../config"
import { Pedido, producao, recebiveis, pedidoEntregue, isTerceirizado, parseData, diasAte, nomeChave } from "./negocio"
import { normalizarProducao } from "./producao"

export type TipoPendencia =
  | "aprovado" | "atrasado" | "fornecedor" | "cobrancaVencida" | "semCobranca"
  | "conferir" | "entregaProxima" | "orcamentoVencendo" | "semPrazo"

export type Pendencia = {
  id: string
  tipo: TipoPendencia
  tom: "perigo" | "alerta" | "info" | "sucesso"
  titulo: string
  sub: string
  valor?: number
  card?: KanbanCard                         // abre o pedido/orçamento
  whatsapp?: string                         // mensagem pronta
  cobrar?: Partial<LancamentoFinanceiro>    // cobrança pronta para lançar
  aprovacao?: NonNullable<Configuracoes["aprovacoesOnline"]>[number]
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const dataCurta = (iso?: string) => {
  const d = parseData(iso)
  return d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") : "—"
}
export const prazoTexto = (iso?: string, hoje = new Date()) => {
  if (!iso) return "sem prazo"
  const d = diasAte(iso, hoje)
  if (d < 0) return `atrasado ${-d} ${-d === 1 ? "dia" : "dias"}`
  if (d === 0) return "entrega hoje"
  if (d === 1) return "entrega amanhã"
  return `entrega em ${d} dias`
}

export const cardDoPedido = (p: Pedido) => p.cards.find(c => !isTerceirizado(c)) ?? p.cards[0]

export const linkWhatsApp = (telefone: string | undefined, texto: string) => {
  const tel = telefone?.replace(/\D/g, "")
  if (!tel) return undefined
  return `https://wa.me/${tel.length <= 11 ? "55" + tel : tel}?text=${encodeURIComponent(texto)}`
}

export function pendencias(args: {
  pedidos: Pedido[]
  kanban: KanbanCard[]
  lancamentos: LancamentoFinanceiro[]
  historico: { form: FormData; numero?: string }[]
  propostasCustom: PropostaCustom[]
  clientes: Cliente[]
  config: Configuracoes
  hoje?: Date
}): Pendencia[] {
  const { pedidos, kanban, lancamentos, historico, propostasCustom, clientes, config } = args
  const hoje = args.hoje ?? new Date()
  const hojeIso = hoje.toLocaleDateString("sv-SE")
  const prod = producao(pedidos, hoje)
  const rec = recebiveis(pedidos, lancamentos)
  const telefoneDe = (nome: string) => clientes.find(c => nomeChave(c.nome) === nomeChave(nome))?.telefone

  const validadeDe = (card: KanbanCard) =>
    historico.find(h => h.numero === card.numero)?.form?.validadeDias
    ?? propostasCustom.find(p => p.cardId === card.id)?.validadeDias
    ?? 30
  const vencendo = kanban
    .filter(c => c.coluna === 0 && !isTerceirizado(c))
    .map(c => {
      const d = parseData(c.data)
      if (!d) return null
      const vence = new Date(d.getTime() + validadeDe(c) * 86_400_000)
      return { card: c, dias: Math.ceil((vence.getTime() - hoje.getTime()) / 86_400_000) }
    })
    .filter((x): x is { card: KanbanCard; dias: number } => !!x && x.dias >= 0 && x.dias <= 3)
    .sort((a, b) => a.dias - b.dias)

  // Só enquanto o pedido continua fechado (voltar para orçamento desfaz a aprovação)
  // Cliente de relacionamento: só cobra depois dos dias combinados após a entrega
  const dentroDoPrazoCombinado = (p: Pedido) => {
    const rel = (config.clientesRelacionamento ?? []).find(r => nomeChave(r.nome) === nomeChave(p.nomeCliente))
    const entrega = p.dataEntregaReal ?? p.dataEntregaPrevista
    if (!rel) return false
    if (!entrega) return true   // sem data de entrega: conta a partir de hoje (igual à previsão de caixa)
    const limite = new Date(entrega.slice(0, 10) + "T12:00:00"); limite.setDate(limite.getDate() + rel.diasAposEntrega)
    return limite.toLocaleDateString("sv-SE") >= hojeIso
  }
  const aprovados = (config.aprovacoesOnline ?? []).filter(a => !a.visto && !a.desfeita
    && kanban.some(c => c.id === a.cardId && c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO && c.coluna !== COL_HOT))
  const fornecedorAtrasado = normalizarProducao(config.producao).movimentos.filter(m => !m.recebidoEm && m.prazoPrevisto && m.prazoPrevisto < hojeIso)

  return [
    ...aprovados.map(a => ({
      id: `apr-${a.numero}`, tipo: "aprovado" as const, tom: "sucesso" as const, aprovacao: a,
      titulo: `${a.numero} · ${a.nomeCliente}`,
      sub: a.tipo === "recompra" ? `repetiu ${a.pedidoOrigem} pela página do cliente · ${a.quantidade.toLocaleString("pt-BR")} un · mesmo preço`
        : a.tipo === "recompra_qtd" ? `quer repetir ${a.pedidoOrigem} com ${a.quantidade.toLocaleString("pt-BR")} un · faça o orçamento`
        : `aprovado online por ${a.aprovadoPor} · ${a.quantidade.toLocaleString("pt-BR")} un · ${new Date(a.em).toLocaleDateString("pt-BR")}`,
      valor: a.preco || undefined, card: kanban.find(k => k.id === a.cardId),
    })),
    ...prod.atrasados.map(p => ({
      id: `atr-${p.key}`, tipo: "atrasado" as const, tom: "perigo" as const,
      titulo: `${p.numero} · ${p.nomeCliente}`, sub: `${prazoTexto(p.dataEntregaPrevista, hoje)} · ${p.etapa}`,
      valor: p.valor, card: cardDoPedido(p),
    })),
    ...fornecedorAtrasado.map(m => ({
      id: `forn-${m.id}`, tipo: "fornecedor" as const, tom: "perigo" as const,
      titulo: m.pedidoLabel, sub: `fornecedor passou do prazo (${dataCurta(m.prazoPrevisto)})`,
    })),
    ...rec.comSaldo.filter(p => p.vencido > 0.5).map(p => ({
      id: `rec-${p.key}`, tipo: "cobrancaVencida" as const, tom: "perigo" as const,
      titulo: `${p.numero} · ${p.nomeCliente}`,
      sub: `cobrança vencida${p.semCobranca > 0.5 ? ` · mais ${brl(p.semCobranca)} sem cobrança` : ""}`,
      valor: p.vencido, card: cardDoPedido(p),
      whatsapp: linkWhatsApp(telefoneDe(p.nomeCliente), `Olá! Tudo bem? Passando para lembrar do pagamento do pedido ${p.numero}, no valor de ${brl(p.vencido)}, que já venceu. Se já pagou, pode desconsiderar. Qualquer dúvida, estou à disposição!`),
    })),
    ...rec.comSaldo.filter(p => pedidoEntregue(p) && p.semCobranca > 0.5 && !dentroDoPrazoCombinado(p)).map(p => {
      const c = cardDoPedido(p)
      return {
        id: `sc-${p.key}`, tipo: "semCobranca" as const, tom: "alerta" as const,
        titulo: `${p.numero} · ${p.nomeCliente}`, sub: "entregue e sem cobrança lançada",
        valor: p.semCobranca, card: c,
        cobrar: {
          tipo: "receita" as const, valor: Math.round(p.semCobranca * 100) / 100, descricao: `Saldo ${p.numero} — ${p.nomeCliente}`,
          categoria: "saldo-final", nomeCliente: p.nomeCliente, dataVencimento: hojeIso,
          ...(c.loteId ? { loteId: c.loteId, loteNumero: c.loteNumero } : { cardId: c.id, cardNumero: c.numero }),
        },
      }
    }),
    ...(rec.aConferir.length ? [{
      id: "conferir", tipo: "conferir" as const, tom: "info" as const,
      titulo: `${rec.aConferir.length} ${rec.aConferir.length === 1 ? "cobrança para conferir" : "cobranças para conferir"}`,
      sub: "pendentes em pedidos já quitados ou fora do quadro: confira e dê baixa",
      valor: rec.aConferir.reduce((s, l) => s + l.valor, 0),
    }] : []),
    ...prod.vencendo3d.map(p => ({
      id: `ven-${p.key}`, tipo: "entregaProxima" as const, tom: "alerta" as const,
      titulo: `${p.numero} · ${p.nomeCliente}`, sub: `${prazoTexto(p.dataEntregaPrevista, hoje)} · ${p.etapa}`,
      valor: p.valor, card: cardDoPedido(p),
    })),
    ...vencendo.map(({ card, dias }) => ({
      id: `orc-${card.id}`, tipo: "orcamentoVencendo" as const, tom: "alerta" as const,
      titulo: `${card.numero} · ${card.nomeCliente}`,
      sub: `orçamento ${dias === 0 ? "vence hoje" : dias === 1 ? "vence amanhã" : `vence em ${dias} dias`} sem resposta`,
      valor: card.preco, card,
      whatsapp: linkWhatsApp(telefoneDe(card.nomeCliente), `Olá! Tudo bem? Passando para saber se conseguiu avaliar o orçamento ${card.numero}. Ele vale até ${dias === 0 ? "hoje" : dias === 1 ? "amanhã" : `daqui a ${dias} dias`}. Posso ajudar em algo?`),
    })),
    ...prod.semPrazo.map(p => ({
      id: `sem-${p.key}`, tipo: "semPrazo" as const, tom: "info" as const,
      titulo: `${p.numero} · ${p.nomeCliente}`, sub: `em produção sem data de entrega · ${p.etapa}`,
      valor: p.valor, card: cardDoPedido(p),
    })),
  ]
}
