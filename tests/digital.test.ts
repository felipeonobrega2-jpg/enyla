import { describe, it, expect } from "vitest"
import { cotarDigital, padraoDoMl, sinalUnico, montarPedido, mudouACotacao, textoOrcamentoDigital, valoresDoPedido, proximoIdDigital } from "../app/lib/digital"
import { valoresEmReais } from "../app/lib/agenteLeads"
import type { DadosPedido } from "../app/lib/atendente"

const dados = (x: Partial<DadosPedido>): DadosPedido => ({ produto: "perfume", volume_ml: null, caixa_cm: null, frasco_cm: null, quantidade: null, tem_arte: null, resumo: "", ...x })

describe("braço digital", () => {
  it("medida padrão pelo ml mais próximo", () => {
    expect(padraoDoMl(50)?.a).toBe(10)
    expect(padraoDoMl(10)?.ml).toBe(15)
    expect(padraoDoMl(200)).toBeNull()
  })
  it("cota com o padrão do ml ou com as medidas", () => {
    const c = cotarDigital(dados({ volume_ml: 50, quantidade: 100 }))
    expect(c).toMatchObject({ ok: true, folha: "A4", padrao: true, total: 619.95 })
    const m = cotarDigital(dados({ caixa_cm: { frente: 6.7, lateral: 3.8, altura: 13 }, quantidade: 80 }))
    expect(m).toMatchObject({ ok: true, folha: "A3", padrao: false, quantidade: 100, total: 719.95 })
  })
  it("não cota sem quantidade, sem medida ou fora da tabela", () => {
    expect(cotarDigital(dados({ volume_ml: 50 })).ok).toBe(false)
    expect(cotarDigital(dados({ quantidade: 100 })).ok).toBe(false)
    expect(cotarDigital(dados({ volume_ml: 50, quantidade: 300 }))).toMatchObject({ ok: true, folha: "A3", quantidade: 300 })   // A4 só até 100: vai para a tabela A3
  })
  it("sinal de 50% com centavos únicos", () => {
    expect(sinalUnico(619.95, [])).toBe(309.98)
    expect(sinalUnico(619.95, [309.98, 309.97])).toBe(309.96)
  })
  it("pedido, recotação e texto", () => {
    const c = cotarDigital(dados({ volume_ml: 50, quantidade: 100 }))
    if (!c.ok) throw new Error()
    const p = montarPedido([{ id: "DIG-0007" } as never], "1@lid", "Ana", dados({ volume_ml: 50 }), c)
    expect(p.id).toBe("DIG-0008")
    expect(proximoIdDigital([])).toBe("DIG-0001")
    expect(mudouACotacao(p, c)).toBe(false)
    expect(mudouACotacao(p, { ...c, quantidade: 50 })).toBe(true)
    const t = textoOrcamentoDigital(p, "https://x/pix")
    expect(t).toContain("R$ 619,95"); expect(t).toContain("R$ 309,98"); expect(t).toContain("medida padrão")
    // tudo o que o texto cita em R$ passa na trava de valores
    for (const v of valoresEmReais(t)) expect(valoresDoPedido(p)).toContain(v)
  })
})

describe("página do pedido e sinal no extrato", async () => {
  const { opcoesDoPedido, trocarQuantidade, sinaisPagos, textoLinkPedido, textoSinalPago } = await import("../app/lib/digital")
  const c = cotarDigital(dados({ volume_ml: 50, quantidade: 50 }))
  if (!c.ok) throw new Error()
  const p = montarPedido([], "1@lid", "Ana", dados({ volume_ml: 50 }), c, new Date("2026-11-06T15:00:00Z"))

  it("opções da folha e troca de quantidade antes do sinal", () => {
    expect(opcoesDoPedido(p).map(o => o.quantidade)).toEqual([20, 50, 100])
    const n = trocarQuantidade([p], p, 100)!
    expect(n.total).toBe(619.95); expect(n.sinal).toBe(309.98)
    expect(trocarQuantidade([p], p, 75)).toBeNull()
    expect(trocarQuantidade([p], { ...p, status: "sinal_pago" }, 100)).toBeNull()
  })
  it("acha o Pix pelo valor exato, a partir do dia da cotação, sem usar a mesma entrada duas vezes", () => {
    const ext = [
      { id: "a", data: "2026-11-05", valor: p.sinal, tipo: "entrada" as const },
      { id: "b", data: "2026-11-06", valor: p.sinal, tipo: "saida" as const },
      { id: "c", data: "2026-11-06", valor: p.sinal, tipo: "entrada" as const },
    ]
    expect(sinaisPagos([p], ext, new Set())).toEqual([{ id: p.id, tx: ext[2] }])
    expect(sinaisPagos([p], ext, new Set(["c"]))).toEqual([])
    expect(sinaisPagos([p], [{ id: "d", data: "2026-11-07", valor: p.sinal + 0.01, tipo: "entrada" }], new Set())).toEqual([])
  })
  it("textos", () => {
    const t = textoLinkPedido(p, "https://x/d/DIG-0001?t=a")
    expect(t).toContain("R$ 419,95"); expect(t).toContain("https://x/d/DIG-0001?t=a"); expect(t).not.toMatch(/frete/i)
    for (const v of valoresEmReais(t)) expect(valoresDoPedido(p)).toContain(v)
    expect(textoSinalPago(p, "L", false)).toContain("L")
    expect(textoSinalPago(p, "L", true)).not.toContain("L")
  })
})

describe("caixa padrão cresce até caber o frasco", () => {
  it("30 ml com 9,6 cm de altura com a válvula: a caixa sobe para 10 cm", async () => {
    const { caberFrasco, cotarDigital } = await import("../app/lib/digital")
    expect(caberFrasco({ a: 9, l: 4, p: 4 }, "9,6 com a válvula")).toEqual({ a: 10, l: 4, p: 4 })
    expect(caberFrasco({ a: 9, l: 4, p: 4 }, "30 ml, 3,2 x 8 cm")).toEqual({ a: 9, l: 4, p: 4 })
    expect(caberFrasco({ a: 9, l: 4, p: 4 }, "4,5 x 10 cm")).toEqual({ a: 10.4, l: 4.8, p: 4.8 })
    const c = cotarDigital({ produto: "", volume_ml: 30, caixa_cm: null, frasco_cm: "9,6 com válvula", quantidade: 20, tem_arte: null, resumo: "" } as never)
    expect(c.ok && c.medidas).toEqual({ a: 10, l: 4, p: 4 })
    expect(c.ok && c.folha).toBe("A4")
    expect(c.ok && c.total).toBe(339.94)
  })
})

describe("quantidade acima da tabela A4", () => {
  it("150 caixinhas de 30 ml (cabe na A4, que só vai até 100): cota na tabela A3, faixa de 300", async () => {
    const { cotarDigital } = await import("../app/lib/digital")
    const c = cotarDigital({ produto: "", volume_ml: 30, caixa_cm: null, frasco_cm: null, quantidade: 150, tem_arte: null, resumo: "" } as never)
    expect(c.ok && [c.folha, c.quantidade, c.total]).toEqual(["A3", 300, 1419.85])
  })
  it("acima de 500: sem preço (avisa você)", async () => {
    const { cotarDigital } = await import("../app/lib/digital")
    const c = cotarDigital({ produto: "", volume_ml: 30, caixa_cm: null, frasco_cm: null, quantidade: 600, tem_arte: null, resumo: "" } as never)
    expect(c.ok).toBe(false)
  })
})
