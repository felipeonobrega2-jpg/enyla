// Extrato do banco (Pluggy / Meu Pluggy) → lançamentos, sem bagunçar o que já foi cadastrado à mão.
//
//   1. Já existe? Mesmo tipo, mesmo valor, data até 3 dias → vincula ao lançamento manual (não cria nada).
//   2. Pagamento a fornecedor com conta corrente (Jerograf): abate a conta, não é custo novo.
//   3. Regra que você ensinou (quem recebeu/pagou → categoria, fornecedor) → sugere o lançamento.
//   4. Recebimento de cliente: a mesma conciliação do extrato OFX (pagador × pedido em aberto).
//   5. O resto: a IA interpreta (no servidor) e você confere.
// Nada é lançado sem você aprovar enquanto o modo automático estiver desligado.

import type { LancamentoFinanceiro } from "../types"
import type { Fornecedor } from "../config"
import { Pedido, nomeChave } from "./negocio"
import { conciliar, aplicarConciliacao, MemoriaConciliacao, MARCA } from "./conciliacao"

export type EstadoTx = "pendente" | "vinculada" | "criada" | "ignorada"

export type TxBanco = {
  id: string
  conta_id: string
  conta_nome: string | null
  data: string                 // AAAA-MM-DD
  valor: number                // sempre positivo
  tipo: "entrada" | "saida"
  descricao: string
  contraparte_nome: string | null
  contraparte_doc: string | null
  categoria_pluggy: string | null
  hora?: string | null         // data e hora da transação no banco (ISO), quando o banco manda
  estado: EstadoTx
  lancamento_ids: string[]
  sugestao: SugestaoBanco | null
  historico: { em: string; acao: string; detalhe?: string }[]
}

export type SugestaoBanco =
  | { acao: "vincular"; lancamentoId: string; motivo: string; junto?: string[] }   // junto: outras transações que, somadas, pagaram o mesmo lançamento
  | { acao: "vincularVarios"; lancamentoIds: string[]; motivo: string }          // uma transação pagou vários lançamentos (rateio entre lotes)
  | { acao: "escolher"; candidatos: string[]; motivo: string }
  | { acao: "atualizar"; lancamentoId: string; campos: Partial<LancamentoFinanceiro>; motivo: string }
  | { acao: "criar"; lancamentos: Partial<LancamentoFinanceiro>[]; motivo: string; origem: "regra" | "conciliacao" | "conta" | "ia" | "devolucao"; v?: number }   // v 2: IA já com subcategoria
  | { acao: "ignorar"; motivo: string }
  | { acao: "revisar"; motivo: string }   // ninguém soube dizer: você decide

// Regra aprendida com as suas correções: quem está do outro lado → o que lançar
export type RegraBanco = {
  chave: string                // documento (só números) ou nome normalizado de quem pagou/recebeu
  tipo: "entrada" | "saida"
  acao: "lancar" | "ignorar"
  categoria?: string
  subcategoria?: string
  fornecedorId?: string
  contaId?: string             // conta/cartão em que você lança
  formaPagamento?: LancamentoFinanceiro["formaPagamento"]
  descricao?: string
  vezes: number
  seguidas?: number            // aceitas em sequência sem você mudar nada (3 = lança sozinha)
}

// Regra em que dá para confiar: você aceitou 3 vezes seguidas sem mexer (lançar), ou mandou "sempre ignorar"
export const REGRA_CONFIAVEL = 3
export const regraConfiavel = (r: Pick<RegraBanco, "acao" | "seguidas"> | undefined) =>
  !!r && (r.acao === "ignorar" || (r.seguidas ?? 0) >= REGRA_CONFIAVEL)
export const regraDaTx = (regras: RegraBanco[], tx: Pick<TxBanco, "tipo" | "contraparte_doc" | "contraparte_nome" | "descricao">) =>
  regras.find(r => r.chave === chaveContraparte(tx) && r.tipo === tx.tipo)

// ── Transação da Pluggy → formato do sistema ─────────────────────────────────
type Pessoa = { name?: string | null; documentNumber?: { value?: string | null } | null } | null | undefined
export type TxPluggy = {
  id: string; accountId: string; date: string; description?: string; descriptionRaw?: string | null; amount: number
  type?: "DEBIT" | "CREDIT"; category?: string | null
  paymentData?: { payer?: Pessoa; receiver?: Pessoa } | null
  merchant?: { name?: string | null; businessName?: string | null; cnpj?: string | null } | null
}

