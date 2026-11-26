// Origem do cadastro em /parceiros: link com ?o=prospector, casamento por telefone ou CNPJ, funil (respondeu → cadastrou),
// e a correção retroativa. Supabase, e-mail, WhatsApp e aviso são simulados; só fixtures fictícias.
import { describe, it, expect, vi, beforeEach } from "vitest"

type Linha = Record<string, unknown>
const mundo = vi.hoisted(() => ({ prospectos: [] as Linha[], cfg: {} as Record<string, unknown> }))

vi.mock("@/app/lib/configAtomica", () => ({
  lerConfigLinha: vi.fn(async () => ({ data: { data: mundo.cfg }, error: null })),
  lerCampos: vi.fn(async () => mundo.cfg),
  mudarConfig: vi.fn(async (mudar: (d: Record<string, unknown>) => Record<string, unknown> | null) => { mundo.cfg = { ...mundo.cfg, ...(mudar(mundo.cfg) ?? {}) }; return mundo.cfg }),
}))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    storage: { from: vi.fn() },
    from: (tabela: string) => {
      const fonte = tabela === "prospectos_parceiros" ? mundo.prospectos : []
      const filtros: ((r: Linha) => boolean)[] = []
      let patch: Linha | null = null
      let faixa: [number, number] | null = null
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (c: string, v: unknown) => { filtros.push(r => r[c] === v); return q }
      q.range = (a: number, b: number) => { faixa = [a, b]; return q }
      q.update = (p: Linha) => { patch = p; return q }
      const achar = () => { const l = fonte.filter(r => filtros.every(f => f(r))); return faixa ? l.slice(faixa[0], faixa[1] + 1) : l }
      q.maybeSingle = async () => ({ data: structuredClone(achar()[0] ?? null), error: null })
      q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        const rs = achar()
        if (patch) rs.forEach(r => Object.assign(r, patch))
        return Promise.resolve({ data: structuredClone(rs), error: null }).then(ok, ko)
      }
      return q
    },
  },
}))
vi.mock("@/app/lib/notificar", () => ({ notificar: vi.fn(async () => null), LINK_SISTEMA: "https://exemplo.test" }))
vi.mock("@/app/lib/geocodificar", () => ({ enderecoPeloCep: vi.fn(async () => ({ erro: "teste" })) }))
vi.mock("@/app/lib/emailsServidor", () => ({ emailDoCadastro: vi.fn(async () => ({ tipo: "teste", ok: false })) }))
vi.mock("@/app/lib/evolution", () => ({ evo: vi.fn(async () => null) }))
vi.mock("@/app/lib/agenteAuto", () => ({ seuNumero: vi.fn(async () => "") }))

import { receberCadastro } from "@/app/lib/parceirosServidor"
import { casarProspecto, origemDoCadastro, corrigirOrigemRetroativa } from "@/app/lib/origemCadastroServidor"
import { aoCadastroDaProspeccao, MOTIVO_CADASTRO_DA_PROSPECCAO } from "@/app/lib/prospector"
import { linkParceiros, ajustarLink, LINK_PARCEIROS } from "@/app/lib/atendenteParceiro"
import { marcarLinkDoCadastro } from "@/app/lib/ordemProspecto"
import { URL_CADASTRO_DA_PROSPECCAO, URL_CADASTRO_PARCEIROS } from "@/app/lib/prospectorEnvio"
import type { CadastroParceiro } from "@/app/lib/parceiros"

const CNPJ = "11222333000181"
const dados = {
  nomeFantasia: "Gráfica Exemplo", tipoDocumento: "cnpj", documento: CNPJ, cep: "01310100", rua: "Avenida Paulista", numero: "1000",
  bairro: "Bela Vista", cidade: "São Paulo", uf: "SP", responsavel: "Marcos", whatsapp: "11988887777", email: "a@b.com.br",
  servicos: [{ id: "colagem", cobranca: "unidade", valor: 0.5, prazoDias: 3, prazoVaria: false, tecnico: { buscaEntrega: true }, precosExemplo: { colagem: 250 } }], aceite: true,
}
const formulario = (extra: Record<string, string> = {}, d: Record<string, unknown> = dados) => {
  const f = new FormData(); f.set("dados", JSON.stringify(d))
  for (const [k, v] of Object.entries(extra)) f.set(k, v)
  return f
}
const prospecto = (extra: Linha = {}): Linha => ({ id: 3384, cnpj: "99888777000166", telefone: "(11) 98888-7777", etapa: "abordado", opt_out: false, historico_etapas: [], atualizado_em: "2026-11-26T10:00:00Z", ...extra })
const salvo = () => ((mundo.cfg.cadastrosParceiros ?? []) as CadastroParceiro[])[0]
const hist = () => mundo.prospectos[0].historico_etapas as { etapa: string; motivo?: string; cadastroId?: string }[]

beforeEach(() => { mundo.prospectos = [prospecto()]; mundo.cfg = {} })

