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
