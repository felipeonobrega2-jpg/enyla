import { describe, it, expect, afterEach } from "vitest"
import { lerContasOpeni, contaValeNaData, daOpeni, fonteDoExtrato, segredoValido, lerTermosEmpresa, ehDaEmpresa } from "@/app/lib/openi"

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

  it("conta mista: lê a flag e classifica por termos (sem acento, sem caixa)", () => {
    expect(lerContasOpeni(JSON.stringify([{ item: "i", conta: "m1", mista: true }, { item: "i", conta: "m2" }])).map(c => c.mista)).toEqual([true, false])
    const termos = lerTermosEmpresa(["Ferramenta Ficticia", "Hospedagem  Exemplo", "ab"], undefined)
    expect(termos).toEqual(["ferramenta ficticia", "hospedagem exemplo"])
    expect(ehDaEmpresa({ descricao: "COMPRA FERRAMENTA FICTÍCIA 12/11" }, termos)).toBe(true)
    expect(ehDaEmpresa({ descricao: "Mercado", contraparte_nome: "Hospedagem Exemplo Ltda" }, termos)).toBe(true)
    expect(ehDaEmpresa({ descricao: "Padaria do bairro" }, termos)).toBe(false)
    expect(ehDaEmpresa({ descricao: "qualquer" }, [])).toBe(false)
  })

  it("termos vêm da env quando a config está vazia", () => {
    expect(lerTermosEmpresa([], JSON.stringify(["Servico Ficticio"]))).toEqual(["servico ficticio"])
    expect(lerTermosEmpresa(undefined, "lixo")).toEqual([])
  })
})
