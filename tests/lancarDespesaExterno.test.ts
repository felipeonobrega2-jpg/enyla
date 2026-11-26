// Porta externa: lancar_despesa (rateio por lote) e renomear_fornecedor. Só a chave do CTO. Dados fictícios; sem DELETE.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({
  cfg: {} as Record<string, unknown>, diretor: "cto" as string | null, conversa: [] as unknown[],
  ops: [] as { t: string; op: string; v?: unknown }[],
  cards: [] as Record<string, unknown>[], lancs: [] as Record<string, unknown>[],
}))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async (campos: string[]) => Object.fromEntries(campos.filter(c => estado.cfg[c] !== undefined).map(c => [c, structuredClone(estado.cfg[c])]))),
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
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn(), renovarFoto: vi.fn() }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (t: string) => {
      let op = "select"; let v: unknown; let filtro: [string, unknown] | null = null
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (c: string, x: unknown) => { filtro = [c, x]; return q }
      q.insert = (x: unknown) => { op = "insert"; v = x; return q }
      q.update = (x: unknown) => { op = "update"; v = x; return q }
      q.delete = () => { op = "delete"; return q }
      q.then = (ok: (r: unknown) => unknown) => {
        if (op !== "select") { estado.ops.push({ t, op, v }); return ok({ data: null, error: null }) }
        return ok({ data: t === "KanbanCard" ? estado.cards.filter(c => !filtro || c[filtro[0]] === filtro[1]) : t === "LancamentoFinanceiro" ? estado.lancs.filter(c => !filtro || c[filtro[0]] === filtro[1]) : [], error: null })
      }
      return q
    },
  },
}))

import { POST, GET } from "@/app/api/externo/route"
import { NextRequest } from "next/server"
import { montarPedidos } from "@/app/lib/negocio"
import type { KanbanCard, LancamentoFinanceiro } from "@/app/types"

const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))
const semDelete = () => expect(estado.ops.filter(o => o.op === "delete")).toEqual([])
const inseridas = () => estado.ops.filter(o => o.t === "LancamentoFinanceiro" && o.op === "insert").flatMap(o => o.v as Record<string, unknown>[])
const base = {
  acao: "lancar_despesa", chaveIdempotencia: "k1", fornecedorId: "F1", descricao: "Papel (teste)", valor: 300, dataVencimento: "2026-12-10",
  status: "pendente", rateio: [{ loteNumero: "L-1", valor: 100 }, { loteNumero: "L-2", valor: 200 }],
}

beforeEach(() => {
  estado.diretor = "cto"; estado.conversa = []; estado.ops = []; estado.lancs = []
  estado.cfg = { fornecedores: [{ id: "F1", nome: "Gráfica Fictícia", categoria: "x" }] }
  estado.cards = [
    { id: "c1", numero: "ORC-1", loteId: "lote-a", loteNumero: "L-1", coluna: 3, preco: 1000 },
    { id: "c2", numero: "ORC-2", loteId: "lote-b", loteNumero: "L-2", coluna: 3, preco: 1000 },
  ]
})

describe("categoria na porta (CTO)", () => {
  it("lancar_despesa grava o id da categoria cadastrada em todas as fatias", async () => {
    const r = await pedir({ ...base, chaveIdempotencia: "kc", categoria: "materiais" })
    expect(r.status).toBe(200)
    expect(inseridas().map(l => l.categoria)).toEqual(["materiais", "materiais"])
  })
  it("categoria inexistente, nome livre ou desativada: 400 e nada gravado", async () => {
    estado.cfg.categoriasDespesa = [{ id: "frete", nome: "Frete" }, { id: "impressao", nome: "Impressão", ativa: false }]
    for (const c of ["Materiais", "papel", "impressao"]) {
      expect((await pedir({ ...base, chaveIdempotencia: "kx" + c, categoria: c })).status, c).toBe(400)
    }
    expect(inseridas()).toEqual([])
    expect((await pedir({ ...base, chaveIdempotencia: "kf", categoria: "frete" })).status).toBe(200)
  })
  it("corrigir_categoria_lancamento: só categoria muda, com registro; CFO e outras chaves 403", async () => {
    estado.cfg.categoriasDespesa = [{ id: "frete", nome: "Frete" }]
    for (const d of ["cfo", "coo"]) { estado.diretor = d; expect((await pedir({ acao: "corrigir_categoria_lancamento", lancamentoId: "x", categoria: "frete" })).status, d).toBe(403) }
    estado.diretor = "cto"
    expect((await pedir({ acao: "corrigir_categoria_lancamento", lancamentoId: "x", categoria: "livre" })).status).toBe(400)
    expect(estado.ops.filter(o => o.t === "LancamentoFinanceiro")).toEqual([])
    expect((await pedir({ acao: "corrigir_categoria_lancamento", lancamentoId: "nao", categoria: "frete" })).status).toBe(404)
    estado.lancs = [{ id: "L9", tipo: "despesa", valor: 50, status: "pago", loteId: "lote-a" }]
    const r = await pedir({ acao: "corrigir_categoria_lancamento", lancamentoId: "L9", categoria: "frete" })
    expect(r.status).toBe(200)
    const up = estado.ops.filter(o => o.t === "LancamentoFinanceiro")
    expect(up).toEqual([{ t: "LancamentoFinanceiro", op: "update", v: { categoria: "frete" } }])
    const reg = (estado.cfg.correcoesCategoria as Record<string, unknown>[])[0]
    expect(reg).toMatchObject({ autor: "cto", lancamentoId: "L9", categoriaAnterior: null, categoriaNova: "frete" })
    semDelete()
  })
})

