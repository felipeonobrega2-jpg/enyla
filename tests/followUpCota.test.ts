import { describe, it, expect, vi } from "vitest"
import { decidirVez, iaDoFollowUp } from "@/app/lib/agenteAuto"

const agora = Date.parse("2026-11-24T12:00:00Z")
const envios = (n: number) => Array.from({ length: n }, (_, i) => agora - 3_000_000 + i * 1000)

describe("cota proativa", () => {
  it("proativo: 24 por hora; cheio barra, livre passa", () => {
    const base = { agora, aquecendo: false, essencial: false, proativo: true, jitterSeg: 0 }
    expect(decidirVez({ ...base, envios: envios(24) })).toEqual({ erro: "não enviou (limite de 24 por hora para follow-up)" })
    expect("vez" in decidirVez({ ...base, envios: envios(23) })).toBe(true)
  })
  it("responder quem escreveu não tem teto", () => {
    expect("vez" in decidirVez({ agora, envios: envios(100), aquecendo: false, essencial: false, proativo: false, jitterSeg: 0 })).toBe(true)
  })
})

describe("follow-up confere a cota antes da IA", () => {
  it("cota cheia: não chama a IA", async () => {
    const atender = vi.fn(async () => ({ ok: true }))
    const r = await iaDoFollowUp(atender, async () => "não enviou (limite de 24 por hora para follow-up)")
    expect(atender).not.toHaveBeenCalled()
    expect(r).toEqual({ segurado: "não enviou (limite de 24 por hora para follow-up)" })
  })
  it("cota livre: chama a IA como hoje", async () => {
    const atender = vi.fn(async () => ({ ok: true }))
    const r = await iaDoFollowUp(atender, async () => null)
    expect(atender).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ resultado: { ok: true } })
  })
})
