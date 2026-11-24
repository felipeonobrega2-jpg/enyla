import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  BASE_BARUERI, CNAES_PROSPECTO, PESOS_NOTA,
  MOTIVO_CADASTRO_APROVADO, MOTIVO_CADASTRO_RECEBIDO,
  aoCadastrarComCnpj, aplicarOptOut, cnaeDeInteresse, distanciaAteBarueri,
  notaDoProspect, podeTransicionar, registrarCadastroRecebido, servicosDosCnaes, transicionar, type EstadoFunil,
} from "@/app/lib/prospector"
import { MUNICIPIOS_SP } from "@/app/lib/municipiosSp"

const HOJE = "2026-11-24"
const base = {
  uf: "SP", situacao: "ATIVA", municipio: "Barueri", servicos: ["cartonagem"],
  abertura: "2010-01-01", porte: "EPP", hoje: HOJE,
}

const estado = (etapa: EstadoFunil["etapa"], optOut = false): EstadoFunil => ({ etapa, optOut, historico: [] })

describe("nota do prospecto", () => {
  it("os tetos somam 100 e os quatro serviços fortes enchem a fatia de serviço", () => {
    expect(PESOS_NOTA.distancia.max + PESOS_NOTA.servicosMax + PESOS_NOTA.tempoMax + PESOS_NOTA.porteMax).toBe(100)
    expect(PESOS_NOTA.pontosTempo.anos10).toBe(PESOS_NOTA.tempoMax)
    expect(PESOS_NOTA.pontosPorte.demais).toBe(PESOS_NOTA.porteMax)
    const s = PESOS_NOTA.pontosServico
    expect(s.cartonagem + s.corteVinco + s.colagem + s.offset).toBeGreaterThanOrEqual(PESOS_NOTA.servicosMax)
    expect(s.cartonagem).toBeGreaterThan(s.offset)
    expect(s.offset).toBeGreaterThan(s.digital)
    expect(s.digital).toBeGreaterThan(0)
    expect(s.acabamento).toBeGreaterThan(0)
    expect(s.hotStamping).toBeGreaterThan(0)
  })

  it("gráfica ativa em Barueri, cartonagem, 10 anos e EPP", () => {
    const n = notaDoProspect(base)
    expect(n.entra).toBe(true)
    expect(n.km).not.toBeNull()
    expect(n.km!).toBeLessThan(1)
    expect(n.partes).toEqual({ distancia: 40, servicos: 12, tempo: 15, porte: 8 })
    expect(n.nota).toBe(75)
  })

  it("os quatro serviços fortes travam em 35; digital a mais não aumenta", () => {
    const cheia = notaDoProspect({ ...base, servicos: ["cartonagem", "corteVinco", "colagem", "offset"] })
    const comResto = notaDoProspect({ ...base, servicos: ["cartonagem", "corte e vinco", "colagem", "offset", "digital", "hot stamping", "acabamento"] })
    expect(cheia.partes.servicos).toBe(35)
    expect(cheia.nota).toBe(98)
    expect(comResto.partes.servicos).toBe(35)
    expect(comResto.nota).toBe(98)
  })

  it("porte, idade e situação mudam a nota; fora de SP ou inativa zera", () => {
    expect(notaDoProspect({ ...base, porte: "MEI" }).partes.porte).toBe(2)
    expect(notaDoProspect({ ...base, porte: "01" }).partes.porte).toBe(5)
    expect(notaDoProspect({ ...base, porte: "05" }).partes.porte).toBe(10)
    expect(notaDoProspect({ ...base, porte: "" }).partes.porte).toBe(4)
    expect(notaDoProspect({ ...base, abertura: "2024-11-24" }).partes.tempo).toBe(8)
    expect(notaDoProspect({ ...base, abertura: "2025-11-24" }).partes.tempo).toBe(2)
    expect(notaDoProspect({ ...base, abertura: null }).partes.tempo).toBe(5)
    expect(notaDoProspect({ ...base, situacao: "02" }).nota).toBe(75)
    expect(notaDoProspect({ ...base, situacao: "BAIXADA" }).nota).toBe(0)
    expect(notaDoProspect({ ...base, situacao: "SUSPENSA" })).toMatchObject({ nota: 0, entra: false, motivo: "situação não ativa" })
    expect(notaDoProspect({ ...base, situacao: null }).nota).toBe(0)
    expect(notaDoProspect({ ...base, uf: "RJ" })).toMatchObject({ nota: 0, motivo: "fora de SP" })
    expect(notaDoProspect({ ...base, uf: "sp" }).nota).toBe(75)
  })

  it("quanto mais longe de Barueri, menor a fatia de frete; o interior de SP ainda entra", () => {
    const perfil = { ...base, municipio: "Barueri" }
    const barueri = notaDoProspect(perfil)
    const campinas = notaDoProspect({ ...perfil, municipio: "Campinas" })
    const rioPreto = notaDoProspect({ ...perfil, municipio: "São José do Rio Preto" })
    expect(barueri.partes.distancia).toBe(40)
    expect(campinas.partes.distancia).toBeGreaterThan(15)
    expect(campinas.partes.distancia).toBeLessThan(30)
    expect(rioPreto.partes.distancia).toBeLessThanOrEqual(10)
    expect(rioPreto.nota).toBeLessThan(campinas.nota)
    expect(campinas.nota).toBeLessThan(barueri.nota)
    expect(rioPreto.entra).toBe(true)
  })

  it("coordenada manda; sem localização em SP fica no piso, não zera", () => {
    const pelaCoord = notaDoProspect({
      ...base, municipio: "São José do Rio Preto", latitude: BASE_BARUERI.lat, longitude: BASE_BARUERI.lng,
    })
    expect(pelaCoord.partes.distancia).toBe(40)
    const semLugar = notaDoProspect({ ...base, municipio: "Nárnia", latitude: null, longitude: null })
    expect(semLugar.partes.distancia).toBe(8)
    expect(semLugar.entra).toBe(true)
    expect(semLugar.nota).toBe(8 + 12 + 15 + 8)
  })
})

