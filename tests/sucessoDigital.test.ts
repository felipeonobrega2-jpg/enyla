import { describe, it, expect } from "vitest"
import { etapaArte, quemDeve, entrouNaEtapaEm, horasAjusteAteProva } from "../app/lib/sucessoDigital"

const base = { status: "sinal_pago", sinalPagoEm: "2026-03-10T12:00:00.000Z" }

describe("etapaArte", () => {
  it("sem arte nem ajuste: aguarda o cliente", () => {
    expect(etapaArte(base)).toBe("aguardando_arte_cliente")
    expect(quemDeve("aguardando_arte_cliente")).toBe("cliente")
    expect(entrouNaEtapaEm(base)).toBe("2026-03-10T12:00:00.000Z")
  })
  it("prova enviada sem ajuste depois", () => {
    const p = { ...base, status: "arte", arteEnviadaEm: "2026-03-11T10:00:00.000Z" }
    expect(etapaArte(p)).toBe("prova_enviada")
    expect(entrouNaEtapaEm(p)).toBe("2026-03-11T10:00:00.000Z")
  })
  it("ajuste pedido depois da prova: a ENYLA deve", () => {
    const p = { ...base, status: "arte", arteEnviadaEm: "2026-03-11T10:00:00.000Z", ajustes: [{ em: "2026-03-11T15:00:00.000Z" }] }
    expect(etapaArte(p)).toBe("ajuste_pedido")
    expect(quemDeve("ajuste_pedido")).toBe("enyla")
    expect(entrouNaEtapaEm(p)).toBe("2026-03-11T15:00:00.000Z")
  })
  it("nova prova depois do ajuste volta para o cliente", () => {
    const p = { ...base, arteEnviadaEm: "2026-03-12T09:00:00.000Z", ajustes: [{ em: "2026-03-11T15:00:00.000Z" }] }
    expect(etapaArte(p)).toBe("prova_enviada")
  })
  it("aprovada vence tudo", () => {
    const p = { ...base, status: "producao", arteAprovadaEm: "2026-03-13T09:00:00.000Z", ajustes: [{ em: "2026-03-14T00:00:00.000Z" }] }
    expect(etapaArte(p)).toBe("aprovada")
    expect(quemDeve("aprovada")).toBe("ninguem")
  })
})

describe("horasAjusteAteProva", () => {
  it("mede as horas até a prova voltar", () => {
    expect(horasAjusteAteProva({ ...base, ajusteEnviadoLeandroEm: "2026-03-11T15:00:00.000Z", provaDevolvidaEm: "2026-03-12T13:30:00.000Z" })).toBe(22.5)
  })
  it("sem prova devolvida ou datas fora de ordem: null", () => {
    expect(horasAjusteAteProva({ ...base, ajustes: [{ em: "2026-03-11T15:00:00.000Z" }] })).toBeNull()
    expect(horasAjusteAteProva({ ...base, ajusteEnviadoLeandroEm: "2026-03-12T00:00:00.000Z", provaDevolvidaEm: "2026-03-11T00:00:00.000Z" })).toBeNull()
  })
})
