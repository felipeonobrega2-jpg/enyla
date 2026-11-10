import { describe, it, expect } from "vitest"
import { calcular } from "@/app/calculos"
import { chaveCavidades } from "@/app/lib/producao"
import { config, FORM } from "./fixtures"

const cfg = config()
const form = { ...FORM, quantidades: [1000] }

describe("cavidades digitadas no orçamento", () => {
  const base = calcular(form, cfg)!.rotas![0].melhor
  const chave = chaveCavidades(base.impressorId, base.formatoId, base.divisao)
  const rota = { impressorId: base.impressorId, formatoId: base.formatoId, divisao: base.divisao }

  it("vale o número digitado (para menos): mais folhas e marca o que o motor calculou", () => {
    const menos = Math.max(1, base.passadas[0].cavidades - 1)
    const r = calcular({ ...form, rota: { ...rota, cavidades: { [chave]: [menos] } } }, cfg)!.rotas![0].melhor
    expect(r.passadas[0].cavidades).toBe(menos)
    if (menos !== base.passadas[0].cavidades) {
      expect(r.passadas[0].cavidadesAuto).toBe(base.passadas[0].cavidades)
      expect(r.folhasImpressas).toBeGreaterThan(base.folhasImpressas)
    }
  })
  it("para mais também: menos folhas", () => {
    const mais = base.passadas[0].cavidades + 2
    const r = calcular({ ...form, rota: { ...rota, cavidades: { [chave]: [mais] } } }, cfg)!.rotas![0].melhor
    expect(r.passadas[0].cavidades).toBe(mais)
    expect(r.folhasImpressas).toBeLessThan(base.folhasImpressas)
  })
  it("só vale para a rota editada", () => {
    const r = calcular({ ...form, rota: { cavidades: { "outro|papel|1": [1] } } }, cfg)!.rotas![0].melhor
    expect(r.passadas[0].cavidades).toBe(base.passadas[0].cavidades)
    expect(r.passadas[0].cavidadesAuto).toBeUndefined()
  })
})
