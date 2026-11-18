import { describe, it, expect } from "vitest"
import { calcular } from "@/app/calculos"
import { mensagemLote } from "@/app/lib/mensagemProposta"
import { gerarHtmlLoteCliente } from "@/app/pdf"
import { config, FORM } from "./fixtures"

const item = (frente: number, numero: string) => {
  const form = { ...FORM, nomeCliente: "Perfumaria Modelo", frente, alturaBox: 12, lateral: frente, quantidades: [1000, 3000] }
  return { form, calculo: calcular(form, config())!, numero, data: "15/11/2026, 10:00:00" }
}

describe("orçamento em lote", () => {
  const itens = [item(5, "ORC-2026-301"), item(7, "ORC-2026-302")]

  it("mensagem lista cada tamanho com o seu link e o total", () => {
    const m = mensagemLote(itens.map((x, i) => ({ ...x, link: `https://x/aprovar/${i}` })))
    expect(m).toContain("Oi! Segue a proposta das 2 embalagens.")   // "Perfumaria Modelo" é empresa: sem nome
    expect(m).toMatch(/1\. .*5 × 12 × 5 cm/)
    expect(m).toMatch(/2\. .*7 × 12 × 7 cm/)
    expect(m).toContain("https://x/aprovar/0")
    expect(m).toContain("https://x/aprovar/1")
    expect(m).toContain("Total dos 2 itens:")
  })

  it("PDF: resumo na frente, a proposta de cada item e as condições gerais uma vez só", () => {
    const html = gerarHtmlLoteCliente(itens.map(x => ({ item: x })))
    expect(html).toContain("Resumo da proposta")
    expect(html.match(/<body>/g)).toHaveLength(1)
    expect(html).toContain("ORC-2026-301")
    expect(html).toContain("ORC-2026-302")
    expect(html.match(/Valores<\/div>/g)).toHaveLength(2)
    expect(html.match(/Condições Gerais <span>/g)).toHaveLength(1)
    expect(gerarHtmlLoteCliente([])).toBe("")
  })
})

describe("frete grátis (São Paulo)", async () => {
  const { gerarHtmlOrcamentoCliente } = await import("@/app/pdf")
  const { mensagemProposta } = await import("@/app/lib/mensagemProposta")
  const base = item(5, "ORC-2026-401")
  it("aparece no PDF (condições e condições gerais) e na mensagem só quando marcado", () => {
    const com = { ...base, form: { ...base.form, freteGratis: true } }
    const html = gerarHtmlOrcamentoCliente(com)
    expect(html).toContain("Frete grátis para entregas em São Paulo</strong>")
    expect(html).toContain("a entrega é por nossa conta")
    expect(mensagemProposta(com.form, com.calculo, "ORC-2026-401", null)).toContain("Frete grátis para entregas em São Paulo")
    expect(gerarHtmlOrcamentoCliente(base)).not.toContain("Frete grátis")
    expect(mensagemProposta(base.form, base.calculo, "ORC-2026-401", null)).not.toContain("Frete grátis")
  })
  it("lote: uma linha só no fim da mensagem", () => {
    const itens = [item(5, "A"), item(7, "B")].map(x => ({ ...x, form: { ...x.form, freteGratis: true }, link: null }))
    const m = mensagemLote(itens)
    expect(m.match(/Frete grátis/g)).toHaveLength(1)
  })
})
