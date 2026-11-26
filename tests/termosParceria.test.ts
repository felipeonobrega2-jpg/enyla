import { describe, it, expect, vi, beforeEach } from "vitest"

const est = vi.hoisted(() => ({ inserts: [] as { t: string; v: unknown }[], termos: [] as unknown[], cfg: { cadastrosParceiros: [] as Record<string, unknown>[] } }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (t: string) => {
      const c: Record<string, unknown> = {}
      for (const m of ["select", "order", "limit", "eq"]) c[m] = () => c
      c.insert = (v: unknown) => { est.inserts.push({ t, v }); return c }
      c.update = (v: unknown) => { est.inserts.push({ t: `${t}.update`, v }); return c }
      c.then = (ok: (v: unknown) => unknown) => ok({ data: t === "termos_parceria" ? est.termos : [], error: null })
      return c
    },
  },
}))
vi.mock("@/app/lib/configAtomica", () => ({
  lerConfigLinha: vi.fn(async () => ({ data: { data: est.cfg }, error: null })),
  mudarConfig: vi.fn(async (f: (d: typeof est.cfg) => Record<string, unknown> | null) => { const r = f(est.cfg); if (r) Object.assign(est.cfg, r); return est.cfg }),
}))
vi.mock("@/app/lib/notificar", () => ({ notificar: vi.fn(async () => null), LINK_SISTEMA: "https://x" }))
vi.mock("@/app/lib/geocodificar", () => ({ enderecoPeloCep: vi.fn(async () => ({ erro: "x" })) }))
vi.mock("@/app/lib/emailsServidor", () => ({ emailDoCadastro: vi.fn(async () => ({ tipo: "recebido", em: "", ok: true })) }))
vi.mock("@/app/lib/prospectorServidor", () => ({ registrarCadastroRecebido: vi.fn(async () => null) }))
vi.mock("@/app/lib/evolution", () => ({ evo: vi.fn(async () => null) }))
vi.mock("@/app/lib/agenteAuto", () => ({ seuNumero: vi.fn(async () => null) }))

import { receberCadastro } from "@/app/lib/parceirosServidor"
import { aceitarPorLink, tokenDoCadastro } from "@/app/lib/termosServidor"
import { clausulas, termoVigente, podeReceberPedido, pendenteTermos, TERMO_INICIAL, nomesDosServicos } from "@/app/lib/termosParceria"
import { errosDaEtapa, SERVICOS_PARCEIRO } from "@/app/lib/parceiros"

const base = { nomeFantasia: "Gráfica Exemplo", tipoDocumento: "cnpj", documento: "11222333000181", cep: "01310100", rua: "Avenida Paulista", numero: "1000", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP", responsavel: "Marcos", whatsapp: "11988887777", email: "a@b.com.br", aceite: true,
  servicos: [{ id: "corteVinco", cobranca: "milheiro", valor: 38, prazoDias: 3, prazoVaria: false, precosExemplo: { corteVinco: 250 } }] }
