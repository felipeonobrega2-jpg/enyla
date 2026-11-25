import { describe, it, expect } from "vitest"
import { prazoDoPedido, prazoPadraoDias, validarGravarDigital, aplicarGravacaoDigital } from "../app/lib/digitalPrazo"
import { somarDiasUteis } from "../app/lib/diasUteis"

describe("prazoDoPedido", () => {
  const aprovada = { situacaoArte: "aprovada" as const, arteAprovadaEm: "2026-03-10T14:00:00.000Z" }
  it("config vazia → a confirmar, mesmo com arte aprovada", () => {
    expect(prazoDoPedido(aprovada, null)).toMatchObject({ prazo: null, texto: "a confirmar", origem: "a_confirmar" })
    expect(prazoPadraoDias(undefined)).toBeNull(); expect(prazoPadraoDias({ prazoPadraoDiasUteis: "" })).toBeNull(); expect(prazoPadraoDias({ prazoPadraoDiasUteis: 0 })).toBeNull()
    expect(prazoPadraoDias({ prazoPadraoDiasUteis: 7 })).toBe(7)
  })
  it("config preenchida + arte aprovada → aprovação + dias úteis (também prova autorizada)", () => {
    const esperado = somarDiasUteis("2026-03-10", 7)
    expect(prazoDoPedido(aprovada, 7)).toMatchObject({ prazo: esperado, origem: "calculado" })
    expect(prazoDoPedido({ ...aprovada, situacaoArte: "prova autorizada" }, 7).prazo).toBe(esperado)
  })
  it("arte não aprovada → a confirmar", () => {
    for (const s of ["sem arte", "enviada", "ajustes pedidos", undefined] as const) expect(prazoDoPedido({ ...aprovada, situacaoArte: s }, 7).texto).toBe("a confirmar")
  })
  it("situação marcada à mão sem arteAprovadaEm usa o dia da gravação", () => {
    const g = [{ por: "COO", em: "2026-03-12T10:00:00-03:00", motivo: "x", situacaoArte: "aprovada" as const }]
    expect(prazoDoPedido({ situacaoArte: "aprovada", gravacoesDigital: g }, 3).prazo).toBe(somarDiasUteis("2026-03-12", 3))
    expect(prazoDoPedido({ situacaoArte: "aprovada" }, 3).texto).toBe("a confirmar")
  })
  it("prazoEntrega gravado na mão prevalece (até sem config ou sem aprovação)", () => {
    expect(prazoDoPedido({ ...aprovada, prazoEntrega: "2026-04-01" }, 7)).toMatchObject({ prazo: "2026-04-01", origem: "gravado" })
    expect(prazoDoPedido({ prazoEntrega: "2026-04-01" }, null).prazo).toBe("2026-04-01")
    expect(prazoDoPedido({ prazoEntrega: "lixo" }, null).texto).toBe("a confirmar")
  })
})

describe("validar e aplicar gravar_digital", () => {
  it("exige id DIG, motivo (até 300), ao menos um campo, valores válidos", () => {
    expect(validarGravarDigital({ id: "ORC-1", situacaoArte: "aprovada", motivo: "x" })).toHaveProperty("erro")
    expect(validarGravarDigital({ id: "DIG-0001", situacaoArte: "aprovada" })).toHaveProperty("erro")
    expect(validarGravarDigital({ id: "DIG-0001", situacaoArte: "aprovada", motivo: "x".repeat(301) })).toHaveProperty("erro")
    expect(validarGravarDigital({ id: "DIG-0001", motivo: "x" })).toHaveProperty("erro")
    expect(validarGravarDigital({ id: "DIG-0001", situacaoArte: "ok", motivo: "x" })).toHaveProperty("erro")
    expect(validarGravarDigital({ id: "DIG-0001", prazoEntrega: "2026-02-30", motivo: "x" })).toHaveProperty("erro")
    expect(validarGravarDigital({ id: "DIG-0001", prazoEntrega: "", motivo: " ok " })).toEqual({ id: "DIG-0001", prazoEntrega: "", motivo: "ok" })
  })
  it("grava só os dois campos e registra quem, quando (Brasília) e motivo", () => {
    const p = { id: "DIG-0001", status: "arte", total: 10, gravacoesDigital: undefined }
    const n = aplicarGravacaoDigital(p, { situacaoArte: "aprovada", motivo: "cliente aprovou" }, "COO", new Date("2026-03-18T01:30:00Z"))
    expect(n).toMatchObject({ status: "arte", total: 10, situacaoArte: "aprovada" })
    expect(n).not.toHaveProperty("prazoEntrega")
    expect(n.gravacoesDigital).toEqual([{ por: "COO", em: "2026-03-17T22:30:00-03:00", motivo: "cliente aprovou", situacaoArte: "aprovada" }])
  })
})
