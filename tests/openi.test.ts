import { describe, it, expect, afterEach } from "vitest"
import { lerContasOpeni, contaValeNaData, daOpeni, fonteDoExtrato, segredoValido } from "@/app/lib/openi"

// Só dados fictícios.
describe("Openi", () => {
  afterEach(() => { delete process.env.OPENI_WEBHOOK_SECRET })

  it("lê as contas da configuração e ignora lixo", () => {
    expect(lerContasOpeni(undefined)).toEqual([])
    expect(lerContasOpeni("não é json")).toEqual([])
    const c = lerContasOpeni(JSON.stringify([{ item: "i1", conta: "a1", antesDe: "2026-12-01" }, { item: "i2", conta: "b1", aPartirDe: "2026-12-01" }, { item: "", conta: "x" }]))
    expect(c).toHaveLength(2)
  })

  it("conta A vale até a data X, conta B a partir dela", () => {
    const a = { antesDe: "2026-12-01" }, b = { aPartirDe: "2026-12-01" }
    expect(contaValeNaData(a, "2026-11-30")).toBe(true)
    expect(contaValeNaData(a, "2026-12-01")).toBe(false)
    expect(contaValeNaData(b, "2026-11-30")).toBe(false)
    expect(contaValeNaData(b, "2026-12-01")).toBe(true)
  })

  it("mapeia o movimento no formato da Pluggy, com id prefixado", () => {
    const m = daOpeni({ id: "t1", date: "2026-11-20T10:00:00Z", amount: -12.5, type: "DEBIT", description: " Fornecedor Fictício " }, "a1", "Openi · a1")
    expect(m).toMatchObject({ id: "openi:t1", data: "2026-11-20", valor: 12.5, tipo: "saida", descricao: "Fornecedor Fictício" })
    expect(daOpeni({ id: "t2", date: "2026-11-20", amount: 5 }, "a1", null)?.tipo).toBe("entrada")
    expect(daOpeni({ date: "2026-11-20", amount: 5 }, "a1", null)).toBeNull()
  })

  const pagador = { name: "Pagador Exemplo", document: "000.000.000-00", documentType: "CPF" }
  const recebedor = { name: "Recebedor Exemplo LTDA", document: "00.000.000/0001-00", documentType: "CNPJ" }

  it("formato real: débito perto da meia-noite UTC vira o dia de São Paulo, categoria e recebedor", () => {
    const m = daOpeni({ id: "tx-exemplo-1", type: "DEBIT", amount: "-360.00", description: "PIX ENVIADO", category: { id: "cat-1", name: "Transfer - PIX" }, transactionAt: "2026-11-27T01:30:00.000Z", payer: pagador, receiver: recebedor }, "a1", null)
    expect(m).toMatchObject({ data: "2026-11-26", valor: 360, tipo: "saida", categoria_pluggy: "Transfer - PIX", contraparte_nome: "Recebedor Exemplo LTDA", contraparte_doc: "00000000000100" })
  })

  it("formato real: crédito usa o pagador; 03:00Z já é o mesmo dia em São Paulo", () => {
    const m = daOpeni({ id: "tx-exemplo-2", type: "CREDIT", amount: "150.00", category: { name: "Income" }, transactionAt: "2026-11-27T03:00:00.000Z", payer: pagador, receiver: recebedor }, "a1", null)
    expect(m).toMatchObject({ data: "2026-11-27", valor: 150, tipo: "entrada", contraparte_nome: "Pagador Exemplo", contraparte_doc: "00000000000" })
  })

  it("data: meia-noite UTC e AAAA-MM-DD usam os 10 primeiros caracteres", () => {
    expect(daOpeni({ id: "a", amount: 1, transactionAt: "2026-11-27T00:00:00Z" }, "a1", null)?.data).toBe("2026-11-27")
    expect(daOpeni({ id: "b", amount: 1, transactionAt: "2026-11-27" }, "a1", null)?.data).toBe("2026-11-27")
  })

  it("categoria string é mantida; vazia vira null", () => {
    expect(daOpeni({ id: "a", amount: 1, date: "2026-11-20", category: "Mercado" }, "a1", null)?.categoria_pluggy).toBe("Mercado")
    expect(daOpeni({ id: "b", amount: 1, date: "2026-11-20", category: { id: "x", name: "" } }, "a1", null)?.categoria_pluggy).toBeNull()
    expect(daOpeni({ id: "c", amount: 1, date: "2026-11-20", category: null }, "a1", null)?.categoria_pluggy).toBeNull()
  })

  it("padrão da chave é pluggy", () => {
    expect(fonteDoExtrato(undefined)).toBe("pluggy")
    expect(fonteDoExtrato("openi")).toBe("openi")
    expect(fonteDoExtrato("qualquer")).toBe("pluggy")
  })

  it("valida o segredo do webhook", () => {
    expect(segredoValido("x")).toBe(false)
    process.env.OPENI_WEBHOOK_SECRET = "segredo-ficticio"
    expect(segredoValido("segredo-ficticio")).toBe(true)
    expect(segredoValido("outro")).toBe(false)
    expect(segredoValido(null)).toBe(false)
  })
})
