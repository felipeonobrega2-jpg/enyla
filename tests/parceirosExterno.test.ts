import { describe, it, expect, vi } from "vitest"
vi.mock("@/app/lib/supabase", () => ({ supabase: {} }))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn() }))
import { mascararEmail, mascararTelefone, montarCadastros, montarRespostas, contarFunil } from "@/app/lib/parceirosExterno"

describe("parceiros na porta: mascaramento", () => {
  it("e-mail", () => { expect(mascararEmail("maria@gmail.com")).toBe("ma***@gmail.com"); expect(mascararEmail("x")).toBeNull() })
  it("telefone com os 4 últimos", () => { expect(mascararTelefone("(11) 98765-4321")).toBe("***4321"); expect(mascararTelefone("12")).toBeNull() })
  it("a resposta não vaza dados completos", () => {
    const [c] = montarCadastros([{ id: "1", em: "2026-11-25", status: "novo", nomeFantasia: "A", razaoSocial: "A Ltda", documento: "12.345.678/0001-90", tipoDocumento: "cnpj", email: "maria@gmail.com", whatsapp: "11987654321" }], [])
    const txt = JSON.stringify(c)
    expect(txt).not.toMatch(/maria@|11987654321|12345678|0001-90/)
  })
})

describe("parceiros na porta: origem e ordem", () => {
  const cad = (id: string, em: string, documento: string) => ({ id, em, status: "novo", nomeFantasia: id, documento, tipoDocumento: "cnpj" as const })
  it("prospector quando o CNPJ casa, direto quando não", () => {
    const r = montarCadastros([cad("a", "2026-11-01", "12.345.678/0001-90"), cad("b", "2026-11-02", "99999999000199")], [{ cnpj: "12345678000190", etapa: "abriu" }])
    expect(r.map(x => [x.id, x.origem, x.etapaProspector])).toEqual([["b", "direto", undefined], ["a", "prospector", "abriu"]])
  })
  it("limita a 100", () => {
    expect(montarCadastros(Array.from({ length: 150 }, (_, i) => cad(String(i), `2026-11-${String(i % 28 + 1).padStart(2, "0")}`, "")), [])).toHaveLength(100)
  })
})

describe("parceiros na porta: respostas e funil", () => {
  it("sem a tabela de e-mails, vem só pela etapa", () => {
    const r = montarRespostas([{ id: 1, cnpj: "1", etapa: "respondeu", nome_fantasia: "Gráfica X" }, { id: 2, cnpj: "2", etapa: "abordado" }], null)
    expect(r.emailsRecebidos).toBeNull()
    expect(r.prospectosQueResponderam).toEqual([{ prospecto_id: 1, nome: "Gráfica X" }])
  })
  it("corta o corpo em 300 e fica com 50", () => {
    const emails = Array.from({ length: 60 }, (_, i) => ({ prospecto_id: 1, recebido_em: `2026-11-${String(i % 28 + 1).padStart(2, "0")}`, assunto: "re", corpo: "x".repeat(500) }))
    const r = montarRespostas([{ id: 1, cnpj: "1", etapa: "respondeu", nome_fantasia: "G" }], emails)
    expect(r.emailsRecebidos).toHaveLength(50)
    expect(r.emailsRecebidos![0].corpo).toHaveLength(300)
    expect(r.emailsRecebidos![0].nome).toBe("G")
  })
  it("conta o funil", () => expect(contarFunil(["respondeu", "respondeu", "abriu", "descartado"])).toMatchObject({ respondeu: 2, abriu: 1, encontrado: 0 }))
})
