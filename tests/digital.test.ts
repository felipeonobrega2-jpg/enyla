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
    expect(cotarDigital(dados({ volume_ml: 50, quantidade: 300 }))).toMatchObject({ ok: false })   // A4 só até 100
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
