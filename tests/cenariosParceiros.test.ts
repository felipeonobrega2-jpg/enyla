// Cenário-exemplo do cadastro de parceiros: preço do exemplo obrigatório, gravação, comparação interna e a regra
// inviolável (preço e nome dos nossos fornecedores nunca chegam ao parceiro).
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import React from "react"

const estado = vi.hoisted(() => ({ cfg: {} as Record<string, unknown> }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerConfigLinha: vi.fn(async () => ({ data: { data: estado.cfg }, error: null })),
  mudarConfig: vi.fn(async (mudar: (d: Record<string, unknown>) => Record<string, unknown> | null) => { estado.cfg = { ...estado.cfg, ...(mudar(estado.cfg) ?? {}) }; return estado.cfg }),
}))
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: vi.fn(), storage: { from: vi.fn() } } }))
vi.mock("@/app/lib/notificar", () => ({ notificar: vi.fn(async () => null), LINK_SISTEMA: "https://exemplo.test" }))
vi.mock("@/app/lib/geocodificar", () => ({ enderecoPeloCep: vi.fn(async () => ({ erro: "teste" })) }))
vi.mock("@/app/lib/emailsServidor", () => ({ emailDoCadastro: vi.fn(async () => ({ tipo: "teste", ok: false })) }))
vi.mock("@/app/lib/evolution", () => ({ evo: vi.fn(async () => null) }))
vi.mock("@/app/lib/agenteAuto", () => ({ seuNumero: vi.fn(async () => "") }))
vi.mock("@/app/lib/prospectorServidor", () => ({ registrarCadastroRecebido: vi.fn(async () => null), marcarProspectCadastrou: vi.fn(async () => null) }))

import { errosDaEtapa, limparCadastro, paraFornecedor, type CadastroParceiro } from "@/app/lib/parceiros"
import { CENARIOS_PADRAO, cenariosPublicos, compararExemplo, mesclarCenarios } from "@/app/lib/cenariosParceiros"
import { receberCadastro, lerCenariosPublicos, salvarCenarios } from "@/app/lib/parceirosServidor"
import ParceirosForm from "@/app/parceiros/ParceirosForm"
import { LinhaExemplo } from "@/app/components/CadastrosParceirosCard"

const base = { nomeFantasia: "Gráfica Exemplo", tipoDocumento: "cnpj" as const, documento: "11222333000181", cep: "01310100", rua: "Avenida Paulista", numero: "1000", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP", responsavel: "Marcos", whatsapp: "11988887777", email: "a@b.com.br", aceite: true }
const serv = (extra = {}) => ({ id: "verniz" as const, cobranca: "folha" as const, prazoDias: 3, prazoVaria: false, ...extra })
const NOMES = CENARIOS_PADRAO.flatMap(c => c.referencias.map(r => r.fornecedorNome)).filter(Boolean) as string[]

beforeEach(() => { estado.cfg = {} })

describe("preço do exemplo é obrigatório", () => {
  it("serviço marcado sem preço do exemplo não passa; com preço passa; 'outro' fica de fora", () => {
    expect(errosDaEtapa({ ...base, servicos: [serv()] }, "detalhes")["verniz.precoExemplo"]).toBeTruthy()
    expect(errosDaEtapa({ ...base, servicos: [serv({ precoExemplo: 0 })] }, "detalhes")["verniz.precoExemplo"]).toBeTruthy()
    expect(errosDaEtapa({ ...base, servicos: [serv({ precoExemplo: 900 })] }, "detalhes")).toEqual({})
    expect(errosDaEtapa({ ...base, servicos: [{ id: "outro", qual: "X", cobranca: "varia", prazoDias: null, prazoVaria: true }] }, "detalhes")).toEqual({})
  })
  it("o servidor recusa cadastro sem o preço do exemplo", async () => {
    const f = new FormData(); f.set("dados", JSON.stringify({ ...base, servicos: [serv()] }))
    const r = await receberCadastro(f)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.campos?.["verniz.precoExemplo"]).toBeTruthy()
  })
})

