// Empate de `ts` entre duas mensagens do lead (25/11, Igor Maia): vigia, Atendente e retomada veem a mesma "última".
import { describe, it, expect, vi, beforeEach } from "vitest"

type Linha = Record<string, unknown>
const mundo = vi.hoisted(() => ({ mensagens: [] as Linha[], cfg: { vigiaTentouV3: ["A1", "B2"] } as Record<string, unknown> }))

vi.mock("@/app/lib/evolution", () => ({ evo: vi.fn() }))
vi.mock("@/app/lib/atendenteServidor", () => ({ atender: vi.fn(), lerConfigAtendente: vi.fn(async () => ({ agenteAuto: { ligado: true } })) }))
vi.mock("@/app/lib/registroAgente", () => ({
  lerRegistros: vi.fn(async () => null), gravarRegistro: vi.fn(), lerIdsAgente: vi.fn(async () => null), guardarIdAgente: vi.fn(),
  reservarTratada: vi.fn(async () => true), liberarTratada: vi.fn(), temTabelas: vi.fn(async () => true),
}))
vi.mock("@/app/lib/configAtomica", () => ({
  lerConfigLinha: vi.fn(async () => ({ data: { data: mundo.cfg } })),
  mudarConfig: vi.fn(async (f: (d: Record<string, unknown>) => Record<string, unknown> | null) => { Object.assign(mundo.cfg, f(mundo.cfg) ?? {}) }),
}))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: () => {
      const filtros: ((r: Linha) => boolean)[] = []
      const ordens: { c: string; asc: boolean }[] = []
      let max = Infinity
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (c: string, v: unknown) => { filtros.push(r => r[c] === v); return q }
      q.order = (c: string, o?: { ascending?: boolean }) => { ordens.push({ c, asc: o?.ascending !== false }); return q }
      q.limit = (n: number) => { max = n; return q }
      // Sem o desempate pedido, o empate sai na ordem em que o banco quiser (aqui: a de gravação)
      const achar = () => mundo.mensagens.filter(r => filtros.every(f => f(r))).sort((a, b) => {
        for (const { c, asc } of ordens) { const x = String(a[c]), y = String(b[c]); if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1) }
        return 0
      }).slice(0, max)
      q.maybeSingle = async () => ({ data: achar()[0] ?? null, error: null })
      q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: structuredClone(achar()), error: null }).then(ok, ko)
      return q
    },
  },
}))

const TS = "2026-11-25T16:53:25.000Z"
const msg = (id: string, criado: string, corpo: string, from_me = false, ts = TS): Linha => ({ id, jid: "j@s", from_me, ts, criado_em: criado, corpo, tipo: "conversation" })

beforeEach(() => {
  mundo.cfg = { vigiaTentouV3: ["A1", "B2"] }
  mundo.mensagens = [msg("A1", "2026-11-25T16:53:26.100Z", "37900575"), msg("B2", "2026-11-25T16:53:26.300Z", "Passos mg")]
})

describe("empate de ts", () => {
  it("ultimaReal (vigia) e ultimaDa (Atendente) devolvem a mesma mensagem", async () => {
    const { ultimaReal } = await import("@/app/lib/vigiaServidor")
    const { ultimaDa } = await import("@/app/lib/agenteAuto")
    const a = await ultimaReal("j@s"), b = await ultimaDa("j@s")
    expect(a?.id).toBe("B2")
    expect(b?.id).toBe(a?.id)
  })

  it("aindaEhAUltima da primeira do empate devolve o jid", async () => {
    const { aindaEhAUltima } = await import("@/app/lib/agenteAuto")
    expect(await aindaEhAUltima("A1")).toBe("j@s")
    expect(await aindaEhAUltima("B2")).toBe("j@s")
  })

  it("mensagem do lead mais nova (ts maior) ainda faz a anterior deixar de ser a última", async () => {
    mundo.mensagens.push(msg("C3", "2026-11-25T16:54:00.000Z", "oi", false, "2026-11-25T16:54:00.000Z"))
    const { aindaEhAUltima } = await import("@/app/lib/agenteAuto")
    expect(await aindaEhAUltima("A1")).toBeNull()
    expect(await aindaEhAUltima("C3")).toBe("j@s")
  })

  it("atrasada que perdeu para mensagem mais nova sai de vigiaTentouV3 e o vigia tenta a mais nova", async () => {
    mundo.mensagens.push(msg("C3", "2026-11-25T16:54:00.000Z", "oi", false, "2026-11-25T16:54:00.000Z"))
    const { responderSozinho } = await import("@/app/lib/agenteAuto")
    await responderSozinho("B2", { atrasada: true }).catch(() => null)
    expect(mundo.cfg.vigiaTentouV3).toEqual(["A1"])
    const { ultimaReal } = await import("@/app/lib/vigiaServidor")
    const ult = await ultimaReal("j@s")
    expect(ult?.id).toBe("C3")
    expect((mundo.cfg.vigiaTentouV3 as string[]).includes(ult!.id)).toBe(false)
  })
})
