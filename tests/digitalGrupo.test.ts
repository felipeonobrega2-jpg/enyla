import { describe, it, expect } from "vitest"
import { cotarItens, montarPedidosDoGrupo, mudouOGrupo, pedidosDoGrupo, textoLinkGrupo } from "@/app/lib/digital"
import type { DadosPedido } from "@/app/lib/atendente"

const base: DadosPedido = { produto: "perfume", volume_ml: null, caixa_cm: null, frasco_cm: null, quantidade: 300, tem_arte: null, resumo: "" }
const item = (rotulo: string, ml: number | null, quantidade: number | null) => ({ rotulo, volume_ml: ml, caixa_cm: null, frasco_cm: null, quantidade })

describe("digital com mais de uma caixa", () => {
  it("uma caixa só segue o caminho de sempre", () => {
    expect(cotarItens({ ...base, itens: [] })).toBeNull()
    expect(cotarItens({ ...base, itens: [item("30 ml", 30, 100)] })).toBeNull()
  })
  it("cota cada caixa separada", () => {
    const r = cotarItens({ ...base, itens: [item("30 ml", 30, 100), item("50 ml", 50, 200)] })!
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.itens.map(i => [i.rotulo, i.cot.quantidade])).toEqual([["30 ml", 100], ["50 ml", 200]])
  })
  it("faltando a quantidade de uma, diz qual", () => {
    const r = cotarItens({ ...base, itens: [item("30 ml", 30, 100), item("50 ml", 50, null)] })!
    expect(r).toEqual({ ok: false, motivo: "50 ml: falta a quantidade" })
  })
  it("pedidos do grupo têm ids e sinais diferentes, e o mesmo grupo", () => {
    const r = cotarItens({ ...base, itens: [item("30 ml", 30, 100), item("30 ml outra", 30, 100)] })!
    if (!r.ok) throw new Error()
    const ps = montarPedidosDoGrupo([], "1@lid", "Ana", r.itens)
    expect(ps.map(p => p.id)).toEqual(["DIG-0001", "DIG-0002"])
    expect(ps[0].sinal).not.toBe(ps[1].sinal)
    expect(ps.every(p => p.grupo === "DIG-0001")).toBe(true)
    expect(pedidosDoGrupo(ps, ps[1]).length).toBe(2)
    expect(mudouOGrupo(ps, r.itens)).toBe(false)
    expect(mudouOGrupo(ps, r.itens.slice(0, 1))).toBe(true)
    expect(mudouOGrupo([{ ...ps[0], status: "sinal_pago" }, ps[1]], r.itens.slice(0, 1))).toBe(false)   // já pagou uma: não refaz
  })
  it("a mensagem identifica cada caixa com o link dela", () => {
    const r = cotarItens({ ...base, itens: [item("30 ml", 30, 100), item("50 ml", 50, 200)] })!
    if (!r.ok) throw new Error()
    const ps = montarPedidosDoGrupo([], "1@lid", "Ana", r.itens)
    const t = textoLinkGrupo(ps, ["L1", "L2"])
    expect(t).toMatch(/\*30 ml\*: 100 caixinhas[\s\S]*L1[\s\S]*\*50 ml\*: 200 caixinhas[\s\S]*L2/)
    expect(t).toMatch(/as duas juntas/)
    expect(t).toMatch(/medida padrão/)
  })
})
