// Filtro de público do Prospector: nome fora do ramo, encadernação sozinha e CNAE só secundário (regras puras + importador).
import { describe, it, expect } from "vitest"
import { CNAES_PROSPECTO } from "@/app/lib/prospector"
import {
  NOTA_MINIMA_SO_SECUNDARIO, TERMOS_FORA_DO_RAMO, motivoNaoQualifica, notaMinimaDe, soEncadernacao, termoForaDoRamo,
} from "@/app/lib/prospectorEnvio"
import { candidatoDaLinha, decidirGravacao, montarProspecto, type LinhaProspecto } from "@/app/lib/prospectorImportador"

const lista = (id: string) => id in CNAES_PROSPECTO

describe("CNAES_PROSPECTO", () => {
  it("mantém pré-impressão e acabamentos", () => {
    for (const id of ["1821100", "1822901", "1822999"]) expect(lista(id)).toBe(true)
  })
})

describe("nome fora do ramo", () => {
  it("acha o termo na razão social ou no fantasia, sem acento e sem maiúsculas", () => {
    expect(termoForaDoRamo("Rei dos INFLÁVEIS Ltda", null)).toBe("inflaveis")
    expect(termoForaDoRamo("Fulano ME", "Balão Mágico")).toBe("balao")
    expect(termoForaDoRamo("Casa de FESTAS", null)).toBe("festa")
    expect(termoForaDoRamo("Brinquedos Alfa", null)).toBe("brinquedo")
  })
  it("não pega gráfica normal e a lista é editável (array simples)", () => {
    expect(termoForaDoRamo("Gráfica e Embalagens Alfa Ltda", "Alfa Print")).toBeNull()
    expect(termoForaDoRamo(null, null)).toBeNull()
    expect(Array.isArray(TERMOS_FORA_DO_RAMO)).toBe(true)
  })
})

describe("encadernação sozinha", () => {
  it("1822-9/01 como único CNAE da lista é cortado, em qualquer posição", () => {
    expect(soEncadernacao("1822901", [], lista)).toBe(true)
    expect(soEncadernacao("4711301", ["1822901", "5611201"], lista)).toBe(true)
  })
  it("com outro CNAE da lista, não é cortado", () => {
    expect(soEncadernacao("1822901", ["1822999"], lista)).toBe(false)
    expect(soEncadernacao("1813001", ["1822901"], lista)).toBe(false)
    expect(soEncadernacao("1821100", [], lista)).toBe(false)
    expect(soEncadernacao("1822999", [], lista)).toBe(false)
    expect(soEncadernacao("4711301", [], lista)).toBe(false)
  })
})

describe("nota mínima de quem só tem CNAE secundário", () => {
  it("padrão 2; principal na lista segue o mínimo configurado", () => {
    expect(NOTA_MINIMA_SO_SECUNDARIO).toBe(2)
    expect(notaMinimaDe("1813001", 1, lista)).toBe(1)
    expect(notaMinimaDe("4711301", 1, lista)).toBe(2)
    expect(notaMinimaDe("4711301", 40, lista)).toBe(40)
    expect(notaMinimaDe(null, 1, lista)).toBe(1)
  })
  it("motivoNaoQualifica junta as regras", () => {
    const base = { razao_social: "Gráfica A", nome_fantasia: null, cnae_principal: "4711301", cnaes_secundarios: ["1813001"] }
    expect(motivoNaoQualifica({ ...base, nota: 1 }, 1, lista)).toMatch(/secundário/)
    expect(motivoNaoQualifica({ ...base, nota: 2 }, 1, lista)).toBeNull()
    expect(motivoNaoQualifica({ ...base, cnae_principal: "1813001", nota: 1 }, 1, lista)).toBeNull()
    expect(motivoNaoQualifica({ ...base, razao_social: "Festa Viva", nota: 90 }, 1, lista)).toMatch(/fora do ramo/)
    expect(motivoNaoQualifica({ ...base, cnae_principal: "1822901", cnaes_secundarios: [], nota: 90 }, 1, lista)).toMatch(/encadernação/)
  })
})

function linha(cnae: string, sec = "") {
  const f = Array(30).fill("")
  Object.assign(f, { 0: "12345678", 1: "0001", 2: "95", 4: "X", 5: "02", 10: "20100315", 11: cnae, 12: sec, 19: "SP", 21: "11", 22: "40001234", 27: "A@X.COM" })
  return f.slice(0, 28).map(v => `"${v}"`).join(";")
}

describe("importador", () => {
  it("não importa quem só tem encadernação; importa pré-impressão e acabamento", () => {
    expect(candidatoDaLinha(linha("1822901"))).toBeNull()
    expect(candidatoDaLinha(linha("4711301", "1822901"))).toBeNull()
    expect(candidatoDaLinha(linha("1821100"))).not.toBeNull()
    expect(candidatoDaLinha(linha("1822999"))).not.toBeNull()
    expect(candidatoDaLinha(linha("4711301", "1822901,1822999"))).not.toBeNull()
  })
  it("recusa a gravação nova de nome fora do ramo, mas atualiza quem já existe (nada é apagado)", () => {
    const agora = new Date("2026-11-24T12:00:00Z")
    const c = candidatoDaLinha(linha("1813001"))!
    const l = montarProspecto(c, { razao_social: "Mundo dos Infláveis Ltda", descricao_situacao_cadastral: "ATIVA", uf: "SP", municipio: "BARUERI" }, agora) as LinhaProspecto
    expect(decidirGravacao(null, l, agora)).toEqual({ tipo: "ignorar", motivo: "fora do ramo" })
    expect(decidirGravacao({ id: 1, etapa: "encontrado", opt_out: false }, l, agora).tipo).toBe("atualizar")
  })
})
