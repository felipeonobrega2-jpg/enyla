import { describe, it, expect, vi } from "vitest"
import { consultarCnpj } from "@/app/lib/cnpjConsulta"

const resp = (status: number, corpo: unknown = {}) => vi.fn(async (_url: string) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo }))
const BRASILAPI = { razao_social: "EMPRESA EXEMPLO LTDA", nome_fantasia: "Exemplo", descricao_situacao_cadastral: "ATIVA", cep: "01310100", descricao_tipo_de_logradouro: "AVENIDA", logradouro: "PAULISTA", numero: "1000", complemento: "", bairro: "BELA VISTA", municipio: "SAO PAULO", uf: "sp" }

describe("consulta pública de CNPJ", () => {
  it("não consulta CNPJ com dígito errado", async () => {
    const f = resp(200)
    expect(await consultarCnpj("11.222.333/0001-82", f)).toEqual({ ok: false, motivo: "invalido" })
    expect(f).not.toHaveBeenCalled()
  })
  it("traz razão social, situação e endereço", async () => {
    const f = resp(200, BRASILAPI)
    const r = await consultarCnpj("11.222.333/0001-81", f)
    expect(f.mock.calls[0][0]).toBe("https://brasilapi.com.br/api/cnpj/v1/11222333000181")
    expect(r).toMatchObject({ ok: true, dados: { razaoSocial: "EMPRESA EXEMPLO LTDA", situacao: "ATIVA", ativa: true, cep: "01310100", rua: "AVENIDA PAULISTA", cidade: "SAO PAULO", uf: "SP" } })
  })
  it("situação diferente de ativa é sinalizada; 404 e queda não derrubam", async () => {
    expect(await consultarCnpj("11222333000181", resp(200, { ...BRASILAPI, descricao_situacao_cadastral: "BAIXADA" }))).toMatchObject({ ok: true, dados: { ativa: false, situacao: "BAIXADA" } })
    expect(await consultarCnpj("11222333000181", resp(404))).toEqual({ ok: false, motivo: "nao_encontrado" })
    expect(await consultarCnpj("11222333000181", resp(500))).toEqual({ ok: false, motivo: "indisponivel" })
    expect(await consultarCnpj("11222333000181", vi.fn(async () => { throw new Error("rede") }))).toEqual({ ok: false, motivo: "indisponivel" })
  })
})
