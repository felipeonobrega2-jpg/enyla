import { describe, expect, test } from "vitest"
import { estadoArte, etapaAtual, avisos, type Acompanhamento } from "@/app/cartuxo/lib/acompanhamento"

const em = (h: number) => new Date(Date.UTC(2026, 10, 8, h)).toISOString()
const v = { url: "https://x/a.png", nome: "a.png", em: em(1) }
const briefing = { marca: "Noir", cores: "", texto: "", arquivos: [], em: em(0) }
const pedido = { numero: "CX-261108-AAAAA", cliente: { nome: "ana lima" }, itens: [{ nome: "Caixa", prazo: "Produção normal" }] }

describe("acompanhamento do pedido", () => {
  test("estados da arte", () => {
    expect(estadoArte(null, 0)).toBe("esperando-briefing")
    expect(estadoArte({ briefing }, 0)).toBe("criando")
    expect(estadoArte({ briefing, artes: { 0: { versoes: [v], enviadaEm: em(2), ajustes: [] } } }, 0)).toBe("para-aprovar")
    expect(estadoArte({ briefing, artes: { 0: { versoes: [v], enviadaEm: em(2), ajustes: [{ texto: "x", em: em(3) }] } } }, 0)).toBe("ajuste")
    // nova versão depois do ajuste volta para aprovação
    expect(estadoArte({ briefing, artes: { 0: { versoes: [v, v], enviadaEm: em(4), ajustes: [{ texto: "x", em: em(3) }] } } }, 0)).toBe("para-aprovar")
    expect(estadoArte({ briefing, artes: { 0: { versoes: [v], enviadaEm: em(2), aprovadaEm: em(3), ajustes: [] } } }, 0)).toBe("aprovada")
  })
  test("etapa que o cliente vê", () => {
    const aprov: Acompanhamento = { briefing, artes: { 0: { versoes: [v], enviadaEm: em(2), aprovadaEm: em(3), ajustes: [] } } }
    expect(etapaAtual(1, null, [])).toBe("pago")
    expect(etapaAtual(1, { briefing }, [])).toBe("arte")
    expect(etapaAtual(1, aprov, [null])).toBe("producao")
    expect(etapaAtual(1, aprov, ["pronta"])).toBe("pronta")
    expect(etapaAtual(1, { ...aprov, envio: { em: em(9), transportadora: "Correios", rastreio: "AA1" } }, ["pronta"])).toBe("enviado")
  })
  test("avisos seguem a etapa", () => {
    expect(avisos(pedido, null).map(a => a.id)).toEqual(["logo"])
    expect(avisos(pedido, null)[0].texto).toContain("Oi, Ana!")
    expect(avisos(pedido, { briefing, artes: { 0: { versoes: [v], enviadaEm: em(2), ajustes: [] } } }).map(a => a.id)).toEqual(["arte"])
    expect(avisos(pedido, { briefing, artes: { 0: { versoes: [v], enviadaEm: em(2), aprovadaEm: em(3), ajustes: [] } }, envio: { em: em(9), transportadora: "Correios", rastreio: "AA1" } }).at(-1)!.texto).toContain("AA1")
    for (const a of avisos(pedido, null)) expect(a.texto).not.toMatch(/chapa/i)
  })
})
