import { describe, it, expect } from "vitest"
import { buscarDesenhos, lerTags, normalizarBusca, nomeDoDesenho, tagsMaisUsadas, type Desenho } from "../app/lib/biblioteca"

const d = (id: string, x: Partial<Desenho>): Desenho => ({ id, nome: "dieline_de_caixa_com_fundo_automático_52×32×85_mm.dxf", caixa: { largura: 52, altura: 85, profundidade: 32 }, blank: { largura: 200, altura: 180 }, criadoEm: "2026-11-01", ...x })
const lista = [
  d("a", { apelido: "Perfume 20ml fundo automático", tags: ["perfume", "20ml"] }),
  d("b", { apelido: "Cartucho 50 ml", tags: ["perfume", "50ml", "villa"], modelo: "cartucho" }),
  d("c", { nome: "dieline_de_caixa_tampa_e_fundo_100×100×40_mm.dxf", caixa: { largura: 100, altura: 40, profundidade: 100 } }),
]

describe("busca de facas", () => {
  it("todas as palavras precisam bater, em qualquer campo", () => {
    expect(buscarDesenhos(lista, "perfume 20ml").map(x => x.id)).toEqual(["a"])
    expect(buscarDesenhos(lista, "perfume").map(x => x.id).sort()).toEqual(["a", "b"])
  })
  it("20 ml = 20ml, sem acento e maiúscula", () => {
    expect(buscarDesenhos(lista, "PERFUME 20 ML").map(x => x.id)).toEqual(["a"])
    expect(buscarDesenhos(lista, "automatico").map(x => x.id)).toContain("a")
  })
  it("acha pela medida da caixa e pelo nome do arquivo", () => {
    expect(buscarDesenhos(lista, "10x4x10").map(x => x.id)).toEqual(["c"])
    expect(buscarDesenhos(lista, "tampa").map(x => x.id)).toEqual(["c"])
  })
  it("palavra-chave exata vem antes", () => {
    const l = [d("x", { apelido: "Caixa villa nova" }), d("y", { tags: ["villa"] })]
    expect(buscarDesenhos(l, "villa").map(x => x.id)).toEqual(["y", "x"])
  })
  it("busca vazia devolve tudo", () => expect(buscarDesenhos(lista, "  ")).toHaveLength(3))
})

describe("palavras-chave e nome", () => {
  it("lê, normaliza e não repete", () => expect(lerTags("Perfume, 20 ml; perfume\n#Villa")).toEqual(["perfume", "20ml", "villa"]))
  it("normaliza", () => expect(normalizarBusca("Caixa  50 ML 5×5")).toBe("caixa 50ml 5x5"))
  it("seu nome vale sobre o do arquivo", () => {
    expect(nomeDoDesenho(lista[0])).toBe("Perfume 20ml fundo automático")
    expect(nomeDoDesenho(lista[2])).toBe("Caixa tampa e fundo 100×100×40 mm")
  })
  it("mais usadas primeiro", () => expect(tagsMaisUsadas(lista)).toEqual(["perfume", "20ml", "50ml", "villa"]))
})