describe("distância até Barueri", () => {
  it("a tabela cobre os 645 municípios e a ordem de distância faz sentido", () => {
    expect(MUNICIPIOS_SP).toHaveLength(645)
    expect(BASE_BARUERI.lat).toBeLessThan(0)
    const d = (municipio: string) => distanciaAteBarueri({ municipio })
    expect(d("Barueri")!).toBeLessThan(1)
    expect(d("Osasco")!).toBeLessThan(d("São Paulo")!)
    expect(d("São Paulo")!).toBeGreaterThan(20)
    expect(d("São Paulo")!).toBeLessThan(30)
    expect(d("sao paulo")).toBeCloseTo(d("São Paulo")!, 5)
    expect(d("São Paulo")!).toBeLessThan(d("Campinas")!)
    expect(d("Campinas")!).toBeGreaterThan(60)
    expect(d("Campinas")!).toBeLessThan(80)
    expect(d("Campinas")!).toBeLessThan(d("Ribeirão Preto")!)
    expect(d("Ribeirão Preto")!).toBeLessThan(d("São José do Rio Preto")!)
    expect(d("cidade que não existe")).toBeNull()
  })
})

describe("CNAE para serviço", () => {
  it("usa os códigos oficiais da CNAE 2.3 e o código antigo de outros usos", () => {
    expect(CNAES_PROSPECTO["1813001"].codigo).toBe("1813-0/01")
    expect(CNAES_PROSPECTO["1813099"].descricao).toMatch(/outros usos/i)
    expect(servicosDosCnaes("1813-0/01")).toEqual(["offset"])
    expect(servicosDosCnaes("1813001")).toEqual(["offset"])
    expect(servicosDosCnaes("1813-0/99")).toEqual(["offset"])
    expect(servicosDosCnaes("1813-0/02")).toEqual(["offset"])
    expect(cnaeDeInteresse("1821-1/00")).toBe(true)
    expect(servicosDosCnaes("1821-1/00")).toEqual([])
    expect(servicosDosCnaes("1822-9/01")).toEqual(["acabamento"])
    expect(servicosDosCnaes("1822-9/99")).toEqual(["acabamento"])
    expect(servicosDosCnaes("1731-1/00")).toEqual(["cartonagem"])
    expect(servicosDosCnaes("1732-0/00")).toEqual(["cartonagem"])
    expect(servicosDosCnaes("1733-8/00")).toEqual(["cartonagem"])
    expect(cnaeDeInteresse("1830-0/01")).toBe(false)
    expect(servicosDosCnaes("1813001", ["1732-0/00"])).toEqual(["offset", "cartonagem"])
  })
})

