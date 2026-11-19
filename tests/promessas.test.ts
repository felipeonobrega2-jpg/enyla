import { describe, it, expect } from "vitest"
import { ehPromessa, promessaAberta, deveCobrar } from "@/app/lib/promessas"

const m = (id: string, from_me: boolean, ts: string, corpo: string, tipo = "conversation") => ({ id, from_me, ts, corpo, tipo })
const agora = new Date("2026-11-19T19:00:00Z").getTime()

describe("promessas", () => {
  it("reconhece promessa de orçamento", () => {
    expect(ehPromessa("Vou preparar o orçamento com e sem hot stamping, em uma e duas cores, e te mando.")).toBe(true)
    expect(ehPromessa("Já te mando o orçamento")).toBe(true)
    expect(ehPromessa("Tô montando a proposta aqui")).toBe(true)
    expect(ehPromessa("Quantas caixinhas você precisa?")).toBe(false)
    expect(ehPromessa("Quando conseguir medir, me manda a altura e a largura que já te passo o orçamento")).toBe(false)
    expect(ehPromessa("Se você tiver o orçamento da outra gráfica, envia para mim que a gente tenta cobrir")).toBe(false)
    expect(ehPromessa("Ricardo, eu vou fazer o orçamento para você em offset, tá bom?")).toBe(true)
  })
  it("caso Anderson: promessa em aberto, cliente agradeceu", () => {
    const p = promessaAberta([
      m("1", false, "2026-11-18T17:00:00Z", "2 mil caixas"),
      m("2", true, "2026-11-18T17:08:00Z", "A impressão é em Barueri.\n\nVou preparar o orçamento com e sem hot stamping, em uma e duas cores, e te mando."),
      m("3", false, "2026-11-18T17:09:00Z", "Ok Luiz"),
      m("4", false, "2026-11-18T17:10:00Z", "Agradeço"),
    ], agora)
    expect(p?.msgId).toBe("2")
    expect(p?.horas).toBe(25)
  })
  it("cumprida com valor, link ou PDF", () => {
    expect(promessaAberta([m("2", true, "2026-11-18T17:08:00Z", "vou preparar o orçamento e te mando"), m("5", true, "2026-11-18T19:00:00Z", "Ficou R$ 0,98 cada")], agora)).toBeNull()
    expect(promessaAberta([m("2", true, "2026-11-18T17:08:00Z", "vou preparar o orçamento e te mando"), m("5", true, "2026-11-18T19:00:00Z", "https://app.enyla.com.br/aprovar/abc")], agora)).toBeNull()
    expect(promessaAberta([m("2", true, "2026-11-18T17:08:00Z", "vou preparar o orçamento e te mando"), m("5", true, "2026-11-18T19:00:00Z", "", "documentMessage")], agora)).toBeNull()
  })
  it("cobra com 2 h, repete a cada 4 h, desiste com 3 dias", () => {
    const p = (horas: number) => ({ msgId: "x", em: "", texto: "", horas })
    expect(deveCobrar(p(1), undefined, agora)).toBe(false)
    expect(deveCobrar(p(2), undefined, agora)).toBe(true)
    expect(deveCobrar(p(5), new Date(agora - 3 * 3600_000).toISOString(), agora)).toBe(false)
    expect(deveCobrar(p(5), new Date(agora - 4 * 3600_000).toISOString(), agora)).toBe(true)
    expect(deveCobrar(p(80), undefined, agora)).toBe(false)
  })
})