export function daPluggy(t: TxPluggy, contaNome: string | null): Omit<TxBanco, "estado" | "lancamento_ids" | "sugestao" | "historico"> {
  const saida = t.type ? t.type === "DEBIT" : t.amount < 0
  const outro = saida ? t.paymentData?.receiver : t.paymentData?.payer
  const nome = outro?.name || t.merchant?.businessName || t.merchant?.name || null
  const doc = (outro?.documentNumber?.value || t.merchant?.cnpj || "").replace(/\D/g, "") || null
  return {
    id: t.id, conta_id: t.accountId, conta_nome: contaNome, data: t.date.slice(0, 10), valor: Math.abs(t.amount),
    tipo: saida ? "saida" : "entrada", descricao: (t.description || t.descriptionRaw || "").trim(),
    contraparte_nome: nome, contraparte_doc: doc, categoria_pluggy: t.category ?? null,
  }
}

// Quem está do outro lado, para regras e memória (documento é mais confiável que nome)
export const chaveContraparte = (t: Pick<TxBanco, "contraparte_doc" | "contraparte_nome" | "descricao">) =>
  t.contraparte_doc || nomeChave(t.contraparte_nome || t.descricao.replace(/[\d./\\-]{4,}/g, " ")).replace(/\s+/g, " ").trim()

const igual = (a: number, b: number) => Math.abs(a - b) < 0.01
const distancia = (a: string, b: string) => Math.abs(new Date(a + "T12:00:00").getTime() - new Date(b + "T12:00:00").getTime()) / 86_400_000

// Transferência entre as suas próprias contas: não é receita nem despesa
export function ehTransferenciaPropria(t: Pick<TxBanco, "contraparte_doc" | "contraparte_nome" | "descricao">, documentosProprios: string[], nomesProprios: string[]) {
  if (t.contraparte_doc && documentosProprios.includes(t.contraparte_doc)) return true
  if (t.contraparte_nome && nomesProprios.some(n => nomeChave(n) === nomeChave(t.contraparte_nome!))) return true
  return /mesma titularidade|entre contas|aplica[cç][aã]o autom|resgate autom/i.test(t.descricao)
}

// 0..1: o nome de quem recebeu parece o fornecedor?
const pareceFornecedor = (nome: string | null, f: Fornecedor) => {
  if (!nome) return false
  const a = nomeChave(nome), b = nomeChave(f.nome)
  return a.includes(b) || b.includes(a) || a.split(" ").filter(w => w.length > 3).some(w => b.split(" ").includes(w))
}

