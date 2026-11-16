import { describe, it, expect } from "vitest"
import { candidatas, sugerirQuantidades } from "@/app/lib/sugerirQuantidades"
import { facasParaPedido, type Desenho } from "@/app/lib/biblioteca"
import { calcular } from "@/app/calculos"
import { config, FORM } from "./fixtures"

describe("sugestão de quantidades", () => {
  // Degraus de 100 folhas: 800–950 no mesmo papel, 1.100 sobe
  const precos = [[800, 3334], [850, 3360], [900, 3390], [950, 3423], [1000, 4000], [1050, 4030], [1100, 4051], [1150, 4080], [1200, 4110], [1300, 4700], [2000, 5664], [3000, 7600]]
    .map(([quantidade, total]) => ({ quantidade, total }))
  it("rende mais: maior quantidade até 5% a mais no total", () => {
    const s = sugerirQuantidades([1000], precos)
    const rende = s.find(x => x.tipo === "rende")!
    expect(rende.quantidade).toBe(1200)
    expect(rende.texto).toContain("+200 caixas")
  })
  it("mais em conta: logo abaixo do degrau", () => {
    expect(sugerirQuantidades([1000], precos).find(x => x.tipo === "abaixo")?.quantidade).toBe(950)
  })
  it("volume: 2x quando o unitário cai 15% ou mais", () => {
    const v = sugerirQuantidades([1000], precos).find(x => x.tipo === "volume")!
    expect(v.quantidade).toBe(2000)
    expect(v.texto).toMatch(/Unitário cai 29%/)
  })
  it("não sugere quantidade que já está no orçamento", () => {
    expect(sugerirQuantidades([1000, 1200, 2000], precos).map(x => x.quantidade)).not.toContain(1200)
  })
  it("candidatas em passos redondos em volta da orçada", () => {
    const c = candidatas([1000])
    expect(c).toContain(800); expect(c).toContain(1600); expect(c).toContain(2000); expect(c).toContain(3000)
    expect(c).not.toContain(1000)
    expect(c.every(q => q % 50 === 0)).toBe(true)
  })
  it("com o motor de verdade sai pelo menos uma sugestão", () => {
    const f = { ...FORM, quantidades: [1000] }
    const precoDe = (l: { quantidade: number; precoSemFaca: number }) => ({ quantidade: l.quantidade, total: l.precoSemFaca })
    const base = calcular(f, config())!.tabela.map(precoDe)
    const extra = calcular({ ...f, quantidades: candidatas([1000]) }, config())!.tabela.map(precoDe)
    expect(sugerirQuantidades([1000], [...base, ...extra]).length).toBeGreaterThan(0)
  })
})

describe("faca guardada para o pedido da conversa", () => {
  const d = (id: string, caixa: [number, number, number] | null, x: Partial<Desenho> = {}): Desenho =>
    ({ id, nome: `dieline_${id}.dxf`, caixa: caixa ? { largura: caixa[0], altura: caixa[1], profundidade: caixa[2] } : null, blank: { largura: 200, altura: 150 }, criadoEm: "2026-11-01", ...x })
  const lista = [d("a", [52, 120, 52]), d("b", [50, 118, 55]), d("c", [40, 90, 40], { tags: ["50ml"] }), d("d", [60, 150, 60], { tags: ["150ml"] })]
  it("caixa ±5 mm, largura e profundidade em qualquer ordem, a mais parecida primeiro", () => {
    expect(facasParaPedido(lista, { caixa_cm: { frente: 5.2, lateral: 5.2, altura: 12 } }).map(x => x.d.id)).toEqual(["a", "b"])
    expect(facasParaPedido(lista, { caixa_cm: { frente: 5.5, lateral: 5, altura: 11.8 } }).map(x => x.d.id)[0]).toBe("b")
  })
  it("ml pela palavra-chave, sem confundir 50 ml com 150 ml", () => {
    expect(facasParaPedido(lista, { volume_ml: 50 }).map(x => x.d.id)).toEqual(["c"])
  })
})

describe("valor da faca digitado", () => {
  it("vale o mesmo em todas as quantidades", () => {
    const r = calcular({ ...FORM, comFaca: true, valorFaca: 500, quantidades: [300, 1000, 5000] }, config())!
    for (const x of r.rotas!) expect(x.melhor.itens.find(i => i.etapa === "faca")?.valor).toBe(500)
  })
})
