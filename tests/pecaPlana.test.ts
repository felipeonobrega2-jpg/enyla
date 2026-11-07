import { describe, it, expect } from "vitest"
import { calcular } from "@/app/calculos"
import { config, FORM } from "./fixtures"

const cfg = config()
const fita = { ...FORM, frente: 0, alturaBox: 0, lateral: 0, comFaca: true, valorFaca: 500, quantidades: [1000], pecaPlana: { nome: "Fita personalizada", largura: 2, comprimento: 30, corte: "guilhotina" as const } }

describe("peça plana (fita)", () => {
  it("calcula sem caixa: refile na guilhotina, sem faca e sem colagem", () => {
    const c = calcular(fita, cfg)!
    expect(c).not.toBeNull()
    expect(c.dieline.largura).toBe(20)
    expect(c.dieline.altura).toBe(300)
    const r = c.rotas![0].melhor
    expect(r.itens.some(i => i.etapa === "faca")).toBe(false)
    expect(r.itens.some(i => i.etapa === "colagem")).toBe(false)
    expect(r.itens.find(i => i.etapa === "corteVinco")!.descricao).toMatch(/Refile/)
  })
  it("com faca: corte e vinco normal e faca", () => {
    const r = calcular({ ...fita, pecaPlana: { ...fita.pecaPlana, corte: "faca" } }, cfg)!.rotas![0].melhor
    expect(r.itens.some(i => i.etapa === "faca")).toBe(true)
    expect(r.itens.some(i => i.etapa === "colagem")).toBe(false)
  })
  it("fita fina encaixa muitas por folha", () => {
    const c = calcular(fita, cfg)!
    expect(c.rotas![0].melhor.pecasPorFolhaPapel).toBeGreaterThan(20)
  })
})