// Devolução (PIX DEVOLVIDO / estorno) ↔ a compra de onde veio: mesma empresa, até 20 dias antes, valor ≥ o devolvido.
// Cada compra serve a uma devolução só (a de valor exato e mais perto primeiro).
export type ParDevolucao = { outra: Pick<TxBanco, "id" | "data" | "valor" | "estado" | "lancamento_ids">; total: boolean; papel: "compra" | "devolucao" }
type TxPar = Pick<TxBanco, "id" | "data" | "valor" | "tipo" | "estado" | "descricao" | "contraparte_doc" | "contraparte_nome" | "lancamento_ids">
export const ehDevolucao = (t: Pick<TxBanco, "tipo" | "descricao">) => t.tipo === "entrada" && /devolvid|estorn|reembols/i.test(t.descricao)
export function paresDeDevolucao(txs: TxPar[]): Map<string, ParDevolucao> {
  const pares = new Map<string, ParDevolucao>()
  const porChave = new Map<string, TxPar[]>()
  for (const t of txs) if (t.tipo === "saida") { const k = chaveContraparte(t); if (k) porChave.set(k, [...(porChave.get(k) ?? []), t]) }
  const usadas = new Set<string>()
  for (const d of txs.filter(ehDevolucao).sort((a, b) => a.data.localeCompare(b.data))) {
    const cands = (porChave.get(chaveContraparte(d)) ?? []).filter(s => !usadas.has(s.id) && s.data <= d.data && distancia(d.data, s.data) <= 20 && s.valor >= d.valor - 0.005)
    const s = [...cands].sort((a, b) => Number(!igual(a.valor, d.valor)) - Number(!igual(b.valor, d.valor)) || b.data.localeCompare(a.data))[0]
    if (!s) continue
    const total = igual(s.valor, d.valor)
    usadas.add(s.id)
    pares.set(d.id, { outra: s, total, papel: "devolucao" })
    if (total) pares.set(s.id, { outra: d, total, papel: "compra" })
  }
  return pares
}
export const FOI_E_VOLTOU = "foi e voltou"
const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export function sugerir(args: {
  tx: TxBanco
  lancamentos: LancamentoFinanceiro[]
  pedidos: Pedido[]
  fornecedores: Fornecedor[]
  regras: RegraBanco[]
  memoria?: MemoriaConciliacao
  jaVinculados: Set<string>          // lançamentos ligados a outra transação
  documentosProprios?: string[]
  nomesProprios?: string[]
  pares?: Map<string, ParDevolucao>  // devolução ↔ compra (paresDeDevolucao)
}): SugestaoBanco | null {
  const { tx, lancamentos, fornecedores, regras } = args
  const chave = chaveContraparte(tx)

  // 0. Para você mesmo (seu CPF/CNPJ, "mesma titularidade", aplicação automática): não some mais da fila.
  //    O seu salário sai assim; a regra que você ensinar vale primeiro (passo 3), senão o padrão abaixo (passo 3b).
  const propria = ehTransferenciaPropria(tx, args.documentosProprios ?? [], args.nomesProprios ?? [])

  // 0b. Devolução: o Pix que foi e voltou inteiro não é nada (as duas pontas saem da fila); a devolução de uma compra
  //     já lançada vira estorno (Outros / Estorno), total ou parcial
  const par = args.pares?.get(tx.id)
  if (par?.papel === "compra" && (par.outra.estado === "pendente" || par.outra.estado === "ignorada"))
    return { acao: "ignorar", motivo: `${FOI_E_VOLTOU}: devolvido inteiro em ${diaMes(par.outra.data)}` }
  if (par?.papel === "devolucao") {
    const c = par.outra
    if (par.total && (c.estado === "pendente" || c.estado === "ignorada"))
      return { acao: "ignorar", motivo: `${FOI_E_VOLTOU}: devolução do Pix de ${reais(c.valor)} de ${diaMes(c.data)}` }
    const lc = lancamentos.find(l => (c.lancamento_ids ?? []).includes(l.id))
    if (c.estado === "criada" || c.estado === "vinculada") return {
      acao: "criar", origem: "devolucao", motivo: `${par.total ? "devolução" : "devolução parcial"} da compra de ${reais(c.valor)} de ${diaMes(c.data)}${lc ? ` (${lc.descricao})` : ""}`,
      lancamentos: [{ tipo: "receita", categoria: "outros", subcategoria: "Estorno", descricao: `Estorno — ${lc?.descricao ?? tx.contraparte_nome ?? tx.descricao}`, valor: tx.valor, status: "pago", dataVencimento: tx.data, dataPagamento: tx.data }],
    }
    if (c.estado === "pendente") return { acao: "revisar", motivo: `devolução parcial do Pix de ${reais(c.valor)} de ${diaMes(c.data)}, que ainda está na fila: resolva a compra primeiro; esta vira estorno` }
  }

  // 1. Lançamento que você já cadastrou (fora da conta de fornecedor, que não passa pelo banco)
  const tipoLanc = tx.tipo === "entrada" ? "receita" : "despesa"
  const candidatos = lancamentos.filter(l => l.tipo === tipoLanc && l.formaPagamento !== "conta" && !args.jaVinculados.has(l.id)
    && igual(l.valor, tx.valor) && distancia(tx.data, (l.dataPagamento ?? l.dataVencimento).slice(0, 10)) <= 3)
  if (candidatos.length === 1) {
    const l = candidatos[0]
    return l.status === "pago"
      ? { acao: "vincular", lancamentoId: l.id, motivo: `já lançado: ${l.descricao}` }
      : { acao: "atualizar", lancamentoId: l.id, campos: { status: "pago", dataPagamento: tx.data }, motivo: `dá baixa em: ${l.descricao}` }
  }
  // 1b. Pagador que você já ligou a um cliente (ex.: "Bianca paga pelo Maurício"): o mesmo valor até 10 dias, e se não
  //     houver, um lançamento maior dele no mesmo dia (pagamento dividido em dois Pix)
  const clienteDoPagador = tx.tipo === "entrada" && tx.contraparte_nome ? args.memoria?.pagadores?.[nomeChave(tx.contraparte_nome)] : undefined
  if (!candidatos.length && clienteDoPagador) {
    const doCliente = lancamentos.filter(l => l.tipo === "receita" && !args.jaVinculados.has(l.id) && l.formaPagamento !== "conta" && l.categoria !== "sobra"
      && nomeChave(l.nomeCliente) === nomeChave(clienteDoPagador))
    const dias = (l: LancamentoFinanceiro) => distancia(tx.data, (l.dataPagamento ?? l.dataVencimento).slice(0, 10))
    const mesmoValor = doCliente.filter(l => igual(l.valor, tx.valor) && dias(l) <= 10).sort((a, b) => dias(a) - dias(b))
    if (mesmoValor.length === 1) return { acao: "vincular", lancamentoId: mesmoValor[0].id, motivo: `${clienteDoPagador} (pagador conhecido), ${Math.round(dias(mesmoValor[0]))} dia(s) de diferença: ${mesmoValor[0].descricao}` }
    if (mesmoValor.length > 1) return { acao: "escolher", candidatos: mesmoValor.map(l => l.id), motivo: `${clienteDoPagador}: mais de um lançamento com esse valor perto dessa data. Qual é?` }
    const maior = doCliente.filter(l => l.valor > tx.valor + 0.01 && dias(l) <= 1).sort((a, b) => dias(a) - dias(b))
    if (maior.length) return { acao: "escolher", candidatos: maior.map(l => l.id), motivo: `${clienteDoPagador}: pode ser parte de um pagamento maior (pagou em mais de um Pix). É parte de qual?` }
  }
  if (candidatos.length > 1) {
    // Um só no mesmo dia: é ele. Senão pergunta, do mais perto para o mais longe da data do banco
    const dias = (l: LancamentoFinanceiro) => distancia(tx.data, (l.dataPagamento ?? l.dataVencimento).slice(0, 10))
    const mesmoDia = candidatos.filter(l => dias(l) === 0)
    if (mesmoDia.length === 1) {
      const l = mesmoDia[0]
      return l.status === "pago"
        ? { acao: "vincular", lancamentoId: l.id, motivo: `já lançado no mesmo dia: ${l.descricao}` }
        : { acao: "atualizar", lancamentoId: l.id, campos: { status: "pago", dataPagamento: tx.data }, motivo: `dá baixa em (mesmo dia): ${l.descricao}` }
    }
    return { acao: "escolher", candidatos: [...candidatos].sort((a, b) => dias(a) - dias(b)).map(l => l.id), motivo: `${candidatos.length} lançamentos com o mesmo valor e data` }
  }

  // 2. Pagamento a fornecedor com conta corrente: abate a conta (o custo já está lançado na conta)
  if (tx.tipo === "saida") {
    const regra = regras.find(r => r.chave === chave && r.tipo === "saida")
    const fConta = fornecedores.find(f => f.ativo && f.conta && (regra?.fornecedorId === f.id || pareceFornecedor(tx.contraparte_nome, f)))
    if (fConta) {
      const jaTem = lancamentos.find(l => l.tipo === "receita" && l.formaPagamento === "conta" && l.fornecedorId === fConta.id && !args.jaVinculados.has(l.id)
        && igual(l.valor, tx.valor) && distancia(tx.data, (l.dataPagamento ?? l.dataVencimento).slice(0, 10)) <= 3)
      if (jaTem) return { acao: "vincular", lancamentoId: jaTem.id, motivo: `pagamento da conta ${fConta.nome} já lançado` }
      return {
        acao: "criar", origem: "conta", motivo: `pagamento da conta ${fConta.nome}: abate o saldo devedor (não é custo novo)`,
        lancamentos: [{ tipo: "receita", formaPagamento: "conta", fornecedorId: fConta.id, descricao: `Pagamento da conta — ${fConta.nome}`, valor: tx.valor, status: "pago", dataVencimento: tx.data, dataPagamento: tx.data }],
      }
    }
  }

  // 3. Regra ensinada
  const regra = regras.find(r => r.chave === chave && r.tipo === tx.tipo)
  if (regra?.acao === "ignorar") return { acao: "ignorar", motivo: `você ensinou a ignorar (${tx.contraparte_nome ?? tx.descricao})` }
  if (regra?.acao === "lancar") return {
    acao: "criar", origem: "regra", motivo: `regra aprendida (${regra.vezes}×${regraConfiavel(regra) ? " · lança sozinha" : ` · ${regra.seguidas ?? 0} de ${REGRA_CONFIAVEL} para lançar sozinha`}): ${tx.contraparte_nome ?? tx.descricao}`,
    lancamentos: [{ tipo: tipoLanc, categoria: regra.categoria, ...(regra.subcategoria ? { subcategoria: regra.subcategoria } : {}), ...(regra.formaPagamento ? { formaPagamento: regra.formaPagamento } : {}), fornecedorId: regra.fornecedorId, descricao: regra.descricao ?? tx.contraparte_nome ?? tx.descricao, valor: tx.valor, status: "pago", dataVencimento: tx.data, dataPagamento: tx.data }],
  }

  // 3b. Para você, sem regra: saída = distribuição de lucros (o seu salário); rendimento da aplicação = receita;
  //     ida e volta da aplicação automática não é receita nem despesa
  if (propria) {
    const base = { valor: tx.valor, status: "pago" as const, dataVencimento: tx.data, dataPagamento: tx.data }
    if (/remunera[cç][aã]o|rendimento/i.test(tx.descricao) && tx.tipo === "entrada")
      return { acao: "criar", origem: "regra", motivo: "rendimento da aplicação automática", lancamentos: [{ ...base, tipo: "receita", categoria: "outros", subcategoria: "Rendimento", descricao: "Rendimento da aplicação" }] }
    if (/aplica[cç][aã]o autom|resgate autom/i.test(tx.descricao))
      return { acao: "ignorar", motivo: "aplicação/resgate automático (o dinheiro continua seu, não é receita nem despesa)" }
    if (tx.tipo === "saida")
      return { acao: "criar", origem: "regra", motivo: "transferência para você: distribuição de lucros (o seu salário)", lancamentos: [{ ...base, tipo: "despesa", categoria: "salarios", subcategoria: "Distribuição de Lucros", descricao: `Distribuição de lucros${tx.contraparte_nome ? ` — ${tx.contraparte_nome}` : ""}` }] }
  }

  // 4. Recebimento de cliente: a conciliação do extrato (pagador × pedidos em aberto)
  if (tx.tipo === "entrada") {
    const [r] = conciliar({ entradas: [{ id: tx.id, data: tx.data, valor: tx.valor, descricao: tx.descricao, pagador: tx.contraparte_nome ?? undefined }], pedidos: args.pedidos, lancamentos, memoria: args.memoria })
    const melhor = r?.sugestoes[0]
    if (melhor && (r.status === "automatico" || r.status === "sugestao")) {
      const a = aplicarConciliacao({ id: tx.id, data: tx.data, valor: tx.valor, descricao: tx.descricao, pagador: tx.contraparte_nome ?? undefined }, melhor.candidato)
      const motivo = `${melhor.candidato.pedido?.numero ?? ""} ${melhor.candidato.pedido?.nomeCliente ?? ""} · ${melhor.motivos.join(", ")}`.trim()
      if (a.atualizar) return { acao: "atualizar", lancamentoId: a.atualizar.id, campos: a.atualizar.campos, motivo }
      if (a.criar) return { acao: "criar", origem: "conciliacao", motivo, lancamentos: [a.criar] }
    }
  }
  return null   // fica para a IA
}

