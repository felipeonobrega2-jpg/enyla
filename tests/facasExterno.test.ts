import { describe, it, expect, vi } from "vitest"
vi.mock("@/app/lib/supabase", () => ({ supabase: {} }))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn(async () => ({})) }))
vi.mock("@/app/lib/bibliotecaServidor", () => ({ lerIndice: vi.fn(async () => []) }))

import { montarFacas, maquinaDaJerograf } from "@/app/lib/facasExterno"
import { normalizarProducao, type Ferramental } from "@/app/lib/producao"
import type { Desenho } from "@/app/lib/biblioteca"

const jerograf = { nome: "Jerograf 48×45", largura: 480, altura: 450, pinca: 10, margem: 5 }
const desenho: Desenho = { id: "91b661606f62a900", nome: "dieline_de_caixa.dxf", apelido: "Perfume 100ml fundo automático", modelo: "fundo automático",
  caixa: { largura: 50, altura: 120, profundidade: 50 }, blank: { largura: 222.5, altura: 202.75 }, criadoEm: "2026-11-01T00:00:00Z" }
const faca = (p: Partial<Ferramental>): Ferramental => ({ id: "f-mweu5lzf", tipo: "faca", cliente: "Cliente Secreto", produto: "x", blankLargura: 222.5, blankAltura: 202.75, cavidades: 4,
  fornecedor: "Forn Secreto", custo: 999, data: "2026-11-01", desenhoId: desenho.id, ...p })

describe("?o=facas", () => {
  it("faca com cavidades cadastradas: 4, salva, com o nome do desenho e a máquina da Jerograf", () => {
    const r = montarFacas({ ferramentais: [faca({})], desenhos: [desenho], maquina: jerograf, espacoMm: 2 })
    expect(r.facas[0]).toMatchObject({ id: "f-mweu5lzf", nome: "Perfume 100ml fundo automático", modelosPorChapa: 4, origem: "salva", blankMm: { largura: 222.5, altura: 202.75 } })
    expect(r.maquina).toEqual({ nome: "Jerograf 48×45", larguraMm: 480, alturaMm: 450 })
  })
  it("a montagem na Jerograf também dá 4 para a peça 222,5 × 202,75", () => {
    const r = montarFacas({ ferramentais: [faca({ cavidades: 0 })], desenhos: [desenho], maquina: jerograf, espacoMm: 2 })
    expect(r.facas[0]).toMatchObject({ modelosPorChapa: 4, origem: "estimada" })
  })
  it("sem cavidades e sem máquina: null, desconhecida", () => {
    const r = montarFacas({ ferramentais: [faca({ cavidades: 0 })], desenhos: [], maquina: null, espacoMm: 2 })
    expect(r.facas[0]).toMatchObject({ nome: null, modelosPorChapa: null, origem: "desconhecida" })
    expect(r.maquina).toBeNull()
  })
  it("não vaza cliente, fornecedor, custo, data nem arquivo", () => {
    const txt = JSON.stringify(montarFacas({ ferramentais: [faca({}), faca({ tipo: "cliche", id: "c1" })], desenhos: [desenho], maquina: jerograf, espacoMm: 2 }))
    for (const x of ["Secreto", "999", "custo", "cliente", "fornecedor", "dxf", "url", "2026-11-01"]) expect(txt).not.toContain(x)
    expect(JSON.parse(txt).facas).toHaveLength(1)
  })
  it("acha a máquina do impressor chamado Jerograf", () => {
    const p = normalizarProducao({ fornecedores: [{ id: "j", nome: "Jerograf", ativo: true, maquina: jerograf, servicos: { impressao: { tipo: "fixo_chapa", valor: 1 } }, frete: 0, prazoDias: 1 }] })
    expect(maquinaDaJerograf(p)).toEqual(jerograf)
    expect(maquinaDaJerograf(normalizarProducao(null))).toBeNull()
  })
})
