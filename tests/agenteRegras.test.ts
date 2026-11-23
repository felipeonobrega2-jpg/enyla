import { describe, it, expect } from "vitest"
import { trouxeDadosNovos } from "@/app/lib/digital"
describe("digital: só recota com dado novo", () => {
  const m = (from_me: boolean, corpo: string, tipo = "text") => ({ from_me, corpo, tipo })
  it("pergunta sem número depois do orçamento: não recota (caso Thays)", () => {
    expect(trouxeDadosNovos([m(false, "150 do sérum e 100 do gel"), m(true, "Montei os orçamentos…"), m(false, "Bom dia!"), m(false, "quanto tempo me entregam, após a aprovação da arte?")])).toBe(false)
  })
  it("mudou a quantidade ou mandou foto: recota", () => {
    expect(trouxeDadosNovos([m(true, "Montei…"), m(false, "na verdade quero 300")])).toBe(true)
    expect(trouxeDadosNovos([m(true, "Montei…"), m(false, "", "image")])).toBe(true)
  })
})

import { leadQuente } from "@/app/lib/agenteAuto"
describe("lead quente ignora o limite por hora", () => {
  it("MQL, etiqueta boa, perfil bom, pedido digital ou proposta em aberto", () => {
    expect(leadQuente({ jid: "a", status_lead: "mql" })).toBe(true)
    expect(leadQuente({ jid: "a", etiquetas: ["Lead médio"] })).toBe(true)
    expect(leadQuente({ jid: "a", perfil: "icp" })).toBe(true)
    expect(leadQuente({ jid: "a", pedidosDigitais: [{ jid: "a", status: "aguardando_sinal" }] })).toBe(true)
    expect(leadQuente({ jid: "a", propostas: [{ jid: "a", status: "enviada", em: new Date().toISOString() }] })).toBe(true)
    expect(leadQuente({ jid: "a", etiquetas: ["Lead pequeno"], perfil: "pequeno" })).toBe(false)
  })
})

describe("digital: caixa maior que A3", () => {
  it("custo R$ 4,40 e venda R$ 7,96 a unidade, final quebrado (caso Master Bacth, 15×12×8, 100 un)", async () => {
    const { cotarDigital } = await import("@/app/lib/digital")
    const c = cotarDigital({ quantidade: 100, caixa_cm: { frente: 12, lateral: 8, altura: 15 } } as never)
    expect(c.ok).toBe(true)
    if (c.ok) { expect(c.total).toBe(795.95); expect(c.custo).toBe(440); expect(c.margem).toBe(355.95) }
    const { precoMaiorQueA3 } = await import("@/app/lib/precoDigital")
    expect(precoMaiorQueA3(50)?.total).toBe(397.95)
    expect(precoMaiorQueA3(600)).toBeNull()
  })
})

describe("número do pedido digital nunca repete", () => {
  it("dois pedidos ao mesmo tempo com o mesmo número: o segundo pega o próximo livre (grupo acompanha)", async () => {
    const { vi } = await import("vitest")
    const tomados = new Set<string>()
    vi.doMock("@/app/lib/registroAgente", () => ({ reservarTratada: async (id: string) => { if (tomados.has(id)) return false; tomados.add(id); return true } }))
    const { reservarIdsDigitais } = await import("@/app/lib/digitalServidor")
    const existentes = [{ id: "DIG-0151" }]
    const a = await reservarIdsDigitais([{ id: "DIG-0152" }], existentes)
    const b = await reservarIdsDigitais([{ id: "DIG-0152", grupo: "DIG-0152" }, { id: "DIG-0153", grupo: "DIG-0152" }], existentes)
    expect(a[0].id).toBe("DIG-0152")
    expect(b.map(x => x.id)).toEqual(["DIG-0153", "DIG-0154"])
    expect(b.map(x => x.grupo)).toEqual(["DIG-0153", "DIG-0153"])
  })
})

describe("base de conhecimento: só o que importa na conversa", () => {
  it("as lições do Felipe vão sempre; das outras, as do assunto", async () => {
    const { conhecimentoRelevante } = await import("@/app/lib/agenteLeads")
    const kb = [
      { id: "felipe-prazo", tema: "prazo", texto: "Prazo do digital de 7 a 10 dias úteis", em: "2026-11-19" },
      { id: "a1", tema: "produto", texto: "Caixa cartonada rígida é outro produto, bem mais cara", em: "2026-11-10" },
      { id: "a2", tema: "processo", texto: "Frete para o interior de São Paulo vai por transportadora", em: "2026-11-11" },
      { id: "a3", tema: "recusa", texto: "Não fazemos embalagem de cigarro", em: "2026-11-12" },
    ] as never[]
    const sel = conhecimentoRelevante(kb, "cliente: quanto fica o frete para o interior? moro em Campinas", 120)
    const ids = (sel as { id: string }[]).map(i => i.id)
    expect(ids[0]).toBe("felipe-prazo")
    expect(ids).toContain("a2")
    expect(ids).not.toContain("a3")
  })
})