// Correção vira regra: da próxima vez, o mesmo recebedor/pagador já vem certo
export function aprender(regras: RegraBanco[], tx: TxBanco, decisao: { acao: "lancar" | "ignorar"; categoria?: string; subcategoria?: string; fornecedorId?: string; contaId?: string; formaPagamento?: LancamentoFinanceiro["formaPagamento"]; descricao?: string },
  confianca: "mais" | "zera" | "mantem" = "zera"): RegraBanco[] {
  const chave = chaveContraparte(tx)
  if (!chave || chave.length < 3) return regras
  const atual = regras.find(r => r.chave === chave && r.tipo === tx.tipo)
  const nova: RegraBanco = { chave, tipo: tx.tipo, acao: decisao.acao, categoria: decisao.categoria, subcategoria: decisao.subcategoria || undefined, fornecedorId: decisao.fornecedorId,
    contaId: decisao.contaId || undefined, formaPagamento: decisao.formaPagamento || undefined, descricao: decisao.descricao, vezes: (atual?.vezes ?? 0) + 1,
    seguidas: confianca === "mais" ? (atual?.seguidas ?? 0) + 1 : confianca === "mantem" ? atual?.seguidas ?? 0 : 0 }
  return [...regras.filter(r => r !== atual), nova]
}

// Regras tiradas do que você já resolveu (lançou ou vinculou): quem pagou/recebeu 2+ vezes e caiu sempre na mesma
// categoria vira regra (ex.: Jupter → Comissões de Parcerias). Não entra pedido de cliente (isso é da conciliação),
// não passa por cima de regra que você ensinou e nunca lança sozinha (começa em 0 de 3).
export function regrasDoHistorico(resolvidas: Pick<TxBanco, "tipo" | "contraparte_doc" | "contraparte_nome" | "descricao" | "lancamento_ids">[],
  lancamentos: LancamentoFinanceiro[], regras: RegraBanco[], cats: { id: string; subcategorias?: string[] }[] = []): RegraBanco[] {
  const porId = new Map(lancamentos.map(l => [l.id, l]))
  const grupos = new Map<string, { tipo: TxBanco["tipo"]; ls: LancamentoFinanceiro[]; vezes: number }>()
  for (const t of resolvidas) {
    const ls = (t.lancamento_ids ?? []).map(id => porId.get(id)).filter((l): l is LancamentoFinanceiro => !!l)
    if (!ls.length) continue
    const chave = chaveContraparte(t)
    if (!chave || chave.length < 3) continue
    const k = `${t.tipo}|${chave}`
    const g = grupos.get(k) ?? { tipo: t.tipo, ls: [], vezes: 0 }
    g.ls.push(...ls); g.vezes++
    grupos.set(k, g)
  }
  const novas: RegraBanco[] = []
  for (const [k, g] of grupos) {
    const chave = k.slice(k.indexOf("|") + 1)
    if (g.vezes < 2 || regras.some(r => r.chave === chave && r.tipo === g.tipo)) continue
    if (g.ls.some(l => l.loteNumero || l.cardId || l.loteId || l.formaPagamento === "conta" || !l.categoria)) continue
    const categoria = g.ls[0].categoria!
    if (g.ls.some(l => l.categoria !== categoria)) continue
    // Subcategoria: a que você usou mais; se nunca usou, a que aparece no nome da maioria dos lançamentos ("Comissão Frascos")
    const conta = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0]
    const usada = conta(g.ls.map(l => l.subcategoria).filter((s): s is string => !!s))
    const subs = cats.find(c => c.id === categoria)?.subcategorias ?? []
    const noNome = conta(g.ls.flatMap(l => subs.filter(s => nomeChave(l.descricao ?? "").includes(nomeChave(s)))))
    const subcategoria = usada?.[0] ?? (noNome && noNome[1] * 2 > g.ls.length ? noNome[0] : undefined)
    const fornecedores = [...new Set(g.ls.map(l => l.fornecedorId).filter(Boolean))]
    novas.push({ chave, tipo: g.tipo, acao: "lancar", categoria, ...(subcategoria ? { subcategoria } : {}), ...(fornecedores.length === 1 ? { fornecedorId: fornecedores[0] } : {}), vezes: g.vezes, seguidas: 0 })
  }
  return novas
}

