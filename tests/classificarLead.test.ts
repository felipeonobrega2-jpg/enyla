import { describe, it, expect } from "vitest"
import { validarClassificacao, etiquetasDaClassificacao, numerosDo, temSinalDeVolume, type Classificacao } from "../app/lib/classificarLead"

const cl = (x: Partial<Classificacao>): Classificacao => ({ perfil: "indefinido", quantidade_total: null, recorrente: false, evidencia: "", motivo: "m", fornecedor: false, ...x })

describe("classificação do lead com prova", () => {
  it("números do texto", () => {
    expect(numerosDo("1.000 de cada")).toEqual([1000])
    expect(numerosDo("5 mil caixas")).toEqual([5000])
    expect(numerosDo("Tenho 13 FRAGÂNCIAS")).toEqual([13])
  })
  it("WR: 13 fragrâncias × 1.000 é ICP", () => {
    const c = validarClassificacao(cl({ perfil: "icp", quantidade_total: 13000, evidencia: "Tenho 13 FRAGÂNCIAS / 1000 de cada" }), ["Tenho 13 FRAGÂNCIAS", "1000 de cada"])
    expect(c.perfil).toBe("icp")
  })
  it("MQL sem o cliente dizer volume vira indefinido", () => {
    expect(validarClassificacao(cl({ perfil: "medio", quantidade_total: 2000, evidencia: "" }), ["quero caixas"]).perfil).toBe("indefinido")
    // número da prova não está no que o cliente escreveu (veio do Felipe)
    expect(validarClassificacao(cl({ perfil: "medio", quantidade_total: 2000, evidencia: "2000 unidades" }), ["quero 200"]).perfil).toBe("indefinido")
  })
  it("o número manda: <1.000 é pequeno, 1.000–4.999 médio, 5.000+ ICP", () => {
    expect(validarClassificacao(cl({ perfil: "icp", quantidade_total: 500, evidencia: "500" }), ["500"]).perfil).toBe("pequeno")
    expect(validarClassificacao(cl({ perfil: "icp", quantidade_total: 2000, evidencia: "2000" }), ["2000"]).perfil).toBe("medio")
    expect(validarClassificacao(cl({ perfil: "medio", quantidade_total: 8000, evidencia: "8 mil" }), ["8 mil"]).perfil).toBe("icp")
    expect(validarClassificacao(cl({ perfil: "pequeno", quantidade_total: 3000, evidencia: "3000" }), ["3000"]).perfil).toBe("medio")
    expect(validarClassificacao(cl({ perfil: "medio", quantidade_total: 1500, recorrente: true, evidencia: "1500 todo mês" }), ["1500 todo mês"]).perfil).toBe("icp")
  })
  it("etiquetas: vira MQL e sai do follow-up; MQL sem prova sai do MQL; as suas ficam", () => {
    expect(etiquetasDaClassificacao(["F2", "Cliente VIP"], null, "icp", { digital: true })).toEqual({ etiquetas: ["Cliente VIP", "MQL", "ICP"], status: "mql" })
    expect(etiquetasDaClassificacao(["MQL", "Lead médio", "F1"], "mql", "indefinido", { digital: true })).toEqual({ etiquetas: ["F1"], status: null })
    expect(etiquetasDaClassificacao(["MQL", "ICP"], "mql", "pequeno", { digital: true })).toEqual({ etiquetas: ["Digital", "Lead pequeno"], status: null })
    expect(etiquetasDaClassificacao(["F1"], null, "indefinido", { digital: true })).toEqual({ etiquetas: ["F1"], status: undefined })
    expect(etiquetasDaClassificacao(["MQL"], "mql", "nao_lead", { digital: true, fornecedor: true })).toEqual({ etiquetas: ["Fornecedora"], status: null })
  })
  it("só chama a IA quando o lead fala de volume", () => {
    expect(temSinalDeVolume(["??", "boa noite"])).toBe(false)
    expect(temSinalDeVolume(["1000 de cada"])).toBe(true)
    expect(temSinalDeVolume(["quero umas caixinhas"])).toBe(true)
  })
})
