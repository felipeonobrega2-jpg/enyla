import { describe, it, expect } from "vitest"
import { ordenar, top, topPorValor, semDispensados, entraConversa, novosNoTop, valorDoItem, referenciaUnitaria, fim4, urgencia, type ItemFelipe } from "../app/lib/pendenciasFelipe"

const AGORA = new Date("2026-11-25T15:00:00Z").getTime()
const h = (n: number) => new Date(AGORA - n * 3_600_000).toISOString()
const item = (o: Partial<ItemFelipe>): ItemFelipe => ({ chave: "x", fonte: "espera", nome: "Lead", jid: null, fim4: null, acao: "a", valor: null, estimativa: false, quantidade: null, medida: null, tipo: null,
  desde: h(1), prazo: null, risco: null, origem: "conversa", link: "/", icp: false, orc: null, pedidoPor: null, podeAssumir: false, ...o })

describe("ordem valor × urgência", () => {
  it("valor maior com mesma espera vem primeiro", () => {
    const r = ordenar([item({ chave: "a", valor: 1000 }), item({ chave: "b", valor: 5000 })], AGORA)
    expect(r.map(i => i.chave)).toEqual(["b", "a"])
  })
  it("urgência pode virar a ordem (espera longa e prazo vencido)", () => {
    const r = ordenar([item({ chave: "caro-novo", valor: 3000, desde: h(1) }), item({ chave: "barato-vencido", valor: 2000, desde: h(72), prazo: "2026-11-24" })], AGORA)
    expect(r[0].chave).toBe("barato-vencido")
  })
  it("ICP sobe", () => {
    expect(urgencia({ desde: h(1), prazo: null, icp: true }, AGORA)).toBeCloseTo(urgencia({ desde: h(1), prazo: null, icp: false }, AGORA) * 1.5)
  })
  it("sem valor vale 0 e fica atrás de quem tem valor; entre eles, quem espera mais", () => {
    const r = ordenar([item({ chave: "sv-novo", valor: null, desde: h(1) }), item({ chave: "sv-velho", valor: null, desde: h(30) }), item({ chave: "com", valor: 10 })], AGORA)
    expect(r.map(i => i.chave)).toEqual(["com", "sv-velho", "sv-novo"])
  })
})

describe("corte em 5 e resumo das 8h30", () => {
  const muitos = Array.from({ length: 9 }, (_, i) => item({ chave: `k${i}`, valor: (i + 1) * 100 }))
  it("devolve no máximo 5", () => { expect(top(muitos, AGORA)).toHaveLength(5); expect(top(muitos, AGORA)[0].chave).toBe("k8") })
  it("o resumo traz só os 3 de maior valor", () => { expect(topPorValor(muitos).map(i => i.chave)).toEqual(["k8", "k7", "k6"]) })
})

describe("dispensado não volta, salvo mensagem nova do lead", () => {
  const disp = { chave: "esp:1", titulo: "t", motivo: "já resolvi", por: "felipe", em: "2026-11-25T12:00:00.000Z" }
  const i = item({ chave: "esp:1", jid: "5511999990001@s.whatsapp.net" })
  it("some enquanto não há mensagem nova", () => {
    expect(semDispensados([i], [disp], { [i.jid!]: "2026-11-25T11:00:00.000Z" }, AGORA)).toHaveLength(0)
    expect(semDispensados([i], [disp], {}, AGORA)).toHaveLength(0)
  })
  it("volta com mensagem do lead depois da dispensa", () => {
    expect(semDispensados([i], [disp], { [i.jid!]: "2026-11-25T13:00:00.000Z" }, AGORA)).toHaveLength(1)
  })
  it("dispensa reaberta não esconde; outros itens ficam", () => {
    expect(semDispensados([i], [{ ...disp, reabertaEm: "2026-11-25T14:00:00Z" }], {}, AGORA)).toHaveLength(1)
    expect(semDispensados([item({ chave: "outro" })], [disp], {}, AGORA)).toHaveLength(1)
  })
})

describe("conversa que o Felipe conduz", () => {
  it("só entra se a última mensagem real é do lead", () => {
    expect(entraConversa({ conduzida: true, ultimaRecebidaAt: "2026-11-25T10:00:00Z", ultimaEnviadaAt: "2026-11-25T09:00:00Z" })).toBe(true)
    expect(entraConversa({ conduzida: true, ultimaRecebidaAt: "2026-11-25T09:00:00Z", ultimaEnviadaAt: "2026-11-25T10:00:00Z" })).toBe(false)
    expect(entraConversa({ conduzida: true, ultimaRecebidaAt: null, ultimaEnviadaAt: "2026-11-25T10:00:00Z" })).toBe(false)
  })
  it("conversa que ele não conduz segue a regra normal", () => { expect(entraConversa({ conduzida: false })).toBe(true) })
})

describe("valor, referência e avisos", () => {
  it("ORC vale; senão estimativa; senão sem valor", () => {
    expect(valorDoItem({ orc: 1500, quantidade: 1000, referenciaUnit: 1 })).toEqual({ valor: 1500, estimativa: false })
    expect(valorDoItem({ quantidade: 1000, referenciaUnit: 1.5 })).toEqual({ valor: 1500, estimativa: true })
    expect(valorDoItem({ quantidade: 1000 })).toEqual({ valor: null, estimativa: false })
  })
  it("referência só com 3+ pedidos da mesma medida", () => {
    const c = (p: number) => ({ dimensoes: "5 x 5 x 10 cm", preco: p * 1000, quantidade: 1000 })
    expect(referenciaUnitaria("5x5x10", [c(1), c(2)])).toBeNull()
    expect(referenciaUnitaria("5x5x10", [c(1), c(2), c(3)])).toBe(2)
  })
  it("novos no top e 4 dígitos", () => {
    expect(novosNoTop(["a"], [item({ chave: "a" }), item({ chave: "b" })]).map(i => i.chave)).toEqual(["b"])
    expect(fim4("5511999991234@s.whatsapp.net")).toBe("1234")
  })
})

import { validarPedido } from "../app/lib/pendenciasFelipe"
describe("pedido de diretor", () => {
  it("sem titulo ou origem é erro; valor enviado é ignorado", () => {
    expect(validarPedido({ origem: "ficha" }).ok).toBe(false)
    expect(validarPedido({ titulo: "Dar preço" }).ok).toBe(false)
    const r = validarPedido({ titulo: "Dar preço", origem: "ficha", valor: 99999, oQueFazer: "Dar preço" })
    expect(r.ok && "valor" in r.r).toBe(false)
    expect(validarPedido({ titulo: "x", origem: "y", prazo: "31/12" }).ok).toBe(false)
  })
})
