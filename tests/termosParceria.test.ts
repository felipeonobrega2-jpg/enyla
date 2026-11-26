import { describe, it, expect, vi, beforeEach } from "vitest"

const inseridos: Record<string, unknown>[] = []
vi.mock("@/app/lib/supabase", () => ({
  supabase: { from: (t: string) => ({
    insert: (v: Record<string, unknown>) => { if (t === "termos_parceria_aceites") inseridos.push(v); return Promise.resolve({ error: null }) },
    select: () => ({ lte: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }),
  }), storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "x" } }) }) } },
}))
vi.mock("@/app/lib/configAtomica", () => ({ lerConfigLinha: async () => ({ data: { data: {} } }), mudarConfig: async () => ({}) }))
vi.mock("@/app/lib/notificar", () => ({ notificar: async () => null, LINK_SISTEMA: "x" }))
vi.mock("@/app/lib/geocodificar", () => ({ enderecoPeloCep: async () => ({ erro: "x" }) }))
vi.mock("@/app/lib/prospectorServidor", () => ({ registrarCadastroRecebido: async () => null }))
vi.mock("@/app/lib/emailsServidor", () => ({ emailDoCadastro: async () => ({}) }))
vi.mock("@/app/lib/evolution", () => ({ evo: async () => null }))
vi.mock("@/app/lib/agenteAuto", () => ({ seuNumero: async () => null }))

import { receberCadastro } from "@/app/lib/parceirosServidor"
import { pendenteTermos, podeReceberPedido, registroDoAceite } from "@/app/lib/termosParceria"

const dados = { nomeFantasia: "Gráfica Teste", tipoDocumento: "cnpj", documento: "11222333000181", cep: "01310100", rua: "Rua A", numero: "1", bairro: "B", cidade: "São Paulo", uf: "SP", responsavel: "Fulano", whatsapp: "11988887777", email: "a@b.com.br",
  servicos: [{ id: "corteVinco", cobranca: "milheiro", valor: 38, prazoDias: 3, prazoVaria: false, precosExemplo: { corteVinco: 250 } }], aceite: true }
const form = (termos?: string) => { const f = new FormData(); f.set("dados", JSON.stringify(dados)); if (termos) f.set("termos", termos); return f }

describe("Termos de Parceria", () => {
  beforeEach(() => { inseridos.length = 0 })
  it("envio sem aceite dos termos falha e não grava nada", async () => {
    const r = await receberCadastro(form())
    expect(r.ok).toBe(false)
    expect(!r.ok && r.campos?.termos).toBeTruthy()
    expect(inseridos).toHaveLength(0)
  })
  it("com aceite grava versão, data, IP e navegador", async () => {
    const r = await receberCadastro(form("1"), { ip: "203.0.113.9", userAgent: "teste" })
    expect(r.ok).toBe(true)
    expect(inseridos).toHaveLength(1)
    expect(inseridos[0]).toMatchObject({ status: "aceito", termos_versao: "rascunho-1", ip: "203.0.113.9", user_agent: "teste" })
    expect(Number.isNaN(Date.parse(String(inseridos[0].termos_aceitos_em)))).toBe(false)
  })
  it("sem registro de aceite a parceira fica pendente", () => {
    expect(pendenteTermos(null)).toBe(true)
    expect(pendenteTermos({ status: "pendente_termos" })).toBe(true)
    expect(pendenteTermos({ status: registroDoAceite("v1", { ip: null, userAgent: null }).status })).toBe(false)
  })
  it("sem aceite, só cadastro via /parceiros fica sem pedido novo; fornecedor em operação não é bloqueado", () => {
    expect(podeReceberPedido({ origem: "cadastro_parceiros", aceite: { status: "pendente_termos" } })).toBe(false)
    expect(podeReceberPedido({ origem: "cadastro_parceiros", aceite: { status: "aceito" } })).toBe(true)
    expect(podeReceberPedido({ origem: "fornecedor", aceite: null })).toBe(true)
  })
  it("pedido já em produção não é afetado, mesmo sem aceite", () => {
    expect(podeReceberPedido({ origem: "cadastro_parceiros", aceite: null, pedidoEmProducao: true })).toBe(true)
    expect(podeReceberPedido({ origem: "fornecedor", aceite: { status: "pendente_termos" }, pedidoEmProducao: true })).toBe(true)
  })
})