describe("funil", () => {
  it("a etapa só anda para frente, e pode pular até cadastrou", () => {
    expect(podeTransicionar("encontrado", "qualificado", false)).toBe(true)
    expect(transicionar(estado("qualificado"), "abordado", "2026-11-24T12:00:00Z")?.etapa).toBe("abordado")
    expect(transicionar(estado("abordado"), "abriu", "2026-11-24T12:00:00Z")?.etapa).toBe("abriu")
    expect(transicionar(estado("abriu"), "cadastrou", "2026-11-24T12:00:00Z")?.etapa).toBe("cadastrou")
    expect(transicionar(estado("encontrado"), "cadastrou", "2026-11-24T12:00:00Z")?.etapa).toBe("cadastrou")
    expect(transicionar(estado("qualificado"), "encontrado", "2026-11-24T12:00:00Z")).toBeNull()
    expect(transicionar(estado("cadastrou"), "abriu", "2026-11-24T12:00:00Z")).toBeNull()
    expect(transicionar(estado("qualificado"), "qualificado", "2026-11-24T12:00:00Z")).toBeNull()
  })

  it("descartado sai de qualquer etapa e não volta", () => {
    const fora = transicionar(estado("abordado"), "descartado", "2026-11-24T12:00:00Z", "sem fit")
    expect(fora?.etapa).toBe("descartado")
    expect(fora?.historico).toEqual([{ etapa: "descartado", em: "2026-11-24T12:00:00Z", motivo: "sem fit" }])
    expect(transicionar(fora!, "qualificado", "2026-11-25T12:00:00Z")).toBeNull()
    expect(aoCadastrarComCnpj(fora!, "2026-11-25T12:00:00Z")).toBeNull()
  })

  it("opt-out marca descartado e nunca mais volta à fila", () => {
    const em = "2026-11-24T15:00:00Z"
    const opt = aplicarOptOut(estado("qualificado"), em)
    expect(opt).toMatchObject({ etapa: "descartado", optOut: true, optOutEm: em })
    expect(opt.historico).toEqual([{ etapa: "descartado", em, motivo: "não quero receber" }])
    expect(transicionar(opt, "cadastrou", "2026-11-25T12:00:00Z")).toBeNull()
    expect(aoCadastrarComCnpj(opt, "2026-11-25T12:00:00Z")).toBeNull()
    expect(aplicarOptOut(opt, "2026-11-26T12:00:00Z").historico).toHaveLength(1)
  })

  it("o cadastro aprovado com o mesmo CNPJ avança para cadastrou e guarda a data e o id", () => {
    const em = "2026-11-24T18:00:00Z"
    const foi = aoCadastrarComCnpj(estado("qualificado"), em, "PAR-1")
    expect(foi?.etapa).toBe("cadastrou")
    expect(foi?.historico).toEqual([{ etapa: "cadastrou", em, motivo: MOTIVO_CADASTRO_APROVADO, cadastroId: "PAR-1" }])
    expect(aoCadastrarComCnpj(foi!, "2026-11-25T12:00:00Z")).toBeNull()
  })

  it("o cadastro recebido só entra no histórico, sem mudar a etapa", () => {
    const em = "2026-11-24T18:00:00Z"
    const r = registrarCadastroRecebido(estado("abordado"), em, "PAR-1")
    expect(r?.etapa).toBe("abordado")
    expect(r?.historico).toEqual([{ etapa: "abordado", em, motivo: MOTIVO_CADASTRO_RECEBIDO, cadastroId: "PAR-1" }])
    expect(MOTIVO_CADASTRO_RECEBIDO).toBe("cadastro recebido (aguardando aprovação do Felipe)")
    expect(registrarCadastroRecebido(r!, "2026-11-25T12:00:00Z", "PAR-1")).toBeNull()
    expect(registrarCadastroRecebido(estado("descartado"), em, "PAR-1")).toBeNull()
    expect(registrarCadastroRecebido(aplicarOptOut(estado("qualificado"), em), em, "PAR-1")).toBeNull()
  })
})

describe("migração", () => {
  const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261124_prospectos_parceiros.sql"), "utf8")
  const baixo = sql.toLowerCase()

  it("só cria a tabela nova, com os campos do prospecto", () => {
    expect(baixo).toContain("create table if not exists prospectos_parceiros")
    expect(baixo).not.toMatch(/\bdrop\b/)
    expect(baixo).not.toMatch(/\bdelete\b/)
    expect(baixo).not.toMatch(/\btruncate\b/)
    expect(baixo).not.toMatch(/\bupdate\b/)
    for (const coluna of ["cnpj", "razao_social", "nome_fantasia", "cnae_principal", "cnaes_secundarios", "servicos", "situacao", "abertura", "porte", "municipio", "uf", "cep", "endereco", "latitude", "longitude", "email", "telefone", "fonte", "coletado_em", "nota", "etapa", "historico_etapas", "opt_out", "opt_out_em"]) {
      expect(baixo).toContain(coluna)
    }
    for (const etapa of ["encontrado", "qualificado", "abordado", "abriu", "cadastrou", "descartado"]) {
      expect(baixo).toContain(`'${etapa}'`)
    }
    const alters = [...baixo.matchAll(/alter table\s+(\w+)/g)].map(m => m[1])
    expect(alters).toEqual(["prospectos_parceiros"])
  })
})
