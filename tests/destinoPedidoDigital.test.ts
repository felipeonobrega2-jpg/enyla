// Pós-venda (e qualquer ordem a cliente) acha o WhatsApp de um pedido Digital: pedido, depois cadastro, depois conversa.
import { describe, it, expect, vi, beforeEach } from "vitest"

const e = vi.hoisted(() => ({
  cfg: {} as Record<string, unknown>, clientes: [] as Record<string, string>[], conversas: [] as Record<string, string>[],
}))
const cadeia = (rows: unknown[]) => { const q: Record<string, unknown> = { then: (r: (v: unknown) => void) => r({ data: rows }) }; for (const m of ["select", "order", "limit", "eq", "ilike"]) q[m] = () => q; return q }
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: (t: string) => cadeia(t === "Cliente" ? e.clientes : t === "whatsapp_conversas" ? e.conversas : []) } }))
vi.mock("@/app/lib/configAtomica", () => ({ lerConfigLinha: vi.fn(async () => ({ data: { data: e.cfg } })) }))
vi.mock("@/app/lib/evolution", () => ({ evo: vi.fn() }))
vi.mock("@/app/lib/whatsappDados", () => ({ gravarLote: vi.fn() }))

import { destinoDoCliente } from "@/app/lib/enviarCliente"

const JID = "5511999990002@s.whatsapp.net"
beforeEach(() => { e.cfg = {}; e.clientes = []; e.conversas = [] })

describe("destinoDoCliente com pedido Digital", () => {
  it("DIG-xxxx: usa o jid do pedido, sem cadastro", async () => {
    e.cfg = { pedidosDigitais: [{ id: "DIG-0052", jid: JID, nome: "Ana Velas" }] }
    expect(await destinoDoCliente("DIG-0052")).toMatchObject({ destino: JID, jid: JID })
  })
  it("DIG-xxxx sem jid no pedido: cai na conversa pelo nome do pedido", async () => {
    e.cfg = { pedidosDigitais: [{ id: "DIG-0127", jid: "", nome: "Ana Velas" }] }
    e.conversas = [{ jid: JID, nome: "Ana Velas", ultima_at: "2026-11-25" }]
    expect(await destinoDoCliente("DIG-0127")).toMatchObject({ destino: JID, jid: JID })
  })
  it("nome do cliente sem cadastro: acha o jid pelo pedido Digital", async () => {
    e.cfg = { pedidosDigitais: [{ id: "DIG-0001", jid: JID, nome: "Ana Velas" }] }
    expect(await destinoDoCliente("Ana Velas")).toMatchObject({ destino: JID })
  })
  it("sem nada: devolve o motivo, sem cair em silêncio", async () => {
    e.cfg = { pedidosDigitais: [{ id: "DIG-0003", jid: "", nome: "Ana Velas" }] }
    expect(await destinoDoCliente("DIG-0003")).toMatchObject({ destino: null, motivo: "pedido_sem_jid" })
    expect(await destinoDoCliente("DIG-9999")).toMatchObject({ destino: null, motivo: "pedido_nao_encontrado" })
    expect(await destinoDoCliente("Fulano")).toMatchObject({ destino: null, motivo: "sem_jid" })
  })
})
