import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const TOKEN = "EAAB_segredo_do_token_123"
let diretorChave: { ok: true; diretor: string } | { ok: false; erro: string; status: number } = { ok: true, diretor: "cmo" }
const inserts: { colecao: string; id: string; dados: Record<string, unknown> }[] = []

vi.mock("@/app/lib/configAtomica", () => ({
  lerConfigLinha: async () => ({ data: { data: { metaToken: TOKEN, metaContaId: "act_9" } }, error: null }),
  lerCampos: async () => ({}),
}))
vi.mock("@/app/lib/acessoExterno", () => ({ conferirChave: async () => diretorChave, LIMITE_POR_HORA: 120 }))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn() }))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(), gravarConversa: vi.fn(), lerPlanos: vi.fn() }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: { from: () => ({ insert: async (r: { colecao: string; id: string; dados: Record<string, unknown> }) => { inserts.push(r); return { error: null } } }) },
}))
vi.mock("@/app/lib/agenteLeads", () => ({ filtroDoAgente: vi.fn() }))
vi.mock("next/server", async () => {
  const real = await vi.importActual<typeof import("next/server")>("next/server")
  return { ...real, after: vi.fn() }
})

import { POST, GET } from "@/app/api/externo/route"

let campanha: Record<string, unknown>
let fetchMock: ReturnType<typeof vi.fn>
const escritas = () => fetchMock.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === "POST")
const post = (corpo: unknown) => POST({ headers: new Headers({ authorization: "Bearer x" }), json: async () => corpo } as never)
const msg = (c: object) => ({ acao: "meta_ads", campanhaId: "111", ...c })

