import { describe, it, expect, vi } from "vitest"

vi.mock("@/app/lib/prospectorEventosServidor", () => ({ registrarCliquePorToken: vi.fn(async () => undefined) }))
vi.mock("@/app/lib/supabase", () => ({ supabase: {} }))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn(async () => ({})) }))

import { linkCadastro, URL_CADASTRO_PARCEIROS } from "@/app/lib/prospectorEnvio"
import { TEXTO_BOAS_VINDAS } from "@/app/lib/boasVindasParceiro"
import { GET } from "@/app/api/prospector/r/[token]/route"
import { registrarCliquePorToken } from "@/app/lib/prospectorEventosServidor"
import { contarPorCanal, montarCadastros } from "@/app/lib/parceirosExterno"
import { readFileSync } from "node:fs"

describe("(1) link com utm por canal", () => {
  it("um utm_source por canal e utm_medium=prospector", () => {
    expect(linkCadastro("email")).toBe("https://app.enyla.com.br/parceiros?utm_source=email&utm_medium=prospector")
    expect(linkCadastro("whatsapp")).toBe("https://app.enyla.com.br/parceiros?utm_source=whatsapp&utm_medium=prospector")
    expect(linkCadastro("boasvindas")).toBe("https://app.enyla.com.br/parceiros?utm_source=boasvindas&utm_medium=prospector")
  })
  it("a mensagem fixa das boas-vindas usa boasvindas", () => {
    expect(TEXTO_BOAS_VINDAS).toContain(linkCadastro("boasvindas"))
  })
  it("o link rastreado do e-mail mantém o rastreio e redireciona com utm_source=email", async () => {
    const r = await GET(new Request("https://x/api/prospector/r/abc") as never, { params: Promise.resolve({ token: "abc" }) })
    expect(registrarCliquePorToken).toHaveBeenCalledWith("abc")
    expect(r.status).toBe(302)
    expect(r.headers.get("location")).toBe(linkCadastro("email"))
    expect(r.headers.get("location")!.startsWith(URL_CADASTRO_PARCEIROS)).toBe(true)
  })
})

describe("(2) formulário grava o utm", () => {
  it("o servidor lê utm_source e utm_medium (sanitizados) e o cadastro sem utm segue sem os campos", () => {
    const src = readFileSync("app/lib/parceirosServidor.ts", "utf8")
    expect(src).toContain('utm("utm_source")')
    expect(src).toContain('utm("utm_medium")')
    expect(src).toContain("...(utmSource ? { utmSource } : {})")
    const form = readFileSync("app/parceiros/ParceirosForm.tsx", "utf8")
    expect(form).toContain("utm_source")
  })
})

describe("(3) leitura mostra canal e contagem", () => {
  const cad = (p: Record<string, unknown>) => ({ id: "c", em: "2026-11-20T10:00:00Z", status: "novo", nomeFantasia: "Gráfica Fictícia", documento: "11222333000181", tipoDocumento: "cnpj", whatsapp: "11987654321", email: "a@b.com", ...p })
  it("cada cadastro mostra o canal; sem utm vira sem_utm", () => {
    const r = montarCadastros([cad({ id: "a", utmSource: "whatsapp", utmMedium: "prospector" }), cad({ id: "b" })] as never, [])
    expect(r.find(x => x.id === "a")).toMatchObject({ canal: "whatsapp", utmMedium: "prospector" })
    expect(r.find(x => x.id === "b")).toMatchObject({ canal: "sem_utm" })
  })
  it("conta cadastros e cliques por canal", () => {
    const r = contarPorCanal([{ utmSource: "email" }, { utmSource: "email" }, { utmSource: "boasvindas" }, {}, { utmSource: "outro" }] as never, 7)
    expect(r.email).toEqual({ cadastros: 2, cliques: 7 })
    expect(r.whatsapp).toEqual({ cadastros: 0, cliques: 0 })
    expect(r.boasvindas.cadastros).toBe(1)
    expect(r.sem_utm.cadastros).toBe(1)
    expect(r.outro.cadastros).toBe(1)
  })
})