describe("lancar_despesa", () => {
  it("rateio que bate: uma fatia por lote, total conta uma vez (custoDireto e a pagar)", async () => {
    const r = await pedir({ ...base, status: "pago" })
    const j = await r.json()
    expect(r.status).toBe(200)
    const linhas = inseridas()
    expect(linhas.map(l => [l.loteId, l.valor])).toEqual([["lote-a", 100], ["lote-b", 200]])
    expect(new Set(linhas.map(l => l.rateioGrupoId)).size).toBe(1)
    expect(j.despesa).toMatchObject({ total: 300, status: "pago" }); expect(j.registro).toMatchObject({ autor: "cto", chaveIdempotencia: "k1" }); expect(j.rateio).toHaveLength(2)
    expect((estado.cfg.despesasPorta as Record<string, { autor: string; em: string; payload: unknown }>).k1).toMatchObject({ autor: "cto" })
    // função pura que alimenta margem e caixa
    const ps = montarPedidos(estado.cards as unknown as KanbanCard[], linhas as unknown as LancamentoFinanceiro[])
    expect(ps.map(p => p.custoDireto).sort()).toEqual([100, 200])
    expect(ps.reduce((s, p) => s + p.custoDireto, 0)).toBe(300)
    expect(linhas.reduce((s, l) => s + (l.valor as number), 0)).toBe(300)   // nunca N vezes o total
    expect(estado.conversa).toHaveLength(1); semDelete()
  })
  it("pendente fica fora do custoDireto e o total a pagar é o total", async () => {
    await pedir(base)
    const linhas = inseridas()
    expect(linhas.every(l => l.status === "pendente" && l.dataPagamento === undefined)).toBe(true)
    const ps = montarPedidos(estado.cards as unknown as KanbanCard[], linhas as unknown as LancamentoFinanceiro[])
    expect(ps.every(p => p.custoDireto === 0)).toBe(true)
    expect(linhas.reduce((s, l) => s + (l.valor as number), 0)).toBe(300)
  })
  it("soma que não bate: 400 e nada gravado", async () => {
    const r = await pedir({ ...base, rateio: [{ loteNumero: "L-1", valor: 100 }, { loteNumero: "L-2", valor: 199.99 }] })
    expect(r.status).toBe(400); expect(estado.ops).toEqual([]); expect(estado.cfg.despesasPorta).toBeUndefined()
  })
  it("centavos: 0,1 + 0,2 bate com 0,3 mesmo com float; 0,1 + 0,2 não bate com 0,31", async () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    const ok = await pedir({ ...base, valor: 0.3, rateio: [{ loteNumero: "L-1", valor: 0.1 }, { loteNumero: "L-2", valor: 0.2 }] })
    expect(ok.status).toBe(200)
    const ruim = await pedir({ ...base, chaveIdempotencia: "k2", valor: 0.31, rateio: [{ loteNumero: "L-1", valor: 0.1 }, { loteNumero: "L-2", valor: 0.2 }] })
    expect(ruim.status).toBe(400)
    expect((await pedir({ ...base, chaveIdempotencia: "k3", valor: 10.005, rateio: [{ loteNumero: "L-1", valor: 10.005 }] })).status).toBe(400)
  })
  it("validações 400/404 sem gravar", async () => {
    const casos: [Record<string, unknown>, number][] = [
      [{ chaveIdempotencia: undefined }, 400], [{ chaveIdempotencia: " " }, 400], [{ fornecedorId: "" }, 400], [{ descricao: " " }, 400], [{ valor: 0 }, 400],
      [{ status: "atrasado" }, 400], [{ dataVencimento: "10/12/2026" }, 400], [{ rateio: [] }, 400], [{ rateio: [{ loteNumero: "L-1", valor: 0 }, { loteNumero: "L-2", valor: 300 }] }, 400],
      [{ rateio: [{ loteNumero: "L-1", valor: 150 }, { loteNumero: "L-1", valor: 150 }] }, 400],
      [{ rateio: [{ loteNumero: "L-1", valor: 100 }, { loteId: "lote-a", valor: 200 }] }, 400],
      [{ rateio: [{ loteNumero: "L-1", valor: 100 }, { loteNumero: "L-9", valor: 200 }] }, 404], [{ fornecedorId: "nada" }, 404],
    ]
    for (const [c, st] of casos) expect((await pedir({ ...base, ...c })).status, JSON.stringify(c)).toBe(st)
    expect(estado.ops).toEqual([]); expect(estado.cfg.despesasPorta).toBeUndefined()
  })
  it("loteId também identifica o lote", async () => {
    const r = await pedir({ ...base, rateio: [{ loteId: "lote-a", valor: 100 }, { loteId: "lote-b", valor: 200 }] })
    expect(r.status).toBe(200); expect(inseridas().map(l => l.loteNumero)).toEqual(["L-1", "L-2"])
  })
  it("idempotência: mesma chave+payload não duplica; payload diferente é 409", async () => {
    const a = await (await pedir(base)).json()
    const r2 = await pedir({ ...base, rateio: [...base.rateio].reverse() })
    const b = await r2.json()
    expect(r2.status).toBe(200); expect(b.despesa.id).toBe(a.despesa.id); expect(b.rateio.map((x: { lancamentoId: string }) => x.lancamentoId)).toEqual(a.rateio.map((x: { lancamentoId: string }) => x.lancamentoId))
    expect(inseridas()).toHaveLength(2)
    const r3 = await pedir({ ...base, valor: 301, rateio: [{ loteNumero: "L-1", valor: 101 }, { loteNumero: "L-2", valor: 200 }] })
    expect(r3.status).toBe(409); expect(inseridas()).toHaveLength(2); semDelete()
  })
  it("permissão: só o CTO; CFO, CMO, CCO e COO levam 403 sem escrita; sem chave, 401", async () => {
    for (const acao of ["lancar_despesa", "renomear_fornecedor"])
      for (const d of ["cfo", "cmo", "cco", "coo"]) { estado.diretor = d; expect((await pedir({ ...base, acao, id: "F1", nome: "X" })).status, `${acao} ${d}`).toBe(403) }
    estado.diretor = null
    expect((await pedir(base)).status).toBe(401); expect((await pedir({ acao: "renomear_fornecedor", id: "F1", nome: "X" })).status).toBe(401)
    expect(estado.ops).toEqual([]); expect(estado.cfg.despesasPorta).toBeUndefined(); expect((estado.cfg.fornecedores as { nome: string }[])[0].nome).toBe("Gráfica Fictícia")
  })
})

