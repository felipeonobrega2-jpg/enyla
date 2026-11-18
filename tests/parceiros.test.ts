import { describe, it, expect } from "vitest"
import { cnpjValido, cpfValido, errosDaEtapa, errosDoCadastro, limparCadastro, paraFornecedor, textoCobranca, mascaraDocumento, mascaraTelefone } from "@/app/lib/parceiros"

const ok = { nomeFantasia: "Gráfica Exemplo", tipoDocumento: "cnpj" as const, documento: "11222333000181", cidade: "São Paulo", uf: "SP", responsavel: "Marcos", whatsapp: "11988887777", email: "a@b.com.br",
  servicos: [{ id: "corteVinco" as const, cobranca: "milheiro" as const, valor: 38, prazoDias: 3, prazoVaria: false }, { id: "colagem" as const, cobranca: "varia" as const, prazoDias: null, prazoVaria: true }], aceite: true }

describe("Parceiros ENYLA", () => {
  it("valida CNPJ e CPF", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true)
    expect(cnpjValido("11.222.333/0001-82")).toBe(false)
    expect(cpfValido("529.982.247-25")).toBe(true)
    expect(cpfValido("111.111.111-11")).toBe(false)
  })
  it("cadastro completo passa; prazo vazio só passa marcando que varia", () => {
    expect(errosDoCadastro(ok)).toEqual({})
    const semPrazo = { ...ok, servicos: [{ id: "colagem" as const, cobranca: "folha" as const, prazoDias: null, prazoVaria: false }] }
    expect(errosDaEtapa(semPrazo, "detalhes")["colagem.prazo"]).toBeTruthy()
  })
  it("limpa o que veio do formulário", () => {
    const l = limparCadastro({ ...ok, uf: "sp", email: " A@B.COM.BR ", servicos: [...ok.servicos, { id: "hacker" as never, cobranca: null, prazoDias: 9999, prazoVaria: false }] })
    expect(l.uf).toBe("SP"); expect(l.email).toBe("a@b.com.br"); expect(l.servicos).toHaveLength(2)
  })
  it("aprovado vira fornecedor com prazo e resumo", () => {
    const f = paraFornecedor({ ...limparCadastro(ok), id: "PAR-1", em: "2026-11-18T12:00:00Z", status: "novo", gerente: "Felipe", arquivos: [] }, "f-1")
    expect(f.prazoDias).toBe(3); expect(f.obs).toContain("Corte e vinco"); expect(f.telefone).toBe("11988887777")
    expect(textoCobranca(ok.servicos[0])).toContain("por mil")
  })
  it("máscaras", () => {
    expect(mascaraDocumento("11222333000181", "cnpj")).toBe("11.222.333/0001-81")
    expect(mascaraTelefone("11988887777")).toBe("(11) 98888-7777")
  })
})
