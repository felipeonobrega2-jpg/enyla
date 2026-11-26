import { describe, it, expect, vi, beforeEach } from "vitest"

const est = vi.hoisted(() => ({ tabelas: {} as Record<string, unknown[]>, escritas: [] as string[], cfg: {} as Record<string, unknown>, leituras: 0 }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (t: string) => {
      est.leituras++
      const cadeia: Record<string, unknown> = {}
      for (const m of ["select", "or", "in", "gte", "order", "limit", "like", "eq", "not"]) cadeia[m] = () => cadeia
      for (const m of ["insert", "update", "upsert", "delete"]) cadeia[m] = () => { est.escritas.push(`${t}.${m}`); return cadeia }
      cadeia.then = (ok: (v: unknown) => unknown) => ok({ data: est.tabelas[t] ?? [], error: null })
      return cadeia
    },
  },
}))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn(async () => est.cfg) }))
vi.mock("@/app/lib/nivelCliente", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/nivelCliente")>()),
  carregarFontesNivel: vi.fn(async () => ({ cards: [], pedidosDigitais: [], curvas: new Map(), cadastro: [], leituraOk: true })),
}))

import { lerPropostasExterno, montarPropostas, paginar, AJUDA_PROPOSTAS } from "@/app/lib/propostasExterno"
import type { FontesNivel } from "@/app/lib/nivelCliente"
import type { PropostaPronta } from "@/app/lib/propostaPronta"

const dia = (n: number) => new Date(Date.UTC(2026, 10, 25) - n * 86_400_000).toISOString()
const pp = (p: Record<string, unknown>) => ({
  id: "PP-00001", jid: "a@s.whatsapp.net", nome: "Carla Dias", em: dia(3), preco: 1000, status: "aguardando",
  dados: { telefone: "5511999990000", email: "carla@x.com", cnpj: "12.345.678/0001-90" }, ...p,
}) as unknown as PropostaPronta
const card = (p: Record<string, unknown>) => ({ numero: "ORC-1", nomeCliente: "Bruno", preco: 500, coluna: 0, createdAt: dia(2), ...p })
const montar = (a: Partial<Parameters<typeof montarPropostas>[0]>) => montarPropostas({ propostas: [], cards: [], aprovacoes: [], marcas: [], ...a })

beforeEach(() => {
  est.escritas = []; est.leituras = 0
  est.cfg = { propostasProntas: [pp({})], aprovacoesOnline: [] }
  est.tabelas = { agente_tratadas: [], KanbanCard: [card({})] }
})

