import { describe, it, expect, vi, beforeEach } from "vitest"

const est = vi.hoisted(() => ({ producao: undefined as unknown, escritas: [] as string[] }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: async () => ({ producao: est.producao }),
  mudarConfig: async () => { est.escritas.push("mudarConfig"); return {} },
}))
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: () => { est.escritas.push("supabase"); return {} } } }))

import { lerPrazosFornecedores, montarPrazosFornecedores, AJUDA_PRAZOS_FORNECEDORES } from "@/app/lib/prazosFornecedoresExterno"
import { normalizarProducao, prazoCadastral, normalizarEstadoPrazo, somarPrazosCadeia, movimentosPorEtapa } from "@/app/lib/producao"

beforeEach(() => {
  est.escritas = []
  est.producao = {
    fornecedores: [
      { id: "f1", nome: "Impressor Fictício", ativo: true, servicos: { impressao: { tipo: "fixo_chapa", valor: 350 } }, frete: 0, prazoDias: 5, email: "x@teste.invalid", telefone: "000", contato: "Fulano" },
      { id: "f2", nome: "Acabamento Fictício", ativo: true, servicos: { corteVinco: { tipo: "acerto_milheiro", acerto: 70, milheiro: 70 }, colagem: { tipo: "acerto_milheiro", acerto: 70, milheiro: 70 } }, frete: 0, prazoDias: 4, prazosPorEtapa: { colagem: 2 } },
    ],
    padroes: { acabamento: "f2", corteVinco: "f2", colagem: "f2", arte: "f1" },
    prazoEntregaPadraoDias: 12,
  }
})

describe("?o=prazos_fornecedores", () => {
  it("COO e CTO leem cadastro, padrões e vista por etapa", async () => {
    for (const d of ["coo", "cto"]) {
      const { status, corpo } = await lerPrazosFornecedores(d)
      expect(status).toBe(200)
      expect(corpo.aviso).toMatch(/não data confirmada/)
      expect(corpo.prazoEntregaPadraoDias).toBe(12)
      const fs = corpo.fornecedores as { id: string; prazoDias: number; servicos: string[]; prazosPorEtapa?: unknown }[]
      expect(fs.map(f => f.id)).toEqual(["f1", "f2"])
      expect(fs[1].servicos).toEqual(["corteVinco", "colagem"])
      expect(fs[1].prazosPorEtapa).toEqual({ colagem: 2 })
      expect(fs[0].prazosPorEtapa).toBeUndefined()
      const pe = corpo.porEtapa as { etapa: string; prazoCadastralDias: number; deOnde: string }[]
      expect(pe.find(e => e.etapa === "colagem")).toMatchObject({ prazoCadastralDias: 2, deOnde: "etapa" })
      expect(pe.find(e => e.etapa === "corteVinco")).toMatchObject({ prazoCadastralDias: 4, deOnde: "fornecedor" })
      expect(pe.find(e => e.etapa === "arte")).toMatchObject({ fornecedorId: "f1", prazoCadastralDias: 5 })
    }
  })

  it("CFO, CMO e CCO levam 403 sem ler nada", async () => {
    for (const d of ["cfo", "cmo", "cco"]) {
      const r = await lerPrazosFornecedores(d)
      expect(r.status).toBe(403)
    }
    expect(est.escritas).toEqual([])
  })

  it("sem dado de contato nem preço e sem escrita", async () => {
    const { corpo } = await lerPrazosFornecedores("coo")
    const txt = JSON.stringify(corpo)
    expect(txt).not.toMatch(/teste\.invalid|Fulano|"telefone"|"email"|"contato"|"frete"|acerto|milheiro|valor/)
    expect(est.escritas).toEqual([])
  })

  it("cadastro padrão (sem producao salva) também responde", () => {
    const r = montarPrazosFornecedores(normalizarProducao(null))
    expect(r.fornecedores.length).toBeGreaterThan(0)
    expect(AJUDA_PRAZOS_FORNECEDORES).toMatch(/COO E DO CTO/)
  })

  it("prazo antigo sai como não confirmado / sem_dado; estado gravado é respeitado", async () => {
    const prod = est.producao as { fornecedores: Record<string, unknown>[] }
    prod.fornecedores[1].prazoEstado = { confirmado: true, origem: "confirmado_fornecedor" }
    prod.fornecedores[1].prazosPorEtapaEstado = { colagem: { confirmado: true, origem: "medido" } }
    const { corpo } = await lerPrazosFornecedores("coo")
    const fs = corpo.fornecedores as { confirmado: boolean; origem: string; rotulo: string; estadoPorEtapa?: Record<string, { confirmado: boolean; origem: string }> }[]
    expect(fs[0]).toMatchObject({ confirmado: false, origem: "sem_dado", rotulo: "não confirmado" })
    expect(fs[1]).toMatchObject({ confirmado: true, origem: "confirmado_fornecedor", rotulo: "confirmado" })
    expect(fs[1].estadoPorEtapa?.colagem).toMatchObject({ confirmado: true, origem: "medido" })
    const pe = corpo.porEtapa as { etapa: string; confirmado: boolean; origem: string; rotulo: string }[]
    expect(pe.find(e => e.etapa === "colagem")).toMatchObject({ confirmado: true, origem: "medido" })
    expect(pe.find(e => e.etapa === "arte")).toMatchObject({ confirmado: false, origem: "sem_dado", rotulo: "não confirmado" })
  })
})

describe("prazo cadastral e cadeia", () => {
  const f = { id: "f", nome: "F", ativo: true, servicos: {}, frete: 0, prazoDias: 5, prazosPorEtapa: { colagem: 2 }, prazosPorEtapaEstado: { colagem: { confirmado: true, origem: "medido" as const } } }
  it("etapa usa o seu prazo e estado; sem etapa cai no geral não confirmado", () => {
    expect(prazoCadastral(f, "colagem")).toMatchObject({ dias: 2, deEtapa: true, estado: { confirmado: true } })
    expect(prazoCadastral(f, "arte")).toMatchObject({ dias: 5, deEtapa: false, estado: { confirmado: false, origem: "sem_dado" } })
  })
  it("estado incoerente (confirmado sem origem) vale como não confirmado", () => {
    expect(normalizarEstadoPrazo({ confirmado: true, origem: "sem_dado" })).toEqual({ confirmado: false, origem: "sem_dado" })
  })
  it("cadeia só é confirmada se todos os prazos forem", () => {
    const a = prazoCadastral(f, "colagem"), b = prazoCadastral(f, "arte")
    expect(somarPrazosCadeia([a, a])).toEqual({ dias: 4, confirmado: true })
    expect(somarPrazosCadeia([a, b])).toEqual({ dias: 7, confirmado: false })
  })
  it("prazoPrevisto automático herda o estado do prazo usado", () => {
    const p = normalizarProducao({ fornecedores: [{ ...f, servicos: { colagem: { tipo: "acerto_milheiro", acerto: 1, milheiro: 1 } } }], padroes: { acabamento: "f" } } as never)
    const movs = movimentosPorEtapa(p, "k", "K", 6, null, "2026-11-23", ["colagem"])
    expect(movs?.[0]).toMatchObject({ etapa: "acabamento", prazoConfirmado: false })
    const p2 = normalizarProducao({ fornecedores: [{ ...f, servicos: { colagem: {} } }], padroes: { arte: "f" } } as never)
    expect(movimentosPorEtapa(p2, "k", "K", 2, null, "2026-11-23")?.[0]).toMatchObject({ etapa: "arte", prazoConfirmado: false })
  })
})
