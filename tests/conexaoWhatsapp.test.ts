import { describe, it, expect, vi, beforeEach } from "vitest"

let cfg: Record<string, unknown> = {}
const gravar = vi.fn(async (campos: Record<string, unknown>) => { cfg = { ...cfg, ...campos } })
let msgs: Record<string, { status: string | null; from_me: boolean }> = {}

vi.mock("@/app/lib/configAtomica", () => ({
  lerConfigLinha: async () => ({ data: { data: cfg }, error: null }),
  gravarCampos: (c: Record<string, unknown>) => gravar(c),
}))
vi.mock("@/app/lib/evolution", () => ({ evo: vi.fn() }))
vi.mock("@/app/lib/contatos", () => ({ telefoneNaResposta: () => null }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: () => {
      let id = ""
      const q = {
        select: () => q, eq: (_: string, v: string) => { id = v; return q },
        maybeSingle: async () => ({ data: msgs[id] ?? null }),
        update: () => q,
      }
      return q
    },
  },
}))

import { nomeDoEvento, lerEventoConexao, registrarConexao, provaDeVida, conferirConexao, registrarRecibos } from "@/app/lib/whatsappEventos"

const con = () => cfg.whatsappConexao as Record<string, unknown>
beforeEach(() => { cfg = {}; msgs = {}; gravar.mockClear() })

describe("evento de conexão", () => {
  it("reconhece connection.update em qualquer caixa/separador", () => {
    for (const n of ["connection.update", "CONNECTION_UPDATE", "connection-update", " Connection.Update "]) expect(nomeDoEvento(n)).toBe("connection.update")
    expect(nomeDoEvento("MESSAGES_UPSERT")).toBe("messages.upsert")
  })
  it("lê state, connection ou instance.state", () => {
    expect(lerEventoConexao({ state: "open" })?.estado).toBe("open")
    expect(lerEventoConexao({ connection: "CLOSE" })?.estado).toBe("close")
    expect(lerEventoConexao({ instance: { state: "open" } })?.estado).toBe("open")
    expect(lerEventoConexao({ state: "close", statusReason: 401 })?.motivo).toBe(401)
    expect(lerEventoConexao({ connection: "close", lastDisconnect: { error: { output: { statusCode: 401 } } } })?.motivo).toBe(401)
    expect(lerEventoConexao({})).toBeNull()
    expect(lerEventoConexao(undefined)).toBeNull()
  })
  it("grava open e o horário da mudança", async () => {
    await registrarConexao("open")
    expect(con().estado).toBe("open")
    expect(typeof con().em).toBe("string")
  })
})

describe("401 / aparelho removido", () => {
  it("acende removido e, na volta, liga o aquecimento", async () => {
    cfg = { whatsappConexao: { estado: "open", em: "2026-11-24T10:00:00Z" } }
    await registrarConexao("close", 401)
    expect(con().removido).toBe(true)
    expect(con().motivo).toBe(401)
    await registrarConexao("open")
    expect(con().aquecerDesde).toBeTruthy()
  })
})

describe("prova de vida", () => {
  it("volta para open sem removido/aquecerDesde", async () => {
    cfg = { whatsappConexao: { estado: "close", em: "2026-11-24T19:00:00Z" } }
    expect(await provaDeVida()).toBe(true)
    expect(con().estado).toBe("open")
    expect(con().removido).toBeUndefined()
    expect(con().aquecerDesde).toBeUndefined()
  })
  it("já open: não reescreve em", async () => {
    cfg = { whatsappConexao: { estado: "open", em: "2026-11-24T10:00:00Z" } }
    expect(await provaDeVida()).toBe(false)
    expect(gravar).not.toHaveBeenCalled()
    expect(con().em).toBe("2026-11-24T10:00:00Z")
  })
  it("aparelho removido: não mexe (quem liga o aquecimento é a conexão de verdade)", async () => {
    cfg = { whatsappConexao: { estado: "close", removido: true, em: "x" } }
    expect(await provaDeVida()).toBe(false)
    expect(gravar).not.toHaveBeenCalled()
  })
  it("recibo de envio nosso volta o carimbo para open", async () => {
    cfg = { whatsappConexao: { estado: "close", em: "x" } }
    msgs = { A1: { status: null, from_me: true } }
    await registrarRecibos([{ keyId: "A1", status: "DELIVERY_ACK" }])
    expect(con().estado).toBe("open")
    expect(con().removido).toBeUndefined()
  })
  it("recibo de mensagem que não é nossa não conta", async () => {
    cfg = { whatsappConexao: { estado: "close", em: "x" } }
    msgs = { B1: { status: null, from_me: false } }
    await registrarRecibos([{ keyId: "B1", status: "READ" }])
    expect(con().estado).toBe("close")
  })
})

describe("Vigia: conferirConexao", () => {
  it("connectionState open atualiza o carimbo", async () => {
    cfg = { whatsappConexao: { estado: "close", em: "x" } }
    const r = await conferirConexao(async () => ({ ok: true, status: 200, corpo: { instance: { state: "open" } } }))
    expect(r).toBe("open")
    expect(con().estado).toBe("open")
  })
  it("API inacessível não grava open", async () => {
    cfg = { whatsappConexao: { estado: "close", em: "x" } }
    expect(await conferirConexao(async () => ({ ok: false, status: 0, corpo: null }))).toBeNull()
    expect(await conferirConexao(async () => { throw new Error("rede") })).toBeNull()
    expect(gravar).not.toHaveBeenCalled()
    expect(con().estado).toBe("close")
  })
})