describe("gravação", () => {
  it("o cadastro grava preço, cenário e versão", async () => {
    const f = new FormData(); f.set("dados", JSON.stringify({ ...base, servicos: [serv({ precoExemplo: "1200,5".replace(",", "."), cenarioVersao: 1 })] }))
    const r = await receberCadastro(f)
    expect(r.ok).toBe(true)
    const [c] = estado.cfg.cadastrosParceiros as CadastroParceiro[]
    expect(c.servicos[0]).toMatchObject({ precoExemplo: 1200.5, cenarioId: "verniz", cenarioVersao: 1 })
  })
  it("cadastro antigo sem o campo continua válido e vira fornecedor", () => {
    const antigo = { ...limparCadastro({ ...base, servicos: [serv()] }), id: "PAR-0", em: "2026-11-01T12:00:00Z", status: "novo" as const, gerente: "Felipe", arquivos: [] }
    expect(antigo.servicos[0].precoExemplo).toBeUndefined()
    expect(paraFornecedor(antigo, "f-0").obs).not.toContain("exemplo")
    expect(renderToStaticMarkup(React.createElement(LinhaExemplo, { precoExemplo: undefined }))).toContain("sem preço informado")
  })
  it("o resumo do fornecedor de produção traz o preço do exemplo, sem nome nem preço de referência nossos", () => {
    const c = { ...limparCadastro({ ...base, servicos: [serv({ precoExemplo: 1300 })] }), id: "PAR-1", em: "2026-11-01T12:00:00Z", status: "novo" as const, gerente: "Felipe", arquivos: [] }
    const obs = paraFornecedor(c, "f-1").obs ?? ""
    expect(obs).toContain("exemplo")
    expect(obs).not.toMatch(/Ronaldo|1\.145|1145/)
  })
})

describe("nada interno vaza para o parceiro", () => {
  it("a parte pública tem só serviço, enunciado e versão", async () => {
    const pub = JSON.stringify(cenariosPublicos(mesclarCenarios(undefined)))
    for (const n of NOMES) expect(pub).not.toContain(n)
    expect(pub).not.toMatch(/1145|2095|1387|4500|referencias|unidade|preco/)
    expect(JSON.stringify(await lerCenariosPublicos())).toBe(pub)
  })
  it("o formulário (página /parceiros) mostra enunciado e campo, sem preço nem fornecedor", () => {
    estado.cfg = { cenariosParceiros: [{ ...CENARIOS_PADRAO[3], referencias: [{ preco: 7777, fornecedorNome: "Zé Secreto" }] }] }
    const html = renderToStaticMarkup(React.createElement(ParceirosForm, { whatsappGerente: null, cenarios: cenariosPublicos(mesclarCenarios(estado.cfg.cenariosParceiros)) }))
    for (const n of [...NOMES, "Zé Secreto", "7777", "1145"]) expect(html).not.toContain(n)
  })
  it("o cadastro gravado não carrega referência nossa", async () => {
    const f = new FormData(); f.set("dados", JSON.stringify({ ...base, servicos: [serv({ precoExemplo: 1200 })] }))
    await receberCadastro(f)
    const json = JSON.stringify(estado.cfg.cadastrosParceiros)
    for (const n of NOMES) expect(json).not.toContain(n)
  })
})

describe("comparação interna", () => {
  it("calcula diferença em R$ e % quando há referência", () => {
    const verniz = CENARIOS_PADRAO.find(c => c.servicoId === "verniz")!
    expect(compararExemplo(1259.98, verniz.referencias)).toEqual([{ referencia: 1145.44, fornecedorNome: "Ronaldo Osasco", diferenca: 114.54, percentual: 10 }])
    const cv = CENARIOS_PADRAO.find(c => c.servicoId === "corteVinco")!
    expect(compararExemplo(240, cv.referencias).map(x => x.diferenca)).toEqual([40, -40, -40])
  })
  it("mostra 'sem referência' quando não há", () => {
    expect(compararExemplo(500, CENARIOS_PADRAO.find(c => c.servicoId === "relevo")!.referencias)).toEqual([])
    const html = renderToStaticMarkup(React.createElement(LinhaExemplo, { precoExemplo: 500, cenario: CENARIOS_PADRAO.find(c => c.servicoId === "relevo") }))
    expect(html).toContain("sem referência")
    const com = renderToStaticMarkup(React.createElement(LinhaExemplo, { precoExemplo: 1259.98, cenario: CENARIOS_PADRAO.find(c => c.servicoId === "verniz") }))
    expect(com).toContain("Ronaldo Osasco"); expect(com).toContain("10")
  })
  it("não inventa referência para lacuna", () => {
    for (const id of ["impressaoOffset", "relevo", "faca", "arte", "fechamento", "transporte"]) expect(CENARIOS_PADRAO.find(c => c.servicoId === id)!.referencias).toEqual([])
  })
})

describe("config editável", () => {
  it("o que a equipe salva sobrescreve o padrão, e o enunciado novo sobe a versão", async () => {
    await salvarCenarios([{ servicoId: "relevo", enunciado: "Novo texto", referencias: [{ preco: 100, fornecedorNome: "Fulano" }] }])
    const m = mesclarCenarios(estado.cfg.cenariosParceiros)
    expect(m.find(c => c.servicoId === "relevo")).toMatchObject({ enunciado: "Novo texto", versao: 2, referencias: [{ preco: 100, fornecedorNome: "Fulano" }] })
    expect(m.find(c => c.servicoId === "verniz")!.referencias[0].preco).toBe(1145.44)
    expect(JSON.stringify(await lerCenariosPublicos())).not.toContain("Fulano")
  })
})
