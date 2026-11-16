import { it, expect } from "vitest"
import { calcular } from "@/app/calculos"
import { config, FORM } from "./fixtures"
it("faca com qualquer número de cavidades", () => {
  const base = calcular({ ...FORM, comFaca: true, quantidades: [2000] }, config())!.rotas![0].melhor
  const cheia = Math.max(...base.passadas.map(p => p.cavidades))
  for (let k = cheia; k >= 1; k--) {
    const m = calcular({ ...FORM, comFaca: true, quantidades: [2000], rota: { facaCavidades: k } }, config())!.rotas![0].melhor
    expect(m.facaCavidades).toBe(k)
  }
})
