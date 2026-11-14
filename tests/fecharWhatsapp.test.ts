import { describe, it, expect } from "vitest"
import { documentoNaMensagem, textosPixNoWhatsapp, textoLinkPedido, FECHAR_POR_AQUI } from "../app/lib/digital"

describe("fechar o digital pelo WhatsApp", () => {
  it("acha CPF e CNPJ válidos no meio do texto", () => {
    expect(documentoNaMensagem("meu cpf é 529.982.247-25 ok")).toBe("52998224725")
    expect(documentoNaMensagem("cnpj 11.222.333/0001-81")).toBe("11222333000181")
  })
  it("ignora número que não é documento válido", () => {
    expect(documentoNaMensagem("quero 1000 caixinhas")).toBeNull()
    expect(documentoNaMensagem("123.456.789-00")).toBeNull()
    expect(documentoNaMensagem(null)).toBeNull()
  })
  it("um pedido: cabeçalho, o Pix sozinho numa mensagem e os termos", () => {
    const m = textosPixNoWhatsapp([{ id: "DIG-0001", quantidade: 100, sinal: 360, rotulo: undefined }], ["PIXPAYLOAD"], "https://x/d/DIG-0001")
    expect(m).toHaveLength(3)
    expect(m[1]).toBe("PIXPAYLOAD")
    expect(m[0]).toContain("100 caixinhas")
    expect(m[2]).toContain("2 rodadas")
  })
  it("mais de uma caixa: um Pix para cada, na ordem", () => {
    const m = textosPixNoWhatsapp([{ id: "A", quantidade: 50, sinal: 200, rotulo: "caixa de 30 ml" }, { id: "B", quantidade: 50, sinal: 250, rotulo: "caixa de 50 ml" }], ["P1", "P2"], "l")
    expect(m.slice(1, 3)).toEqual(["P1", "P2"])
    expect(m[0]).toContain("Caixa de 30 ml")
  })
  it("o orçamento já oferece fechar pela conversa", () => {
    const t = textoLinkPedido({ quantidade: 100, ml: 30, medidas: { a: 100, l: 40, p: 40 }, padrao: false, total: 700, produto: undefined, pedida: 100 } as never, "link")
    expect(t).toContain(FECHAR_POR_AQUI)
  })
})
