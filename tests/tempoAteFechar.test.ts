import { describe, it, expect } from "vitest"
import { estatistica, diasEntre, montarTempo, textoParaIA } from "@/app/lib/tempoAteFechar"

describe("tempo até fechar", () => {
  it("mediana e faixa da metade dos casos", () => {
    expect(estatistica([13, 14, 27, 26, 37, 58, 97, 120, 223, 3])).toMatchObject({ n: 10, mediana: 32, p25: 14, p75: 97 })
    expect(estatistica([])).toBeNull()
  })
  it("sem contato, ou contato depois do fechamento (antes do histórico): sem dado", () => {
    const f = new Date("2026-09-30T12:00:00")
    expect(diasEntre(null, f)).toBeNull()
    expect(diasEntre(new Date("2026-10-05T12:00:00"), f)).toBeNull()
    expect(diasEntre(new Date("2026-09-02T12:00:00"), f)).toBe(28)
  })
  it("separa offset e digital, mais recentes primeiro, e lista quem ficou de fora", () => {
    const t = montarTempo([
      { cliente: "A", tipo: "offset", fechou: "2026-09-01", valor: 1, dias: 10 },
      { cliente: "B", tipo: "offset", fechou: "2026-10-01", valor: 1, dias: null },
      { cliente: "C", tipo: "digital", fechou: "2026-11-12", valor: 1, dias: 3 },
    ])
    expect(t.offset?.mediana).toBe(10)
    expect(t.digital?.mediana).toBe(3)
    expect(t.casos[0].cliente).toBe("C")
    expect(t.semDado).toEqual(["B"])
    expect(textoParaIA(t)).toMatch(/mediana 10 dias[\s\S]*menos de 10 dias/)
  })
})
