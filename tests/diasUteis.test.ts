import { describe, it, expect, afterEach } from "vitest"
import { ehDiaUtil, somarDiasUteis, diasUteisEntre, definirFeriadosLocais } from "@/app/lib/diasUteis"

afterEach(() => definirFeriadosLocais(null))

describe("dias úteis", () => {
  it("pula fim de semana e Finados", () => {
    expect(somarDiasUteis("2026-10-30", 5)).toBe("2026-11-09")
    expect(diasUteisEntre("2026-10-30", "2026-11-09")).toBe(5)
    expect(diasUteisEntre("2026-11-09", "2026-10-30")).toBe(-5)
  })
  it("feriados móveis", () => {
    expect(ehDiaUtil("2027-02-08")).toBe(false) // Carnaval
    expect(ehDiaUtil("2027-03-26")).toBe(false) // Sexta-feira Santa
    expect(ehDiaUtil("2026-06-04")).toBe(false) // Corpus Christi
  })
  it("feriados de São Paulo e dias extras só quando configurados", () => {
    expect(ehDiaUtil("2027-01-25")).toBe(true)
    definirFeriadosLocais({ cidade: "sp", extras: ["12-24", "2026-12-31"] })
    expect(ehDiaUtil("2027-01-25")).toBe(false)
    expect(ehDiaUtil("2027-07-09")).toBe(false)
    expect(ehDiaUtil("2026-12-24")).toBe(false)
    expect(ehDiaUtil("2026-12-31")).toBe(false)
    expect(ehDiaUtil("2027-12-31")).toBe(true)
    expect(somarDiasUteis("2026-12-23", 1)).toBe("2026-12-28")
  })
})
