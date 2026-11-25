import { describe, it, expect, vi } from "vitest"
vi.mock("@/app/lib/supabase", () => ({ supabase: {} }))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn() }))
import { classificarNivel, type FontesNivel } from "@/app/lib/nivelCliente"

const base = (p: Partial<FontesNivel> = {}): FontesNivel => ({ cards: [], pedidosDigitais: [], curvas: new Map(), cadastro: [], leituraOk: true, ...p })
const conv = { jid: "5511999990001@s.whatsapp.net", nome: "Carla Dias", telefone: "5511999990001" }
const compra = { numero: "P-1", nomeCliente: "Carla Dias", coluna: 4, createdAt: "2026-10-01" }

describe("classificarNivel", () => {
  it.each(["A", "B", "C"] as const)("curva %s com ligação forte", c => {
    expect(classificarNivel(conv, base({ cards: [compra], curvas: new Map([["carla dias", c]]) as never }))).toMatchObject({ nivel: c, jaCliente: true })
  })
  it("comprou mas sem curva, ou só digital: indefinido e jaCliente", () => {
    expect(classificarNivel(conv, base({ cards: [compra] }))).toMatchObject({ nivel: "indefinido", jaCliente: true })
    const dig = { id: "DIG-1", jid: conv.jid, em: "2026-10-01", status: "producao" }
    expect(classificarNivel({ ...conv, nome: "Zé" }, base({ pedidosDigitais: [dig] }))).toMatchObject({ nivel: "indefinido", jaCliente: true })
  })
  it("cadastro sem compra: lead", () => {
    expect(classificarNivel(conv, base({ cadastro: [{ nome: "Outro Nome", telefone: "(11) 99999-0001" }] }))).toMatchObject({ nivel: "lead", jaCliente: false })
    expect(classificarNivel(conv, base({ cadastro: [{ nome: "Carla Dias", telefone: null }] })).nivel).toBe("lead")
  })
  it("cadastro com orçamento aberto (coluna 0), número internacional ou jid com sufixo: lead", () => {
    const orc = { ...compra, coluna: 0 }
    expect(classificarNivel(conv, base({ cards: [orc], cadastro: [{ nome: "Carla Dias", telefone: null }] })).nivel).toBe("lead")
    const intl = { jid: "447535624212@s.whatsapp.net", nome: "Kingdom Healthcare", telefone: null }
    expect(classificarNivel(intl, base({ cards: [{ ...compra, nomeCliente: "Kingdom Healthcare", coluna: 0 }], cadastro: [{ nome: "Kingdom Healthcare", telefone: null }] })).nivel).toBe("lead")
  })
  it("ligação fraca (só o primeiro nome) com cliente que comprou: indefinido", () => {
    const c = { jid: "9@s.whatsapp.net", nome: "Carla", telefone: null }
    const cards = [{ ...compra, nomeCliente: "Carla" }, { ...compra, nomeCliente: "Carla Dias" }]
    expect(classificarNivel(c, base({ cards })).nivel).not.toBe("A")
    expect(classificarNivel(c, base({ cards, cadastro: [{ nome: "Carla", telefone: null }] })).nivel).toBe("indefinido")
  })
  it("erro de leitura: indefinido", () => {
    expect(classificarNivel(conv, base({ leituraOk: false })).nivel).toBe("indefinido")
  })
  it("sem cadastro, sem compra, leituras ok: lead (orçamento aberto não é compra)", () => {
    expect(classificarNivel(conv, base({ cards: [{ ...compra, coluna: 0 }] }))).toMatchObject({ nivel: "lead", jaCliente: false })
  })
})
