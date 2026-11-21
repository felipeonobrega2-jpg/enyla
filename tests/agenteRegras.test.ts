import { describe, it, expect } from "vitest"
import { trouxeDadosNovos } from "@/app/lib/digital"
describe("digital: só recota com dado novo", () => {
  const m = (from_me: boolean, corpo: string, tipo = "text") => ({ from_me, corpo, tipo })
  it("pergunta sem número depois do orçamento: não recota (caso Thays)", () => {
    expect(trouxeDadosNovos([m(false, "150 do sérum e 100 do gel"), m(true, "Montei os orçamentos…"), m(false, "Bom dia!"), m(false, "quanto tempo me entregam, após a aprovação da arte?")])).toBe(false)
  })
  it("mudou a quantidade ou mandou foto: recota", () => {
    expect(trouxeDadosNovos([m(true, "Montei…"), m(false, "na verdade quero 300")])).toBe(true)
    expect(trouxeDadosNovos([m(true, "Montei…"), m(false, "", "image")])).toBe(true)
  })
})

import { leadQuente } from "@/app/lib/agenteAuto"
describe("lead quente ignora o limite por hora", () => {
  it("MQL, etiqueta boa, perfil bom, pedido digital ou proposta em aberto", () => {
    expect(leadQuente({ jid: "a", status_lead: "mql" })).toBe(true)
    expect(leadQuente({ jid: "a", etiquetas: ["Lead médio"] })).toBe(true)
    expect(leadQuente({ jid: "a", perfil: "icp" })).toBe(true)
    expect(leadQuente({ jid: "a", pedidosDigitais: [{ jid: "a", status: "aguardando_sinal" }] })).toBe(true)
    expect(leadQuente({ jid: "a", propostas: [{ jid: "a", status: "enviada", em: new Date().toISOString() }] })).toBe(true)
    expect(leadQuente({ jid: "a", etiquetas: ["Lead pequeno"], perfil: "pequeno" })).toBe(false)
  })
})

describe("digital: caixa maior que A3", () => {
  it("custo R$ 4,40 e venda R$ 7,96 a unidade, final quebrado (caso Master Bacth, 15×12×8, 100 un)", async () => {
    const { cotarDigital } = await import("@/app/lib/digital")
    const c = cotarDigital({ quantidade: 100, caixa_cm: { frente: 12, lateral: 8, altura: 15 } } as never)
    expect(c.ok).toBe(true)
    if (c.ok) { expect(c.total).toBe(795.95); expect(c.custo).toBe(440); expect(c.margem).toBe(355.95) }
    const { precoMaiorQueA3 } = await import("@/app/lib/precoDigital")
    expect(precoMaiorQueA3(50)?.total).toBe(397.95)
    expect(precoMaiorQueA3(600)).toBeNull()
  })
})

describe("número do pedido digital nunca repete", () => {
  it("dois pedidos ao mesmo tempo com o mesmo número: o segundo pega o próximo livre (grupo acompanha)", async () => {
    const { vi } = await import("vitest")
    const tomados = new Set<string>()
    vi.doMock("@/app/lib/registroAgente", () => ({ reservarTratada: async (id: string) => { if (tomados.has(id)) return false; tomados.add(id); return true } }))
    const { reservarIdsDigitais } = await import("@/app/lib/digitalServidor")
    const existentes = [{ id: "DIG-0151" }]
    const a = await reservarIdsDigitais([{ id: "DIG-0152" }], existentes)
    const b = await reservarIdsDigitais([{ id: "DIG-0152", grupo: "DIG-0152" }, { id: "DIG-0153", grupo: "DIG-0152" }], existentes)
    expect(a[0].id).toBe("DIG-0152")
    expect(b.map(x => x.id)).toEqual(["DIG-0153", "DIG-0154"])
    expect(b.map(x => x.grupo)).toEqual(["DIG-0153", "DIG-0153"])
  })
})
