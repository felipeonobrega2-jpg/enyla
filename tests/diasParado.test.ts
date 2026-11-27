import { describe, it, expect } from "vitest"
import { diasParado, ultimaMovimentacao } from "../app/lib/diasParado"

const agora = new Date("2026-11-26T15:00:00Z").getTime()

describe("diasParado", () => {
  it("sem conversa, conta desde a data do orçamento", () => {
    expect(diasParado({ data: "16/11/2026, 10:00:00" }, null, agora)).toBe(10)
  })
  it("usa a mensagem mais recente, nossa ou do cliente", () => {
    const c = { recebida: "2026-11-20T12:00:00Z", enviada: "2026-11-24T12:00:00Z" }
    expect(diasParado({ data: "01/11/2026, 10:00:00" }, c, agora)).toBe(2)
    expect(diasParado({ data: "01/11/2026, 10:00:00" }, { recebida: "2026-11-25T12:00:00Z", enviada: null }, agora)).toBe(1)
  })
  it("o fechamento conta como movimentação", () => {
    expect(diasParado({ data: "01/11/2026, 10:00:00", dataFechamento: "2026-11-23" }, null, agora)).toBe(3)
  })
  it("mensagem mais antiga que o card não puxa para trás", () => {
    expect(diasParado({ data: "20/11/2026, 10:00:00" }, { recebida: "2026-10-01T12:00:00Z", enviada: null }, agora)).toBe(6)
  })
  it("movimentação hoje ou no futuro dá 0; sem nenhuma data dá null", () => {
    expect(diasParado({ data: "26/11/2026, 09:00:00" }, null, agora)).toBe(0)
    expect(diasParado({ data: "30/11/2026, 09:00:00" }, null, agora)).toBe(0)
    expect(diasParado({ data: "" }, null, agora)).toBeNull()
    expect(ultimaMovimentacao({ data: "lixo" })).toBeNull()
  })
})
