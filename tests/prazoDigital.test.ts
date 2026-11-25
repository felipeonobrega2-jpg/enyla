import { describe, it, expect } from "vitest"
import { prazoDigital, prazoDoPedido, ateDataPrazo, CORTE_PRAZO_15 } from "../app/lib/prazoDigital"
import { termosDigital } from "../app/lib/termosDigital"

const antes = "2026-11-20T12:00:00.000Z", depois = "2026-11-27T12:00:00.000Z", logoAntes = "2026-11-26T02:59:59.000Z"
describe("prazo digital", () => {
  it("até 200: 7 a 10, em qualquer data", () => {
    expect(prazoDigital(200, depois).texto).toBe("7 a 10 dias úteis")
    expect(prazoDigital(200, antes)).toEqual({ min: 7, max: 10, texto: "7 a 10 dias úteis" })
  })
  it("acima de 200: 15 depois do corte, 14 antes", () => {
    expect(prazoDigital(201, depois).texto).toBe("15 dias úteis")
    expect(prazoDigital(201, antes).texto).toBe("14 dias úteis")
    expect(prazoDigital(201, CORTE_PRAZO_15).texto).toBe("15 dias úteis")
    expect(prazoDigital(201, logoAntes).texto).toBe("14 dias úteis")
    expect(CORTE_PRAZO_15).toBe("2026-11-26T03:00:00.000Z")
  })
  it("prioridade: prazoEntrega > termos.prazo > regra pela data de criação", () => {
    const manual = { min: 5, max: 5, texto: "5 dias úteis" }
    expect(prazoDoPedido({ quantidade: 300, em: depois, prazoEntrega: manual, termos: { prazo: prazoDigital(300, antes) } })).toEqual(manual)
    expect(prazoDoPedido({ quantidade: 300, em: depois, termos: { prazo: prazoDigital(300, antes) } }).texto).toBe("14 dias úteis")
    expect(prazoDoPedido({ quantidade: 300, em: antes }).texto).toBe("14 dias úteis")
    expect(prazoDoPedido({ quantidade: 300, em: depois }).texto).toBe("15 dias úteis")
  })
  it("retrato no aceite: pedido criado antes, aceito depois, retrata 14", () => {
    expect(prazoDigital(300, antes).max).toBe(14)
  })
  it("termos já aceitos mantêm o texto do retrato", () => {
    const t = termosDigital({ quantidade: 300, medidas: { a: 1, l: 1, p: 1 }, validadeDias: 7, prazo: "14 dias úteis" })
    expect(JSON.stringify(t)).toContain("leva 14 dias úteis")
  })
  it("até dd/mm usa o teto; sem arte aprovada, a confirmar", () => {
    expect(ateDataPrazo({ quantidade: 100, em: depois })).toBe("a confirmar")
    expect(ateDataPrazo({ quantidade: 100, em: depois, arteAprovadaEm: "2026-12-01T12:00:00.000Z" })).toBe("até 15/12")
  })
})
