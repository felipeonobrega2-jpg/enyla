import { describe, it, expect, vi } from "vitest"
import { criarConfirmacaoEnvio } from "@/app/lib/confirmarEnvio"

const P = { destinatario: "Maria", texto: "Oi, Maria" }

describe("confirmação antes de Enviar mesmo assim", () => {
  it("pedir só abre a confirmação e não envia", () => {
    const enviar = vi.fn()
    const c = criarConfirmacaoEnvio()
    c.pedir(P)
    expect(c.pendente).toEqual(P)
    expect(enviar).not.toHaveBeenCalled()
  })
  it("cancelar fecha e nunca envia", async () => {
    const enviar = vi.fn()
    const c = criarConfirmacaoEnvio()
    c.pedir(P); c.cancelar()
    expect(c.pendente).toBeNull()
    expect(await c.confirmar(enviar)).toBe(false)
    expect(enviar).not.toHaveBeenCalled()
  })
  it("confirmar sem pedir não envia", async () => {
    const enviar = vi.fn()
    expect(await criarConfirmacaoEnvio().confirmar(enviar)).toBe(false)
    expect(enviar).not.toHaveBeenCalled()
  })
  it("envia uma única vez, só após confirmar", async () => {
    const enviar = vi.fn()
    const c = criarConfirmacaoEnvio()
    c.pedir(P)
    expect(await c.confirmar(enviar)).toBe(true)
    expect(enviar).toHaveBeenCalledTimes(1)
    expect(await c.confirmar(enviar)).toBe(false)
    expect(enviar).toHaveBeenCalledTimes(1)
  })
})
