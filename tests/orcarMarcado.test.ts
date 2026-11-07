import { describe, it, expect } from "vitest"
import { aguardaOrcamentoMarcado, listaDoHoje, ProximoPasso } from "../app/lib/hoje"

const agora = new Date("2026-11-07T15:00:00Z").getTime()
const passo: ProximoPasso = { tipo: "orcar", em: "2026-11-07T12:00:00Z", ate: "2026-11-21T12:00:00Z", nota: "2 tamanhos" }
describe("esperando meu orçamento (marcado por você)", () => {
  it("fica até você mandar o PDF ou criar o orçamento", () => {
    expect(aguardaOrcamentoMarcado({ status_lead: "mql" }, passo, { documento: false, orcamentoNoSistema: false }, agora)).toBe(true)
    expect(aguardaOrcamentoMarcado({ status_lead: "mql" }, passo, { documento: true, orcamentoNoSistema: false }, agora)).toBe(false)
    expect(aguardaOrcamentoMarcado({ status_lead: "mql" }, passo, { documento: false, orcamentoNoSistema: true }, agora)).toBe(false)
  })
  it("sai se fechou, perdeu ou passou 14 dias", () => {
    expect(aguardaOrcamentoMarcado({ status_lead: "pedido" }, passo, { documento: false, orcamentoNoSistema: false }, agora)).toBe(false)
    expect(aguardaOrcamentoMarcado({ status_lead: null }, passo, { documento: false, orcamentoNoSistema: false }, new Date("2026-11-22T00:00:00Z").getTime())).toBe(false)
  })
  it("não aparece também em Responder/Retomar", () => {
    const c = { jid: "1@s", nome: "X", ultima_msg: "oi", ultima_recebida_at: "2026-11-07T14:00:00Z", ultima_enviada_at: null, fechada_em: null, status_lead: "mql", etiquetas: ["ICP"], campanha: null, criado_em: null, proxima_acao: null }
    expect(listaDoHoje(c as never, passo, agora)).toBeNull()
  })
})

import { PRODUTO_RECUSADO } from "../app/lib/agenteAuto"
describe("produto que não fazemos", () => {
  it("cigarro não cota", () => {
    expect(PRODUTO_RECUSADO.test("quero 500 caixas de cigarro personalizadas")).toBe(true)
    expect(PRODUTO_RECUSADO.test("maço com a minha marca")).toBe(true)
    expect(PRODUTO_RECUSADO.test("caixinha de perfume 50 ml")).toBe(false)
  })
})
