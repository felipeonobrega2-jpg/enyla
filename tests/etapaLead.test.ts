import { describe, it, expect } from "vitest"
import { etapaDoLead, etiquetasCoerentes, coerente, ehBomNegocio } from "@/app/lib/etapaLead"

describe("etapa do lead num lugar só", () => {
  it("o status manda; o perfil é histórico", () => {
    expect(etapaDoLead({ status_lead: "perdido", etiquetas: ["MQL", "ICP"] })).toBe("perdido")
    expect(etapaDoLead({ status_lead: "mql", etiquetas: ["MQL", "Lead médio"] })).toBe("bom")
    expect(etapaDoLead({ status_lead: "mql", etiquetas: ["Digital", "Lead pequeno"] })).toBe("digital")   // caso Master Bacth
    expect(etapaDoLead({ status_lead: null, etiquetas: ["Fornecedora"] })).toBe("fornecedor")
    expect(etapaDoLead({ status_lead: null, etiquetas: ["F1"] })).toBe("novo")
    expect(ehBomNegocio({ status_lead: "perdido", etiquetas: ["MQL", "ICP"] })).toBe(false)
  })
  it("a etiqueta MQL/Descartado é só o reflexo do status", () => {
    expect(etiquetasCoerentes("perdido", ["MQL", "ICP", "F2"])).toEqual(["ICP", "F2"])            // tira o MQL, guarda o perfil
    expect(etiquetasCoerentes("mql", ["Lead médio"])).toEqual(["Lead médio", "MQL"])
    expect(etiquetasCoerentes("descartado", ["Lead pequeno"])).toEqual(["Lead pequeno", "Descartado"])
    expect(etiquetasCoerentes(null, ["Descartado", "Lead pequeno"])).toEqual(["Lead pequeno"])
    expect(coerente({ status_lead: "perdido", etiquetas: ["MQL"] })).toBe(false)
    expect(coerente({ status_lead: "mql", etiquetas: ["ICP", "MQL"] })).toBe(true)
  })
})
