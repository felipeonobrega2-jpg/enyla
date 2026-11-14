import { describe, it, expect } from "vitest"
import { adicionarLicao, editarLicao, tirarLicao, correcaoDeMensagem, licoesNoPrompt, ehArea } from "../app/lib/licoesIA"

describe("ensinar a IA", () => {
  const t = new Date("2026-11-14T12:00:00Z")
  it("adiciona, não repete e limita as correções às mais recentes", () => {
    let l = adicionarLicao([], "Faturamento conta pela data de fechamento", "voce", t, "a")
    l = adicionarLicao(l, "faturamento  conta pela DATA de fechamento", "voce", t, "b")
    expect(l.map(x => x.id)).toEqual(["a"])
    for (let i = 0; i < 20; i++) l = adicionarLicao(l, `correção ${i}`, "correcao", t, `c${i}`)
    expect(l.filter(x => x.origem === "correcao")).toHaveLength(15)
    expect(l[0].id).toBe("a")                         // a sua fica
    expect(l.at(-1)!.id).toBe("c19")
  })
  it("editar uma correção vira lição sua; apagar tira", () => {
    const l = adicionarLicao([], "x", "correcao", t, "c")
    expect(editarLicao(l, "c", "Sempre pelo primeiro nome")[0]).toMatchObject({ texto: "Sempre pelo primeiro nome", origem: "voce" })
    expect(tirarLicao(l, "c")).toEqual([])
  })
  it("correção de mensagem só quando mudou de verdade", () => {
    expect(correcaoDeMensagem("Oi Ana, tudo bem?", "oi ana tudo bem")).toBeNull()
    expect(correcaoDeMensagem("Prezada Ana, segue.", "Ana, segue o orçamento!")).toMatch(/A IA escreveu: «Prezada Ana, segue\.» · você mandou: «Ana, segue o orçamento!»/)
  })
  it("prompt: vazio sem lições; as suas acima das correções", () => {
    expect(licoesNoPrompt([])).toBe("")
    const p = licoesNoPrompt([{ id: "1", texto: "A", em: "", origem: "voce" }, { id: "2", texto: "B", em: "", origem: "correcao" }])
    expect(p.indexOf("- A")).toBeLessThan(p.indexOf("- B"))
    expect(ehArea("design")).toBe(true); expect(ehArea("x")).toBe(false)
  })
})
