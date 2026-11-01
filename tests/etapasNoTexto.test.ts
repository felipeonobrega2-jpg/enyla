import { describe, it, expect } from "vitest"
import { etapasNoTexto } from "@/app/lib/calibragem"

describe("etapas citadas no nome do lançamento", () => {
  it("acusa mistura", () => {
    expect(etapasNoTexto("Impressão + Papel")).toEqual(["papel", "impressao"])
    expect(etapasNoTexto("Verniz e corte e vinco")).toEqual(["acabamento", "corteVinco"])
  })
  it("não acusa à toa", () => {
    expect(etapasNoTexto("Faca de corte")).toEqual(["faca"])
    expect(etapasNoTexto("Transporte corte e vinco")).toEqual(["frete"])
    expect(etapasNoTexto("Impressão 500 folhas")).toEqual(["impressao"])
    expect(etapasNoTexto("Papel")).toEqual(["papel"])
  })
})
