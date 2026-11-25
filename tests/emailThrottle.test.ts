// Resend: pausa entre e-mails e retry em 429 respeitando o Retry-After.
import { describe, it, expect, vi, afterEach } from "vitest"
import { enviarEmail, esperaDoRetryAfter, MAX_TENTATIVAS_429, PAUSA_ENTRE_EMAILS_MS } from "@/app/lib/email"

const msg = { assunto: "a", texto: "t", html: "<p>t</p>" }
const resp = (status: number, corpo: object, headers: Record<string, string> = {}) => new Response(JSON.stringify(corpo), { status, headers })

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe("enviarEmail e a Resend", () => {
  it("dois e-mails seguidos não saem na mesma hora", async () => {
    vi.useFakeTimers(); vi.stubEnv("RESEND_API_KEY", "k")
    const f = vi.fn(async () => resp(200, { id: "x" }))
    vi.stubGlobal("fetch", f)
    const a = enviarEmail("a@b.com.br", msg), b = enviarEmail("c@d.com.br", msg)
    await vi.advanceTimersByTimeAsync(10)
    expect(f).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(PAUSA_ENTRE_EMAILS_MS)
    expect(f).toHaveBeenCalledTimes(2)
    await Promise.all([a, b])
  })
  it("Retry-After: segundos viram ms, com piso e teto", () => {
    expect(esperaDoRetryAfter("2")).toBe(2000)
    expect(esperaDoRetryAfter("999")).toBe(10_000)
    expect(esperaDoRetryAfter(null)).toBe(1000)
  })
  it("429 espera o Retry-After e tenta de novo; sucesso na segunda", async () => {
    vi.useFakeTimers(); vi.stubEnv("RESEND_API_KEY", "k")
    const f = vi.fn().mockResolvedValueOnce(resp(429, { message: "rate" }, { "retry-after": "2" })).mockResolvedValueOnce(resp(200, { id: "x" }))
    vi.stubGlobal("fetch", f)
    const p = enviarEmail("a@b.com.br", msg)
    await vi.advanceTimersByTimeAsync(1000)
    expect(f).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2500)
    expect(await p).toEqual({ ok: true, id: "x" })
    expect(f).toHaveBeenCalledTimes(2)
  })
  it("429 sem parar: desiste depois de poucas tentativas", async () => {
    vi.useFakeTimers(); vi.stubEnv("RESEND_API_KEY", "k")
    const f = vi.fn(async () => resp(429, { message: "rate" }, { "retry-after": "1" }))
    vi.stubGlobal("fetch", f)
    const p = enviarEmail("a@b.com.br", msg)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await p).toEqual({ ok: false, erro: "rate" })
    expect(f).toHaveBeenCalledTimes(MAX_TENTATIVAS_429)
  })
  it.each(["daily_quota_exceeded", "monthly_quota_exceeded"])("429 de cota (%s) não retenta e devolve erro de cota", async nome => {
    vi.useFakeTimers(); vi.stubEnv("RESEND_API_KEY", "k")
    const f = vi.fn(async () => resp(429, { name: nome, message: "You have reached your daily email sending quota.", statusCode: 429 }, { "retry-after": "1" }))
    vi.stubGlobal("fetch", f)
    const p = enviarEmail("a@b.com.br", msg)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await p).toEqual({ ok: false, erro: "You have reached your daily email sending quota.", cota: true })
    expect(f).toHaveBeenCalledTimes(1)
  })
})
