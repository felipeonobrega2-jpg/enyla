import { describe, it, expect } from "vitest"
import { bancoParado, recusaDoMeuPluggy } from "../app/lib/pluggy"

const agora = Date.parse("2026-11-27T12:00:00Z")
const h = (n: number) => new Date(agora - n * 3600_000).toISOString()
const recusa = { ok: false, erro: "MeuPluggy item cant be updated" }

describe("banco parado (MeuPluggy)", () => {
  it("reconhece a recusa do MeuPluggy", () => {
    expect(recusaDoMeuPluggy("MeuPluggy item cant be updated")).toBe(true)
    expect(recusaDoMeuPluggy("Sem conexão com a Pluggy.")).toBe(false)
  })
  it("recusa do MeuPluggy com dados recentes não marca parado", () => {
    expect(bancoParado(recusa, h(2), agora)).toBe(false)
  })
  it("recusa do MeuPluggy com dados com mais de 36h marca parado", () => {
    expect(bancoParado(recusa, h(37), agora)).toBe(true)
    expect(bancoParado(recusa, null, agora)).toBe(true)
  })
  it("outro erro continua marcando parado", () => {
    expect(bancoParado({ ok: false, erro: "Sem conexão com a Pluggy." }, h(1), agora)).toBe(true)
  })
  it("sem erro e recente não marca parado", () => {
    expect(bancoParado({ ok: true }, h(1), agora)).toBe(false)
  })
})
