import { describe, it, expect } from "vitest"
import { instrucoesNuvem } from "../app/lib/instrucoesNuvem"

describe("instruções do diretor na nuvem", () => {
  it("leva a chave, o endereço, o dossiê e as regras que nunca quebram", () => {
    const t = instrucoesNuvem("cmo", "enyla_cmo_TESTE1234567890abcdefghij", "https://app.enyla.com.br/")
    expect(t).toContain("Lívia Andrade")
    expect(t).toContain("Bearer enyla_cmo_TESTE1234567890abcdefghij")
    expect(t).toContain("https://app.enyla.com.br/api/externo?o=dossie")
    expect(t).toContain("?o=conhecimento")
    expect(t).toMatch(/Nunca fala com cliente/)
    expect(t).toMatch(/Aprovo do Felipe/)
  })
})