describe("o link leva a origem", () => {
  it("Atendente: ?o=prospector e o id do prospecto; sem id, só a origem", () => {
    expect(linkParceiros(3384)).toBe(`${LINK_PARCEIROS}?o=prospector&p=3384`)
    expect(linkParceiros()).toBe(`${LINK_PARCEIROS}?o=prospector`)
    expect(ajustarLink("Cadastre aqui https://www.enyla.com.br/parceiros ok", { pode: true, quer: true, link: linkParceiros(3384) })).toBe(`Cadastre aqui ${LINK_PARCEIROS}?o=prospector&p=3384 ok`)
    expect(ajustarLink("Faça o cadastro.", { pode: true, quer: true, link: linkParceiros(3384) })).toBe(`Faça o cadastro.\n\n${LINK_PARCEIROS}?o=prospector&p=3384`)
  })
  it("ordem direta: troca o link do /parceiros (com ou sem www e parâmetros) pelo marcado e não mexe no resto", () => {
    const certo = `${LINK_PARCEIROS}?o=prospector&p=3384`
    expect(marcarLinkDoCadastro("Cadastre: https://app.enyla.com.br/parceiros", 3384)).toBe(`Cadastre: ${certo}`)
    expect(marcarLinkDoCadastro("Cadastre: www.enyla.com.br/parceiros?o=x ok", 3384)).toBe(`Cadastre: ${certo} ok`)
    expect(marcarLinkDoCadastro("Sem link nenhum", 3384)).toBe("Sem link nenhum")
    expect(marcarLinkDoCadastro("Veja https://enyla.com.br/ola", 3384)).toBe("Veja https://enyla.com.br/ola")
  })
  it("e-mail do Prospector: o link rastreado encaminha com ?o=prospector", () => {
    expect(URL_CADASTRO_DA_PROSPECCAO).toBe(`${URL_CADASTRO_PARCEIROS}?o=prospector`)
  })
})

describe("casar o cadastro com o prospecto", () => {
  const ps = [{ id: 1, telefone: "(11) 98888-7777", cnpj: null }, { id: 2, telefone: null, cnpj: CNPJ }]
  it("telefone com ou sem 55 e com ou sem o 9 extra; CNPJ; telefone curto não casa", () => {
    for (const w of ["11988887777", "5511988887777", "1188887777"]) expect(casarProspecto({ whatsapp: w, documento: "", tipoDocumento: "cpf" }, ps)?.id).toBe(1)
    expect(casarProspecto({ whatsapp: "21900000000", documento: CNPJ, tipoDocumento: "cnpj" }, ps)?.id).toBe(2)
    expect(casarProspecto({ whatsapp: "21900000000", documento: CNPJ, tipoDocumento: "cpf" }, ps)).toBeNull()
    expect(casarProspecto({ whatsapp: "8888", documento: "", tipoDocumento: "cnpj" }, [{ id: 9, telefone: "8888", cnpj: null }])).toBeNull()
  })
  it("o id do link só vale se o prospecto existe, e não avança a etapa", () => {
    const c = { whatsapp: "21900000000", documento: "", tipoDocumento: "cpf" as const }
    expect(origemDoCadastro(c, ps, { origem: "prospector", prospectoId: "2" })).toEqual({ prospecto: ps[1], avanca: false })
    expect(origemDoCadastro(c, ps, { origem: "prospector", prospectoId: "77" })).toBeNull()
    expect(origemDoCadastro(c, ps, { origem: "outro", prospectoId: "2" })).toBeNull()
  })
})

describe("funil: cadastro de quem veio da prospecção", () => {
  const est = (etapa: string, extra = {}) => ({ etapa: etapa as never, optOut: false, historico: [], ...extra })
  it("antes de respondeu: passa por respondeu e vai a cadastrou, uma linha por etapa, com o id do cadastro", () => {
    const r = aoCadastroDaProspeccao(est("abordado"), "2026-11-26T12:00:00Z", "PAR-1")!
    expect(r.etapa).toBe("cadastrou")
    expect(r.historico.map(h => [h.etapa, h.cadastroId, h.motivo])).toEqual([["respondeu", "PAR-1", MOTIVO_CADASTRO_DA_PROSPECCAO], ["cadastrou", "PAR-1", MOTIVO_CADASTRO_DA_PROSPECCAO]])
  })
  it("já em respondeu ou abriu: só cadastrou; já cadastrou, descartado, opt-out ou o mesmo cadastro: nada", () => {
    expect(aoCadastroDaProspeccao(est("respondeu"), "x", "PAR-1")!.historico.map(h => h.etapa)).toEqual(["cadastrou"])
    expect(aoCadastroDaProspeccao(est("abriu"), "x", "PAR-1")!.historico.map(h => h.etapa)).toEqual(["cadastrou"])
    expect(aoCadastroDaProspeccao(est("cadastrou"), "x", "PAR-1")).toBeNull()
    expect(aoCadastroDaProspeccao(est("descartado"), "x", "PAR-1")).toBeNull()
    expect(aoCadastroDaProspeccao(est("abordado", { optOut: true }), "x", "PAR-1")).toBeNull()
    const feito = aoCadastroDaProspeccao(est("abordado"), "x", "PAR-1")!
    expect(aoCadastroDaProspeccao(est("abordado", { historico: feito.historico }), "x", "PAR-1")).toBeNull()
  })
})

