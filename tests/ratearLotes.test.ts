import { describe, it, expect } from "vitest"
import { ratearValor } from "../app/lib/ratearLotes"

describe("ratearValor", () => {
  it("cada: repete o valor em todos os lotes", () => {
    expect(ratearValor(194, [1000, 4000], "cada")).toEqual([194, 194])
  })
  it("quantidade: 1.000 un e 4.000 un dividem 1 para 4", () => {
    expect(ratearValor(970, [1000, 4000], "quantidade")).toEqual([194, 776])
  })
  it("igual: divide por igual, soma exata ao centavo", () => {
    const r = ratearValor(100, [1, 1, 1], "igual")
    expect(r).toEqual([33.34, 33.33, 33.33])
    expect(Math.round(r.reduce((s, x) => s + x, 0) * 100)).toBe(10000)
  })
  it("quantidade sem quantidade válida cai para igual", () => {
    expect(ratearValor(10, [0, 5], "quantidade")).toEqual([5, 5])
  })
  it("lista vazia", () => { expect(ratearValor(10, [], "igual")).toEqual([]) })
})
