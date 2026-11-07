import { describe, it, expect } from "vitest"
import { limparEmojis, medirEstilo, textoEstilo, leadEstaRindo } from "../app/lib/estilo"

describe("trava de emoji", () => {
  it("tira 🙌 e ✨ sempre", () => {
    expect(limparEmojis("Show, que legal que você tá começando! 🙌🏻", { primeira: false, leadRindo: false })).toBe("Show, que legal que você tá começando!")
    expect(limparEmojis("Ficaria lindo assim ✨\n\nMe manda a logo 🙌🏻", { primeira: false, leadRindo: false })).toBe("Ficaria lindo assim\n\nMe manda a logo")
  })
  it("👋 só na primeira mensagem", () => {
    expect(limparEmojis("Oi, boa noite! Aqui é o Luiz Felipe 👋", { primeira: true, leadRindo: false })).toBe("Oi, boa noite! Aqui é o Luiz Felipe 👋")
    expect(limparEmojis("Oi de novo 👋", { primeira: false, leadRindo: false })).toBe("Oi de novo")
  })
  it("😂 só se o lead está rindo, e no máximo um", () => {
    expect(limparEmojis("Tu sumiu pô 😂😂", { primeira: false, leadRindo: true })).toBe("Tu sumiu pô 😂")
    expect(limparEmojis("Tu sumiu pô 😂", { primeira: false, leadRindo: false })).toBe("Tu sumiu pô")
    expect(leadEstaRindo(["kkkkk verdade"])).toBe(true)
    expect(leadEstaRindo(["ok"])).toBe(false)
  })
})

describe("estilo medido", () => {
  const msgs = [...Array(40)].map((_, i) => i % 10 === 0 ? "Oi, tudo bem? 👋" : i % 3 ? "Show meu irmão" : "Bom dia, me passa as medidas do frasco")
  it("mede tamanho, exclamação e emoji, com exemplos limpos", () => {
    const e = medirEstilo([...msgs, "CNPJ 03.999.896/0001-52", "Cadê minhas artes cacete"])!
    expect(e.pctExclamacao).toBe(0)
    expect(e.emojis[0]).toBe("👋")
    expect(e.aberturas).toContain("show")
    expect(e.exemplos.some(x => /cnpj|cacete/i.test(x))).toBe(false)
    expect(textoEstilo(e)).toContain("Não use 🙌")
  })
  it("pouca mensagem: não mede", () => expect(medirEstilo(["oi"])).toBeNull())
})
