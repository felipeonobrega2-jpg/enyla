import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { NextRequest } from "next/server"
process.env.AUTH_SECRET ??= "segredo-de-teste"

const lerPedido = vi.fn()
vi.mock("../app/lib/digitalServidor", () => ({
  lerPedido: (...a: unknown[]) => lerPedido(...a),
  tokenDigitalValido: (id: string, t: string | null) => t === `ok-${id}`,
}))
vi.mock("../app/lib/acompanhamentoPedido", () => ({ acompanhamentoDe: async () => ({ numero: "DIG-0001", etapaAtual: { rotulo: "Em produção" } }) }))

import { GET } from "../app/api/d/[id]/acompanhar/route"
import { linkAcompanhar, linkPedido, tokenDigital } from "../app/lib/digitalLink"

const chamar = (t: string) => GET(new NextRequest(`http://x/api/d/DIG-0001/acompanhar?t=${t}`), { params: Promise.resolve({ id: "DIG-0001" }) })
const fonte = (p: string) => readFileSync(p, "utf8")

describe("link de acompanhamento do Digital", () => {
  beforeEach(() => lerPedido.mockReset())

  it("recusa token errado, sem ler o pedido", async () => {
    const r = await chamar("errado")
    expect(r.status).toBe(403)
    expect(lerPedido).not.toHaveBeenCalled()
  })
  it("com token certo devolve só o acompanhamento (sem Pix, briefing, quantidades)", async () => {
    lerPedido.mockResolvedValue({ pedido: { id: "DIG-0001", status: "em_producao", sinalPagoEm: "2026-11-20" } })
    const r = await chamar("ok-DIG-0001")
    expect(r.status).toBe(200)
    expect(Object.keys(await r.json())).toEqual(["acompanhamento"])
  })
  it("usa o mesmo token do fechamento e não muda o link de fechamento", () => {
    const id = "DIG-0001"
    expect(linkAcompanhar(id)).toBe(`https://app.enyla.com.br/d/${id}/acompanhar?t=${tokenDigital(id)}`)
    expect(linkPedido(id)).toBe(`https://app.enyla.com.br/d/${id}?t=${tokenDigital(id)}`)
  })
  it("a tela nova não tem Pix, briefing, upload, ajuste nem entrega", () => {
    const t = fonte("app/d/[id]/acompanhar/AcompanharClient.tsx") + fonte("app/d/[id]/acompanhar/page.tsx")
    expect(t).toContain("AcompanhamentoDigital")
    expect(t).not.toMatch(/pix|briefing|upload|ajuste|entrega"|cep|frete/i)
  })
  it("/d/{id} não mostra mais o acompanhamento nem o bloco de entrega, e não fala em frete", () => {
    const c = fonte("app/d/[id]/DigitalClient.tsx")
    expect(c).not.toContain("<AcompanhamentoDigital")
    expect(c).not.toMatch(/Salvar endereço|Para onde a gente manda|placeholder="CEP"/)
    expect(c).not.toMatch(/frete(?!:)/i)
    expect(c).toContain("Acompanhar meu pedido")
  })
})
