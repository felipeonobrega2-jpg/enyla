import { describe, it, expect } from "vitest"
import { ondeCabe, frascoQueServe, servemParaFrasco, facasDoDesenho, type Desenho } from "@/app/lib/biblioteca"

const des = (id: string, caixa: [number, number, number], blank: [number, number]): Desenho =>
  ({ id, nome: `${id}.dxf`, caixa: { largura: caixa[0], altura: caixa[1], profundidade: caixa[2] }, blank: { largura: blank[0], altura: blank[1] }, criadoEm: "" })

describe("biblioteca de facas", () => {
  it("onde a peça cabe: digital e offset", () => {
    const o = ondeCabe(des("a", [52, 85, 32], [169.5, 149]))
    expect(o.digital).toBe("A4")
    expect(o.offset[0].porFolha).toBeGreaterThan(10)
    expect(ondeCabe(des("b", [100, 300, 100], [420, 500])).digital).toBeNull()
  })
  it("que frasco serve (folga de uns 2 mm por lado)", () => {
    expect(frascoQueServe(des("a", [43, 124, 43], [1, 1]))).toEqual({ altura: 12.1, diametro: 4 })
  })
  it("busca pelo frasco: só os que servem, do mais justo ao mais folgado", () => {
    const lista = [des("folgado", [46, 126, 46], [1, 1]), des("justo", [43, 124, 43], [1, 1]), des("pequeno", [38, 110, 38], [1, 1])]
    expect(servemParaFrasco(lista, 11.7, 3.9).map(x => x.d.id)).toEqual(["justo", "folgado"])
  })
  it("facas do desenho: as ligadas a ele e as antigas com a mesma peça (±1 mm, inclusive girada)", () => {
    const d = des("a", [52, 85, 32], [169.5, 149])
    const facas = [
      { id: "1", tipo: "faca" as const, cliente: "", produto: "", blankLargura: 1, blankAltura: 1, cavidades: 6, custo: 0, data: "", desenhoId: "a" },
      { id: "2", tipo: "faca" as const, cliente: "", produto: "", blankLargura: 149.4, blankAltura: 170, cavidades: 4, custo: 0, data: "" },
      { id: "3", tipo: "faca" as const, cliente: "", produto: "", blankLargura: 120, blankAltura: 90, cavidades: 8, custo: 0, data: "" },
      { id: "4", tipo: "faca" as const, cliente: "", produto: "", blankLargura: 169.5, blankAltura: 149, cavidades: 2, custo: 0, data: "", desenhoId: "outro" },
    ]
    expect(facasDoDesenho(d, facas).map(f => f.id)).toEqual(["1", "2"])
  })
})

describe("nome legível", () => {
  it("tira o prefixo e os sublinhados do Pacdora", async () => {
    const { nomeBonito } = await import("@/app/lib/biblioteca")
    expect(nomeBonito("dieline_de_caixa_com_fundo_automático_52×32×85_mm (1).dxf")).toBe("Caixa com fundo automático 52×32×85 mm")
    expect(nomeBonito("Export_Dieline_2026-08-15.dxf")).toBe("Export Dieline 2026-08-15")
  })
})
