// Trava de idempotência dos disparos do Prospector (issue #249). Fixtures fictícias.
import { describe, it, expect, vi, beforeEach } from "vitest"

const e = vi.hoisted(() => ({
  idem: new Set<string>(), porta: new Map<string, { status?: number; resposta?: unknown; criado_em: string }>(), evo: vi.fn(), hist: [] as unknown[],
}))
// Banco falso: upsert com ignoreDuplicates devolve só a linha que inseriu (como o Postgres com on conflict do nothing).
const cadeia = (rows: () => unknown[], extra: Record<string, unknown> = {}) => {
  const q: Record<string, unknown> = { then: (r: (v: unknown) => void) => r({ data: rows(), error: null }), maybeSingle: async () => ({ data: rows()[0] ?? null }), ...extra }
  for (const m of ["select", "order", "limit", "eq", "in", "range"]) q[m] = () => q
  return q
}
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (t: string) => {
      if (t === "prospector_envios_idem") return {
        upsert: (l: { prospecto_id: number; canal: string; campanha: string }[]) => {
          const k = `${l[0].prospecto_id}|${l[0].canal}|${l[0].campanha}`
          const novo = !e.idem.has(k); e.idem.add(k)
          return cadeia(() => (novo ? [{ id: 1 }] : []))
        },
        delete: () => { const f: Record<string, string | number> = {}; const q: Record<string, unknown> = { then: (r: (v: unknown) => void) => { e.idem.delete(`${f.prospecto_id}|${f.canal}|${f.campanha}`); r({ error: null }) } }; q.eq = (c: string, v: string | number) => { f[c] = v; return q }; return q },
      }
      if (t === "porta_idempotencia") return {
        upsert: (l: { chave: string }[]) => { const novo = !e.porta.has(l[0].chave); if (novo) e.porta.set(l[0].chave, { criado_em: new Date().toISOString() }); return cadeia(() => (novo ? [{ chave: l[0].chave }] : [])) },
        select: () => ({ eq: (_c: string, v: string) => ({ maybeSingle: async () => ({ data: e.porta.get(v) ?? null }) }) }),
        update: (c: { status: number; resposta: unknown }) => ({ eq: async (_c: string, v: string) => { Object.assign(e.porta.get(v)!, c) } }),
        delete: () => ({ eq: async (_c: string, v: string) => { e.porta.delete(v) } }),
      }
      return cadeia(() => [{ id: 1 }], { update: (c: Record<string, unknown>) => { e.hist.push(c.historico_etapas); return cadeia(() => [{ id: 1 }]) } })
    },
  },
}))
vi.mock("@/app/lib/configAtomica", () => ({ mudarConfig: vi.fn(async (f: (d: Record<string, unknown>) => unknown) => f({})), lerCampos: vi.fn(async () => ({})) }))
vi.mock("@/app/lib/evolution", () => ({ evo: e.evo }))

import { reservarEnvio, liberarEnvio, campanhaDa, hashTexto, reservarChavePorta, guardarRespostaPorta } from "@/app/lib/envioIdem"
import { enviarAoProspecto } from "@/app/lib/ordemProspecto"

const util = new Date("2026-11-26T15:00:00Z")   // quinta, 12h em São Paulo
const prospecto = { id: 7, razao_social: "Gráfica Teste", nome_fantasia: null, telefone: "11999990001", etapa: "encontrado", opt_out: false, historico_etapas: [], atualizado_em: "2026-11-26T00:00:00Z" } as never
const enviar = (campanha?: string, texto = "Oi, tudo bem?") => enviarAoProspecto({ diretor: "cco", func: { nome: "Atendente" }, prospecto, jid: "5511999990001@s.whatsapp.net", texto, novoId: () => "a1", agora: util, campanha })

describe("trava de idempotência do envio", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(util)
    e.idem.clear(); e.porta.clear(); e.hist = []
    e.evo.mockReset(); e.evo.mockResolvedValue({ ok: true, status: 201, corpo: { key: { id: "w1" } } })
  })
  it("duas chamadas simultâneas iguais: 1 envio e 1 recusa 409, com a tentativa registrada", async () => {
    const [a, b] = await Promise.all([enviar("abertura-a"), enviar("abertura-a")])
    expect([a.status, b.status].filter(s => s === 409)).toHaveLength(1)
    expect([a, b].filter(r => r.destino === "enviado_direto")).toHaveLength(1)
    expect(e.evo).toHaveBeenCalledTimes(1)
    const recusa = [a, b].find(r => r.status === 409)!
    expect(recusa.motivo).toBe("já enviado (idempotência)")
    expect(JSON.stringify(e.hist)).toContain("barrado")
  })
  it("campanha diferente para o mesmo destino: permitido", async () => {
    expect((await enviar("abertura-a")).destino).toBe("enviado_direto")
    expect((await enviar("abertura-b")).destino).toBe("enviado_direto")
    expect(e.evo).toHaveBeenCalledTimes(2)
  })
  it("sem campanha, o texto normalizado é a chave: mesmo texto barra, texto outro passa", async () => {
    expect((await enviar(undefined, "Oi,  TUDO bem?")).destino).toBe("enviado_direto")
    expect((await enviar(undefined, "oi, tudo bem?")).status).toBe(409)
    expect((await enviar(undefined, "Outro assunto")).destino).toBe("enviado_direto")
    expect(e.evo).toHaveBeenCalledTimes(2)
  })
  it("o envio que falha devolve a reserva e pode ser repetido", async () => {
    e.evo.mockResolvedValueOnce({ ok: false, status: 500, corpo: null })
    expect((await enviar("x")).status).toBe(503)
    expect((await enviar("x")).destino).toBe("enviado_direto")
  })
  it("canal diferente na mesma campanha: permitido; e-mail segue a mesma regra", async () => {
    expect(await reservarEnvio(7, "whatsapp", "c1")).toBe(true)
    expect(await reservarEnvio(7, "email", "c1")).toBe(true)
    expect(await reservarEnvio(7, "email", "c1")).toBe(false)
    expect(await reservarEnvio(8, "email", "c1")).toBe(true)
    await liberarEnvio(7, "email", "c1")
    expect(await reservarEnvio(7, "email", "c1")).toBe(true)
  })
  it("campanhaDa: campanha/passo quando vem, hash do texto quando não", () => {
    expect(campanhaDa({ campanha: "black", passo: 2 }, "t")).toBe("black/2")
    expect(campanhaDa({}, "Oi  Mundo")).toBe(`texto:${hashTexto("oi mundo")}`)
  })
})

describe("Idempotency-Key da porta", () => {
  beforeEach(() => { e.porta.clear() })
  it("repetida: devolve a resposta da primeira, sem reenviar", async () => {
    expect(await reservarChavePorta("cco", "k1")).toEqual({ primeira: true })
    expect(await reservarChavePorta("cco", "k1")).toEqual({ primeira: false, guardada: null })   // primeira ainda em andamento
    await guardarRespostaPorta("cco", "k1", { status: 200, corpo: { ok: true, id: "a1" } })
    expect(await reservarChavePorta("cco", "k1")).toEqual({ primeira: false, guardada: { status: 200, corpo: { ok: true, id: "a1" } } })
    expect(await reservarChavePorta("cmo", "k1")).toEqual({ primeira: true })   // chave é por diretor
  })
  it("passadas 24 h, a chave vale de novo", async () => {
    await reservarChavePorta("cco", "k2")
    e.porta.get("cco:k2")!.criado_em = new Date(Date.now() - 25 * 3600_000).toISOString()
    expect(await reservarChavePorta("cco", "k2")).toEqual({ primeira: true })
  })
})