// Conta/cartão do sistema em que entra o que vem de cada conta do banco: aprendido com os seus lançamentos
// (a conta do banco e a do sistema são a mesma coisa; o que mais se repetiu vence)
export type ContasDoBanco = Record<string, Record<string, number>>   // conta do banco → conta do sistema → vezes
export function aprenderConta(m: ContasDoBanco, contaBanco: string, contaId: string | undefined): ContasDoBanco {
  if (!contaBanco || !contaId) return m
  const atual = m[contaBanco] ?? {}
  return { ...m, [contaBanco]: { ...atual, [contaId]: (atual[contaId] ?? 0) + 1 } }
}
export function contaDoBanco(m: ContasDoBanco | undefined, contaBanco: string): string | undefined {
  const x = m?.[contaBanco]
  if (!x) return undefined
  return Object.entries(x).sort((a, b) => b[1] - a[1])[0]?.[0]
}

// Subcategoria só vale se for uma das da categoria (nome exato, sem diferença de maiúscula/acento)
export function subcategoriaValida(subs: string[] | undefined, sub: string | null | undefined): string | undefined {
  if (!sub || !subs?.length) return undefined
  const n = (x: string) => nomeChave(x)
  return subs.find(s => n(s) === n(sub))
}

// Completa o lançamento sugerido com o que já se sabe: a conta/cartão (da regra ou da conta do banco de onde veio) e
// a subcategoria da regra; subcategoria que não existe na categoria sai (para não gravar lixo)
export function completarSugestao(sg: SugestaoBanco, tx: TxBanco, regras: RegraBanco[], contas: ContasDoBanco | undefined, cats: { id: string; subcategorias?: string[] }[]): SugestaoBanco {
  if (sg.acao !== "criar" || sg.origem === "conta") return sg
  const regra = regras.find(r => r.chave === chaveContraparte(tx) && r.tipo === tx.tipo && r.acao === "lancar")
  const conta = regra?.contaId ?? contaDoBanco(contas, tx.conta_id)
  return { ...sg, lancamentos: sg.lancamentos.map(l => {
    const subs = cats.find(c => c.id === l.categoria)?.subcategorias
    const sub = subcategoriaValida(subs, l.subcategoria) ?? (regra?.categoria === l.categoria ? subcategoriaValida(subs, regra?.subcategoria) : undefined)
    const { subcategoria: _s, ...resto } = l
    void _s
    return { ...resto, ...(sub ? { subcategoria: sub } : {}), ...(l.contaId || !conta ? {} : { contaId: conta }) }
  }) }
}

