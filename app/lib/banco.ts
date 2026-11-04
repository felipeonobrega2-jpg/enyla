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
import { conciliar, aplicarConciliacao, MemoriaConciliacao } from "./conciliacao"

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
  estado: EstadoTx
  lancamento_ids: string[]
  sugestao: SugestaoBanco | null
  historico: { em: string; acao: string; detalhe?: string }[]
}

export type SugestaoBanco =
  | { acao: "vincular"; lancamentoId: string; motivo: string }
  | { acao: "escolher"; candidatos: string[]; motivo: string }
  | { acao: "atualizar"; lancamentoId: string; campos: Partial<LancamentoFinanceiro>; motivo: string }
  | { acao: "criar"; lancamentos: Partial<LancamentoFinanceiro>[]; motivo: string; origem: "regra" | "conciliacao" | "conta" | "ia" }
  | { acao: "ignorar"; motivo: string }
  | { acao: "revisar"; motivo: string }   // ninguém soube dizer: você decide

// Regra aprendida com as suas correções: quem está do outro lado → o que lançar
export type RegraBanco = {
  chave: string                // documento (só números) ou nome normalizado de quem pagou/recebeu
  tipo: "entrada" | "saida"
  acao: "lancar" | "ignorar"
  categoria?: string
  fornecedorId?: string
  descricao?: string
  vezes: number
}

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
}): SugestaoBanco | null {
  const { tx, lancamentos, fornecedores, regras } = args
  const chave = chaveContraparte(tx)

  // 0. Entre as suas contas
  if (ehTransferenciaPropria(tx, args.documentosProprios ?? [], args.nomesProprios ?? []))
    return { acao: "ignorar", motivo: "transferência entre as suas contas" }

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
  if (candidatos.length > 1) return { acao: "escolher", candidatos: candidatos.map(l => l.id), motivo: `${candidatos.length} lançamentos com o mesmo valor e data` }

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
    acao: "criar", origem: "regra", motivo: `regra aprendida (${regra.vezes}×): ${tx.contraparte_nome ?? tx.descricao}`,
    lancamentos: [{ tipo: tipoLanc, categoria: regra.categoria, fornecedorId: regra.fornecedorId, descricao: regra.descricao ?? tx.contraparte_nome ?? tx.descricao, valor: tx.valor, status: "pago", dataVencimento: tx.data, dataPagamento: tx.data }],
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
export function aprender(regras: RegraBanco[], tx: TxBanco, decisao: { acao: "lancar" | "ignorar"; categoria?: string; fornecedorId?: string; descricao?: string }): RegraBanco[] {
  const chave = chaveContraparte(tx)
  if (!chave || chave.length < 3) return regras
  const atual = regras.find(r => r.chave === chave && r.tipo === tx.tipo)
  const nova: RegraBanco = { chave, tipo: tx.tipo, acao: decisao.acao, categoria: decisao.categoria, fornecedorId: decisao.fornecedorId, descricao: decisao.descricao, vezes: (atual?.vezes ?? 0) + 1 }
  return [...regras.filter(r => r !== atual), nova]
}
