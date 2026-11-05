import { describe, it, expect } from "vitest"
import { normalizarTelefone, telefoneDaConversa, telefoneNaResposta, vcf, csv } from "@/app/lib/contatos"

describe("contatos importantes", () => {
  it("telefone com DDI e da conversa", () => {
    expect(normalizarTelefone("(11) 96843-7324")).toBe("5511968437324")
    expect(normalizarTelefone("5511968437324")).toBe("5511968437324")
    expect(normalizarTelefone("123")).toBeNull()
    expect(telefoneDaConversa({ jid: "5511999990000@s.whatsapp.net", telefone: null })).toBe("5511999990000")
    expect(telefoneDaConversa({ jid: "1234567@lid", telefone: null })).toBeNull()
  })
  it("acha o número em respostas da Evolution de formatos diferentes", () => {
    expect(telefoneNaResposta([{ id: "x", remoteJid: "1@lid", jid: "5511999990000@s.whatsapp.net" }])).toBe("5511999990000")
    expect(telefoneNaResposta({ wuid: "5511988887777:12@s.whatsapp.net" })).toBe("5511988887777")
    expect(telefoneNaResposta({ phoneNumber: "+55 11 97777-6666" })).toBe("5511977776666")
    expect(telefoneNaResposta({ remoteJid: "1234567@lid", pushName: "Ana" })).toBeNull()
  })
  it("vcf só com telefone; csv com todos", () => {
    const l = [{ jid: "a", nome: "Ana; Cosméticos", telefone: "5511999990000", motivos: ["MQL", "ICP"], etiquetas: [], ultima: null },
      { jid: "b@lid", nome: "Sem Número", telefone: null, motivos: ["Oportunidade"], etiquetas: [], ultima: null }]
    const v = vcf(l)
    expect(v).toContain("TEL;TYPE=CELL:+5511999990000")
    expect(v).toContain("FN:Ana\\; Cosméticos")
    expect(v).not.toContain("Sem Número")
    expect(csv(l).split("\r\n")).toHaveLength(3)
  })
})
