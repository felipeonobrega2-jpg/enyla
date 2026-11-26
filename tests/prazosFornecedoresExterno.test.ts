import { describe, it, expect, vi, beforeEach } from "vitest"

const est = vi.hoisted(() => ({ producao: undefined as unknown, escritas: [] as string[] }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: async () => ({ producao: est.producao }),
  mudarConfig: async () => { est.escritas.push("mudarConfig"); return {} },
}))
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: () => { est.escritas.push("supabase"); return {} } } }))

import { lerPrazosFornecedores, montarPrazosFornecedores, prazoDaEtapa, previsaoDoLote, MINIMO_LOTES_MEDIDOS, AJUDA_PRAZOS_FORNECEDORES } from "@/app/lib/prazosFornecedoresExterno"
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
      expect(corpo.aviso).toMatch(/Não é data confirmada/)
      expect(corpo.prazoEntregaPadraoDias).toBe(12)
      const fs = corpo.fornecedores as { id: string; prazoDias: number; servicos: string[]; prazosPorEtapa?: unknown }[]
      expect(fs.map(f => f.id)).toEqual(["f1", "f2"])
      expect(fs[1].servicos).toEqual(["corteVinco", "colagem"])
      expect(fs[1].prazosPorEtapa).toEqual({ colagem: 2 })
      expect(fs[0].prazosPorEtapa).toBeUndefined()
      const pe = corpo.porEtapa as { etapas: string[]; fornecedorId: string; origem: string; n: number; prazoMedianoDias: number | null }[]
      // sem registro de recebi e enviei: tudo "aprendendo", sem usar o número do cadastro
      expect(pe.every(e => e.origem === "aprendendo" && e.n === 0 && e.prazoMedianoDias === null)).toBe(true)
      expect(pe.find(e => e.etapas.includes("arte"))).toMatchObject({ fornecedorId: "f1" })
      expect(corpo.previsaoLote).toMatchObject({ medido: { medianaDias: 0, etapas: [] }, faltamMedir: ["arte", "acabamento", "corteVinco", "colagem"] })
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

  describe("prazoDaEtapa e previsão do lote", () => {
    const f2 = { id: "f2", nome: "Acabamento Fictício" }
    const mov = (id: number, servicos: string[], env: string, rec: string, forn = "f2") =>
      ({ id: String(id), pedidoKey: "p" + id, pedidoLabel: "P", fornecedorId: forn, etapa: "acabamento", servicos, enviadoEm: env, recebidoEm: rec }) as never

    it("mínimo fica numa constante", () => { expect(MINIMO_LOTES_MEDIDOS).toBe(3) })

    it("medido com n≥3 usa a mediana do registro", () => {
      const ms = [mov(1, ["corteVinco"], "2026-11-02", "2026-11-04"), mov(2, ["corteVinco"], "2026-11-02", "2026-11-05"), mov(3, ["corteVinco"], "2026-11-02", "2026-11-09")]
      expect(prazoDaEtapa("corteVinco", f2, ms)).toMatchObject({ origem: "medido", n: 3, prazoMedianoDias: 3, minDias: 2, maxDias: 5 })
    })

    it("com n<3 fica aprendendo, mostra n e ignora o cadastro", () => {
      const ms = [mov(1, ["corteVinco"], "2026-11-02", "2026-11-04"), mov(2, ["corteVinco"], "2026-11-02", "2026-11-05"), { ...(mov(3, ["corteVinco"], "2026-11-02", "") as object), recebidoEm: undefined } as never]
      expect(prazoDaEtapa("corteVinco", f2, ms)).toMatchObject({ origem: "aprendendo", n: 2, prazoMedianoDias: null })
      expect(prazoDaEtapa("corteVinco", f2, ms, 2).origem).toBe("medido")
    })

    it("mesmo fornecedor em duas etapas: sem combinado mostra as duas; com combinado conta uma vez", () => {
      const sep = ["corteVinco", "colagem"].flatMap((s, k) => [1, 2, 3].map(i => mov(k * 10 + i, [s], "2026-11-02", "2026-11-04")))
      const prod = normalizarProducao(est.producao as Parameters<typeof normalizarProducao>[0])
      let r = previsaoDoLote({ ...prod, movimentos: [] })
      expect(r.porEtapa.map(p => p.etapas)).toEqual([["arte"], ["acabamento"], ["corteVinco"], ["colagem"]])
      expect(r.previsaoLote.faltamMedir).toEqual(["arte", "acabamento", "corteVinco", "colagem"])
      r = previsaoDoLote({ ...prod, movimentos: sep })
      expect(r.previsaoLote.medido).toMatchObject({ medianaDias: 4, etapas: ["corteVinco", "colagem"] })
      expect(r.previsaoLote.faltamMedir).toEqual(["arte", "acabamento"])
      const junto = [1, 2, 3].map(i => mov(i, ["corteVinco", "colagem"], "2026-11-02", "2026-11-05"))
      r = previsaoDoLote({ ...prod, movimentos: [...sep, ...junto] })
      expect(r.porEtapa.find(p => p.etapas.length === 2)).toMatchObject({ etapas: ["corteVinco", "colagem"], prazoMedianoDias: 3 })
      expect(r.previsaoLote.medido.medianaDias).toBe(3)
    })
  })
})
