import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const { sincronizar } = vi.hoisted(() => ({ sincronizar: vi.fn() }))
vi.mock("@/app/lib/bancoServidor", () => ({ sincronizar }))

import { GET } from "@/app/api/banco/cron/route"

function req(auth?: string) {
  return new Request("http://localhost/api/banco/cron", {
    headers: auth ? { authorization: auth } : {},
  }) as never
}

describe("/api/banco/cron: autenticação", () => {
  const original = process.env.CRON_SECRET
  beforeEach(() => {
    sincronizar.mockReset().mockResolvedValue({ ok: true })
    process.env.CRON_SECRET = "segredo"
  })
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  })

  it("sem cabeçalho dá 401", async () => {
    expect((await GET(req())).status).toBe(401)
    expect(sincronizar).not.toHaveBeenCalled()
  })

  it("com segredo errado dá 401", async () => {
    expect((await GET(req("Bearer errado"))).status).toBe(401)
    expect(sincronizar).not.toHaveBeenCalled()
  })

  it("sem CRON_SECRET definido dá 401", async () => {
    delete process.env.CRON_SECRET
    expect((await GET(req("Bearer undefined"))).status).toBe(401)
    expect(sincronizar).not.toHaveBeenCalled()
  })

  it("com o segredo certo chama sincronizar", async () => {
    const r = await GET(req("Bearer segredo"))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
    expect(sincronizar).toHaveBeenCalledTimes(1)
  })
})
