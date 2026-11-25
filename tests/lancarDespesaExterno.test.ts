// Porta externa, ações lancar_despesa (rateio por lote, idempotência, auditoria) e renomear_fornecedor. Dados fictícios; sem delete.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({
  cfg: {} as Record<string, unknown>, diretor: "cfo" as string | null, conversa: [] as unknown[],
  inserts: [] as Record<string, unknown>[][], ops: [] as string[],
  cards: [] as { loteId: string; loteNumero: string }[],
}))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async (campos: string[]) => Object.fromEntries(campos.map(c => [c, structuredClone(estado.cfg[c])]))),
  mudarConfig: vi.fn(async (f: (d: Record<string, unknown>) => Record<string, unknown> | null) => {
    const m = f(structuredClone(estado.cfg)); if (m) estado.cfg = { ...estado.cfg, ...m }; return estado.cfg
  }),
}))
vi.mock("@/app/lib/acessoExterno", () => ({
  LIMITE_POR_HORA: 120,
  conferirChave: vi.fn(async () => estado.diretor ? { ok: true, diretor: estado.diretor } : { ok: false, status: 401, erro: "Sem chave." }),
}))
vi.mock("@/app/lib/diretoriaServidor", () => ({
  lerConversa: vi.fn(async () => estado.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown[]) => { estado.conversa = m }), lerPlanos: vi.fn(),
}))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn() }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (t: string) => ({
      select: () => ({ eq: async (c: string, v: string) => ({ data: t === "KanbanCard" ? estado.cards.filter(k => (k as Record<string, string>)[c] === v) : [], error: null }) }),
      insert: async (x: Record<string, unknown>[]) => { estado.ops.push(`insert:${t}`); estado.inserts.push(x); return { error: null } },
      update: async () => { estado.ops.push(`update:${t}`); return { error: null } },
      delete: async () => { estado.ops.push(`delete:${t}`); return { error: null } },
    }),
  },
}))

import { POST, GET } from "@/app/api/externo/route"
import { NextRequest } from "next/server"
import { emCentavos } from "@/app/lib/lancarDespesaExterno"

const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))
const base = () => ({
  acao: "lancar_despesa", chaveIdempotencia: "k1", fornecedorId: "F1", descricao: "Papel (fictício)", valor: 100, status: "pago",
  dataVencimento: "2026-12-05", dataPagamento: "2026-12-04",
  rateio: [{ loteNumero: "LT-1", valor: 60 }, { loteId: "id-2", valor: 40 }],
})
const gravouAlgo = () => estado.inserts.length > 0
const cents = (xs: Record<string, unknown>[]) => xs.reduce((s, l) => s + Math.round((l.valor as number) * 100), 0)

beforeEach(() => {
  estado.diretor = "cfo"; estado.conversa = []; estado.inserts = []; estado.ops = []
  estado.cfg = { fornecedores: [{ id: "F1", nome: "Gráfica Fictícia", categoria: "papel" }] }
  estado.cards = [{ loteId: "id-1", loteNumero: "LT-1" }, { loteId: "id-2", loteNumero: "LT-2" }, { loteId: "id-3", loteNumero: "LT-3" }]
})

