import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { lerOfx, valorOfx, dataOfx, sugerirCasamentos } from "@/app/lib/extratoOfx"

const sgml = readFileSync("tests/fixtures/extrato-ficticio.ofx", "utf8")

describe("lerOfx (SGML)", () => {
  const r = lerOfx(sgml)
  it("lê crédito e débito com conta, valor positivo e data", () => {
    expect(r.contas).toEqual(["0033/000000000-0"])
    expect(r.linhas[0]).toEqual({ data: "2026-11-03", valor: 1500, tipo: "credito", descricao: "PIX RECEBIDO CLIENTE FICTICIO LTDA", fitId: "FIT0001", conta: "0033/000000000-0" })
    expect(r.linhas[1]).toMatchObject({ tipo: "debito", valor: 320.5, descricao: "PAPELARIA EXEMPLO - COMPRA CARTAO & CIA" })
  })
  it("aceita vírgula decimal e ignora data inválida", () => {
    expect(r.linhas[2]).toMatchObject({ valor: 1234.56, tipo: "debito" })
    expect(r.linhas).toHaveLength(3)
    expect(r.ignoradas).toBe(1)
  })
})

describe("lerOfx (XML)", () => {
  const xml = `<?xml version="1.0"?><OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0033</BANKID><ACCTID>123</ACCTID></BANKACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261105120000</DTPOSTED><TRNAMT>-50.25</TRNAMT><FITID>X1</FITID><MEMO>TARIFA</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261106</DTPOSTED><TRNAMT>10</TRNAMT><FITID>X2</FITID><MEMO>PIX</MEMO></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`
  it("lê tags fechadas", () => {
    const r = lerOfx(xml)
    expect(r.linhas.map(l => [l.fitId, l.tipo, l.valor, l.data, l.conta])).toEqual([["X1", "debito", 50.25, "2026-11-05", "0033/123"], ["X2", "credito", 10, "2026-11-06", "0033/123"]])
  })
})

describe("erros e auxiliares", () => {
  it("rejeita arquivo que não é OFX", () => { expect(() => lerOfx("a;b;c")).toThrow(/OFX/) })
  it("valorOfx e dataOfx", () => {
    expect(valorOfx("-12.5")).toBe(-12.5); expect(valorOfx("abc")).toBeNaN()
    expect(dataOfx("20260229")).toBe(""); expect(dataOfx("20240229")).toBe("2024-02-29")
  })
  it("FITID ausente gera id estável", () => {
    const t = "<OFX><STMTTRN><DTPOSTED>20261105<TRNAMT>-5.00<MEMO>X</STMTTRN></OFX>"
    expect(lerOfx(t).linhas[0].fitId).toBe(lerOfx(t).linhas[0].fitId)
  })
})

describe("sugerirCasamentos", () => {
  const ext = [
    { data: "2026-11-05", valor: 320.5, tipo: "debito", descricao: "A", fitId: "F1", conta: "c" },
    { data: "2026-11-08", valor: 320.5, tipo: "debito", descricao: "B", fitId: "F2", conta: "c" },
    { data: "2026-11-06", valor: 320.5, tipo: "credito", descricao: "crédito não conta", fitId: "F3", conta: "c" },
    { data: "2026-11-12", valor: 99, tipo: "debito", descricao: "longe", fitId: "F4", conta: "c" },
  ]
  it("mesmo valor, ±3 dias, só débito, mais próximo primeiro", () => {
    const s = sugerirCasamentos([{ id: "d1", descricao: "Papel", valor: 320.5, dataPagamento: "2026-11-06" }, { id: "d2", descricao: "Longe", valor: 99, dataPagamento: "2026-11-05" }, { id: "d3", descricao: "Sem data", valor: 1 }], ext)
    expect(s).toHaveLength(1)
    expect(s[0].despesa.id).toBe("d1")
    expect(s[0].candidatos.map(c => c.fitId)).toEqual(["F1", "F2"])
  })
  it("4 dias fica de fora", () => {
    expect(sugerirCasamentos([{ id: "d", descricao: "x", valor: 320.5, dataPagamento: "2026-11-09" }], ext.slice(0, 1))).toEqual([])
  })
})
