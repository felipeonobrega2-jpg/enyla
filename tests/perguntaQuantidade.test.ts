import { describe, it, expect, vi } from "vitest"
import {
  TEXTO_VB, deveFazerPerguntaVb, ehPerguntaVb, interpretarRespostaVb, perguntaVbAtiva, respostaDoLeadAoVb,
  aplicarResposta, taxaVolumeInformadoVb, CHAVE_PERGUNTA_VB, type RegistroVb,
} from "../app/lib/perguntaQuantidade"
import { tratarRespostaVb } from "../app/lib/perguntaQuantidadeServidor"
import { soAbertura, saudacaoDoFiltro, FILTRO_PADRAO } from "../app/lib/agenteLeads"

const msg = (from_me: boolean, corpo: string) => ({ from_me, corpo, tipo: "text" })

describe("flag", () => {
  it("nasce desligada: ausente ou diferente de true", () => {
    expect(perguntaVbAtiva({})).toBe(false)
    expect(perguntaVbAtiva(null)).toBe(false)
    expect(perguntaVbAtiva({ [CHAVE_PERGUNTA_VB]: "true" })).toBe(false)
    expect(perguntaVbAtiva({ [CHAVE_PERGUNTA_VB]: true })).toBe(true)
  })
  it("desligada: saudação e soAbertura de sempre", () => {
    expect(saudacaoDoFiltro(FILTRO_PADRAO)).not.toBe(TEXTO_VB)
    expect(soAbertura([msg(false, "Olá, gostaria de saber mais sobre as caixinhas.")])).toBe(true)
    expect(soAbertura([msg(false, "oi"), msg(true, "Oi!"), msg(false, "300")])).toBe(false)
  })
})

describe("quem recebe a pergunta", () => {
  it("lead novo com a flag ligada recebe o texto exato da Versão B", () => {
    expect(deveFazerPerguntaVb({ flag: true, nivel: "lead" })).toBe(true)
    expect(TEXTO_VB).toBe(`Oi! Aqui é da ENYLA, embalagens personalizadas para perfumaria. Para eu te passar a melhor opção, quantas caixinhas você precisa? Responda só com o número:
1 - até 999 caixas
2 - de 1.000 a 4.999
3 - 5 mil ou mais
Se ainda não sabe, me conta para qual produto é que eu te ajudo.`)
  })
  it("flag desligada não pergunta", () => expect(deveFazerPerguntaVb({ flag: false, nivel: "lead" })).toBe(false))
  it.each(["A", "B", "C", "indefinido"] as const)("nível %s não recebe", nivel => expect(deveFazerPerguntaVb({ flag: true, nivel })).toBe(false))
})

describe("interpretação", () => {
  it("1, 2, 3 (com pontuação leve) viram a faixa, sem quantidade inventada", () => {
    expect(interpretarRespostaVb("1")).toEqual({ tipo: "faixa", faixa: 1, quantidade: null })
    expect(interpretarRespostaVb("2.")).toEqual({ tipo: "faixa", faixa: 2, quantidade: null })
    expect(interpretarRespostaVb(" 3! ")).toEqual({ tipo: "faixa", faixa: 3, quantidade: null })
  })
  it("número digitado cai na faixa e guarda a quantidade", () => {
    expect(interpretarRespostaVb("300")).toEqual({ tipo: "faixa", faixa: 1, quantidade: 300 })
    expect(interpretarRespostaVb("999")).toMatchObject({ faixa: 1 })
    expect(interpretarRespostaVb("2 mil")).toEqual({ tipo: "faixa", faixa: 2, quantidade: 2000 })
    expect(interpretarRespostaVb("2000")).toMatchObject({ faixa: 2, quantidade: 2000 })
    expect(interpretarRespostaVb("4.999")).toMatchObject({ faixa: 2 })
    expect(interpretarRespostaVb("5000")).toMatchObject({ faixa: 3, quantidade: 5000 })
    expect(interpretarRespostaVb("5 mil")).toMatchObject({ faixa: 3, quantidade: 5000 })
    expect(interpretarRespostaVb("10000")).toMatchObject({ faixa: 3, quantidade: 10000 })
  })
  it("não sei e outras respostas", () => {
    for (const t of ["não sei", "Ainda não sei", "não sei ainda!"]) expect(interpretarRespostaVb(t)).toEqual({ tipo: "nao_sei" })
    expect(interpretarRespostaVb("é para um perfume masculino")).toBeNull()
    expect(interpretarRespostaVb("")).toBeNull()
  })
})

describe("localiza a resposta à pergunta", () => {
  it("só depois da nossa pergunta", () => {
    expect(ehPerguntaVb(TEXTO_VB)).toBe(true)
    expect(respostaDoLeadAoVb([msg(false, "oi"), msg(true, TEXTO_VB), msg(false, "2")])).toBe("2")
    expect(respostaDoLeadAoVb([msg(false, "oi"), msg(false, "2")])).toBeNull()
  })
})

describe("gravação, aviso e métrica", () => {
  const rodar = async (texto: string, antes?: RegistroVb) => {
    let reg: RegistroVb | undefined = antes
    const avisar = vi.fn().mockResolvedValue(undefined)   // mock de avisarMql
    const r = interpretarRespostaVb(texto)!
    await tratarRespostaVb("jid-teste", r, { gravar: async (_j, f) => { reg = f(reg) }, avisar })
    return { reg: reg!, avisar }
  }
  it("faixa 3 avisa uma vez; 1 e 2 não avisam", async () => {
    const tres = await rodar("3")
    expect(tres.avisar).toHaveBeenCalledTimes(1)
    expect((await rodar("1")).avisar).not.toHaveBeenCalled()
    expect((await rodar("2")).avisar).not.toHaveBeenCalled()
    const de_novo = await rodar("3", tres.reg)
    expect(de_novo.avisar).not.toHaveBeenCalled()
  })
  it("responder só 1 não inventa quantidade", async () => {
    const { reg } = await rodar("1")
    expect(reg.faixa).toBe(1)
    expect(reg.quantidade).toBeNull()
    expect((await rodar("300")).reg.quantidade).toBe(300)
  })
  it("não sei não grava volume e não entra no numerador", async () => {
    const ns = (await rodar("não sei")).reg
    expect(ns.faixa).toBeNull()
    const um = (await rodar("1")).reg
    expect(taxaVolumeInformadoVb([ns, um, aplicarResposta(undefined, { tipo: "faixa", faixa: 3, quantidade: null }, "x").registro, { faixa: null }]))
      .toEqual({ perguntados: 4, informaram: 2, taxa: 0.5 })
    expect(taxaVolumeInformadoVb([])).toEqual({ perguntados: 0, informaram: 0, taxa: 0 })
  })
})
