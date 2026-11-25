import { describe, it, expect, vi } from "vitest"

vi.mock("@/app/lib/supabase", () => ({ supabase: {} }))
vi.mock("@/app/lib/notificar", () => ({ notificar: vi.fn() }))
vi.mock("@/app/lib/metaAdsLeitura", () => ({ resolverTokenConta: vi.fn() }))

import { detectarParadas, selecionarAvisos, agoraBrasilia, type CampanhaDia } from "@/app/lib/metaCampanhaParada"

const HOJE = "2026-11-24"
const camp = (c: Partial<CampanhaDia>): CampanhaDia => ({ id: "1", nome: "TESTAR NOVAMENTE", effectiveStatus: "ACTIVE", gastoPorDia: {}, ...c })
const gastando = { "2026-11-21": 20, "2026-11-22": 20, "2026-11-23": 20 }

describe("detectarParadas", () => {
  it("campanha gastando não avisa", () => {
    expect(detectarParadas([camp({ gastoPorDia: { ...gastando, [HOJE]: 8 } })], HOJE, 15)).toEqual([])
  })
  it("parou hoje à tarde: avisa com último dia de gasto", () => {
    const r = detectarParadas([camp({ gastoPorDia: gastando })], HOJE, 14)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: "1", nome: "TESTAR NOVAMENTE", ultimoGasto: "2026-11-23" })
  })
  it("hoje R$ 0 antes das 12h não avisa", () => {
    expect(detectarParadas([camp({ gastoPorDia: gastando })], HOJE, 11)).toEqual([])
  })
  it("ontem R$ 0 avisa mesmo de manhã", () => {
    const r = detectarParadas([camp({ gastoPorDia: { "2026-11-20": 20, "2026-11-21": 20, "2026-11-22": 20 } })], HOJE, 8)
    expect(r).toHaveLength(1)
    expect(r[0].ultimoGasto).toBe("2026-11-22")
  })
  it("pausada de propósito não avisa", () => {
    expect(detectarParadas([camp({ effectiveStatus: "PAUSED", gastoPorDia: gastando })], HOJE, 15)).toEqual([])
  })
  it("média até R$ 5/dia não avisa", () => {
    expect(detectarParadas([camp({ gastoPorDia: { "2026-11-21": 5, "2026-11-22": 5, "2026-11-23": 5 } })], HOJE, 15)).toEqual([])
  })
  it("motivo vem de issues_info e anúncio reprovado", () => {
    const r = detectarParadas([camp({ gastoPorDia: gastando, issues: ["Problema no anúncio"], reprovados: 2 })], HOJE, 15)
    expect(r[0].motivo).toBe("Problema no anúncio; 2 anúncios reprovados")
  })
})

describe("avisos", () => {
  it("conta sem saldo: só o aviso de saldo (nenhum aviso de campanha)", () => {
    const p = detectarParadas([camp({ gastoPorDia: gastando })], HOJE, 15, true)
    expect(p).toHaveLength(1)
    expect(p[0].semSaldo).toBe(true)
    expect(selecionarAvisos(p, {})).toEqual([])
  })
  it("dedupe de 12 h por campanha", () => {
    const p = detectarParadas([camp({ gastoPorDia: gastando })], HOJE, 15)
    const agora = new Date("2026-11-24T18:00:00Z").getTime()
    expect(selecionarAvisos(p, { "1": "2026-11-24T10:00:00Z" }, agora)).toEqual([])
    expect(selecionarAvisos(p, { "1": "2026-11-24T05:00:00Z" }, agora)).toHaveLength(1)
    expect(selecionarAvisos(p, {}, agora)).toHaveLength(1)
  })
})

describe("agoraBrasilia", () => {
  it("converte para o horário de Brasília", () => {
    expect(agoraBrasilia(new Date("2026-11-24T02:30:00Z"))).toEqual({ hoje: "2026-11-23", hora: 23 })
  })
})
