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

import { errosDaEtapa, limparCadastro, paraFornecedor, CENARIOS_IDS, type CadastroParceiro } from "@/app/lib/parceiros"
import { CENARIOS_PADRAO, cenariosPublicos, compararExemplo, estatisticaCenario, mesclarCenarios, temCenario } from "@/app/lib/cenariosParceiros"
import { receberCadastro, lerCenariosPublicos, salvarCenarios } from "@/app/lib/parceirosServidor"
import ParceirosForm from "@/app/parceiros/ParceirosForm"
import { LinhaExemplo } from "@/app/components/CadastrosParceirosCard"
import { LinhaMercado } from "@/app/components/CenariosParceirosEditor"

const base = { nomeFantasia: "Gráfica Exemplo", tipoDocumento: "cnpj" as const, documento: "11222333000181", cep: "01310100", rua: "Avenida Paulista", numero: "1000", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP", responsavel: "Marcos", whatsapp: "11988887777", email: "a@b.com.br", aceite: true }
const serv = (extra = {}) => ({ id: "verniz" as const, cobranca: "folha" as const, prazoDias: 3, prazoVaria: false, ...extra })
const imp = (extra = {}) => ({ id: "impressaoOffset" as const, cobranca: null, prazoDias: 3, prazoVaria: false, tecnico: { formatoMax: { l: 66, a: 96 } }, acerto: 300, valor: 120, ...extra })
const NOMES = CENARIOS_PADRAO.flatMap(c => c.referencias.map(r => r.fornecedorNome)).filter(Boolean) as string[]
const cad = (servicos: unknown[]) => ({ servicos }) as Pick<CadastroParceiro, "servicos">
const cenario = (id: string) => CENARIOS_PADRAO.find(c => c.id === id)!

beforeEach(() => { estado.cfg = {} })

describe("estrutura dos cenários", () => {
  it("os ids padrão batem com os ids que o cadastro exige, e impressão não tem cenário", () => {
    expect(CENARIOS_PADRAO.map(c => c.id).sort()).toEqual(Object.values(CENARIOS_IDS).flat().sort())
    for (const c of CENARIOS_PADRAO) expect(CENARIOS_IDS[c.servicoId]).toContain(c.id)
    expect(temCenario("impressaoOffset")).toBe(false); expect(temCenario("impressaoDigital")).toBe(false); expect(temCenario("laminacao")).toBe(true); expect(temCenario("outro")).toBe(false)
  })
  it("acabamentos usam 3.000 folhas de 48 × 44 cm e laminação tem quatro cenários", () => {
    for (const id of ["verniz", "hotStamping", "relevo", "corteVinco", "laminacao-fosca", "laminacao-brilho", "laminacao-soft", "laminacao-dois-lados"]) {
      expect(cenario(id).enunciado).toContain("3.000 folhas de 48 × 44 cm, cartão 300 g"); expect(cenario(id).enunciado).not.toContain("66")
    }
    expect(CENARIOS_PADRAO.filter(c => c.servicoId === "laminacao")).toHaveLength(4)
    expect(cenario("colagem").enunciado).toBe("3.000 cartuchos já cortados e vincados, cola lateral, cartão 300 g.")
  })
  it("referências internas combinadas, e nada inventado", () => {
    const ref = (id: string) => cenario(id).referencias.map(r => [r.fornecedorNome, r.preco])
    expect(ref("verniz")).toEqual([["Ronaldo Osasco", 450]])
    expect(ref("laminacao-fosca")).toEqual([["Ronaldo Osasco", 765.28]])
    for (const id of ["laminacao-brilho", "laminacao-soft", "laminacao-dois-lados", "relevo", "faca", "fechamento", "transporte"]) expect(ref(id)).toEqual([])
    expect(ref("hotStamping")).toEqual([["Guilherme", 1387.5]])
    expect(ref("corteVinco")).toEqual([["Rodrigo", 200], ["Fabiano", 280], ["Jacuna", 280]])
    expect(ref("colagem")).toEqual([["Fabiano", 280]])
    expect(ref("arte-unitaria")).toEqual([["Ludmila", 70], ["Daniel", 350]])
    expect(ref("arte-pacote3")).toEqual([["Ludmila", 210]])
  })
})

describe("impressão: formato, acerto e milheiro, sem preço de exemplo", () => {
  it("exige formato, acerto e milheiro e não exige preço de exemplo nem forma de cobrança", () => {
    expect(errosDaEtapa({ ...base, servicos: [imp()] }, "detalhes")).toEqual({})
    const vazio = errosDaEtapa({ ...base, servicos: [imp({ tecnico: {}, acerto: null, valor: null })] }, "detalhes")
    expect(Object.keys(vazio).sort()).toEqual(["impressaoOffset.acerto", "impressaoOffset.formatoMax", "impressaoOffset.valor"])
    expect(errosDaEtapa({ ...base, servicos: [imp({ acerto: 0 })] }, "detalhes")["impressaoOffset.acerto"]).toBeTruthy()
    const dig = errosDaEtapa({ ...base, servicos: [{ ...imp(), id: "impressaoDigital" as const, valor: null }] }, "detalhes")
    expect(Object.keys(dig)).toEqual(["impressaoDigital.valor"])
  })
  it("grava acerto + milheiro, e o servidor recusa sem eles", async () => {
    const f = new FormData(); f.set("dados", JSON.stringify({ ...base, servicos: [imp()] }))
    expect((await receberCadastro(f)).ok).toBe(true)
    const [c] = estado.cfg.cadastrosParceiros as CadastroParceiro[]
    expect(c.servicos[0]).toMatchObject({ cobranca: "acertoMilheiro", acerto: 300, valor: 120, tecnico: { formatoMax: { l: 66, a: 96 } } })
    expect(c.servicos[0].precosExemplo).toBeUndefined()
    const g = new FormData(); g.set("dados", JSON.stringify({ ...base, documento: "11444777000161", servicos: [imp({ acerto: null })] }))
    const r = await receberCadastro(g)
    expect(!r.ok && r.campos?.["impressaoOffset.acerto"]).toBeTruthy()
  })
  it("cadastro antigo de impressão, sem esses campos, continua válido e vira fornecedor", () => {
    const antigo = { ...limparCadastro({ ...base, servicos: [{ id: "impressaoOffset", cobranca: "folha", prazoDias: 2, prazoVaria: false }] }), id: "PAR-0", em: "2026-11-01T12:00:00Z", status: "novo" as const, gerente: "Felipe", arquivos: [] }
    expect(paraFornecedor(antigo, "f-0").nome).toBe("Gráfica Exemplo")
  })
})

describe("preço do exemplo é obrigatório nos serviços com cenário", () => {
  it("serviço marcado sem preço não passa; com preço passa; 'outro' fica de fora", () => {
    expect(errosDaEtapa({ ...base, servicos: [serv()] }, "detalhes")["verniz.preco.verniz"]).toBeTruthy()
    expect(errosDaEtapa({ ...base, servicos: [serv({ precosExemplo: { verniz: 0 } })] }, "detalhes")["verniz.preco.verniz"]).toBeTruthy()
    expect(errosDaEtapa({ ...base, servicos: [serv({ precosExemplo: { verniz: 450 } })] }, "detalhes")).toEqual({})
    expect(errosDaEtapa({ ...base, servicos: [{ id: "outro", qual: "X", cobranca: "varia", prazoDias: null, prazoVaria: true }] }, "detalhes")).toEqual({})
  })
  it("laminação grava os quatro preços e exige todos", async () => {
    const lam = (precosExemplo: Record<string, number>) => ({ id: "laminacao" as const, cobranca: "folha" as const, prazoDias: 3, prazoVaria: false, precosExemplo })
    const quatro = { "laminacao-fosca": 700, "laminacao-brilho": 650, "laminacao-soft": 900, "laminacao-dois-lados": 1300 }
    expect(errosDaEtapa({ ...base, servicos: [lam({ "laminacao-fosca": 700 })] }, "detalhes")).toEqual({
      "laminacao.preco.laminacao-brilho": expect.any(String), "laminacao.preco.laminacao-soft": expect.any(String), "laminacao.preco.laminacao-dois-lados": expect.any(String),
    })
    expect(errosDaEtapa({ ...base, servicos: [lam(quatro)] }, "detalhes")).toEqual({})
    const f = new FormData(); f.set("dados", JSON.stringify({ ...base, servicos: [{ ...lam(quatro), cenarioVersoes: { "laminacao-fosca": 1 } }] }))
    expect((await receberCadastro(f)).ok).toBe(true)
    const [c] = estado.cfg.cadastrosParceiros as CadastroParceiro[]
    expect(c.servicos[0].precosExemplo).toEqual(quatro)
    expect(c.servicos[0].cenarioVersoes).toEqual({ "laminacao-fosca": 1, "laminacao-brilho": 1, "laminacao-soft": 1, "laminacao-dois-lados": 1 })
  })
  it("arte grava preço por arte e pacote de 3, e exige os dois", async () => {
    const arte = (precosExemplo: Record<string, number>) => ({ id: "arte" as const, cobranca: "trabalho" as const, prazoDias: 3, prazoVaria: false, precosExemplo })
    expect(Object.keys(errosDaEtapa({ ...base, servicos: [arte({ "arte-unitaria": 70 })] }, "detalhes"))).toEqual(["arte.preco.arte-pacote3"])
    const f = new FormData(); f.set("dados", JSON.stringify({ ...base, servicos: [arte({ "arte-unitaria": 80, "arte-pacote3": 210, "outro-id": 5 })] }))
    expect((await receberCadastro(f)).ok).toBe(true)
    const [c] = estado.cfg.cadastrosParceiros as CadastroParceiro[]
    expect(c.servicos[0].precosExemplo).toEqual({ "arte-unitaria": 80, "arte-pacote3": 210 })
  })
  it("o resumo do fornecedor de produção traz o exemplo, sem nome nem preço de referência nossos", () => {
    const c = { ...limparCadastro({ ...base, servicos: [serv({ precosExemplo: { verniz: 480 } })] }), id: "PAR-1", em: "2026-11-01T12:00:00Z", status: "novo" as const, gerente: "Felipe", arquivos: [] }
    const obs = paraFornecedor(c, "f-1").obs ?? ""
    expect(obs).toContain("exemplo")
    expect(obs).not.toMatch(/Ronaldo|450/)
  })
})

describe("nada interno vaza para o parceiro", () => {
  it("a parte pública tem só id, serviço, enunciado e versão", async () => {
    const pub = JSON.stringify(cenariosPublicos(mesclarCenarios(undefined)))
    for (const n of NOMES) expect(pub).not.toContain(n)
    expect(pub).not.toMatch(/765|450|1387|4500|referencias|unidade|preco/)
    expect(JSON.stringify(await lerCenariosPublicos())).toBe(pub)
  })
  it("o formulário (página /parceiros) mostra enunciado e campo, sem preço, média, faixa nem fornecedor", () => {
    estado.cfg = { cenariosParceiros: [{ ...cenario("verniz"), referencias: [{ preco: 7777, fornecedorNome: "Zé Secreto" }] }] }
    const html = renderToStaticMarkup(React.createElement(ParceirosForm, { whatsappGerente: null, cenarios: cenariosPublicos(mesclarCenarios(estado.cfg.cenariosParceiros)) }))
    for (const n of [...NOMES, "Zé Secreto", "7777", "765,28", "450", "média", "mínimo"]) expect(html).not.toContain(n)
  })
  it("o cadastro gravado não carrega referência nossa", async () => {
    const f = new FormData(); f.set("dados", JSON.stringify({ ...base, servicos: [serv({ precosExemplo: { verniz: 1200 } })] }))
    await receberCadastro(f)
    const json = JSON.stringify(estado.cfg.cadastrosParceiros)
    for (const n of NOMES) expect(json).not.toContain(n)
  })
})

describe("comparação interna", () => {
  it("calcula diferença em R$ e % quando há referência", () => {
    expect(compararExemplo(495, cenario("verniz").referencias)).toEqual([{ referencia: 450, fornecedorNome: "Ronaldo Osasco", diferenca: 45, percentual: 10 }])
    expect(compararExemplo(240, cenario("corteVinco").referencias).map(x => x.diferenca)).toEqual([40, -40, -40])
  })
  it("mostra 'sem referência' quando não há, por cenário", () => {
    expect(compararExemplo(500, cenario("relevo").referencias)).toEqual([])
    const sv = { id: "laminacao" as const, cobranca: null, prazoDias: 3, prazoVaria: false, precosExemplo: { "laminacao-fosca": 842, "laminacao-brilho": 600 } }
    const html = renderToStaticMarkup(React.createElement(LinhaExemplo, { servico: sv, cenarios: CENARIOS_PADRAO }))
    expect(html).toContain("Ronaldo Osasco"); expect(html).toContain("sem referência"); expect(html).toContain("sem preço informado")
  })
})

describe("média e faixa dos parceiros (só equipe)", () => {
  const cads = [
    cad([{ id: "verniz", precosExemplo: { verniz: 400 } }]), cad([{ id: "verniz", precosExemplo: { verniz: 500 } }]),
    cad([{ id: "verniz", precosExemplo: { verniz: 0 } }]), cad([{ id: "verniz" }]), cad([{ id: "verniz", precosExemplo: { verniz: -3 } }]), cad([{ id: "verniz", precosExemplo: { verniz: 451 } }]),
  ]
  it("calcula n, média, mínimo e máximo ignorando vazio e não positivo", () => {
    expect(estatisticaCenario(cads, "verniz")).toEqual({ n: 3, media: 450.33, min: 400, max: 500 })
    expect(estatisticaCenario(cads, "laminacao-fosca")).toBeNull()
  })
  it("a tela interna mostra média, mínimo e máximo, ou que ainda não há preço de parceiro", () => {
    const com = renderToStaticMarkup(React.createElement(LinhaMercado, { cenario: cenario("verniz"), cadastros: cads }))
    expect(com).toContain("média"); expect(com).toContain("mínimo"); expect(com).toContain("máximo"); expect(com).toContain("Ronaldo Osasco")
    const sem = renderToStaticMarkup(React.createElement(LinhaMercado, { cenario: cenario("relevo"), cadastros: cads }))
    expect(sem).toContain("sem referência"); expect(sem).toContain("ainda não há preço de parceiro")
  })
})

describe("config editável", () => {
  it("o que a equipe salva sobrescreve o padrão por cenário, e o enunciado novo sobe a versão", async () => {
    await salvarCenarios([{ id: "laminacao-soft", servicoId: "laminacao", enunciado: "Novo texto", referencias: [{ preco: 100, fornecedorNome: "Fulano" }] }, { id: "inexistente", servicoId: "laminacao", enunciado: "x" }])
    const m = mesclarCenarios(estado.cfg.cenariosParceiros)
    expect(m).toHaveLength(CENARIOS_PADRAO.length)
    expect(m.find(c => c.id === "laminacao-soft")).toMatchObject({ enunciado: "Novo texto", versao: 2, referencias: [{ preco: 100, fornecedorNome: "Fulano" }] })
    expect(m.find(c => c.id === "laminacao-fosca")!.referencias[0].preco).toBe(765.28)
    expect(JSON.stringify(await lerCenariosPublicos())).not.toContain("Fulano")
  })
})
