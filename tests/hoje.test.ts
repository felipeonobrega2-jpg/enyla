import { describe, it, expect } from "vitest"
import { quemResponder, doAnuncio, haQuanto, ConvHoje } from "../app/lib/hoje"

const agora = new Date("2026-11-05T14:00:00Z").getTime()
const h = (horas: number) => new Date(agora - horas * 3_600_000).toISOString()
const conv = (o: Partial<ConvHoje>): ConvHoje => ({
  jid: "1@lid", nome: "Teste", ultima_msg: "oi", ultima_recebida_at: h(1), ultima_enviada_at: h(2), fechada_em: null,
  status_lead: null, etiquetas: [], campanha: null, criado_em: null, ...o,
})

describe("quemResponder", () => {
  it("só bons negócios esperando entram; os sem classificar viram contagem", () => {
    const r = quemResponder([
      conv({ jid: "a", etiquetas: ["ICP"] }),
      conv({ jid: "b" }),
      conv({ jid: "c", etiquetas: ["Lead pequeno"] }),
      conv({ jid: "d", etiquetas: ["MQL"], ultima_enviada_at: h(0.5) }),   // você já respondeu
    ], [], agora)
    expect(r.responder.map(x => x.jid)).toEqual(["a"])
    expect(r.responder[0].rotulo).toBe("ICP")
    expect(r.outros).toBe(1)
  })

  it("quem respondeu à retomada vem primeiro, mesmo sem etiqueta", () => {
    const r = quemResponder([
      conv({ jid: "a", status_lead: "mql", ultima_recebida_at: h(5), ultima_enviada_at: h(6) }),
      conv({ jid: "b", ultima_recebida_at: h(1) }),
    ], [{ em: h(1), jid: "b", nome: null, perfil: "icp", enviou: false, texto: "", motivo: "", passo: "Respondeu" }], agora)
    expect(r.responder.map(x => x.jid)).toEqual(["b", "a"])
    expect(r.responder[0].retomada).toBe(true)
  })

  it("resposta à retomada de mais de 7 dias não conta", () => {
    const r = quemResponder([conv({ jid: "b" })], [{ em: h(24 * 8), jid: "b", nome: null, perfil: "icp", enviou: false, texto: "", motivo: "", passo: "Respondeu" }], agora)
    expect(r.responder).toEqual([])
  })
})

describe("doAnuncio", () => {
  it("conta leads do anúncio das últimas 24 h pela entrada", () => {
    const an = (entrada: string, o: Partial<ConvHoje> = {}) => conv({ campanha: JSON.stringify({ canal: "anuncio", entrada }), ...o })
    expect(doAnuncio([
      an(h(2), { status_lead: "mql" }), an(h(3)), an(h(5), { etiquetas: ["Lead pequeno"] }), an(h(30)),
      conv({ campanha: JSON.stringify({ canal: "site", entrada: h(1) }) }),
    ], agora)).toEqual({ leads: 3, mql: 1, semClassificar: 1, descartados: 1 })
  })
})

it("haQuanto", () => {
  expect(haQuanto(h(0.5), agora)).toBe("há 30 min")
  expect(haQuanto(h(3), agora)).toBe("há 3 h")
  expect(haQuanto(h(50), agora)).toBe("há 2 dias")
})

it("dadosDaConversa lê o que a IA guardou e tolera lixo", async () => {
  const { dadosDaConversa } = await import("../app/lib/hoje")
  expect(dadosDaConversa(JSON.stringify({ r: { dados: { quantidade: 3000 } } }))?.quantidade).toBe(3000)
  expect(dadosDaConversa("{quebrado")).toBeNull()
  expect(dadosDaConversa(null)).toBeNull()
})
