import { describe, it, expect } from "vitest"
import { qualidadeDoLead, total, linhaVazia, custoPor, variacao, periodos, dentro, textoResumoWhatsapp, horaDoRelatorio, numerosParaIA, Relatorio } from "../app/lib/marketing"

describe("qualidadeDoLead", () => {
  it("MQL pela etapa ou pelas etiquetas de perfil", () => {
    expect(qualidadeDoLead({ status_lead: "mql", etiquetas: [] })).toBe("mql")
    expect(qualidadeDoLead({ status_lead: null, etiquetas: ["Oportunidade"] })).toBe("mql")
  })
  it("pequeno é descartado; sem nada é aberto", () => {
    expect(qualidadeDoLead({ status_lead: null, etiquetas: ["Lead pequeno"] })).toBe("descartado")
    expect(qualidadeDoLead({ status_lead: "novo", etiquetas: ["F1"] })).toBe("aberto")
  })
})

describe("contas", () => {
  it("custo por MQL é null sem MQL (não é custo zero)", () => {
    expect(custoPor(100, 0)).toBeNull()
    expect(custoPor(155, 12)).toBeCloseTo(12.92, 2)
  })
  it("variação sem base é null", () => {
    expect(variacao(10, 0)).toBeNull()
    expect(variacao(15, 10)).toBeCloseTo(0.5)
  })
  it("total soma as campanhas", () => {
    const t = total([{ ...linhaVazia("a", "A"), gasto: 10, mql: 1 }, { ...linhaVazia("b", "B"), gasto: 5, mql: 2 }])
    expect(t.gasto).toBe(15)
    expect(t.mql).toBe(3)
  })
})

describe("períodos (São Paulo)", () => {
  it("semana e semana anterior", () => {
    expect(periodos("2026-11-04")).toEqual({ dia1: { de: "2026-11-04", ate: "2026-11-04" }, semana: { de: "2026-10-29", ate: "2026-11-04" }, semanaAnterior: { de: "2026-10-22", ate: "2026-10-28" } })
  })
  it("lead às 23h de São Paulo conta no dia de São Paulo", () => {
    expect(dentro("2026-11-05T02:00:00Z", { de: "2026-11-04", ate: "2026-11-04" })).toBe(true)
  })
  it("relatório sai depois das 9h15", () => {
    expect(horaDoRelatorio(new Date("2026-11-05T12:10:00Z"))).toBe(false)  // 9h10
    expect(horaDoRelatorio(new Date("2026-11-05T12:20:00Z"))).toBe(true)   // 9h20
  })
})

it("resumo do WhatsApp traz MQL, custo por MQL, a ação e o link", () => {
  const l = { ...linhaVazia("c", "Campanha"), gasto: 155, leads: 98, mql: 12 }
  const r: Relatorio = { dia: "2026-11-04", geradoEm: "", dia1: [l], semana: [l], semanaAnterior: [], leitura: { resumo: "Bom dia.", destaques: [], acao: "Orçar os MQL." } }
  const t = textoResumoWhatsapp(r, "https://app.exemplo/?aba=meta")
  expect(t).toContain("*12 MQL*")
  expect(t).toContain("12,92")
  expect(t).toContain("Orçar os MQL.")
  expect(t).toContain("?aba=meta")
  expect(numerosParaIA(r)).toContain("custo por MQL")
})

describe("resumo da manhã", () => {
  const r: Relatorio = { dia: "2026-11-04", geradoEm: "", dia1: [{ ...linhaVazia("c", "C"), gasto: 155, leads: 98, mql: 12 }], semana: [], semanaAnterior: [], leitura: { resumo: "Bom dia.", destaques: [], acao: "Leve os MQL para orçamento." } }
  it("bons negócios esperando vêm primeiro, com perfil e quantidade, e o link do Hoje", () => {
    const esperando = Array.from({ length: 7 }, (_, i) => ({ nome: `Lead ${i}`, jid: `${i}@lid`, rotulo: i ? "Lead médio" : "ICP", quantidade: i ? null : 3000 }))
    const t = textoResumoWhatsapp(r, "https://x/?aba=meta", { esperando, orcamentosSemResposta: 2, linkHoje: "https://x/?aba=painel" })
    expect(t.split("\n")[0]).toBe("☀️ *7 bons negócios esperando sua resposta*")
    expect(t).toContain("• Lead 0 · ICP · 3.000 un")
    expect(t).toContain("• e mais 2")
    expect(t).toContain("2 orçamentos sem resposta")
    expect(t.indexOf("https://x/?aba=painel")).toBeLessThan(t.indexOf("Marketing de ontem"))
  })
  it("sem nada esperando, só avisa e segue para o marketing", () => {
    const t = textoResumoWhatsapp(r, "https://x/?aba=meta", { esperando: [], orcamentosSemResposta: 0, linkHoje: "https://x/?aba=painel" })
    expect(t).toContain("Nenhum bom negócio esperando")
    expect(t).not.toContain("aba=painel")
  })
})
