// Aceite dos Termos de Parceria (issue #256): sem aceite o envio falha; com aceite grava versão, data, ip e user-agent.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({ cfg: {} as Record<string, unknown> }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerConfigLinha: vi.fn(async () => ({ data: { data: estado.cfg }, error: null })),
  mudarConfig: vi.fn(async (mudar: (d: Record<string, unknown>) => Record<string, unknown> | null) => { estado.cfg = { ...estado.cfg, ...(mudar(estado.cfg) ?? {}) }; return estado.cfg }),
}))
const insert = vi.hoisted(() => vi.fn(async () => ({ error: null })))
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: vi.fn(() => ({ insert })), storage: { from: vi.fn() } } }))
vi.mock("@/app/lib/notificar", () => ({ notificar: vi.fn(async () => null), LINK_SISTEMA: "https://exemplo.test" }))
vi.mock("@/app/lib/geocodificar", () => ({ enderecoPeloCep: vi.fn(async () => ({ erro: "teste" })) }))
vi.mock("@/app/lib/emailsServidor", () => ({ emailDoCadastro: vi.fn(async () => ({ tipo: "teste", ok: false })) }))
vi.mock("@/app/lib/evolution", () => ({ evo: vi.fn(async () => null) }))
vi.mock("@/app/lib/agenteAuto", () => ({ seuNumero: vi.fn(async () => "") }))
vi.mock("@/app/lib/prospectorServidor", () => ({ registrarCadastroRecebido: vi.fn(async () => null), marcarProspectCadastrou: vi.fn(async () => null) }))

import { receberCadastro } from "@/app/lib/parceirosServidor"
import { pendenteTermos, errosDaEtapa, type CadastroParceiro } from "@/app/lib/parceiros"
import { contextoDaRequisicao } from "@/app/lib/termosParceria"

const base = {
  nomeFantasia: "Gráfica Exemplo", tipoDocumento: "cnpj", documento: "11222333000181", cep: "01310100", rua: "Avenida Paulista", numero: "1000",
  bairro: "Bela Vista", cidade: "São Paulo", uf: "SP", responsavel: "Marcos", whatsapp: "11988887777", email: "a@b.com.br", aceite: true,
  servicos: [{ id: "corteVinco", cobranca: "milheiro", valor: 38, prazoDias: 3, prazoVaria: false, precosExemplo: { corteVinco: 250 } }],
}
const form = (extra = {}) => { const f = new FormData(); f.set("dados", JSON.stringify({ ...base, ...extra })); return f }

beforeEach(() => { estado.cfg = {}; insert.mockClear() })

describe("aceite dos Termos de Parceria", () => {
  it("envio sem aceite falha, com mensagem no campo, e não grava nada", async () => {
    for (const extra of [{}, { aceiteTermos: false }, { aceiteTermos: "true" }]) {
      const r = await receberCadastro(form(extra))
      expect(r.ok).toBe(false)
      expect(!r.ok && r.campos?.aceiteTermos).toMatch(/Termos de Parceria/)
    }
    expect(estado.cfg.cadastrosParceiros).toBeUndefined()
    expect(insert).not.toHaveBeenCalled()
  })
  it("a etapa final exige o aceite", () => {
    expect(errosDaEtapa({ ...base, aceiteTermos: false } as never, "final").aceiteTermos).toBeTruthy()
    expect(errosDaEtapa({ ...base, aceiteTermos: true } as never, "final").aceiteTermos).toBeUndefined()
  })
  it("com aceite grava versão e data no cadastro e o registro com ip e user-agent", async () => {
    const r = await receberCadastro(form({ aceiteTermos: true, termosVersao: "inventada" }), { ip: "203.0.113.9", userAgent: "UA-teste" })
    expect(r.ok).toBe(true)
    const [c] = estado.cfg.cadastrosParceiros as CadastroParceiro[]
    expect(c.termosVersao).toBeTruthy()
    expect(c.termosVersao).not.toBe("inventada")   // a versão vem do servidor, não do navegador
    expect(Number.isNaN(Date.parse(c.termosAceitosEm ?? ""))).toBe(false)
    expect(pendenteTermos(c)).toBe(false)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ cadastro_id: c.id, termos_versao: c.termosVersao, ip: "203.0.113.9", user_agent: "UA-teste" }))
  })
  it("cadastro antigo, sem versão de termos, fica pendente_termos", () => {
    expect(pendenteTermos({})).toBe(true)
    expect(pendenteTermos({ termosVersao: "rascunho-1" })).toBe(false)
  })
  it("ip e user-agent vêm dos cabeçalhos", () => {
    const req = new Request("https://x.test", { headers: { "x-forwarded-for": "198.51.100.1, 10.0.0.1", "user-agent": "UA" } })
    expect(contextoDaRequisicao(req)).toEqual({ ip: "198.51.100.1", userAgent: "UA" })
  })
})
