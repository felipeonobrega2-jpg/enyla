import { describe, it, expect, vi, beforeEach } from "vitest"

const est = vi.hoisted(() => ({ producao: undefined as unknown, escritas: [] as string[] }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: async () => ({ producao: est.producao }),
  mudarConfig: async () => { est.escritas.push("mudarConfig"); return {} },
}))
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: () => { est.escritas.push("supabase"); return {} } } }))

import { lerPrazosFornecedores, montarPrazosFornecedores, prazoDaEtapa, AJUDA_PRAZOS_FORNECEDORES } from "@/app/lib/prazosFornecedoresExterno"
import { normalizarProducao } from "@/app/lib/producao"

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
      const pe = corpo.porEtapa as { etapa: string; prazoCadastralDias: number; origem: string }[]
      expect(pe.find(e => e.etapa === "colagem")).toMatchObject({ prazoCadastralDias: 2, origem: "cadastral", fonteCadastral: "etapa", aConfirmar: true })
      expect(pe.find(e => e.etapa === "corteVinco")).toMatchObject({ prazoCadastralDias: 4, origem: "cadastral", fonteCadastral: "fornecedor" })
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
})

describe("prazo medido x cadastral (issue #213)", () => {
  const mov = (id: string, etapa: string, fornecedorId: string, enviadoEm: string, recebidoEm?: string) =>
    ({ id, pedidoKey: id, pedidoLabel: id, fornecedorId, etapa, enviadoEm, recebidoEm }) as never
  const f = (extra = {}) => ({ id: "f2", nome: "F", ativo: true, servicos: {}, frete: 0, prazoDias: 5, ...extra }) as never

  it("medido com n>=3: mediana, origem medido", () => {
    const ms = [mov("a", "corteVinco", "f2", "2026-11-02", "2026-11-04"), mov("b", "corteVinco", "f2", "2026-11-02", "2026-11-06"), mov("c", "corteVinco", "f2", "2026-11-02", "2026-11-05"), mov("d", "colagem", "f2", "2026-11-02", "2026-11-03")]
    expect(prazoDaEtapa("corteVinco", f(), ms)).toEqual({ dias: 3, origem: "medido", n: 3, aConfirmar: false })
  })

  it("cadastral com n<3 (ou sem retorno): prazosPorEtapa, depois prazoDias, a confirmar", () => {
    const ms = [mov("a", "corteVinco", "f2", "2026-11-02", "2026-11-04"), mov("b", "corteVinco", "f2", "2026-11-02", "2026-11-06"), mov("c", "corteVinco", "f2", "2026-11-02")]
    expect(prazoDaEtapa("corteVinco", f(), ms)).toMatchObject({ dias: 5, origem: "cadastral", fonte: "fornecedor", aConfirmar: true })
    expect(prazoDaEtapa("corteVinco", f({ prazosPorEtapa: { corteVinco: 3 } }), ms)).toMatchObject({ dias: 3, origem: "cadastral", fonte: "etapa", aConfirmar: true })
  })

  const prod = (fornExtra = {}, movimentos: unknown[] = []) => normalizarProducao({
    fornecedores: [{ id: "f2", nome: "Fabiano", ativo: true, servicos: {}, frete: 0, prazoDias: 5, ...fornExtra }],
    padroes: { corteVinco: "f2", colagem: "f2" }, movimentos,
  } as never)

  it("mesmo fornecedor em duas etapas com prazo único: não soma duas vezes", () => {
    const r = montarPrazosFornecedores(prod({ prazosPorEtapa: { "corteVinco+colagem": 6 } }))
    const pe = r.porEtapa
    expect(pe.map(e => e.prazoDias)).toEqual([6, 0])
    expect(pe.every(e => e.origem === "combinado" && e.aConfirmar)).toBe(true)
    expect(r.previsaoTotal).toMatchObject({ medidoDias: 0, aConfirmarDias: 6, totalDias: 6 })
  })

  it("mesmo fornecedor sem prazo único: mostra as duas etapas, a confirmar, com aviso", () => {
    const r = montarPrazosFornecedores(prod())
    expect(r.porEtapa.map(e => [e.etapa, e.prazoDias, e.aConfirmar])).toEqual([["corteVinco", 5, true], ["colagem", 5, true]])
    expect(r.previsaoTotal).toMatchObject({ aConfirmarDias: 10, medidoDias: 0 })
    expect(r.previsaoTotal.avisoMesmoFornecedor).toBeTruthy()
  })

  it("total separado em medido e a confirmar", () => {
    const ms = ["a", "b", "c"].map((id, i) => mov(id, "corteVinco", "f2", "2026-11-02", `2026-11-0${3 + i}`))
    const r = montarPrazosFornecedores(prod({}, ms))
    expect(r.porEtapa[0]).toMatchObject({ etapa: "corteVinco", origem: "medido", n: 3, aConfirmar: false })
    expect(r.previsaoTotal).toMatchObject({ medidoDias: r.porEtapa[0].prazoDias, aConfirmarDias: 5 })
  })
})
