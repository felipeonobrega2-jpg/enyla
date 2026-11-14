import { describe, it, expect } from "vitest"
import { devePedirMedida, textoPedirMedida, ConvMedida } from "../app/lib/pedirMedida"

const agora = new Date("2026-11-13T15:00:00Z").getTime()
const base: ConvMedida = {
  jid: "1@s.whatsapp.net", nome: "Carla Souza", status_lead: "mql", etiquetas: ["MQL"],
  ultima_recebida_at: "2026-11-13T10:00:00Z", ultima_enviada_at: "2026-11-13T09:00:00Z",
  dados: { quantidade: 3000, volume_ml: 50 } as never, etapa: null,
}

describe("pedir a medida ao bom negócio", () => {
  it("MQL com quantidade e só o ml, esperando há 5 h: pede", () => {
    expect(devePedirMedida(base, {}, new Set(), agora)).toBe(true)
  })
  it("não pede: já pediu, cliente da casa, já tem medida, você falou por último, cedo ou tarde demais, lead pequeno", () => {
    expect(devePedirMedida(base, { [base.jid]: "x" }, new Set(), agora)).toBe(false)
    expect(devePedirMedida(base, {}, new Set([base.jid]), agora)).toBe(false)
    expect(devePedirMedida({ ...base, dados: { quantidade: 3000, caixa_cm: { frente: 5, lateral: 5, altura: 12 } } as never }, {}, new Set(), agora)).toBe(false)
    expect(devePedirMedida({ ...base, ultima_enviada_at: "2026-11-13T11:00:00Z" }, {}, new Set(), agora)).toBe(false)
    expect(devePedirMedida({ ...base, ultima_recebida_at: "2026-11-13T14:30:00Z" }, {}, new Set(), agora)).toBe(false)
    expect(devePedirMedida({ ...base, ultima_recebida_at: "2026-11-09T10:00:00Z", ultima_enviada_at: null }, {}, new Set(), agora)).toBe(false)
    expect(devePedirMedida({ ...base, status_lead: null, etiquetas: ["Lead pequeno"] }, {}, new Set(), agora)).toBe(false)
  })
  it("texto na voz do Felipe, com o nome e o frasco", () => {
    const t = textoPedirMedida("Carla Souza", base.dados!)
    expect(t).toContain("Carla"); expect(t).toContain("3.000 caixas"); expect(t).toContain("50 ml"); expect(t).toContain("altura e a largura")
  })
})
