import { describe, it, expect, vi } from "vitest"
vi.mock("@/app/lib/supabase", () => ({ supabase: {} }))
import { conferirSaldo, valoresDoTexto } from "@/app/lib/saldoCobranca"

describe("conferirSaldo", () => {
  it("lê valores em reais", () => expect(valoresDoTexto("de R$ 1.234,56 e R$ 90")).toEqual([123456, 9000]))
  it("valor igual ao saldo: ok", () => expect(conferirSaldo("valor de R$ 1.234,56", "P1", 1234.56)).toEqual({ ok: true }))
  it("valor diferente: não confere", () => expect(conferirSaldo("valor de R$ 1.000,00", "P1", 1234.56).ok).toBe(false))
  it("sem pedido, pedido inexistente ou sem valor: não confere", () => {
    expect(conferirSaldo("R$ 10,00", undefined, null).ok).toBe(false)
    expect(conferirSaldo("R$ 10,00", "P1", null).ok).toBe(false)
    expect(conferirSaldo("pague já", "P1", 10).ok).toBe(false)
  })
})
