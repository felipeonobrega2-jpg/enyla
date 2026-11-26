// Devolver à Fila: remove só as chaves pedidas, id inexistente não dá erro, nada é enviado.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({ cfg: {} as Record<string, unknown>, gravou: 0, fetch: vi.fn() }))
vi.mock("@/app/lib/configAtomica", () => ({
  mudarConfig: async (f: (d: Record<string, unknown>) => Record<string, unknown> | null) => {
    const m = f(estado.cfg)
    if (m) { estado.cfg = { ...estado.cfg, ...m }; estado.gravou++ }
    return estado.cfg
  },
}))

import { acaoRestaurarFila } from "@/app/lib/filaRestaurar"
import { restaurarDispensados, listarDispensados } from "@/app/lib/filaMensagens"

beforeEach(() => {
  estado.cfg = { filaDispensados: { "fu-a@s.whatsapp.net-1": "2026-11-20T10:00:00Z", "fu-b@s.whatsapp.net-2": "2026-11-21T10:00:00Z", "fu-c@s.whatsapp.net-3": "2026-11-22T10:00:00Z" } }
  estado.gravou = 0
  estado.fetch.mockClear()
  vi.stubGlobal("fetch", estado.fetch)
})

describe("restaurar_fila", () => {
  it("remove só as chaves pedidas e grava o mapa inteiro sem elas", async () => {
    const r = await acaoRestaurarFila("coo", { acao: "restaurar_fila", ids: ["fu-a@s.whatsapp.net-1", "fu-c@s.whatsapp.net-3"] })
    expect(r.status).toBe(200)
    expect(r.corpo.devolvidos).toBe(2)
    expect(Object.keys(estado.cfg.filaDispensados as object)).toEqual(["fu-b@s.whatsapp.net-2"])
  })
  it("registra autor e data", async () => {
    await acaoRestaurarFila("cco", { ids: ["fu-a@s.whatsapp.net-1"] })
    const log = estado.cfg.filaRestaurados as { ids: string[]; por: string; em: string }[]
    expect(log[0]).toMatchObject({ ids: ["fu-a@s.whatsapp.net-1"], por: "cco" })
    expect(new Date(log[0].em).getTime()).toBeGreaterThan(0)
  })
  it("id inexistente não dá erro, devolve 0 e não grava", async () => {
    const r = await acaoRestaurarFila("coo", { ids: ["fu-nao-existe-9"] })
    expect(r.status).toBe(200)
    expect(r.corpo.devolvidos).toBe(0)
    expect(estado.gravou).toBe(0)
    expect(Object.keys(estado.cfg.filaDispensados as object)).toHaveLength(3)
  })
  it("mistura de existente e inexistente conta só o que existia", async () => {
    const r = await acaoRestaurarFila("coo", { ids: ["fu-b@s.whatsapp.net-2", "fu-x-0", "fu-b@s.whatsapp.net-2"] })
    expect(r.corpo.devolvidos).toBe(1)
  })
  it("ids inválido: 400", async () => {
    expect((await acaoRestaurarFila("coo", {})).status).toBe(400)
    expect((await acaoRestaurarFila("coo", { ids: [] })).status).toBe(400)
    expect((await acaoRestaurarFila("coo", { ids: [1] })).status).toBe(400)
  })
  it("nenhum envio é disparado", async () => {
    await acaoRestaurarFila("coo", { ids: ["fu-a@s.whatsapp.net-1"] })
    expect(estado.fetch).not.toHaveBeenCalled()
  })
})

describe("restaurarDispensados / listarDispensados", () => {
  it("não muda o mapa original e ignora chaves herdadas", () => {
    const m = { a: "1", b: "2" }
    const r = restaurarDispensados(m, ["a", "toString"])
    expect(r.devolvidos).toEqual(["a"])
    expect(m).toEqual({ a: "1", b: "2" })
    expect(r.mapa).toEqual({ b: "2" })
  })
  it("lista com o nome da conversa, mais recente primeiro", () => {
    const l = listarDispensados({ "fu-a@s.whatsapp.net-1": "2026-11-20T10:00:00Z", "fu-b@s.whatsapp.net-2": "2026-11-21T10:00:00Z" }, [{ jid: "a@s.whatsapp.net", nome: "Ana" }])
    expect(l.map(i => i.nome)).toEqual(["b", "Ana"])
  })
})
