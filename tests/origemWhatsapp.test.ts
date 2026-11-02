import { describe, it, expect } from "vitest"
import { entradaDaMensagem, campanhaDoDia } from "@/app/lib/origemWhatsapp"

describe("origem da conversa do WhatsApp", () => {
  it("frase pronta do anúncio e do site", () => {
    expect(entradaDaMensagem("Olá, Gostaria se saber mais sobre as caixinhas.")?.canal).toBe("anuncio")
    expect(entradaDaMensagem("Olá, gostaria de solicitar um orçamento.")?.canal).toBe("site")
    expect(entradaDaMensagem("Boa tarde! Posso encomendar?")?.canal).toBe("anuncio")
    expect(entradaDaMensagem("Bom dia")).toBeNull()
    expect(entradaDaMensagem("eu queria saber se posso encomendar 50")).toBeNull()   // só vale no começo
  })
  it("campanha do dia: a que mais gerou conversas; provável quando havia outra no ar", () => {
    const porDia = new Map([["2026-07-10", new Map([["A", 3], ["B", 1]])], ["2026-07-11", new Map([["B", 2]])]])
    const nomes = new Map([["A", "Testar novamente"], ["B", "Campanha 02"]])
    expect(campanhaDoDia("2026-07-10", ["A", "B"], porDia, nomes)).toEqual({ campanhaId: "A", campanhaNome: "Testar novamente", provavel: true })
    expect(campanhaDoDia("2026-07-11", ["A", "B"], porDia, nomes)).toEqual({ campanhaId: "B", campanhaNome: "Campanha 02", provavel: false })
    expect(campanhaDoDia("2026-07-12", ["A", "B"], porDia, nomes)).toBeNull()
  })
})