// Você aceitou a sugestão sem mudar o que importa (categoria, subcategoria, fornecedor, conta)?
export function aceitouSemMudar(sg: SugestaoBanco | null, criados: Partial<LancamentoFinanceiro>[]): boolean {
  if (sg?.acao !== "criar" || sg.lancamentos.length !== 1 || criados.length !== 1) return false
  const a = sg.lancamentos[0], b = criados[0]
  const k = (x: Partial<LancamentoFinanceiro>) => [x.categoria ?? "", x.subcategoria ?? "", x.fornecedorId ?? "", x.contaId ?? ""].join("|")
  return k(a) === k(b)
}
// Desfez um lançamento automático: a regra volta a pedir conferência
export const zerarConfianca = (regras: RegraBanco[], tx: TxBanco) =>
  regras.map(r => r.chave === chaveContraparte(tx) && r.tipo === tx.tipo ? { ...r, seguidas: 0 } : r)

// Possível duplicado: lançamento feito À MÃO (o que veio de outra transação do banco é outra transferência de
// verdade) com o mesmo tipo e valor na mesma data (um dia de folga) e parecido: a mesma categoria do que vai lançar,
// ou o nome de quem recebeu/pagou na descrição. Você confere se foi 2x mesmo.
const palavras = (s: string) => nomeChave(s).split(" ").filter(w => w.length > 3)
export function possiveisDuplicados(tx: Pick<TxBanco, "id" | "tipo" | "valor" | "data" | "contraparte_nome" | "descricao">, lancamentos: LancamentoFinanceiro[], categoria?: string): LancamentoFinanceiro[] {
  const tipo = tx.tipo === "entrada" ? "receita" : "despesa"
  const doOutroLado = new Set(palavras(`${tx.contraparte_nome ?? ""} ${tx.descricao}`).filter(w => !/^(pix|enviado|recebido|transf|debito|credito|visa|electron|brasil|ltda)$/.test(w)))
  return lancamentos.filter(l => l.tipo === tipo && l.formaPagamento !== "conta" && igual(l.valor, tx.valor)
    && distancia(tx.data, (l.dataPagamento ?? l.dataVencimento).slice(0, 10)) <= 1
    && !(l.obs ?? "").includes(MARCA)
    && ((!!categoria && l.categoria === categoria) || palavras(l.descricao).some(w => doOutroLado.has(w))))
}

