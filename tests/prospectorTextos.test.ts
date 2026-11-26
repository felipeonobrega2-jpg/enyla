// Biblioteca de textos do Prospector (teste A/B): sorteio, fallback e contagem por versão. Nada é enviado.
import { describe, it, expect } from "vitest"
import { sortearTexto, preencherTexto, contarPorVersao, validarNovoTexto, ehSim, type TextoProspector } from "@/app/lib/prospectorTextos"
import { envioDe } from "@/app/lib/prospectorEnvio"

const t = (id: string, etapa: "primeira" | "resposta_sim", rotulo: string, ativo = true): TextoProspector =>
  ({ id, etapa, rotulo, corpo: `Oi {nome}, texto ${rotulo} {link}`, ativo, criadaEm: `2026-11-26T1${id.length}:00:00Z` })
const A = t("a", "primeira", "A"), B = t("b", "primeira", "B"), C = t("c", "primeira", "C", false), S = t("s", "resposta_sim", "A")

describe("sorteio", () => {
  it("sem versão ativa na etapa devolve null (o envio usa o texto do código)", () => {
    expect(sortearTexto([], "primeira")).toBeNull()
    expect(sortearTexto([C], "primeira")).toBeNull()
    expect(sortearTexto([S], "primeira")).toBeNull()
  })
  it("com uma só ativa, usa ela", () => { expect(sortearTexto([A, C], "primeira", () => 0.99)?.id).toBe("a") })
  it("peso igual entre as ativas e nunca sorteia a desligada", () => {
    expect(sortearTexto([B, A, C], "primeira", () => 0)?.id).toBe("a")
    expect(sortearTexto([B, A, C], "primeira", () => 0.49)?.id).toBe("a")
    expect(sortearTexto([B, A, C], "primeira", () => 0.5)?.id).toBe("b")
    expect(sortearTexto([B, A, C], "primeira", () => 0.9999)?.id).toBe("b")
    const n = { a: 0, b: 0 }
    for (let i = 0; i < 1000; i++) n[sortearTexto([A, B], "primeira", () => i / 1000)!.id as "a" | "b"]++
    expect(n).toEqual({ a: 500, b: 500 })
  })
  it("não mistura etapas", () => { expect(sortearTexto([A, S], "resposta_sim")?.id).toBe("s") })
})

describe("variáveis e validação", () => {
  it("troca {nome} e {link}", () => { expect(preencherTexto("Oi {nome}, veja {link}", { nome: "Gráfica X", link: "https://x" })).toBe("Oi Gráfica X, veja https://x") })
  it("variável sem valor não deixa chave", () => { expect(preencherTexto("Oi {nome}, tudo bem?", { nome: null })).toBe("Oi , tudo bem?") })
  it("valida etapa, rótulo e corpo", () => {
    expect(validarNovoTexto({ etapa: "x", rotulo: "A", corpo: "oi" }).ok).toBe(false)
    expect(validarNovoTexto({ etapa: "primeira", rotulo: "", corpo: "oi" }).ok).toBe(false)
    expect(validarNovoTexto({ etapa: "primeira", rotulo: "A", corpo: " " }).ok).toBe(false)
    expect(validarNovoTexto({ etapa: "primeira", rotulo: "A", corpo: " oi " })).toEqual({ ok: true, texto: { etapa: "primeira", rotulo: "A", corpo: "oi" } })
  })
  it("reconhece sim curto e não confunde conversa ou recusa", () => {
    expect(ehSim("Sim, fazemos!")).toBe(true)
    expect(ehSim("sim")).toBe(true)
    expect(ehSim("não")).toBe(false)
    expect(ehSim("sim mas não temos interesse agora")).toBe(false)
  })
})

describe("envio guarda o id da versão", () => {
  it("envioDe preserva textoId", () => {
    expect(envioDe({ envio: { passo: "primeiro_contato", canal: "whatsapp", status: "enviado", em: "x", textoId: "a" } })?.textoId).toBe("a")
    expect(envioDe({ envio: { passo: "primeiro_contato", canal: "whatsapp", status: "enviado", em: "x" } })?.textoId).toBeUndefined()
  })
})

const env = (textoId: string | undefined, status = "enviado") => ({ etapa: "qualificado", em: "2026-11-26T12:00:00Z", envio: { passo: "primeiro_contato", canal: "whatsapp", status, em: "2026-11-26T12:00:00Z", ...(textoId ? { textoId } : {}) } })
describe("contagem por versão", () => {
  const prospectos = [
    { etapa: "abordado", historico_etapas: [env("a")] },
    { etapa: "respondeu", historico_etapas: [env("a"), { etapa: "respondeu", em: "x" }] },
    { etapa: "cadastrou", historico_etapas: [env("a"), { etapa: "respondeu", em: "x", sim: true }, { etapa: "cadastrou", em: "y" }] },
    { etapa: "respondeu", historico_etapas: [env("b"), { etapa: "respondeu", em: "x" }] },
    { etapa: "qualificado", historico_etapas: [env("b", "falhou")] },        // falhou: não conta como enviado
    { etapa: "abordado", historico_etapas: [env(undefined)] },               // texto do código: não entra em versão
    { etapa: "abordado", historico_etapas: [env("a"), env("a")] },           // dois canais, mesma versão: conta uma vez
  ]
  it("conta enviados, responderam, sim e cadastros", () => {
    const r = contarPorVersao([A, B, C, S], prospectos)
    const por = Object.fromEntries(r.map(x => [x.id, x]))
    expect(por.a).toMatchObject({ enviados: 4, responderam: 2, responderamSim: 1, cadastros: 1 })
    expect(por.b).toMatchObject({ enviados: 1, responderam: 1, responderamSim: 0, cadastros: 0 })
    expect(por.c).toMatchObject({ enviados: 0, responderam: 0, responderamSim: 0, cadastros: 0 })
    expect(por.s).toMatchObject({ enviados: 0 })
  })
  it("sem biblioteca, nada é contado", () => { expect(contarPorVersao([], prospectos)).toEqual([]) })
})
