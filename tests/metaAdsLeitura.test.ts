import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const TOKEN = "EAAB_segredo_do_token_123"
const cfg: { data: { data: Record<string, unknown> } | null } = { data: { data: { metaToken: TOKEN, metaContaId: "act_9" } } }
let diretorChave: { ok: true; diretor: string } | { ok: false; erro: string; status: number } = { ok: true, diretor: "cmo" }

vi.mock("@/app/lib/configAtomica", () => ({ lerConfigLinha: async () => ({ data: cfg.data, error: null }), lerCampos: async () => ({}) }))
vi.mock("@/app/lib/acessoExterno", () => ({ conferirChave: async () => diretorChave, LIMITE_POR_HORA: 120 }))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn() }))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(), gravarConversa: vi.fn(), lerPlanos: vi.fn() }))
vi.mock("@/app/lib/supabase", () => ({ supabase: {} }))
vi.mock("@/app/lib/agenteLeads", () => ({ filtroDoAgente: vi.fn() }))
vi.mock("next/server", async () => {
  const real = await vi.importActual<typeof import("next/server")>("next/server")
  return { ...real, after: vi.fn() }
})

import { GET } from "@/app/api/externo/route"
import { conversasDe, montarConta, limparCacheMetaAds } from "@/app/lib/metaAdsLeitura"

const acoes = [
  { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "5" },
  { action_type: "messaging_conversation_started_7d", value: "5" },
  { action_type: "lead", value: "9" },
]
function graphFalsa(url: string) {
  const u = new URL(url)
  const p = u.pathname
  if (p.endsWith("/insights")) {
    const lvl = u.searchParams.get("level")!, preset = u.searchParams.get("date_preset")
    const id = lvl === "campaign" ? { campaign_id: "1" } : lvl === "adset" ? { adset_id: "2" } : { ad_id: "3" }
    return { data: [{ ...id, spend: preset === "today" ? "0" : "10.5", ctr: "4.1", frequency: "1.4", impressions: "100", clicks: "4", reach: "70", actions: acoes }] }
  }
  if (p.endsWith("/campaigns")) return { data: [{ id: "1", name: "Camp", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "8000" }] }
  if (p.endsWith("/adsets")) return { data: [{ id: "2", name: "Conj", status: "ACTIVE", campaign_id: "1", daily_budget: "5000" }, { id: "4", name: "Conj CBO", status: "ACTIVE", campaign_id: "1" }] }
  if (p.endsWith("/ads")) return { data: [{ id: "3", name: "Anun", status: "ACTIVE", adset_id: "2", campaign_id: "1" }] }
  return { account_status: 1, is_prepay_account: true, currency: "BRL", amount_spent: "160600", spend_cap: "0", funding_source_details: { display_string: "Saldo disponível (R$4,82 BRL)" } }
}
const req = (o = "meta_ads") => ({ headers: new Headers({ authorization: "Bearer x" }), nextUrl: new URL(`http://x/api/externo?o=${o}`) }) as never

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  limparCacheMetaAds()
  cfg.data = { data: { metaToken: TOKEN, metaContaId: "act_9" } }
  diretorChave = { ok: true, diretor: "cmo" }
  fetchMock = vi.fn(async (url: string) => ({ json: async () => graphFalsa(url) }))
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe("regras puras", () => {
  it("conversas sem contagem dupla", () => expect(conversasDe(acoes)).toBe(5))
  it("conversas cai para a próxima da prioridade", () => expect(conversasDe([{ action_type: "lead", value: "3" }])).toBe(3))
  it("saldo pelo texto; senão pelo limite, em reais", () => {
    expect(montarConta("act_1", { funding_source_details: { display_string: "Saldo (R$4,82 BRL)" }, amount_spent: "160600" })).toMatchObject({ saldo: 4.82, gastoAcumulado: 1606, limite: null })
    expect(montarConta("act_1", { spend_cap: "50000", amount_spent: "20000" })).toMatchObject({ saldo: 300, limite: 500 })
  })
})

describe("GET /api/externo?o=meta_ads", () => {
  it("CMO recebe o payload completo, só com GET e sem token", async () => {
    const r = await GET(req())
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.conta).toMatchObject({ id: "act_9", prePaga: true, moeda: "BRL", saldo: 4.82, gastoAcumulado: 1606 })
    expect(j.campanhas[0]).toMatchObject({ id: "1", status: "ACTIVE", verbaDiaria: 80, gasto: { hoje: 0, d7: 10.5, d30: 10.5 }, conversas: { hoje: 5, d7: 5, d30: 5 }, ctr: { d7: 4.1 }, frequencia: { d7: 1.4 } })
    expect(j.conjuntos[0]).toMatchObject({ id: "2", campanhaId: "1", verbaDiaria: 50, verbaTotal: null })
    expect(j.conjuntos[1]).toMatchObject({ id: "4", verbaDiaria: null, verbaTotal: null })
    expect(j.anuncios[0]).toMatchObject({ id: "3", conjuntoId: "2", campanhaId: "1" })
    expect(j.cacheAte).toBeTruthy()
    expect(JSON.stringify(j)).not.toContain(TOKEN)
    expect(fetchMock.mock.calls.every(c => !(c[1] as RequestInit | undefined)?.method || (c[1] as RequestInit).method === "GET")).toBe(true)
  })
  it("outro diretor recebe 403 e a Graph não é chamada", async () => {
    diretorChave = { ok: true, diretor: "cto" }
    const r = await GET(req())
    expect(r.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("sem chave: 401", async () => {
    diretorChave = { ok: false, erro: "Chave ausente.", status: 401 }
    expect((await GET(req())).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("segunda chamada no TTL usa o cache", async () => {
    await GET(req())
    const n = fetchMock.mock.calls.length
    expect(n).toBeGreaterThan(0)
    await GET(req())
    expect(fetchMock.mock.calls.length).toBe(n)
  })
  it("sem token ou sem conta: 4xx claro", async () => {
    cfg.data = { data: { metaContaId: "act_9" } }
    delete process.env.META_ACCESS_TOKEN
    let r = await GET(req())
    expect(r.status).toBe(401)
    expect((await r.json()).codigo).toBe("TOKEN_MISSING")
    cfg.data = { data: { metaToken: TOKEN } }
    delete process.env.META_AD_ACCOUNT_ID
    r = await GET(req())
    expect(r.status).toBe(400)
    expect((await r.json()).codigo).toBe("SEM_CONTA")
  })
  it("Meta recusa o token (190): 401 sem vazar o token", async () => {
    fetchMock.mockImplementation(async () => ({ json: async () => ({ error: { code: 190, message: `Invalid OAuth access token ${TOKEN}` } }) }))
    const r = await GET(req())
    expect(r.status).toBe(401)
    expect(JSON.stringify(await r.json())).not.toContain(TOKEN)
  })
  it("a ajuda lista meta_ads só para a CMO", async () => {
    const j = await (await GET({ headers: new Headers(), nextUrl: new URL("http://x/api/externo") } as never)).json()
    expect(Object.keys(j.leitura)).toContain("?o=meta_ads")
    diretorChave = { ok: true, diretor: "cto" }
    const k = await (await GET({ headers: new Headers(), nextUrl: new URL("http://x/api/externo") } as never)).json()
    expect(Object.keys(k.leitura)).not.toContain("?o=meta_ads")
  })
})
