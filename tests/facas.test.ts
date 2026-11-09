import { describe, expect, test } from "vitest"
import { lugaresCalculados, cabemNaChapa, situacao, erroFaca, type Faca } from "@/app/cartuxo/lib/facas"

const faca = (m: Partial<Faca> = {}): Faca => ({
  id: "1", codigo: "F-1", nome: "Caixa", tipo: "simples", frente_mm: 65, lateral_mm: 65, altura_mm: 130,
  lugares: null, planificacao: null, produto_slug: "caixa-perfume-100ml", tem_faca: true, no_site: true, obs: "", atualizada_em: "", ...m,
})

describe("facas da Cartuxo", () => {
  test("caixa de 100 ml dá 4 por chapa 66×48 (base dos custos)", () => {
    expect(lugaresCalculados("simples", 65, 65, 130)).toBe(4)
  })
  test("planificação do DXF considera a chapa girada", () => {
    expect(cabemNaChapa(300, 200)).toBe(4)
    expect(cabemNaChapa(200, 300)).toBe(4)
    expect(cabemNaChapa(400, 600)).toBe(1)   // só cabe girada
    expect(cabemNaChapa(0, 100)).toBe(0)
  })
  test("situação no site segue a regra do catálogo", () => {
    expect(situacao(undefined)).toBe("a-confirmar")
    expect(situacao(faca())).toBe("confirmada")
    expect(situacao(faca({ no_site: false }))).toBe("fora")
    expect(situacao(faca({ tem_faca: false }))).toBe("fora")
  })
  test("validação", () => {
    expect(erroFaca(faca())).toBeNull()
    expect(erroFaca(faca({ codigo: " " }))).toMatch(/código/)
    expect(erroFaca(faca({ altura_mm: 0 }))).toMatch(/mm/)
    expect(erroFaca(faca({ lugares: 2.5 }))).toMatch(/Lugares/)
  })
})