describe("renomear_fornecedor", () => {
  it("muda só o nome, preserva o id e não mexe em lançamentos; registra a auditoria", async () => {
    const r = await pedir({ acao: "renomear_fornecedor", id: "F1", nome: "  Gráfica Nova (teste) " })
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j.fornecedor).toMatchObject({ id: "F1", nome: "Gráfica Nova (teste)", categoria: "x" })
    expect(j.registro).toMatchObject({ autor: "cto", id: "F1", nomeAnterior: "Gráfica Fictícia", nomeNovo: "Gráfica Nova (teste)" }); expect(j.registro.em).toBeTruthy()
    expect(estado.cfg.fornecedores).toEqual([{ id: "F1", nome: "Gráfica Nova (teste)", categoria: "x" }])
    expect(estado.cfg.renomeacoesFornecedor).toHaveLength(1)
    expect(estado.ops).toEqual([]); semDelete()   // nenhum lançamento tocado
  })
  it("400 e 404", async () => {
    for (const c of [{ nome: "a" }, { id: "F1" }, { id: "F1", nome: " " }, { id: "F1", nome: 5 }]) expect((await pedir({ acao: "renomear_fornecedor", ...c })).status, JSON.stringify(c)).toBe(400)
    expect((await pedir({ acao: "renomear_fornecedor", id: "nada", nome: "X" })).status).toBe(404)
    expect(estado.cfg.renomeacoesFornecedor).toBeUndefined()
  })
})

describe("ajuda do GET", () => {
  const ler = async () => JSON.stringify((await (await GET(new NextRequest("http://x/api/externo", { headers: { authorization: "Bearer k" } }))).json()).escrita)
  it("as duas ações aparecem só para o CTO", async () => {
    const s = await ler()
    expect(s).toContain("acao:'lancar_despesa'"); expect(s).toContain("acao:'renomear_fornecedor'")
    for (const d of ["cfo", "cmo", "cco", "coo"]) { estado.diretor = d; const t = await ler(); expect(t, d).not.toContain("acao:'lancar_despesa'"); expect(t, d).not.toContain("acao:'renomear_fornecedor'") }
  })
})