const envio = (extra: Record<string, unknown>) => { const f = new FormData(); f.set("dados", JSON.stringify({ ...base, ...extra })); return f }
const req = { headers: { get: (n: string) => ({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Teste/1.0" } as Record<string, string>)[n] ?? null } }

beforeEach(() => { est.inserts = []; est.termos = []; est.cfg = { cadastrosParceiros: [] }; process.env.AUTH_SECRET = "segredo-de-teste" })

describe("aceite no cadastro /parceiros", () => {
  it("sem aceite o envio falha, com mensagem no campo e nada gravado", async () => {
    const r = await receberCadastro(envio({}), req)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.campos?.termos).toMatch(/Termos de Parceria/)
    expect(est.cfg.cadastrosParceiros).toHaveLength(0)
    expect(errosDaEtapa({ ...base, termosAceitos: false } as never, "final").termos).toBeTruthy()
  })
  it("aceite falso ou em formato estranho também falha", async () => {
    for (const v of [false, "true", 1, null]) expect((await receberCadastro(envio({ termosAceitos: v }), req)).ok).toBe(false)
  })
  it("com aceite grava versão, data, ip e user-agent (e a versão vem do servidor)", async () => {
    const r = await receberCadastro(envio({ termosAceitos: true, termos: { versao: "9.9", em: "2000-01-01", ip: "1.1.1.1", userAgent: "x" } }), req)
    expect(r.ok).toBe(true)
    const c = est.cfg.cadastrosParceiros[0] as { termos: { versao: string; em: string; ip: string; userAgent: string } }
    expect(c.termos.versao).toBe(TERMO_INICIAL.versao)
    expect(new Date(c.termos.em).getFullYear()).toBeGreaterThan(2025)
    expect(c.termos.ip).toBe("203.0.113.7"); expect(c.termos.userAgent).toBe("Teste/1.0")
    expect(est.inserts.some(i => i.t === "termos_aceites")).toBe(true)
  })
})

describe("termos: texto e registro", () => {
  it("item 1 lista os tipos de serviço da MESMA fonte do formulário", () => {
    const item1 = clausulas(TERMO_INICIAL)[0]
    for (const s of SERVICOS_PARCEIRO) expect(item1.toLowerCase()).toContain(s.nome.toLowerCase())
    expect(item1).not.toContain("{")
    expect(nomesDosServicos()).toEqual(SERVICOS_PARCEIRO.map(s => s.nome))
  })
  it("registro mais recente em vigor vale; futuro e inválido são ignorados; sem registro usa o rascunho", () => {
    const l = [{ versao: "1.0", texto: "a", vigente_desde: "2026-11-27T00:00:00Z", rascunho: false }, { versao: "0.9", texto: "b", vigente_desde: "2026-11-20T00:00:00Z", rascunho: false }, { versao: "", texto: "c", vigente_desde: "2026-11-26T00:00:00Z" }]
    expect(termoVigente(l, new Date("2026-11-26T12:00:00Z")).versao).toBe("0.9")
    expect(termoVigente(l, new Date("2026-12-01T00:00:00Z")).versao).toBe("1.0")
    expect(termoVigente([]).versao).toBe(TERMO_INICIAL.versao)
  })
  it("texto não cria lógica de cobrança: só cláusulas de texto", () => { expect(clausulas(TERMO_INICIAL)).toHaveLength(13) })
})

describe("aceite por link (cadastrada antes)", () => {
  it("token errado não grava; token certo grava a versão vigente", async () => {
    est.cfg.cadastrosParceiros = [{ id: "PAR-1", documento: "11222333000181" }]
    expect((await aceitarPorLink("PAR-1", "errado", req)).ok).toBe(false)
    expect((est.cfg.cadastrosParceiros[0] as { termos?: unknown }).termos).toBeUndefined()
    const r = await aceitarPorLink("PAR-1", tokenDoCadastro("PAR-1")!, req)
    expect(r.ok).toBe(true)
    expect((est.cfg.cadastrosParceiros[0] as { termos: { versao: string } }).termos.versao).toBe(TERMO_INICIAL.versao)
  })
  it("sem AUTH_SECRET nenhum token vale", async () => {
    delete process.env.AUTH_SECRET; delete process.env.NEXTAUTH_SECRET
    expect((await aceitarPorLink("PAR-1", "", req)).ok).toBe(false)
  })
})

describe("trava de pedido", () => {
  it("cadastrada por /parceiros sem aceite não recebe pedido novo; com aceite recebe", () => {
    expect(pendenteTermos({})).toBe(true)
    expect(podeReceberPedido({ origem: "parceiros", aceitou: false })).toBe(false)
    expect(podeReceberPedido({ origem: "parceiros", aceitou: true })).toBe(true)
  })
  it("fornecedor em operação nunca é bloqueado, e pedido em produção não é afetado", () => {
    expect(podeReceberPedido({ origem: "fornecedor", aceitou: false })).toBe(true)
    expect(podeReceberPedido({ origem: "parceiros", aceitou: false, pedidoEmProducao: true })).toBe(true)
  })
})