beforeEach(() => {
  inserts.length = 0
  diretorChave = { ok: true, diretor: "cmo" }
  campanha = { id: "111", name: "Camp A", status: "PAUSED", daily_budget: "10000", account_id: "9" }
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({ json: async () => init?.method === "POST" ? { success: true } : campanha }))
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe("POST acao=meta_ads", () => {
  it("chave que não é da CMO: 403 e nenhuma chamada à Meta", async () => {
    diretorChave = { ok: true, diretor: "cfo" }
    const r = await post(msg({ operacao: "pausar" }))
    expect(r.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sem chave: 401", async () => {
    diretorChave = { ok: false, erro: "sem chave", status: 401 }
    expect((await post(msg({ operacao: "pausar" }))).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([["ligar", "ACTIVE", "PAUSED"], ["pausar", "PAUSED", "ACTIVE"]])("%s: escreve %s e registra antes/depois", async (operacao, status, antes) => {
    campanha.status = antes
    const r = await post(msg({ operacao }))
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(escritas()).toHaveLength(1)
    const [url, init] = escritas()[0] as [string, RequestInit]
    expect(url).toBe("https://graph.facebook.com/v20.0/111")
    expect(new URLSearchParams(init.body as URLSearchParams).get("status")).toBe(status)
    expect(j.registro).toMatchObject({ diretor: "cmo", operacao, campanhaId: "111", campanhaNome: "Camp A", aceita: true, antes: { status: antes }, depois: { status } })
    expect(Number.isNaN(Date.parse(j.registro.em))).toBe(false)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({ colecao: "metaAdsAcoes", dados: { aceita: true, diretor: "cmo" } })
  })

  it("ajuste dentro de 20% (100 → 96 e 120): escreve em centavos", async () => {
    for (const [v, cent] of [[96, "9600"], [120, "12000"], [80, "8000"]] as const) {
      fetchMock.mockClear(); inserts.length = 0
      const r = await post(msg({ operacao: "ajustar_verba", verbaDiaria: v }))
      const j = await r.json()
      expect(r.status).toBe(200)
      expect(new URLSearchParams((escritas()[0][1] as RequestInit).body as URLSearchParams).get("daily_budget")).toBe(cent)
      expect(j.registro).toMatchObject({ aceita: true, antes: { verbaDiaria: 100 }, depois: { verbaDiaria: v } })
      expect(inserts).toHaveLength(1)
    }
  })

  it("ajuste acima de 20% (100 → 121): 400, sem escrita, recusa registrada", async () => {
    const r = await post(msg({ operacao: "ajustar_verba", verbaDiaria: 121 }))
    const j = await r.json()
    expect(r.status).toBe(400)
    expect(escritas()).toHaveLength(0)
    expect(j.registro).toMatchObject({ aceita: false, antes: { verbaDiaria: 100 }, depois: null })
    expect(inserts[0].dados).toMatchObject({ aceita: false, diretor: "cmo", campanhaId: "111" })
    expect(inserts[0].dados.motivo).toContain("20%")
  })

  it("abaixo de -20% (100 → 79): 400", async () => {
    expect((await post(msg({ operacao: "ajustar_verba", verbaDiaria: 79 }))).status).toBe(400)
    expect(escritas()).toHaveLength(0)
  })

  it("acima de R$ 200 (190 → 210, só 10%): 400 e não corta para 200", async () => {
    campanha.daily_budget = "19000"
    const r = await post(msg({ operacao: "ajustar_verba", verbaDiaria: 210 }))
    expect(r.status).toBe(400)
    expect(escritas()).toHaveLength(0)
    expect(inserts[0].dados).toMatchObject({ aceita: false })
    expect(inserts[0].dados.motivo).toContain("teto")
  })

  it("verba atual zero ou só lifetime: recusa, sem escrita", async () => {
    campanha = { ...campanha, daily_budget: undefined, lifetime_budget: "500000" }
    const r = await post(msg({ operacao: "ajustar_verba", verbaDiaria: 50 }))
    expect(r.status).toBe(400)
    expect(escritas()).toHaveLength(0)
  })

  it("campanha de outra conta ou inexistente: sem escrita", async () => {
    campanha.account_id = "777"
    expect((await post(msg({ operacao: "pausar" }))).status).toBe(404)
    campanha = { error: { code: 100, type: "GraphMethodException" } }
    expect((await post(msg({ operacao: "pausar" }))).status).toBe(404)
    expect(escritas()).toHaveLength(0)
  })

  it.each([
    [{ operacao: "criar_campanha" }], [{ operacao: "publicar" }], [{ operacao: "criar_anuncio" }], [{}],
    [{ operacao: "pausar", adsetId: "5" }], [{ operacao: "pausar", verbaDiaria: 10 }], [{ operacao: "pausar", campanhaId: "abc" }],
    [{ operacao: "pausar", campanhaId: "" }], [{ operacao: "ajustar_verba" }], [{ operacao: "ajustar_verba", verbaDiaria: -5 }],
  ])("pedido inválido %j: 400 e nenhuma escrita", async corpo => {
    const r = await post({ acao: "meta_ads", campanhaId: "111", ...corpo })
    expect(r.status).toBe(400)
    expect(escritas()).toHaveLength(0)
  })

  it("Meta recusa por falta de ads_management: erro claro, recusa registrada, sem token", async () => {
    fetchMock.mockImplementation(async (_u: string, init?: RequestInit) => ({ json: async () => init?.method === "POST" ? { error: { code: 200, type: "OAuthException", message: `token ${TOKEN}` } } : campanha }))
    const r = await post(msg({ operacao: "pausar" }))
    const txt = JSON.stringify(await r.json())
    expect(r.status).toBe(403)
    expect(txt).toContain("ads_management")
    expect(txt).not.toContain(TOKEN)
    expect(JSON.stringify(inserts)).not.toContain(TOKEN)
  })

  it("resposta, registro e logs não contêm o token; o token não vai na URL", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {}), err = vi.spyOn(console, "error").mockImplementation(() => {})
    const txt = JSON.stringify(await (await post(msg({ operacao: "ajustar_verba", verbaDiaria: 110 }))).json())
    expect(txt).not.toContain(TOKEN)
    expect(JSON.stringify(inserts)).not.toContain(TOKEN)
    expect(JSON.stringify([...log.mock.calls, ...err.mock.calls])).not.toContain(TOKEN)
    expect(escritas()[0][0]).not.toContain(TOKEN)
    log.mockRestore(); err.mockRestore()
  })
})

describe("POST acao=meta_ads por conjuntoId", () => {
  const msgC = (c: object) => ({ acao: "meta_ads", conjuntoId: "222", ...c })
  beforeEach(() => { campanha = { id: "222", name: "Conj A", status: "PAUSED", daily_budget: "10000", account_id: "9", campaign_id: "111" } })

  it("outra chave: 403 sem chamar a Meta", async () => {
    diretorChave = { ok: true, diretor: "cfo" }
    expect((await post(msgC({ operacao: "pausar" }))).status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([["ligar", "ACTIVE", "PAUSED"], ["pausar", "PAUSED", "ACTIVE"]])("%s: escreve %s no conjunto e registra", async (operacao, status, antes) => {
    campanha.status = antes
    const r = await post(msgC({ operacao }))
    const j = await r.json()
    expect(r.status).toBe(200)
    const [url, init] = escritas()[0] as [string, RequestInit]
    expect(url).toBe("https://graph.facebook.com/v20.0/222")
    expect([...new URLSearchParams(init.body as URLSearchParams).keys()].sort()).toEqual(["access_token", "status"])
    expect(new URLSearchParams(init.body as URLSearchParams).get("status")).toBe(status)
    expect(j.registro).toMatchObject({ diretor: "cmo", operacao, conjuntoId: "222", conjuntoNome: "Conj A", campanhaId: "111", aceita: true, antes: { status: antes }, depois: { status } })
    expect(Number.isNaN(Date.parse(j.registro.em))).toBe(false)
    expect(inserts).toHaveLength(1)
  })

  it("ajuste dentro de 20% e ≤ 200: escreve daily_budget em centavos", async () => {
    const r = await post(msgC({ operacao: "ajustar_verba", verbaDiaria: 110 }))
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(new URLSearchParams((escritas()[0][1] as RequestInit).body as URLSearchParams).get("daily_budget")).toBe("11000")
    expect(j.registro).toMatchObject({ aceita: true, conjuntoId: "222", antes: { verbaDiaria: 100 }, depois: { verbaDiaria: 110 } })
  })

  it("acima de 20% (100 → 121): 400, sem escrita, recusa registrada", async () => {
    const r = await post(msgC({ operacao: "ajustar_verba", verbaDiaria: 121 }))
    expect(r.status).toBe(400)
    expect(escritas()).toHaveLength(0)
    expect(inserts[0].dados).toMatchObject({ aceita: false, conjuntoId: "222", antes: { verbaDiaria: 100 }, depois: null })
    expect(inserts[0].dados.motivo).toContain("20%")
  })

  it("acima de R$ 200 (190 → 210): 400, não corta", async () => {
    campanha.daily_budget = "19000"
    const r = await post(msgC({ operacao: "ajustar_verba", verbaDiaria: 210 }))
    expect(r.status).toBe(400)
    expect(escritas()).toHaveLength(0)
    expect(inserts[0].dados.motivo).toContain("teto")
  })

  it("conjunto CBO (sem daily_budget): 400 dizendo que a verba está na campanha", async () => {
    delete campanha.daily_budget
    const r = await post(msgC({ operacao: "ajustar_verba", verbaDiaria: 50 }))
    const j = await r.json()
    expect(r.status).toBe(400)
    expect(j.erro).toContain("está na campanha")
    expect(escritas()).toHaveLength(0)
    expect(inserts[0].dados).toMatchObject({ aceita: false, conjuntoId: "222" })
  })

  it("conjunto de outra conta ou inexistente: sem escrita", async () => {
    campanha.account_id = "777"
    expect((await post(msgC({ operacao: "pausar" }))).status).toBe(404)
    campanha = { error: { code: 100, type: "GraphMethodException" } }
    expect((await post(msgC({ operacao: "pausar" }))).status).toBe(404)
    expect(escritas()).toHaveLength(0)
  })

  it.each([
    [{ campanhaId: "111", conjuntoId: "222", operacao: "pausar" }],
    [{ operacao: "pausar", conjuntoId: undefined, campanhaId: undefined }],
    [{ operacao: "pausar", adsetId: "5" }],
    [{ operacao: "pausar", conjuntoId: "abc" }],
  ])("pedido inválido %j: 400 e nenhuma escrita", async corpo => {
    const r = await post({ acao: "meta_ads", ...corpo })
    expect(r.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sem token na resposta, no registro nem na URL", async () => {
    const txt = JSON.stringify(await (await post(msgC({ operacao: "ajustar_verba", verbaDiaria: 110 }))).json())
    expect(txt).not.toContain(TOKEN)
    expect(JSON.stringify(inserts)).not.toContain(TOKEN)
    expect(fetchMock.mock.calls.every(c => !String(c[0]).includes(TOKEN) || (c[1] as RequestInit | undefined)?.method !== "POST")).toBe(true)
  })
})

describe("ajuda do GET", () => {
  const get = () => GET({ headers: new Headers({ authorization: "Bearer x" }), nextUrl: new URL("http://x/api/externo") } as never)
  it("mostra meta_ads só para a CMO", async () => {
    expect(JSON.stringify(await (await get()).json())).toContain("acao:'meta_ads'")
    diretorChave = { ok: true, diretor: "cfo" }
    expect(JSON.stringify(await (await get()).json())).not.toContain("acao:'meta_ads'")
  })
})
