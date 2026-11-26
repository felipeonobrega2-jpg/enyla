import { describe, it, expect } from "vitest"
import { formatarData, formatarIntervaloDatas, formatarMoeda } from "../app/lib/formato"

describe("formato pt-BR", () => {
  it("data curta e longa", () => {
    expect(formatarData("2026-11-30")).toBe("30/11")
    expect(formatarData("2026-11-30", { formato: "longa" })).toBe("30 de novembro")
    expect(formatarData("2026-11-30", { ano: true })).toBe("30/11/2026")
    expect(formatarData("2026-11-30", { formato: "longa", ano: true })).toBe("30 de novembro de 2026")
  })
  it("usa o fuso de São Paulo", () => {
    expect(formatarData("2026-12-01T01:30:00.000Z")).toBe("30/11")   // 22h30 do dia 30 em Brasília
  })
  it("inválido e vazio", () => {
    expect(formatarData(null)).toBe("")
    expect(formatarData("lixo")).toBe("")
  })
  it("intervalo", () => {
    expect(formatarIntervaloDatas("2026-11-25", "2026-11-30")).toBe("25/11 a 30/11")
    expect(formatarIntervaloDatas("2026-11-25", "2026-11-25")).toBe("25/11")
    expect(formatarIntervaloDatas("2026-11-25", "2026-11-30", { formato: "longa" })).toBe("25 de novembro a 30 de novembro")
    expect(formatarIntervaloDatas(null, "2026-11-30")).toBe("30/11")
  })
  it("moeda", () => {
    expect(formatarMoeda(1000).replace(/\s/g, " ")).toBe("R$ 1.000,00")
  })
})
