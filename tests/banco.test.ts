import { describe, it, expect } from "vitest"
import { sugerir, daPluggy, aprender, chaveContraparte, TxBanco } from "@/app/lib/banco"
import type { LancamentoFinanceiro } from "@/app/types"
import type { Fornecedor } from "@/app/config"

const tx = (p: Partial<TxBanco>): TxBanco => ({ id: "t1", conta_id: "c", conta_nome: "Santander", data: "2026-11-03", valor: 100, tipo: "saida", descricao: "PIX ENVIADO", contraparte_nome: null, contraparte_doc: null, categoria_pluggy: null, estado: "pendente", lancamento_ids: [], sugestao: null, historico: [], ...p })
const lanc = (p: Partial<LancamentoFinanceiro>): LancamentoFinanceiro => ({ id: "l1", tipo: "despesa", descricao: "Papel", valor: 100, dataVencimento: "2026-11-02", status: "pago", dataPagamento: "2026-11-02", criadoEm: "", ...p })
const jerograf: Fornecedor = { id: "jero", nome: "Jerograf", categoria: "grafica", ativo: true, conta: true }
const base = { pedidos: [], fornecedores: [jerograf], regras: [], jaVinculados: new Set<string>() }

describe("banco → lançamentos sem bagunçar o manual", () => {
  it("já lançado à mão: vincula, não cria", () => {
    expect(sugerir({ ...base, tx: tx({}), lancamentos: [lanc({})] })).toMatchObject({ acao: "vincular", lancamentoId: "l1" })
  })
  it("lançado como pendente: dá baixa com a data do banco", () => {
    expect(sugerir({ ...base, tx: tx({}), lancamentos: [lanc({ status: "pendente", dataPagamento: undefined })] }))
      .toMatchObject({ acao: "atualizar", campos: { status: "pago", dataPagamento: "2026-11-03" } })
  })
  it("dois iguais: pergunta qual; já vinculado a outra transação não conta", () => {
    expect(sugerir({ ...base, tx: tx({}), lancamentos: [lanc({}), lanc({ id: "l2" })] })).toMatchObject({ acao: "escolher" })
    expect(sugerir({ ...base, tx: tx({}), lancamentos: [lanc({}), lanc({ id: "l2" })], jaVinculados: new Set(["l2"]) })).toMatchObject({ acao: "vincular", lancamentoId: "l1" })
  })
  it("data longe ou valor diferente: não vincula", () => {
    expect(sugerir({ ...base, tx: tx({ data: "2026-11-20" }), lancamentos: [lanc({})] })?.acao).not.toBe("vincular")
    expect(sugerir({ ...base, tx: tx({ valor: 101 }), lancamentos: [lanc({})] })?.acao).not.toBe("vincular")
  })
  it("custo na conta do fornecedor nunca casa com saída do banco (não passou pelo banco)", () => {
    expect(sugerir({ ...base, tx: tx({}), lancamentos: [lanc({ formaPagamento: "conta" })] })?.acao).not.toBe("vincular")
  })
  it("Pix para a Jerograf: abate a conta (receita na conta), não vira custo", () => {
    const s = sugerir({ ...base, tx: tx({ contraparte_nome: "JEROGRAF GRAFICA LTDA", valor: 2000 }), lancamentos: [] })
    expect(s).toMatchObject({ acao: "criar", origem: "conta" })
    expect(s && s.acao === "criar" && s.lancamentos[0]).toMatchObject({ tipo: "receita", formaPagamento: "conta", fornecedorId: "jero", valor: 2000 })
  })
  it("pagamento da conta já lançado à mão: vincula", () => {
    const manual = lanc({ id: "aj", tipo: "receita", formaPagamento: "conta", fornecedorId: "jero", valor: 2000 })
    expect(sugerir({ ...base, tx: tx({ contraparte_nome: "Jerograf", valor: 2000 }), lancamentos: [manual] })).toMatchObject({ acao: "vincular", lancamentoId: "aj" })
  })
  it("transferência entre as suas contas: ignora", () => {
    expect(sugerir({ ...base, tx: tx({ contraparte_doc: "48970391851" }), lancamentos: [], documentosProprios: ["48970391851"] })).toMatchObject({ acao: "ignorar" })
  })
  it("correção vira regra e vale na próxima", () => {
    const t = tx({ contraparte_nome: "Papelaria Brás", contraparte_doc: "11222333000144", valor: 350 })
    const regras = aprender([], t, { acao: "lancar", categoria: "materiais", descricao: "Papel" })
    expect(sugerir({ ...base, regras, tx: { ...t, id: "t2", valor: 420 }, lancamentos: [] })).toMatchObject({ acao: "criar", origem: "regra" })
    const de2 = aprender(regras, t, { acao: "lancar", categoria: "materiais" })
    expect(de2).toHaveLength(1)
    expect(de2[0].vezes).toBe(2)
  })
  it("Pluggy → formato do sistema", () => {
    const t = daPluggy({ id: "x", accountId: "a", date: "2026-11-03T10:00:00.000Z", description: "PIX RECEBIDO", amount: 250, type: "CREDIT", paymentData: { payer: { name: "Ana Cosméticos", documentNumber: { value: "12.345.678/0001-90" } } } }, "Inter")
    expect(t).toMatchObject({ tipo: "entrada", valor: 250, contraparte_nome: "Ana Cosméticos", contraparte_doc: "12345678000190", data: "2026-11-03" })
    expect(daPluggy({ id: "y", accountId: "a", date: "2026-11-03", amount: -80, description: "Compra" }, null).tipo).toBe("saida")
    expect(chaveContraparte({ contraparte_doc: null, contraparte_nome: "Gráfica X", descricao: "" })).toBe("grafica x")
  })
})
