import { describe, it, expect, vi } from "vitest"

// Banco simulado com a mesma semântica do PostgREST: update com filtro na versão só grava se a versão bate
const banco: { data: Record<string, unknown> | null } = { data: { a: 1 } }
const atraso = () => new Promise(r => setTimeout(r, Math.random() * 5))
vi.mock("../app/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => { await atraso(); return { data: banco.data ? { data: structuredClone(banco.data) } : null, error: null } } }) }),
      insert: async (row: { data: Record<string, unknown> }) => { banco.data = row.data; return { error: null } },
      update: (row: { data: Record<string, unknown> }) => ({
        eq: () => {
          const gravar = (cond: (d: Record<string, unknown>) => boolean) => ({
            select: async () => { await atraso(); if (banco.data && cond(banco.data)) { banco.data = structuredClone(row.data); return { data: [{ id: 1 }], error: null } } return { data: [], error: null } },
          })
          return {
            is: () => gravar(d => d._v === undefined || d._v === null),
            eq: (_c: string, v: string) => gravar(d => String(d._v) === v),
          }
        },
      }),
    }),
  },
}))

describe("gravação segura da configuração", () => {
  it("30 gravações ao mesmo tempo: nenhuma se perde e o resto da configuração fica", async () => {
    const { mudarConfig } = await import("../app/lib/configAtomica")
    await Promise.all(Array.from({ length: 30 }, (_, i) =>
      mudarConfig((d: Record<string, unknown>) => ({ lista: [...((d.lista as number[]) ?? []), i] }), 200)))
    expect((banco.data!.lista as number[]).sort((x, y) => x - y)).toEqual(Array.from({ length: 30 }, (_, i) => i))
    expect(banco.data!.a).toBe(1)
    expect(banco.data!._v).toBe(30)
  })
  it("campos diferentes gravados juntos (registro do agente e conferência do Pix) ficam os dois", async () => {
    const { mudarConfig, gravarCampos } = await import("../app/lib/configAtomica")
    await Promise.all([
      mudarConfig((d: Record<string, unknown>) => ({ agenteLog: [{ id: "x" }, ...((d.agenteLog as unknown[]) ?? [])] })),
      gravarCampos({ digitalConferidoEm: "agora" }),
    ])
    expect(banco.data!.agenteLog).toEqual([{ id: "x" }])
    expect(banco.data!.digitalConferidoEm).toBe("agora")
  })
  it("nada a mudar (null): não grava", async () => {
    const { mudarConfig } = await import("../app/lib/configAtomica")
    const antes = banco.data!._v
    await mudarConfig(() => null)
    expect(banco.data!._v).toBe(antes)
  })
})
