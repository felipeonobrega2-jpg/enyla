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

describe("comDigital", () => {
  it("junta ao JSON da produção e respeita 7000", () => {
    const base = JSON.stringify({ prazoMedioPorEtapa: {}, pedidos: [] })
    expect(JSON.parse(comDigital(base, pedidos as never, hoje)).digital.pedidos).toHaveLength(2)
    const muitos = Array.from({ length: 200 }, (_, i) => ({ id: `DIG-${i}`, nome: "Cliente", status: "arte", sinalPagoEm: "2026-03-01" }))
    const s = comDigital(base, muitos as never, hoje)
    expect(JSON.parse(s).digital.pedidos).toHaveLength(200)   // nenhum Digital aberto some
  })
  it("lista todos os Digital abertos mesmo com o Offset ocupando o limite; enxuga o Offset", () => {
    const offset = Array.from({ length: 60 }, (_, i) => ({ numero: `ORC-${i}`, cliente: "Cliente com nome comprido", etapa: "Arte/Dieline", entregaPrevista: "2026-04-01", naEtapaDesde: "2026-03-01", diasUteisNaEtapa: 3 }))
    const base = JSON.stringify({ prazoMedioPorEtapa: {}, pedidos: offset })
    const abertos = Array.from({ length: 40 }, (_, i) => ({ id: `DIG-${i}`, nome: "Cliente", produto: "Caixa", quantidade: 50, status: (["sinal_pago", "arte", "producao"] as const)[i % 3], sinalPagoEm: "2026-03-01" }))
    const mistos = [...abertos, { id: "DIG-T", status: "arte", teste: true }, { id: "DIG-E", status: "enviado" }, { id: "DIG-C", status: "cancelado" }]
    const j = JSON.parse(comDigital(base, mistos as never, hoje))
    expect(j.digital.pedidos.map((p: { id: string }) => p.id).sort()).toEqual(abertos.map(p => p.id).sort())
    expect(j.pedidos.length).toBeLessThan(60)
    expect(j.omitidos).toBe(60 - j.pedidos.length)
  })
  it("pedido de teste não entra", () => {
    expect(digitaisEmProducao([{ id: "DIG-T", status: "arte", teste: true }] as never, hoje)).toEqual([])
  })
  it("sem digitais devolve o JSON como veio", () => {
    expect(comDigital("{}", [], hoje)).toBe("{}")
  })
})
