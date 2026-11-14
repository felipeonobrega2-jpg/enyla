import { describe, it, expect } from "vitest"
import { semPreviaDeLink } from "../app/lib/evolution"
import { prometeLinkSemLink } from "../app/lib/digital"

describe("envio de texto sem prévia de link", () => {
  it("sendText ganha linkPreview: false", () => {
    const init = semPreviaDeLink("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: "55", text: "veja https://app.enyla.com.br/d/X" }) })
    expect(JSON.parse(init!.body as string)).toMatchObject({ number: "55", linkPreview: false })
  })
  it("respeita quem já escolheu e não mexe em outras rotas", () => {
    const b = JSON.stringify({ text: "x", linkPreview: true })
    expect(semPreviaDeLink("/message/sendText/{i}", { body: b })!.body).toBe(b)
    const m = JSON.stringify({ media: "x" })
    expect(semPreviaDeLink("/message/sendMedia/{i}", { body: m })!.body).toBe(m)
    expect(semPreviaDeLink("/instance/connectionState/{i}")).toBeUndefined()
  })
})

describe("IA prometendo link sem link", () => {
  it("pega as frases do caso de 13/11", () => {
    expect(prometeLinkSemLink("Claro, segue o orçamento das 100 caixinhas para o frasco de 50ml.")).toBe(true)
    expect(prometeLinkSemLink("Show. Pra seguir, é só pagar o sinal de 50% pelo link, que a designer já começa.")).toBe(true)
    expect(prometeLinkSemLink("Te mando de novo o orçamento das 100 caixinhas de 50ml.\n\nO valor aparece quando você abre o link")).toBe(true)
  })
  it("com o link junto ou sem promessa, passa", () => {
    expect(prometeLinkSemLink("Segue o orçamento: https://app.enyla.com.br/d/DIG-1?t=a")).toBe(false)
    expect(prometeLinkSemLink("Me passa a altura e a largura do frasco em cm?")).toBe(false)
    expect(prometeLinkSemLink("Quantas caixinhas você precisa?")).toBe(false)
  })
})