// No lote: as que têm possível duplicado (com a categoria que cada uma vai receber)
export function duplicadosNoLote(itens: { tx: Pick<TxBanco, "id" | "tipo" | "valor" | "data" | "contraparte_nome" | "descricao">; categoria?: string }[], lancamentos: LancamentoFinanceiro[]) {
  return itens.map(i => ({ tx: i.tx, existentes: possiveisDuplicados(i.tx, lancamentos, i.categoria) })).filter(x => x.existentes.length > 0)
}


// ── Vínculos por soma (o que o 1 para 1 não acha) ────────────────────────────
//   rateio: uma transação = vários lançamentos seus no mesmo dia (ex.: 5 × "Colagem R$ 194" num Pix de R$ 970)
//   junto:  várias transações = um lançamento seu (ex.: "Lote MAU-003 R$ 1.280" = Pix de R$ 1.000 + R$ 280)
//   quase:  um lançamento do mesmo dia com valor até 5% diferente (taxa, arredondamento): você confirma
// Só quando a combinação é única (com várias possíveis, ninguém garante qual é qual).
const centavos = (v: number) => Math.round(v * 100)
function combinacoes<T>(itens: T[], valor: (x: T) => number, alvo: number, max = 3): T[][] {
  const out: T[][] = [], n = Math.min(itens.length, 30), a = centavos(alvo)
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const s2 = centavos(valor(itens[i])) + centavos(valor(itens[j]))
    if (s2 === a) out.push([itens[i], itens[j]])
    if (max >= 3) for (let k = j + 1; k < n; k++) if (s2 + centavos(valor(itens[k])) === a) out.push([itens[i], itens[j], itens[k]])
    if (out.length > 1) return out
  }
  return out
}
export function vinculosPorSoma(pendentes: TxBanco[], livres: LancamentoFinanceiro[]): { porTx: Map<string, SugestaoBanco>; rateioAutomatico: Set<string> } {
  const porTx = new Map<string, SugestaoBanco>(), rateioAutomatico = new Set<string>()
  const usados = new Set<string>(), txUsadas = new Set<string>()
  const tipoL = (t: TxBanco) => t.tipo === "entrada" ? "receita" : "despesa"
  const dataL = (l: LancamentoFinanceiro) => (l.dataPagamento ?? l.dataVencimento).slice(0, 10)
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

  // 1. Rateio: lançamentos iguais (mesma descrição e valor) somam a transação; senão 2 ou 3 diferentes
  for (const t of pendentes) {
    const perto = livres.filter(l => !usados.has(l.id) && l.tipo === tipoL(t) && l.valor < t.valor - 0.009 && distancia(t.data, dataL(l)) <= 2)
    if (perto.length < 2) continue
    const grupos = new Map<string, LancamentoFinanceiro[]>()
    for (const l of perto) { const k = `${nomeChave(l.descricao)}|${centavos(l.valor)}`; grupos.set(k, [...(grupos.get(k) ?? []), l]) }
    let achou: LancamentoFinanceiro[] | null = null, iguais = false
    for (const g of grupos.values()) {
      const m = centavos(t.valor) / centavos(g[0].valor)
      if (Number.isInteger(m) && m >= 2 && m <= g.length) { achou = g.slice(0, m); iguais = true; break }
    }
    if (!achou) { const c = combinacoes(perto, l => l.valor, t.valor); if (c.length === 1) achou = c[0] }
    if (!achou) continue
    for (const l of achou) usados.add(l.id)
    txUsadas.add(t.id)
    porTx.set(t.id, { acao: "vincularVarios", lancamentoIds: achou.map(l => l.id), motivo: `paga ${achou.length} lançamentos seus que somam ${brl(t.valor)}${iguais ? ` (${achou.length} × “${achou[0].descricao}”)` : ""}` })
    if (iguais) rateioAutomatico.add(t.id)
  }

  // 2. Junto: 2 ou 3 transações somam um lançamento
  for (const l of livres) {
    if (usados.has(l.id)) continue
    const tipo = l.tipo === "receita" ? "entrada" : "saida"
    const perto = pendentes.filter(t => !txUsadas.has(t.id) && t.tipo === tipo && t.valor < l.valor - 0.009 && distancia(t.data, dataL(l)) <= 3)
    if (perto.length < 2) continue
    const c = combinacoes(perto, t => t.valor, l.valor)
    if (c.length !== 1) continue
    usados.add(l.id)
    for (const t of c[0]) {
      txUsadas.add(t.id)
      porTx.set(t.id, { acao: "vincular", lancamentoId: l.id, junto: c[0].filter(x => x.id !== t.id).map(x => x.id),
        motivo: `junto com ${c[0].length - 1} outra(s) transação(ões) (${c[0].map(x => brl(x.valor)).join(" + ")}) soma “${l.descricao}” de ${brl(l.valor)}` })
    }
  }

  // 3. Quase igual: um só lançamento do mesmo dia (±1) com valor até 5% diferente
  for (const t of pendentes) {
    if (txUsadas.has(t.id)) continue
    const c = livres.filter(l => !usados.has(l.id) && l.tipo === tipoL(t) && distancia(t.data, dataL(l)) <= 1
      && Math.abs(l.valor - t.valor) >= 0.01 && Math.abs(l.valor - t.valor) / t.valor <= 0.05)
    if (c.length !== 1) continue
    porTx.set(t.id, { acao: "escolher", candidatos: [c[0].id], motivo: `Valor quase igual: lançado ${brl(c[0].valor)}, no banco ${brl(t.valor)} (taxa ou arredondamento?). É este?` })
  }
  return { porTx, rateioAutomatico }
}
