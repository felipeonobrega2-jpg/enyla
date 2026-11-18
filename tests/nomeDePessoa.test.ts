import { describe, it, expect } from "vitest"
import { nomeParaChamar } from "@/app/lib/nomeDePessoa"

describe("chamar pelo nome só quando é nome de gente", () => {
  it("nomes de pessoa", () => {
    expect(nomeParaChamar("Nubia Lima")).toBe("Nubia")
    expect(nomeParaChamar("Jimmy ✌🏻")).toBe("Jimmy")
    expect(nomeParaChamar("~ Cadu")).toBe("Cadu")   // apelido: mais proximidade
    expect(nomeParaChamar("EdsonLima")).toBe("Edson")   // nome colado
    expect(nomeParaChamar("Dudu Santos")).toBe("Dudu")
    expect(nomeParaChamar("MARIA")).toBe("Maria")
    expect(nomeParaChamar("joão pedro")).toBe("João")
    expect(nomeParaChamar("Eraldo Junior")).toBe("Eraldo")
    expect(nomeParaChamar("Márcio Santana")).toBe("Márcio")
  })
  it("empresa, apelido estranho, e-mail, número, símbolo: sem nome", () => {
    for (const n of ["Patoxx", "WSSACOLAS", "Comercial", "MAJU & NEW SAM", "K", "ruigbds@gmail.com", "559186356962", "🫡", "TECOAMM", "Gestao Para Salao De", "Vitallis Nutre", "A11 Audio Musical", "Retorno ma segunda fei", "Bruna Store", "Agro Napoles", "ZURC", "Abencoado", "Deus E Fiel", ".", null, ""])
      expect(nomeParaChamar(n), String(n)).toBe("")
  })
})

it("mensagem rápida sem nome de pessoa não sobra vírgula", async () => {
  const { preencher } = await import("@/app/lib/mensagensRapidas")
  expect(await preencher("Oi, {{nome}}! Tudo bem?", { contato: "WSSACOLAS", links: {} })).toBe("Oi! Tudo bem?")
  expect(await preencher("{{nome}}, conseguiu ver?", { contato: "Comercial", links: {} })).toBe("conseguiu ver?")
  expect(await preencher("Oi, {{nome}}! Tudo bem?", { contato: "Ana Paula", links: {} })).toBe("Oi, Ana! Tudo bem?")
})

it("mede como você chama a pessoa (meu amigo, irmão…) e põe no estilo da IA", async () => {
  const { medirVocativos, textoEstilo } = await import("@/app/lib/estilo")
  const ms = ["Perfeito, meu amigo", "Fala, irmão, tudo bem?", "Show", "Claro, meu amigo", "Quantas unidades?", "Bom dia", "Beleza", "Pode mandar", "Tá certo", "Fechado"]
  const v = medirVocativos(ms)
  expect(v[0]).toEqual({ texto: "meu amigo", pct: 20 })
  expect(v.some(x => x.texto === "irmão")).toBe(true)
  const t = textoEstilo({ em: "", n: 10, mediaChars: 12, pctEmoji: 0, pctExclamacao: 0, emojis: [], aberturas: ["show"], exemplos: [], vocativos: v })
  expect(t).toMatch(/Como eu chamo a pessoa: "meu amigo" \(20% das mensagens\)/)
})
