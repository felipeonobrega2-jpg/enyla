import { describe, it, expect } from "vitest"
import { cumprimentoDoHorario, corrigirCumprimento, agoraParaIA } from "../app/lib/atendente"

// Horários de São Paulo (UTC-3)
const sp = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 5, h + 3, m))

describe("cumprimento do horário", () => {
  it("bom dia até 11h59, boa tarde até 17h59, boa noite depois e de madrugada", () => {
    expect(cumprimentoDoHorario(sp(6))).toBe("bom dia")
    expect(cumprimentoDoHorario(sp(11, 59))).toBe("bom dia")
    expect(cumprimentoDoHorario(sp(12))).toBe("boa tarde")
    expect(cumprimentoDoHorario(sp(17, 59))).toBe("boa tarde")
    expect(cumprimentoDoHorario(sp(18))).toBe("boa noite")
    expect(cumprimentoDoHorario(sp(2))).toBe("boa noite")
  })
  it("corrige os erros que aconteceram (F1 às 19h, resposta às 12h e às 11h)", () => {
    expect(corrigirCumprimento("Bom dia! Tudo bem? Conseguiu ver o Instagram?", sp(19))).toBe("Boa noite! Tudo bem? Conseguiu ver o Instagram?")
    expect(corrigirCumprimento("Oi, bom dia! Tudo bem? Aqui é o Luiz Felipe", sp(12, 30))).toBe("Oi, boa tarde! Tudo bem? Aqui é o Luiz Felipe")
    expect(corrigirCumprimento("Boa tarde, tudo bem sim! Aqui é o Luiz Felipe", sp(11))).toBe("Bom dia, tudo bem sim! Aqui é o Luiz Felipe")
  })
  it("certo fica como está; no meio da frase não mexe; corrige o começo de cada parte", () => {
    expect(corrigirCumprimento("Boa noite! Tudo certo?", sp(20))).toBe("Boa noite! Tudo certo?")
    expect(corrigirCumprimento("Combinado, tenha um bom dia!", sp(20))).toBe("Combinado, tenha um bom dia!")
    expect(corrigirCumprimento("Oi!\n\nbom dia, posso te ajudar?", sp(15))).toBe("Oi!\n\nboa tarde, posso te ajudar?")
  })
  it("a IA recebe a hora e o cumprimento certo", () => {
    expect(agoraParaIA(sp(19, 5))).toContain('19:05 em São Paulo')
    expect(agoraParaIA(sp(19, 5))).toContain('"boa noite"')
  })
})
