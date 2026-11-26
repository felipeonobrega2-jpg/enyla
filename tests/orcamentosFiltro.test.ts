import { describe, it, expect } from "vitest"
import { antigaSemCard } from "../app/lib/orcamentosFiltro"
import type { KanbanCard } from "../app/types"

const hoje = new Date("2026-11-26T12:00:00")
const card = { id: "c1" } as KanbanCard

describe("antigaSemCard", () => {
  it("sem card, sem valor e com mais de 60 dias: é antiga", () => {
    expect(antigaSemCard({ preco: 0, data: "2026-06-10" }, hoje)).toBe(true)
    expect(antigaSemCard({ preco: 0, data: "10/09/2026, 10:00" }, hoje)).toBe(true)
  })
  it("com card, não é", () => {
    expect(antigaSemCard({ card, preco: 0, data: "2026-06-10" }, hoje)).toBe(false)
  })
  it("com valor, não é", () => {
    expect(antigaSemCard({ preco: 150, data: "2026-06-10" }, hoje)).toBe(false)
  })
  it("recente (até 60 dias), não é", () => {
    expect(antigaSemCard({ preco: 0, data: "2026-10-01" }, hoje)).toBe(false)
    expect(antigaSemCard({ preco: 0, data: "2026-09-27" }, hoje)).toBe(false)
  })
  it("data ilegível, não é", () => {
    expect(antigaSemCard({ preco: 0, data: "" }, hoje)).toBe(false)
  })
})
