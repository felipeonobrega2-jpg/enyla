// Auditor de dados: confere, com regras exatas (sem IA), se os números do sistema batem entre si — pedidos,
// financeiro, banco, digital e WhatsApp. Cada problema tem uma chave estável (para você marcar "está certo"),
// a gravidade, quanto dinheiro está em jogo e onde abrir para corrigir. Puro: o servidor busca os dados.
import type { KanbanCard, LancamentoFinanceiro } from "../types"
import { COL_FECHADO, COL_ENTREGUE, COL_PERDIDO } from "../types"

export type Area = "pedidos" | "financeiro" | "banco" | "digital" | "whatsapp"
export type Gravidade = "alta" | "media" | "baixa"
export type RefProblema = { cardId?: string; cardNumero?: string; lancamentoId?: string; txId?: string; jid?: string; digitalId?: string }
export type Problema = { id: string; regra: string; titulo: string; detalhe: string; valor: number | null; ref: RefProblema; data?: string | null }
export type ResultadoRegra = { id: string; nome: string; area: Area; gravidade: Gravidade; explica: string; problemas: Problema[] }
export type Auditoria = {
  em: string; regras: ResultadoRegra[]
  conferidos: number; comProblema: number; confianca: number   // % dos registros sem nenhum problema
  graves: number; total: number; valorEmJogo: number; ignorados: number
}

export type TxAuditoria = { id: string; data: string; valor: number; tipo: string; estado: string; descricao: string; lancamento_ids: string[] | null }
export type PedidoAuditoria = { id: string; nome?: string | null; status: string; total: number; em: string; sinalPagoEm?: string; teste?: boolean }
export type ConversaAuditoria = { jid: string; nome: string | null; kanban_card_id: string | null }

const DIA = 86_400_000
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const dataBR = (d?: string | null) => d ? d.slice(0, 10).split("-").reverse().join("/") : ""
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()
const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n)
const dentro = (d: string | null | undefined, desde: string) => !!d && d.slice(0, 10) >= desde

// Quanto de diferença é tolerado entre o pedido e o que foi lançado (arredondamento, taxa pequena)
export const tolerancia = (valor: number) => Math.max(5, Math.abs(valor) * 0.02)

