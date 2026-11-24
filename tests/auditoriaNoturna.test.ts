import { describe, it, expect, vi, beforeEach } from "vitest"

// Config simulada: mudarConfig aplica a função sobre ela (sem concorrência)
const cfg: Record<string, unknown> = {}
vi.mock("../app/lib/configAtomica", () => ({
  lerConfigLinha: async () => ({ data: { data: cfg } }),
  mudarConfig: async (fn: (d: Record<string, unknown>) => Record<string, unknown> | null) => { const r = fn(cfg); if (r) Object.assign(cfg, r) },
}))
vi.mock("../app/lib/supabase", () => ({ supabase: {} }))
vi.mock("../app/lib/auditoria", () => ({ auditar: () => ({}) }))

// Horário de Brasília = UTC-3
const sp = (dia: string, h: number) => new Date(new Date(`${dia}T00:00:00Z`).getTime() + (h + 3) * 3_600_000)

async function carregar() {
  const m = await import("../app/lib/auditoriaServidor")
  // rodarAuditoria é interna ao módulo: observa pela gravação do resumo via auditar mockado
  return m
}

describe("auditoria da madrugada", () => {
  beforeEach(() => { for (const k of Object.keys(cfg)) delete cfg[k] })

  it("rodada pela tela às 22h não impede a rodada das 3h", async () => {
    const { talvezAuditar } = await carregar()
    cfg.auditoriaDados = { em: sp("2026-11-23", 22).toISOString() }   // a tela gravou isto
    const r = await talvezAuditar(cfg, sp("2026-11-24", 3))
    expect(typeof r === "string" ? r : "rodou").toMatch(/rodou|erro/)
    expect(cfg.auditoriaComecouEm).toBe(sp("2026-11-24", 3).toISOString())
  })

  it("duas voltas do vigia na mesma noite rodam uma vez só", async () => {
    const { talvezAuditar } = await carregar()
    await talvezAuditar(cfg, sp("2026-11-24", 2))
    const antes = cfg.auditoriaComecouEm
    const r2 = await talvezAuditar(cfg, sp("2026-11-24", 4))
    expect(r2).toBe("já rodou esta noite")
    expect(cfg.auditoriaComecouEm).toBe(antes)
  })

  it("na noite seguinte roda de novo", async () => {
    const { talvezAuditar } = await carregar()
    await talvezAuditar(cfg, sp("2026-11-24", 5))
    await talvezAuditar(cfg, sp("2026-11-25", 2))
    expect(cfg.auditoriaComecouEm).toBe(sp("2026-11-25", 2).toISOString())
  })

  it("fora da janela não roda e devolve o motivo", async () => {
    const { talvezAuditar } = await carregar()
    for (const h of [1, 6, 14, 22]) expect(await talvezAuditar(cfg, sp("2026-11-24", h))).toMatch(/fora da janela/)
    expect(cfg.auditoriaComecouEm).toBeUndefined()
  })

  it("falha da rodada vira \"erro: ...\"", async () => {
    const { talvezAuditar } = await carregar()
    // sem tabelas no supabase simulado, a varredura falha
    const r = await talvezAuditar(cfg, sp("2026-11-24", 3))
    expect(r).toMatch(/^erro: /)
  })
})