describe("lancar_despesa", () => {
  it("rateio que bate: uma linha por lote com só a fatia; o total conta uma vez", async () => {
    const r = await pedir(base())
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(estado.inserts).toHaveLength(1)
    const linhas = estado.inserts[0]
    expect(linhas.map(l => [l.loteNumero, l.valor])).toEqual([["LT-1", 60], ["LT-2", 40]])
    expect(linhas.every(l => l.valor !== 100 && l.status === "pago" && l.tipo === "despesa")).toBe(true)
    expect(cents(linhas)).toBe(10000)   // a soma das fatias é o total, não N vezes o total
    expect(j.despesa).toMatchObject({ total: 100, fornecedorId: "F1" })
    expect(j.rateio.map((f: { valor: number }) => f.valor)).toEqual([60, 40])
    expect(linhas.every(l => String(l.id).startsWith(j.despesa.id))).toBe(true)   // id de grupo compartilhado
    expect(j.registro).toMatchObject({ por: "cfo", chaveIdempotencia: "k1" })
    expect(j.registro.emBrasilia).toBeTruthy()
    expect(j.registro.payload).toMatchObject({ valor: 100 })
    expect(estado.ops.filter(o => o.startsWith("delete"))).toEqual([])
  })
  it("soma que não bate: 400 e nada gravado (sem acertar o residual)", async () => {
    const r = await pedir({ ...base(), rateio: [{ loteNumero: "LT-1", valor: 60 }, { loteId: "id-2", valor: 39.99 }] })
    expect(r.status).toBe(400)
    expect(gravouAlgo()).toBe(false)
    expect(estado.cfg.despesasRateadas).toBeUndefined()
  })
  it("compara em centavos: 0,1 + 0,2 bate com 0,3 (ponto flutuante enganaria); 0,1 + 0,2 não bate com 0,31", async () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(emCentavos(0.1)! + emCentavos(0.2)!).toBe(emCentavos(0.3))
    const ok = await pedir({ ...base(), valor: 0.3, rateio: [{ loteNumero: "LT-1", valor: 0.1 }, { loteNumero: "LT-2", valor: 0.2 }] })
    expect(ok.status).toBe(200)
    const ruim = await pedir({ ...base(), chaveIdempotencia: "k2", valor: 0.31, rateio: [{ loteNumero: "LT-1", valor: 0.1 }, { loteNumero: "LT-2", valor: 0.2 }] })
    expect(ruim.status).toBe(400)
    expect(estado.inserts).toHaveLength(1)
  })
  it("recusa mais de 2 casas decimais, valor <= 0, lote repetido e rateio vazio", async () => {
    for (const corpo of [
      { ...base(), valor: 100.001 },
      { ...base(), rateio: [{ loteNumero: "LT-1", valor: 0 }, { loteNumero: "LT-2", valor: 100 }] },
      { ...base(), rateio: [{ loteNumero: "LT-1", valor: 50 }, { loteNumero: "LT-1", valor: 50 }] },
      { ...base(), rateio: [{ loteNumero: "LT-2", valor: 50 }, { loteId: "id-2", valor: 50 }] },
      { ...base(), rateio: [] },
      { ...base(), status: "atrasado" },
    ]) expect((await pedir(corpo)).status).toBe(400)
    expect(gravouAlgo()).toBe(false)
  })
  it("404 para lote ou fornecedor inexistente, sem gravar", async () => {
    expect((await pedir({ ...base(), rateio: [{ loteNumero: "LT-9", valor: 100 }] })).status).toBe(404)
    expect((await pedir({ ...base(), fornecedorId: "nada" })).status).toBe(404)
    expect(gravouAlgo()).toBe(false)
  })
  it("sem chaveIdempotencia: 400", async () => {
    const { chaveIdempotencia: _c, ...sem } = base(); void _c
    expect((await pedir(sem)).status).toBe(400)
    expect((await pedir({ ...base(), chaveIdempotencia: "  " })).status).toBe(400)
    expect(gravouAlgo()).toBe(false)
  })
  it("idempotência: mesma chave e mesmo payload não duplica; payload diferente é 409", async () => {
    const a = await (await pedir(base())).json()
    const r2 = await pedir({ ...base(), rateio: [...base().rateio].reverse() })   // mesma coisa, outra ordem
    expect(r2.status).toBe(200)
    const b = await r2.json()
    expect(b.despesa.id).toBe(a.despesa.id)
    expect(b.rateio.map((f: { id: string }) => f.id)).toEqual(a.rateio.map((f: { id: string }) => f.id))
    expect(estado.inserts).toHaveLength(1)
    const r3 = await pedir({ ...base(), valor: 100, descricao: "Outra coisa" })
    expect(r3.status).toBe(409)
    expect(estado.inserts).toHaveLength(1)
  })
  it("pendente não leva dataPagamento", async () => {
    const r = await pedir({ ...base(), status: "pendente", dataPagamento: undefined })
    expect(r.status).toBe(200)
    expect(estado.inserts[0].every(l => l.status === "pendente" && l.dataPagamento === undefined)).toBe(true)
  })
  it("permissão: CTO e CFO passam; CMO, CCO e COO levam 403 sem escrita; sem chave 401", async () => {
    for (const [i, d] of ["cto", "cfo"].entries()) { estado.diretor = d; expect((await pedir({ ...base(), chaveIdempotencia: `p${i}` })).status).toBe(200) }
    const antes = estado.inserts.length
    for (const d of ["cmo", "cco", "coo"]) { estado.diretor = d; expect((await pedir({ ...base(), chaveIdempotencia: `x${d}` })).status).toBe(403) }
    expect(estado.inserts).toHaveLength(antes)
    estado.diretor = null
    expect((await pedir(base())).status).toBe(401)
  })
})