export function auditar(a: {
  cards: KanbanCard[]; lancamentos: LancamentoFinanceiro[]; transacoes: TxAuditoria[]; pedidosDigitais: PedidoAuditoria[]; conversas: ConversaAuditoria[]
  hoje: string; ignorados?: string[]; janelaDias?: number
}): Auditoria {
  const hoje = a.hoje
  const desde = new Date(new Date(hoje).getTime() - (a.janelaDias ?? 180) * DIA).toISOString().slice(0, 10)
  const ignorados = new Set(a.ignorados ?? [])
  const cardPorId = new Map(a.cards.map(c => [c.id, c]))
  const lancPorId = new Map(a.lancamentos.map(l => [l.id, l]))
  const receitasDoCard = new Map<string, LancamentoFinanceiro[]>()
  for (const l of a.lancamentos) if (l.tipo === "receita" && l.cardId && l.categoria !== "sobra") receitasDoCard.set(l.cardId, [...(receitasDoCard.get(l.cardId) ?? []), l])
  const nomeCard = (c: KanbanCard) => `${c.numero} · ${c.nomeCliente}`
  const fechado = (c: KanbanCard) => c.coluna >= COL_FECHADO && c.coluna <= COL_ENTREGUE
  const recente = (c: KanbanCard) => dentro(c.dataFechamento ?? c.data, desde)
  const regras: ResultadoRegra[] = []
  const regra = (id: string, nome: string, area: Area, gravidade: Gravidade, explica: string, problemas: Problema[]) =>
    regras.push({ id, nome, area, gravidade, explica, problemas })

  // ── Pedidos × financeiro ─────────────────────────────────────────────────
  const fechadosRecentes = a.cards.filter(c => fechado(c) && recente(c) && !c.loteId && ok(c.preco) && c.preco > 0)
  regra("receita_faltando", "Pedido fechado sem receita lançada", "pedidos", "alta",
    "Pedido fechado precisa ter a receita no financeiro (sinal e restante). Sem ela, o faturamento e o DRE ficam menores do que a realidade.",
    fechadosRecentes.filter(c => !(receitasDoCard.get(c.id)?.length)).map(c => ({
      id: `receita_faltando:${c.id}`, regra: "receita_faltando", titulo: nomeCard(c), detalhe: `Pedido de ${brl(c.preco)} sem nenhuma receita ligada`,
      valor: c.preco, ref: { cardId: c.id, cardNumero: c.numero }, data: c.dataFechamento ?? c.data,
    })))
  regra("receita_diverge", "Receita diferente do valor do pedido", "pedidos", "media",
    "A soma das receitas ligadas ao pedido (pagas e a receber) não bate com o valor do pedido. Falta lançar uma parte, ou lançou a mais.",
    fechadosRecentes.flatMap(c => {
      const ls = receitasDoCard.get(c.id) ?? []
      if (!ls.length) return []
      const soma = ls.reduce((t, l) => t + (ok(l.valor) ? l.valor : 0), 0)
      const dif = soma - c.preco
      if (Math.abs(dif) <= tolerancia(c.preco)) return []
      return [{ id: `receita_diverge:${c.id}:${Math.round(soma)}`, regra: "receita_diverge", titulo: nomeCard(c),
        detalhe: `Pedido ${brl(c.preco)} · lançado ${brl(soma)} (${dif > 0 ? "sobra" : "falta"} ${brl(Math.abs(dif))})`, valor: Math.abs(dif), ref: { cardId: c.id, cardNumero: c.numero }, data: c.dataFechamento ?? c.data }]
    }))
  regra("perdido_com_receita", "Pedido perdido com dinheiro recebido", "pedidos", "alta",
    "O pedido está como perdido, mas tem receita paga ligada. Ou ele não foi perdido, ou o dinheiro é de outro pedido.",
    a.cards.filter(c => c.coluna === COL_PERDIDO).flatMap(c => {
      const pago = (receitasDoCard.get(c.id) ?? []).filter(l => l.status === "pago").reduce((t, l) => t + l.valor, 0)
      return pago > 0 ? [{ id: `perdido_com_receita:${c.id}`, regra: "perdido_com_receita", titulo: nomeCard(c), detalhe: `${brl(pago)} recebido em pedido perdido`, valor: pago, ref: { cardId: c.id, cardNumero: c.numero }, data: c.data }] : []
    }))
  regra("entregue_sem_data", "Entregue sem data de entrega", "pedidos", "baixa",
    "Sem a data real de entrega, o prazo médio e os atrasos ficam errados.",
    a.cards.filter(c => c.coluna === COL_ENTREGUE && recente(c) && !c.dataEntregaReal).map(c => ({
      id: `entregue_sem_data:${c.id}`, regra: "entregue_sem_data", titulo: nomeCard(c), detalhe: "Marcado como entregue, sem a data", valor: null, ref: { cardId: c.id, cardNumero: c.numero }, data: c.data,
    })))
  const porNumero = new Map<string, KanbanCard[]>()
  for (const c of a.cards) if (c.numero) porNumero.set(c.numero.trim(), [...(porNumero.get(c.numero.trim()) ?? []), c])
  regra("numero_duplicado", "Número de orçamento repetido", "pedidos", "media",
    "Dois pedidos com o mesmo número confundem o financeiro, o WhatsApp e o cliente.",
    [...porNumero.entries()].filter(([, cs]) => cs.length > 1).map(([n, cs]) => ({
      id: `numero_duplicado:${n}`, regra: "numero_duplicado", titulo: n, detalhe: `${cs.length} pedidos: ${cs.map(c => c.nomeCliente).join(", ")}`, valor: null, ref: { cardId: cs[0].id, cardNumero: n }, data: cs[0].data,
    })))

  // ── Financeiro ───────────────────────────────────────────────────────────
  const recentes = a.lancamentos.filter(l => dentro(l.dataPagamento ?? l.dataVencimento, desde))
  regra("lancamento_orfao", "Lançamento ligado a pedido que não existe", "financeiro", "media",
    "O lançamento aponta para um pedido apagado. O dinheiro fica fora do pedido certo.",
    a.lancamentos.filter(l => l.cardId && !cardPorId.has(l.cardId)).map(l => ({
      id: `lancamento_orfao:${l.id}`, regra: "lancamento_orfao", titulo: l.descricao || "Lançamento", detalhe: `${l.tipo === "receita" ? "Receita" : "Despesa"} de ${brl(l.valor)} ligada a ${l.cardNumero ?? "um pedido"} que não existe mais`,
      valor: l.valor, ref: { lancamentoId: l.id }, data: l.dataPagamento ?? l.dataVencimento,
    })))
  regra("valor_invalido", "Lançamento com valor zerado ou inválido", "financeiro", "alta",
    "Valor zero, negativo ou vazio distorce todas as somas.",
    a.lancamentos.filter(l => !ok(l.valor) || l.valor <= 0).map(l => ({
      id: `valor_invalido:${l.id}`, regra: "valor_invalido", titulo: l.descricao || "Lançamento", detalhe: `Valor: ${String(l.valor)}`, valor: null, ref: { lancamentoId: l.id }, data: l.dataVencimento,
    })))
  regra("pago_sem_data", "Pago sem data de pagamento", "financeiro", "baixa",
    "Sem a data do pagamento, o lançamento cai no mês errado do fluxo de caixa e do DRE.",
    recentes.filter(l => l.status === "pago" && !l.dataPagamento).map(l => ({
      id: `pago_sem_data:${l.id}`, regra: "pago_sem_data", titulo: l.descricao || "Lançamento", detalhe: `${brl(l.valor)} pago, sem data`, valor: l.valor, ref: { lancamentoId: l.id }, data: l.dataVencimento,
    })))
  const venceuHa = (l: LancamentoFinanceiro) => Math.floor((new Date(hoje).getTime() - new Date(l.dataVencimento).getTime()) / DIA)
  regra("vencido_em_aberto", "Vencido e ainda em aberto", "financeiro", "media",
    "Venceu há mais de 3 dias e continua em aberto: ou foi pago e não deu baixa, ou está atrasado de verdade. Os dois mudam o caixa.",
    recentes.filter(l => l.status !== "pago" && l.categoria !== "pix_link" && l.categoria !== "sobra" && l.dataVencimento && venceuHa(l) > 3).map(l => ({
      id: `vencido_em_aberto:${l.id}:${l.dataVencimento}`, regra: "vencido_em_aberto", titulo: l.descricao || (l.nomeCliente ?? "Lançamento"),
      detalhe: `${l.tipo === "receita" ? "A receber" : "A pagar"} ${brl(l.valor)} · venceu ${dataBR(l.dataVencimento)} (${venceuHa(l)} dias)`, valor: l.valor, ref: { lancamentoId: l.id, cardId: l.cardId }, data: l.dataVencimento,
    })))
  const chaveDup = (l: LancamentoFinanceiro) => [l.tipo, Math.round(l.valor * 100), (l.dataPagamento ?? l.dataVencimento ?? "").slice(0, 10), norm(l.descricao ?? ""), l.cardId ?? ""].join("|")
  const grupos = new Map<string, LancamentoFinanceiro[]>()
  for (const l of recentes) if (ok(l.valor) && l.valor > 0) grupos.set(chaveDup(l), [...(grupos.get(chaveDup(l)) ?? []), l])
  // Cada um com o seu próprio movimento no banco = foram duas compras de verdade (dois pedágios no mesmo dia)
  const txDoLanc = new Map<string, string>()
  for (const t of a.transacoes) for (const id of t.lancamento_ids ?? []) if ((t.lancamento_ids?.length ?? 0) === 1) txDoLanc.set(id, t.id)
  const cadaUmComMovimento = (g: LancamentoFinanceiro[]) => g.every(l => txDoLanc.has(l.id)) && new Set(g.map(l => txDoLanc.get(l.id))).size === g.length
  regra("lancamento_duplicado", "Lançamento em dobro", "financeiro", "media",
    "Mesmo tipo, valor, data e descrição, e sem um movimento do banco para cada um: provavelmente foi lançado duas vezes.",
    [...grupos.values()].filter(g => g.length > 1 && !cadaUmComMovimento(g)).map(g => ({
      id: `lancamento_duplicado:${g.map(l => l.id).sort().join(",")}`, regra: "lancamento_duplicado", titulo: g[0].descricao || "Lançamento",
      detalhe: `${g.length}× ${brl(g[0].valor)} em ${dataBR(g[0].dataPagamento ?? g[0].dataVencimento)}`, valor: g[0].valor * (g.length - 1), ref: { lancamentoId: g[1].id, cardId: g[0].cardId }, data: g[0].dataPagamento ?? g[0].dataVencimento,
    })))
  regra("despesa_sem_categoria", "Despesa sem categoria", "financeiro", "baixa",
    "Sem categoria, a despesa não aparece no lugar certo do DRE e dos gastos.",
    recentes.filter(l => l.tipo === "despesa" && !l.categoria).map(l => ({
      id: `despesa_sem_categoria:${l.id}`, regra: "despesa_sem_categoria", titulo: l.descricao || "Despesa", detalhe: `${brl(l.valor)} sem categoria`, valor: l.valor, ref: { lancamentoId: l.id }, data: l.dataPagamento ?? l.dataVencimento,
    })))

  // ── Banco ────────────────────────────────────────────────────────────────
  const txRecentes = a.transacoes.filter(t => dentro(t.data, desde))
  regra("banco_sem_conciliar", "Movimento do banco sem conciliar há mais de 7 dias", "banco", "media",
    "Todo dinheiro que entrou ou saiu do banco precisa estar no financeiro. Enquanto não concilia, o caixa do sistema não é o caixa real.",
    txRecentes.filter(t => t.estado === "pendente" && (new Date(hoje).getTime() - new Date(t.data).getTime()) / DIA > 7).map(t => ({
      id: `banco_sem_conciliar:${t.id}`, regra: "banco_sem_conciliar", titulo: t.descricao || "Movimento do banco", detalhe: `${t.tipo === "entrada" ? "Entrada" : "Saída"} de ${brl(t.valor)} em ${dataBR(t.data)}`, valor: t.valor, ref: { txId: t.id }, data: t.data,
    })))
  // Movimentos e lançamentos ligados formam grupos (vários débitos num lançamento, um Pix em vários lançamentos):
  // o grupo inteiro tem que bater. O abatimento de conta de fornecedor (forma "conta") não é dinheiro: fica fora.
  const pai = new Map<string, string>()
  const raiz = (x: string): string => { let r = x; while (pai.get(r) && pai.get(r) !== r) r = pai.get(r)!; pai.set(x, r); return r }
  const unir = (x: string, y: string) => { if (!pai.has(x)) pai.set(x, x); if (!pai.has(y)) pai.set(y, y); const a1 = raiz(x), b1 = raiz(y); if (a1 !== b1) pai.set(a1, b1) }
  const ligadas = a.transacoes.filter(t => (t.estado === "vinculada" || t.estado === "criada") && (t.lancamento_ids?.length ?? 0) > 0)
  for (const t of ligadas) { pai.set(`t:${t.id}`, pai.get(`t:${t.id}`) ?? `t:${t.id}`); for (const id of t.lancamento_ids ?? []) unir(`t:${t.id}`, `l:${id}`) }
  const grupoBanco = new Map<string, { txs: TxAuditoria[]; lancIds: Set<string> }>()
  for (const t of ligadas) {
    const g = grupoBanco.get(raiz(`t:${t.id}`)) ?? { txs: [], lancIds: new Set<string>() }
    g.txs.push(t); for (const id of t.lancamento_ids ?? []) g.lancIds.add(id)
    grupoBanco.set(raiz(`t:${t.id}`), g)
  }
  regra("banco_vinculo_quebrado", "Banco e financeiro não batem", "banco", "alta",
    "O que saiu ou entrou no banco tem que ser igual ao que está lançado no financeiro para esses movimentos. Diferença aqui é dinheiro contado a mais ou a menos.",
    [...grupoBanco.values()].filter(g => g.txs.some(t => dentro(t.data, desde))).flatMap(g => {
      const ls = [...g.lancIds].map(id => lancPorId.get(id))
      const t0 = [...g.txs].sort((x, y) => y.valor - x.valor)[0]
      const titulo = t0.descricao || "Movimento do banco"
      if (ls.some(l => !l)) return [{ id: `banco_vinculo_quebrado:${g.txs.map(t => t.id).sort().join(",")}`, regra: "banco_vinculo_quebrado", titulo, detalhe: `${brl(t0.valor)} em ${dataBR(t0.data)} ligado a lançamento que não existe mais`, valor: t0.valor, ref: { txId: t0.id }, data: t0.data }]
      const sinal = (tipo: string) => tipo === "entrada" ? 1 : -1
      const banco = g.txs.reduce((s, t) => s + sinal(t.tipo) * t.valor, 0)
      const lanc = ls.filter(l => l!.formaPagamento !== "conta").reduce((s, l) => s + (l!.tipo === "receita" ? 1 : -1) * l!.valor, 0)
      if (Math.abs(Math.abs(banco) - Math.abs(lanc)) <= 1) return []
      const dif = Math.abs(Math.abs(banco) - Math.abs(lanc))
      return [{ id: `banco_vinculo_quebrado:${g.txs.map(t => t.id).sort().join(",")}:${Math.round(lanc)}`, regra: "banco_vinculo_quebrado", titulo,
        detalhe: `Banco ${brl(Math.abs(banco))}${g.txs.length > 1 ? ` (${g.txs.length} movimentos)` : ""} · lançado ${brl(Math.abs(lanc))} · diferença ${brl(dif)}`, valor: dif, ref: { txId: t0.id, lancamentoId: ls[0]?.id }, data: t0.data }]
    }))

  // ── Digital e WhatsApp ───────────────────────────────────────────────────
  const peds = a.pedidosDigitais.filter(p => !p.teste && dentro(p.em, desde))
  regra("digital_pago_sem_data", "Pedido digital pago sem data do sinal", "digital", "baixa",
    "O pedido andou (arte, produção, enviado), mas não tem a data em que o sinal entrou. O caixa do digital fica sem data.",
    peds.filter(p => ["sinal_pago", "arte", "producao", "enviado"].includes(p.status) && !p.sinalPagoEm).map(p => ({
      id: `digital_pago_sem_data:${p.id}`, regra: "digital_pago_sem_data", titulo: `${p.id} · ${p.nome || "Cliente"}`, detalhe: `${brl(p.total)} · status ${p.status}`, valor: p.total, ref: { digitalId: p.id }, data: p.em,
    })))
  regra("conversa_card_inexistente", "Conversa ligada a pedido que não existe", "whatsapp", "baixa",
    "A conversa aponta para um pedido apagado: o funil e o \"esperando resposta\" ficam errados para esse contato.",
    a.conversas.filter(c => c.kanban_card_id && !cardPorId.has(c.kanban_card_id)).map(c => ({
      id: `conversa_card_inexistente:${c.jid}`, regra: "conversa_card_inexistente", titulo: c.nome || c.jid.split("@")[0], detalhe: "Ligada a um pedido que não existe mais", valor: null, ref: { jid: c.jid }, data: null,
    })))

  // Ignorados (você marcou "está certo") saem da conta
  let nIgnorados = 0
  for (const r of regras) { const antes = r.problemas.length; r.problemas = r.problemas.filter(p => !ignorados.has(p.id)); nIgnorados += antes - r.problemas.length }
  const todos = regras.flatMap(r => r.problemas)
  const refs = new Set(todos.map(p => p.ref.cardId ?? p.ref.lancamentoId ?? p.ref.txId ?? p.ref.digitalId ?? p.ref.jid ?? p.id))
  const conferidos = a.cards.filter(c => recente(c)).length + recentes.length + txRecentes.length + peds.length
  const comProblema = Math.min(refs.size, conferidos)
  return {
    em: new Date().toISOString(), regras,
    conferidos, comProblema, confianca: conferidos ? Math.round((1 - comProblema / conferidos) * 1000) / 10 : 100,
    graves: regras.filter(r => r.gravidade === "alta").reduce((t, r) => t + r.problemas.length, 0),
    total: todos.length, valorEmJogo: Math.round(todos.reduce((t, p) => t + (p.valor ?? 0), 0)), ignorados: nIgnorados,
  }
}