describe("motor: folha cortada em 8 para máquina pequena", () => {
  it("meia folha com 2 caixas lado a lado vira 4 blocos na Jerograf 48×45 (só pinça): 16 por folha", async () => {
    const { passadasDaPeca, DIVISOES } = await import("../app/lib/producao")
    expect(DIVISOES.map(d => d.d)).toEqual([1, 2, 4, 6, 8])
    const [w, h] = DIVISOES.find(d => d.d === 8)!.dims(770, 1130)
    const ps = passadasDaPeca(w, h, { largura: 282.5, altura: 179.75 }, { nome: "J", pinca: 10, margem: 0, largura: 480, altura: 450 } as never, 2)
    expect(ps.reduce((s, p) => s + p.cavidades * p.porPeca, 0) * 8).toBe(16)
  })
})

describe("motor explica a conta", () => {
  it("passos em português e desenho com pinça", async () => {
    const { desenharPassada, gradeDoCorte } = await import("../app/lib/explicaRota")
    expect(gradeDoCorte(8)).toEqual({ cols: 2, rows: 4 })
    const d = desenharPassada(385, 282.5, 2, { largura: 282.5, altura: 179.75 }, { pinca: 10, margem: 0 }, 2)
    expect(d.caixas).toHaveLength(2)
    expect(d.pinca).not.toBeNull()
    expect(desenharPassada(385, 282.5, 3, { largura: 282.5, altura: 179.75 }, { pinca: 10, margem: 0 }, 2).encaixadasAMais).toBe(1)
  })
})

describe("motor: avisos da rota", () => {
  it("sobra do último pacote vira oferta de caixas a mais", async () => {
    const { avisosDaRota } = await import("../app/lib/explicaRota")
    const rota = { quantidade: 20000, pecasPorFolhaPapel: 24, folhasPapel: 1000, passadas: [], impressorNome: "J" } as never
    expect(avisosDaRota(rota, { perdaPct: 10, blank: { largura: 100, altura: 100 }, maquina: null, esp: 2 })[0]).toMatch(/sobra 82 folhas.*1\.700 caixas a mais/)
  })
})

describe("arte prévia: SVG seguro e faces no tamanho certo", () => {
  it("tira script, eventos e links externos; mantém o desenho", async () => {
    const { limparSvg, tamanhoDasFaces, dimsDoFormulario } = await import("../app/lib/artePrevia")
    const s = limparSvg(`texto <svg viewBox='0 0 60 120' onload="x()"><script>alert(1)</script><rect width='60' height='120' fill='url(#g)'/><image href='https://mal.com/a.png'/><foreignObject><div/></foreignObject></svg> fim`)!
    expect(s).toContain("<rect"); expect(s).toContain("url(#g)"); expect(s).toContain("xmlns")
    expect(s).not.toMatch(/script|onload|mal\.com|foreignObject/)
    expect(limparSvg("sem svg")).toBeNull()
    expect(tamanhoDasFaces({ largura: 60, profundidade: 40, altura: 120 }).lateral_esq).toEqual([40, 120])
    expect(dimsDoFormulario({ frente: 6, lateral: 4, alturaBox: 12 })).toEqual({ largura: 60, profundidade: 40, altura: 120 })
  })
})

describe("caixa 3D: luz e brilho", () => {
  it("a face virada para a luz fica clara e a de costas escura; o brilho só aparece perto da luz", async () => {
    const { sombraDaFace, brilhoDaFace } = await import("../app/components/Caixa3DArte")
    expect(sombraDaFace(-38)).toBe(0)
    expect(sombraDaFace(142)).toBeCloseTo(0.62)
    expect(brilhoDaFace(-19)).toBe(1)
    expect(brilhoDaFace(70)).toBeLessThan(0.01)
  })
})

describe("caixa 3D: efeitos pelos acabamentos do orçamento", () => {
  it("só mostra o que o orçamento tem", async () => {
    const { efeitosDoFormulario } = await import("../app/lib/artePrevia")
    expect(efeitosDoFormulario({ incluirVerniz: true, vernizTipo: "UV Total", outrosAcabamentos: ["Hot Stamping"] })).toEqual({ brilho: "total", metal: true, holografico: false })
    expect(efeitosDoFormulario({ laminacao: true, laminacaoTipo: "Soft Touch", incluirVerniz: true, vernizTipo: "UV Localizado" })).toEqual({ brilho: "fosco", metal: false, holografico: false })
    expect(efeitosDoFormulario({ laminacao: true, laminacaoTipo: "Holográfica" }).holografico).toBe(true)
    expect(efeitosDoFormulario({})).toEqual({ brilho: "natural", metal: false, holografico: false })
  })
})