describe("renomear_fornecedor", () => {
  const corpo = { acao: "renomear_fornecedor", id: "F1", nome: "Gráfica Nova (fictícia)" }
  it("muda só o nome, preserva o id e registra quem, quando e antes/depois", async () => {
    const r = await pedir(corpo)
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.fornecedor).toEqual({ id: "F1", nome: "Gráfica Nova (fictícia)", nomeAnterior: "Gráfica Fictícia" })
    expect(j.registro).toMatchObject({ por: "cfo", payload: { id: "F1", nomeAnterior: "Gráfica Fictícia", nomeNovo: "Gráfica Nova (fictícia)" } })
    expect(estado.cfg.fornecedores).toEqual([{ id: "F1", nome: "Gráfica Nova (fictícia)", categoria: "papel" }])
    expect(estado.cfg.fornecedoresRenomeados).toHaveLength(1)
    expect(estado.ops).toEqual([])   // não mexe em lançamento: vínculos (fornecedorId) ficam intactos
  })
  it("404 se o id não existe; 400 sem nome", async () => {
    expect((await pedir({ ...corpo, id: "nada" })).status).toBe(404)
    expect((await pedir({ ...corpo, nome: "  " })).status).toBe(400)
    expect((estado.cfg.fornecedores as { nome: string }[])[0].nome).toBe("Gráfica Fictícia")
  })
  it("permissão: CTO e CFO passam; as outras 403; sem chave 401", async () => {
    for (const d of ["cto", "cfo"]) { estado.diretor = d; expect((await pedir(corpo)).status).toBe(200) }
    for (const d of ["cmo", "cco", "coo"]) { estado.diretor = d; expect((await pedir({ ...corpo, nome: "Outro" })).status).toBe(403) }
    expect((estado.cfg.fornecedores as { nome: string }[])[0].nome).toBe("Gráfica Nova (fictícia)")
    estado.diretor = null
    expect((await pedir(corpo)).status).toBe(401)
  })
})

describe("GET de ajuda", () => {
  it("as duas ações aparecem para CTO e CFO, não para as outras chaves", async () => {
    const ler = async () => JSON.stringify((await (await GET(new NextRequest("http://x/api/externo", { headers: { authorization: "Bearer k" } }))).json()).escrita)
    for (const d of ["cto", "cfo"]) { estado.diretor = d; const s = await ler(); expect(s).toContain("acao:'lancar_despesa'"); expect(s).toContain("acao:'renomear_fornecedor'") }
    for (const d of ["cmo", "cco", "coo"]) { estado.diretor = d; const s = await ler(); expect(s).not.toContain("acao:'lancar_despesa'"); expect(s).not.toContain("acao:'renomear_fornecedor'") }
  })
})