describe("cadastro novo em /parceiros", () => {
  it("telefone do prospecto: origem prospector, ligado ao prospecto, etapa cadastrou e respondeu no histórico", async () => {
    const r = await receberCadastro(formulario())
    expect(r.ok).toBe(true)
    expect(salvo()).toMatchObject({ origem: "prospector", prospectoId: 3384, status: "novo" })
    expect(mundo.prospectos[0].etapa).toBe("cadastrou")
    expect(hist().map(h => h.etapa)).toEqual(["respondeu", "cadastrou"])
    expect(hist().every(h => h.cadastroId === salvo().id)).toBe(true)
  })
  it("CNPJ do prospecto (telefone diferente) também liga e avança", async () => {
    mundo.prospectos = [prospecto({ telefone: "(21) 90000-0000", cnpj: CNPJ })]
    await receberCadastro(formulario())
    expect(salvo()).toMatchObject({ origem: "prospector", prospectoId: 3384 })
    expect(mundo.prospectos[0].etapa).toBe("cadastrou")
  })
  it("sem casamento e sem link: origem direto e o funil não muda", async () => {
    mundo.prospectos = [prospecto({ telefone: "(21) 90000-0000" })]
    await receberCadastro(formulario())
    expect(salvo().origem).toBe("direto"); expect(salvo().prospectoId).toBeUndefined()
    expect(mundo.prospectos[0].etapa).toBe("abordado")
  })
  it("só o link (?o=prospector&p=id): origem prospector e ligado, mas a etapa não anda sem telefone ou CNPJ conferindo", async () => {
    mundo.prospectos = [prospecto({ telefone: "(21) 90000-0000" })]
    await receberCadastro(formulario({ o: "prospector", p: "3384" }))
    expect(salvo()).toMatchObject({ origem: "prospector", prospectoId: 3384 })
    expect(mundo.prospectos[0].etapa).toBe("abordado")
  })
  it("prospecto em opt-out: o cadastro entra como prospector, mas a etapa não muda", async () => {
    mundo.prospectos = [prospecto({ opt_out: true, etapa: "descartado" })]
    await receberCadastro(formulario())
    expect(salvo().origem).toBe("prospector")
    expect(mundo.prospectos[0].etapa).toBe("descartado")
  })
})

describe("correção retroativa", () => {
  const cadastro = (id: string, extra: Partial<CadastroParceiro> = {}) => ({ id, em: "2026-11-26T10:31:00Z", status: "novo", nomeFantasia: "Gráfica Exemplo", whatsapp: "11988887777", documento: "", tipoDocumento: "cpf", servicos: [], ...extra }) as unknown as CadastroParceiro
  it("marca origem e etapa pelo telefone, sem apagar nem trocar nenhum outro dado", async () => {
    mundo.cfg = { cadastrosParceiros: [cadastro("PAR-A", { origem: "direto" }), cadastro("PAR-B", { whatsapp: "21900000000" })] }
    const r = await corrigirOrigemRetroativa()
    expect(r).toMatchObject({ examinados: 2, corrigidos: 1, etapasAvancadas: 1, simulado: false, ids: [{ cadastro: "PAR-A", prospecto: 3384 }] })
    const [a, b] = mundo.cfg.cadastrosParceiros as CadastroParceiro[]
    expect(a).toMatchObject({ id: "PAR-A", origem: "prospector", prospectoId: 3384, nomeFantasia: "Gráfica Exemplo", status: "novo" })
    expect(b.origem).toBeUndefined()
    expect(mundo.prospectos[0].etapa).toBe("cadastrou")
    expect(hist().map(h => h.etapa)).toEqual(["respondeu", "cadastrou"])
  })
  it("simular só conta; rodar de novo não duplica nada", async () => {
    mundo.cfg = { cadastrosParceiros: [cadastro("PAR-A")] }
    expect(await corrigirOrigemRetroativa({ simular: true })).toMatchObject({ corrigidos: 0, simulado: true, ids: [{ cadastro: "PAR-A", prospecto: 3384 }] })
    expect(mundo.prospectos[0].etapa).toBe("abordado"); expect((mundo.cfg.cadastrosParceiros as CadastroParceiro[])[0].origem).toBeUndefined()
    await corrigirOrigemRetroativa()
    const antes = hist().length
    const r2 = await corrigirOrigemRetroativa()
    expect(r2).toMatchObject({ corrigidos: 0, ids: [] })
    expect(hist()).toHaveLength(antes)
  })
  it("cadastro recusado ganha a origem, mas não move o funil", async () => {
    mundo.cfg = { cadastrosParceiros: [cadastro("PAR-A", { status: "recusado" })] }
    const r = await corrigirOrigemRetroativa()
    expect(r).toMatchObject({ corrigidos: 1, etapasAvancadas: 0 })
    expect(mundo.prospectos[0].etapa).toBe("abordado")
  })
})