describe("?o=propostas", () => {
  it("campos certos e sem telefone/e-mail/documento", () => {
    const [i] = montar({ propostas: [pp({})] })
    expect(Object.keys(i).sort()).toEqual(["codigoOrc", "codigoPp", "dataCriacao", "dataEnvio", "estrela", "jid", "nivel", "nome", "status", "valor"])
    expect(i).toMatchObject({ codigoPp: "PP-00001", codigoOrc: null, valor: 1000, status: "pronta", dataEnvio: null, estrela: false, jid: "a@s.whatsapp.net", nome: "Carla Dias" })
    const txt = JSON.stringify(i)
    expect(txt).not.toMatch(/5511999990000|carla@x\.com|12\.345\.678/)
  })

  it("um caso de cada status", () => {
    const itens = montar({
      propostas: [pp({ id: "PP-1" }), pp({ id: "PP-2", status: "enviada", enviadaEm: dia(1) }), pp({ id: "PP-3", status: "descartada" })],
      cards: [card({ numero: "ORC-A", coluna: 0 }), card({ numero: "ORC-B", coluna: 11 }), card({ numero: "ORC-C", coluna: 1 }), card({ numero: "ORC-D", coluna: 9 }), card({ numero: "ORC-E", coluna: 10 }), card({ numero: "ORC-F", coluna: 0 })],
      aprovacoes: [{ numero: "ORC-F" }],
    })
    const st = (c: string) => itens.find(i => i.codigoPp === c || i.codigoOrc === c)!.status
    expect([st("PP-1"), st("PP-2"), st("PP-3")]).toEqual(["pronta", "enviada", "perdida"])
    expect([st("ORC-A"), st("ORC-B"), st("ORC-C"), st("ORC-D"), st("ORC-E"), st("ORC-F")]).toEqual(["enviada", "enviada", "aceita", "aceita", "perdida", "aceita"])
    expect(itens.find(i => i.codigoPp === "PP-2")!.dataEnvio).toBe(dia(1))
  })

  it("aprovação desfeita não confirma aceita", () => {
    const [i] = montar({ cards: [card({ coluna: 0 })], aprovacoes: [{ numero: "ORC-1", desfeita: true }] })
    expect(i.status).toBe("enviada")
  })

  it("PP enviada com card fechado ou perdido muda de status; PP + card = um item com os dois códigos", () => {
    const base = pp({ status: "enviada", numero: "ORC-1", enviadaEm: dia(1) })
    const fechado = montar({ propostas: [base], cards: [card({ coluna: 3, preco: 1200 })] })
    expect(fechado).toHaveLength(1)
    expect(fechado[0]).toMatchObject({ codigoPp: "PP-00001", codigoOrc: "ORC-1", status: "aceita", valor: 1200 })
    expect(montar({ propostas: [base], cards: [card({ coluna: 10 })] })[0].status).toBe("perdida")
    expect(montar({ propostas: [base], cards: [card({ coluna: 0 })] })[0].status).toBe("enviada")
  })

  it("estrela só com marca perto|; sugestão não conta; nivel preenchido quando classifica", () => {
    const fontes = { cards: [], pedidosDigitais: [], curvas: new Map(), cadastro: [], leituraOk: true } as FontesNivel
    const props = [pp({ id: "PP-1", jid: "a@s.whatsapp.net" }), pp({ id: "PP-2", jid: "b@s.whatsapp.net" })]
    const r = montar({ propostas: props, marcas: [{ jid: "a@s.whatsapp.net", nota: "", em: dia(1) }], fontes })
    expect(r.find(i => i.codigoPp === "PP-1")!.estrela).toBe(true)
    expect(r.find(i => i.codigoPp === "PP-2")!.estrela).toBe(false)
    expect(r[0].nivel).toBe("lead")
    expect(montar({ propostas: props })[0].nivel).toBeNull()
  })

  it("paginação: total certo, páginas sem repetir, passa de 7.000 caracteres sem perder item", () => {
    const cards = Array.from({ length: 120 }, (_, k) => card({ numero: `ORC-${k}`, nomeCliente: "Cliente ".padEnd(60, "x"), createdAt: dia(k) }))
    const todos = montar({ cards })
    const p1 = paginar(todos, 1, 100), p2 = paginar(todos, 2, 100)
    expect(p1.total).toBe(120)
    expect(p1.itens).toHaveLength(100); expect(p2.itens).toHaveLength(20)
    expect(JSON.stringify(p1.itens).length).toBeGreaterThan(7000)
    expect(() => JSON.parse(JSON.stringify(p1.itens))).not.toThrow()
    const ids = new Set([...p1.itens, ...p2.itens].map(i => i.codigoOrc))
    expect(ids.size).toBe(120)
    expect(paginar(todos, 1, 500).limite).toBe(100)
    expect(paginar(todos).limite).toBe(50)
  })

  it("CCO e CMO: 200; COO, CFO e CTO: 403 sem leitura nem escrita", async () => {
    for (const d of ["cco", "cmo"] as const) {
      const r = await lerPropostasExterno(d)
      expect(r.status).toBe(200)
      expect(r.corpo.total).toBe(2)
    }
    est.leituras = 0
    for (const d of ["coo", "cfo", "cto"] as const) expect((await lerPropostasExterno(d)).status).toBe(403)
    expect(est.leituras).toBe(0)
    expect(est.escritas).toEqual([])
  })

  it("filtros status e estrela", async () => {
    est.tabelas.agente_tratadas = [{ id: "perto|a@s.whatsapp.net|", em: dia(1) }]
    expect((await lerPropostasExterno("cco", { status: "pronta" })).corpo.total).toBe(1)
    expect((await lerPropostasExterno("cco", { estrela: "true" })).corpo.total).toBe(1)
    expect((await lerPropostasExterno("cco", { status: "xx" })).status).toBe(400)
  })

  it("ajuda menciona ?o=propostas via rota", async () => {
    expect(AJUDA_PROPOSTAS).toContain("CCO e CMO")
    const fonte = (await import("node:fs")).readFileSync("app/api/externo/route.ts", "utf8")
    expect(fonte).toContain('"?o=propostas": AJUDA_PROPOSTAS')
  })
})
