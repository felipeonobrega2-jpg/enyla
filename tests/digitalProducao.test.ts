import { describe, it, expect } from "vitest"
import { digitaisEmProducao, comDigital } from "../app/lib/digitalProducao"

const hoje = "2026-03-18" // quarta
const pedidos = [
  { id: "DIG-0001", nome: "Ana", produto: "Caixa 30 ml", quantidade: 200, status: "sinal_pago", em: "2026-03-10", sinalPagoEm: "2026-03-16T15:00:00.000Z", jid: "551199@s.whatsapp.net", email: "a@b.com", documento: "123" },
  { id: "DIG-0002", nome: "Bia", produto: "Difusor", quantidade: 100, status: "producao", em: "2026-03-02", sinalPagoEm: "2026-03-03", arteEnviadaEm: "2026-03-05", arteAprovadaEm: "2026-03-06", villaEnviadoEm: "2026-03-09", statusEm: "2026-03-10" },
  { id: "DIG-0003", nome: "Caio", status: "aguardando_sinal" },
  { id: "DIG-0004", nome: "Dani", status: "enviado" },
  { id: "DIG-0005", nome: "Edu", status: "cancelado" },
]

describe("digitaisEmProducao", () => {
  const r = digitaisEmProducao(pedidos as never, hoje)
  it("só sinal_pago, arte e producao, sem dados pessoais", () => {
    expect(r.map(p => p.id)).toEqual(["DIG-0001", "DIG-0002"])
    expect(JSON.stringify(r)).not.toMatch(/551199|a@b\.com|123|jid|email|documento/)
  })
  it("sinal_pago sem arte: datas ausentes ficam null", () => {
    expect(r[0]).toMatchObject({ cliente: "Ana", produto: "Caixa 30 ml", quantidade: 200, arteEnviadaEm: null, villaEnviadoEm: null, prontoEm: null, statusEm: null, naEtapaDesde: "2026-03-16T15:00:00.000Z", diasUteisNaEtapa: 2 })
    expect(r[0].faltam).toEqual(["arte", "producao", "pronto", "enviado"])
  })
  it("producao com datas", () => {
    expect(r[1]).toMatchObject({ naEtapaDesde: "2026-03-10", diasUteisNaEtapa: 6, arteAprovadaEm: "2026-03-06", prontoEm: null })
    expect(r[1].faltam).toEqual(["producao", "pronto", "enviado"])
  })
  it("sem statusEm usa o evento da etapa", () => {
    const [p] = digitaisEmProducao([{ ...pedidos[1], statusEm: undefined }] as never, hoje)
    expect(p.naEtapaDesde).toBe("2026-03-09")
  })
})

describe("campos novos", () => {
  const ped = [
    { id: "DIG-0010", nome: "Ana", briefing: { marca: "Aroma Viva" }, produto: "Caixa", quantidade: 200, status: "arte", sinalPagoEm: "2026-03-10", arteEnviadaEm: "2026-03-12T15:00:00.000Z" },
    { id: "DIG-0011", nome: "Bia", empresa: "Bia Velas", quantidade: 100, status: "producao", sinalPagoEm: "2026-03-03", arteEnviadaEm: "2026-03-05", arteAprovadaEm: "2026-03-06" },
    { id: "DIG-0012", nome: "Caio", status: "sinal_pago", sinalPagoEm: "2026-03-16" },
    { id: "DIG-0013", nome: "Edu", status: "cancelado", sinalPagoEm: "2026-03-16" },
  ]
  const r = digitaisEmProducao(ped as never, hoje)
  it("cancelado não aparece", () => expect(r.map(p => p.id)).toEqual(["DIG-0010", "DIG-0011", "DIG-0012"]))
  it("numero, marca, sinal e entrega", () => {
    expect(r[0]).toMatchObject({ numero: "DIG-0010", marca: "Aroma Viva", entregaPrevista: null })
    expect(r[1]).toMatchObject({ marca: "Bia Velas", entregaPrevista: "2026-03-20" })
    expect(r[2]).toMatchObject({ marca: null, arte: "pendente", arteEm: null })
  })
  it("arte enviada e aprovada com data", () => {
    expect(r[0]).toMatchObject({ arte: "enviada", arteEm: "2026-03-12" })
    expect(r[1]).toMatchObject({ arte: "aprovada", arteEm: "2026-03-06" })
  })
})

describe("comDigital", () => {
  it("junta ao JSON da produção e nunca omite pedido (mesmo acima de 7000)", () => {
    const base = JSON.stringify({ prazoMedioPorEtapa: {}, pedidos: [] })
    expect(JSON.parse(comDigital(base, pedidos as never, hoje)).digital.pedidos).toHaveLength(2)
    const muitos = Array.from({ length: 200 }, (_, i) => ({ id: `DIG-${i}`, nome: "Cliente", status: "arte", sinalPagoEm: "2026-03-01" }))
    const s = comDigital(base, muitos as never, hoje)
    const d = JSON.parse(s).digital
    expect(d.pedidos).toHaveLength(200)
    expect(d.omitidos).toBeUndefined()
    expect(d.pedidos[0]).toMatchObject({ numero: expect.any(String), arte: "pendente", sinalPagoEm: "2026-03-01" })
  })
  it("sem digitais devolve o JSON como veio", () => {
    expect(comDigital("{}", [], hoje)).toBe("{}")
  })
})

describe("foto guardada", () => {
  it("não fica velha depois de mudar a versão do código", async () => {
    const { fotoValida } = await import("../app/lib/conversaDiretor")
    const em = new Date().toISOString()
    expect(fotoValida({ em, versao: "v1" }, "v1")).toBe(true)
    expect(fotoValida({ em, versao: "v1" }, "v2")).toBe(false)
    expect(fotoValida({ em }, "v2")).toBe(false)
    expect(fotoValida({ em: "2026-01-01T00:00:00Z", versao: "v1" }, "v1")).toBe(false)
  })
})
