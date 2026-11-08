import { describe, it, expect } from "vitest"
import { varianteDoLead, aberturaPara, qualVariante, respostaDoLead, decidir, ABERTURA_B_PADRAO, TesteAbertura } from "../app/lib/aberturaAB"

const A = "Oi, tudo bem? aqui é o Luiz Felipe, da Jerograf / ENYLA👋 Você já tá vendendo seu produto ou tá lançando agora? E que volume você precisa?"
const t: TesteAbertura = { ligado: true, b: ABERTURA_B_PADRAO, inicio: "2026-11-07T00:00:00Z" }

describe("teste A/B da abertura", () => {
  it("cada lead sempre na mesma, mais ou menos metade em cada", () => {
    const jids = Array.from({ length: 400 }, (_, i) => `55119${String(10000000 + i * 7919)}@s.whatsapp.net`)
    const b = jids.filter(j => varianteDoLead(j, t) === "B").length
    expect(b).toBeGreaterThan(160); expect(b).toBeLessThan(240)
    expect(varianteDoLead(jids[3], t)).toBe(varianteDoLead(jids[3], t))
  })
  it("desligado ou decidido: todo mundo recebe a mesma", () => {
    expect(varianteDoLead("1@lid", { ...t, ligado: false })).toBe("A")
    expect(varianteDoLead("1@lid", undefined)).toBe("A")
    expect(aberturaPara("2@lid", A, { ...t, vencedora: "B" }).texto).toBe(ABERTURA_B_PADRAO)
  })
  it("reconhece qual foi mandada, mesmo com emoji e espaço diferente; texto de outra não conta", () => {
    expect(qualVariante(A.replace("👋", " 👋 "), A, t.b)).toBe("A")
    expect(qualVariante(ABERTURA_B_PADRAO, A, t.b)).toBe("B")
    expect(qualVariante("Bom dia, tudo bem? Aqui é o Luiz Felipe", A, t.b)).toBeNull()
  })
  it("resposta de verdade e volume dito", () => {
    expect(respostaDoLead([{ corpo: "ok", tipo: "text" }])).toEqual({ respondeu: false, volume: false })
    expect(respostaDoLead([{ corpo: "Já vendo", tipo: "text" }])).toEqual({ respondeu: true, volume: false })
    expect(respostaDoLead([{ corpo: "Umas 1.000", tipo: "text" }]).volume).toBe(true)
    expect(respostaDoLead([{ corpo: "uns 2 mil", tipo: "text" }]).volume).toBe(true)
    expect(respostaDoLead([{ corpo: "frasco de 100ml", tipo: "text" }]).volume).toBe(false)
    expect(respostaDoLead([{ corpo: null, tipo: "audio" }]).respondeu).toBe(true)
  })
  it("decide só com amostra e diferença clara, sem perder MQL; empate fica com a A", () => {
    const p = (leads: number, volume: number, mql = 10) => ({ leads, responderam: leads / 2, volume, mql })
    expect(decidir({ em: "", A: p(40, 10), B: p(40, 30) })).toBeNull()
    expect(decidir({ em: "", A: p(60, 15), B: p(60, 25) })?.vencedora).toBe("B")
    expect(decidir({ em: "", A: p(60, 15, 15), B: p(60, 25, 5) })).toBeNull()          // B diz volume mas perde MQL
    expect(decidir({ em: "", A: p(60, 15), B: p(60, 18) })).toBeNull()
    expect(decidir({ em: "", A: p(200, 50), B: p(200, 55) })?.vencedora).toBe("A")
  })
})
