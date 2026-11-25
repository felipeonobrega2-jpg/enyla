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
  it("cadastro sem compra: indefinido", () => {
    expect(classificarNivel(conv, base({ cadastro: [{ nome: "Outro Nome", telefone: "(11) 99999-0001" }] })).nivel).toBe("indefinido")
  })
  it("ligação fraca (só o primeiro nome) com cliente que comprou: indefinido", () => {
    const c = { jid: "9@s.whatsapp.net", nome: "Carla", telefone: null }
    expect(classificarNivel(c, base({ cards: [{ ...compra, nomeCliente: "Carla" }, { ...compra, nomeCliente: "Carla Dias" }] })).nivel).not.toBe("A")
  })
  it("erro de leitura: indefinido", () => {
    expect(classificarNivel(conv, base({ leituraOk: false })).nivel).toBe("indefinido")
  })
  it("sem cadastro, sem compra, leituras ok: lead (orçamento aberto não é compra)", () => {
    expect(classificarNivel(conv, base({ cards: [{ ...compra, coluna: 0 }] }))).toMatchObject({ nivel: "lead", jaCliente: false })
  })
})
