import { describe, it, expect, vi } from "vitest"
import { pedirSugestao, sugestaoVelha } from "@/app/lib/sugestaoWhatsapp"

describe("sugestão da tela do WhatsApp", () => {
  it("sugestão guardada da mesma mensagem continua válida; de mensagem antiga é velha", () => {
    expect(sugestaoVelha({ ultimaId: "a" }, { id: "a" })).toBe(false)
    expect(sugestaoVelha({ ultimaId: "a" }, { id: "b" })).toBe(true)
    expect(sugestaoVelha(undefined, { id: "b" })).toBe(false)
  })
  it("só chama /api/whatsapp/atender quando pedirSugestao é chamada (uma vez por clique)", async () => {
    const f = vi.fn(async (_url: string, _init: unknown) => ({ ok: true, json: async () => ({ resposta: "oi", ultimaId: "a" }) }))
    expect(f).not.toHaveBeenCalled()
    const r = await pedirSugestao(f, "551199@s.whatsapp.net")
    expect(f).toHaveBeenCalledTimes(1)
    expect(f.mock.calls[0][0]).toBe("/api/whatsapp/atender")
    expect(r.at?.resposta).toBe("oi")
  })
  it("erro da IA vira mensagem", async () => {
    const r = await pedirSugestao(async () => ({ ok: false, json: async () => ({ erro: "x" }) }), "j")
    expect(r).toEqual({ erro: "x" })
  })
})
