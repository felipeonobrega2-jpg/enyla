// Porta externa, escrita financeira do CFO (lancamento sem editar, conciliacao e categoria) e edição de lançamento só do CTO. Sem DELETE físico.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({
  cfg: {} as Record<string, unknown>, diretor: "cfo" as string | null, conversa: [] as unknown[],
  ops: [] as { t: string; op: string; v?: unknown }[], linhas: {} as Record<string, Record<string, unknown>[]>,
}))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async (c: string[]) => Object.fromEntries(c.filter(k => estado.cfg[k] !== undefined).map(k => [k, structuredClone(estado.cfg[k])]))),
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
const aplicarMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/lib/bancoServidor", () => ({ aplicar: aplicarMock }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (t: string) => {
      let op = "select"; let v: unknown; let id: unknown
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (_c: string, x: unknown) => { id = x; return q }
      q.insert = (x: unknown) => { op = "insert"; v = x; return q }
      q.update = (x: unknown) => { op = "update"; v = x; return q }
      q.delete = () => { op = "delete"; return q }
      q.maybeSingle = async () => { if (op !== "select") estado.ops.push({ t, op, v }); return { data: (estado.linhas[t] ?? []).find(l => l.id === id) ?? null, error: null } }
      q.then = (ok: (r: unknown) => unknown) => { estado.ops.push({ t, op, v }); return ok({ data: null, error: null }) }
      return q
    },
  },
}))

import { POST, GET } from "@/app/api/externo/route"
import { NextRequest } from "next/server"

const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))
const semDelete = () => expect(estado.ops.filter(o => o.op === "delete")).toEqual([])
const lanc = { acao: "lancamento", operacao: "criar", tipo: "despesa", descricao: "Aluguel", valor: 1500, dataVencimento: "2026-12-05" }

beforeEach(() => {
  estado.diretor = "cfo"; estado.conversa = []; estado.ops = []; aplicarMock.mockReset()
  estado.cfg = { categoriasDespesa: [{ id: "luz", nome: "Luz" }], categoriasReceita: [] }
  estado.linhas = {
    LancamentoFinanceiro: [{ id: "L1", descricao: "Aluguel", obs: "antigo", status: "pendente", tipo: "despesa", valor: 10, categoria: "outros" }, { id: "L2", descricao: "Criado", obs: null }],
    banco_transacoes: [{ id: "T1", estado: "criada", contraparte_doc: "123", bruto: { x: 1 }, historico: [{ em: "x", acao: "criada", detalhe: JSON.stringify({ criados: ["L2"] }) }] }],
  }
})

describe("escrita financeira do CFO", () => {
  for (const acao of ["lancamento", "conciliacao", "categoria"]) {
    it(`${acao}: 403 para outras chaves e 401 sem chave`, async () => {
      for (const d of ["coo", "cco", "cmo", "cto"]) { estado.diretor = d; expect((await pedir({ acao, operacao: "criar" })).status).toBe(403) }
      estado.diretor = null
      expect((await pedir({ acao, operacao: "criar" })).status).toBe(401)
      expect(estado.ops).toEqual([]); expect(aplicarMock).not.toHaveBeenCalled()
    })
  }

  it("lancamento criar: grava, marca autor e conversa", async () => {
    const r = await pedir({ ...lanc, status: "pago", dataPagamento: "2026-12-05" })
    const j = await r.json()
    expect(r.status).toBe(200); expect(j.lancamento).toMatchObject({ alteradoPor: "cfo", status: "pago", valor: 1500 }); expect(j.lancamento.alteradoEm).toBeTruthy()
    expect(estado.ops.map(o => o.op)).toEqual(["insert"]); expect(estado.conversa).toHaveLength(1); semDelete()
  })
  it("lancamento 400 de validação", async () => {
    const casos: Record<string, unknown>[] = [
      { operacao: "criar", tipo: "despesa", descricao: "a", valor: 1 }, { ...lanc, valor: 0 }, { ...lanc, valor: "1" }, { ...lanc, tipo: "x" },
      { ...lanc, descricao: " " }, { ...lanc, dataVencimento: "05/12/2026" }, { ...lanc, status: "paga" }, { ...lanc, formaPagamento: "cheque" },
      { operacao: "desativar" }, { operacao: "estornar" }, { operacao: "apagar", id: "L1" },
    ]
    for (const c of casos) { const r = await pedir({ acao: "lancamento", ...(c.operacao ? {} : {}), ...c }); expect(r.status, JSON.stringify(c)).toBe(400) }
    expect(estado.ops).toEqual([])
  })
  it("lancamento editar: 400 de validação (chave do CTO)", async () => {
    estado.diretor = "cto"
    for (const c of [{ valor: 5 }, { id: "L1" }, { id: "L1", categoria: "Nome Livre" }, { id: "L1", categoria: "inexistente" }, { id: "L1", valor: 0 }]) {
      const r = await pedir({ acao: "lancamento", operacao: "editar", ...c }); expect(r.status, JSON.stringify(c)).toBe(400)
    }
    estado.cfg = { ...estado.cfg, categoriasDespesa: [{ id: "luz", nome: "Luz" }, { id: "gas", nome: "Gás", ativa: false }] }
    expect((await pedir({ acao: "lancamento", operacao: "editar", id: "L1", categoria: "gas" })).status).toBe(400)
    expect(estado.ops).toEqual([]); expect(estado.cfg.edicoesLancamento).toBeUndefined()
  })
  it("lancamento editar: só o CTO edita, preserva obs, grava registro campo a campo e não apaga", async () => {
    estado.diretor = "cto"
    const r = await pedir({ acao: "lancamento", operacao: "editar", id: "L1", valor: 99, status: "pago", dataPagamento: "2026-12-06", categoria: "impressao" })
    const j = await r.json()
    expect(r.status).toBe(200)
    const u = estado.ops.find(o => o.op === "update")!.v as Record<string, string>
    expect(u.valor).toBe(99); expect(u.categoria).toBe("impressao"); expect(u.obs).toContain("antigo"); expect(u.obs).toContain("cto"); semDelete()
    expect(j.lancamento).toMatchObject({ alteradoPor: "cto", categoria: "impressao" })
    const porCampo = Object.fromEntries((j.registro as { campo: string; em: string; emIso: string }[]).map(x => [x.campo, x]))
    expect(Object.keys(porCampo).sort()).toEqual(["categoria", "dataPagamento", "status", "valor"])
    expect(porCampo.status).toMatchObject({ autor: "cto", lancamentoId: "L1", antes: "pendente", depois: "pago" })
    expect(porCampo.categoria).toMatchObject({ antes: "outros", depois: "impressao" })
    expect(porCampo.valor).toMatchObject({ antes: 10, depois: 99 }); expect(porCampo.valor.em).toBeTruthy(); expect(porCampo.valor.emIso).toBeTruthy()
    expect(estado.cfg.edicoesLancamento).toHaveLength(4)
    estado.ops = []
    expect((await pedir({ acao: "lancamento", operacao: "editar", id: "L1", categoria: "luz" })).status).toBe(200)
    expect((await pedir({ acao: "lancamento", operacao: "editar", id: "nada", valor: 5 })).status).toBe(404)
  })
  it("editar: CFO, CMO, CCO e COO levam 403 sem escrita; sem chave 401", async () => {
    for (const d of ["cfo", "cmo", "cco", "coo"]) { estado.diretor = d; expect((await pedir({ acao: "lancamento", operacao: "editar", id: "L1", valor: 5 })).status, d).toBe(403) }
    estado.diretor = null
    expect((await pedir({ acao: "lancamento", operacao: "editar", id: "L1", valor: 5 })).status).toBe(401)
    expect(estado.ops).toEqual([]); expect(estado.cfg.edicoesLancamento).toBeUndefined()
  })
  it("criar, desativar e estornar seguem só no CFO: o CTO leva 403", async () => {
    estado.diretor = "cto"
    for (const operacao of ["criar", "desativar", "estornar"]) expect((await pedir({ ...lanc, operacao, id: "L1" })).status, operacao).toBe(403)
    expect(estado.ops).toEqual([])
    estado.diretor = "cfo"
    expect((await pedir({ ...lanc })).status).toBe(200)
    for (const operacao of ["desativar", "estornar"]) expect((await pedir({ acao: "lancamento", operacao, id: "L1" })).status).toBe(200)
  })
  it("a leitura do CFO devolve o registro das edições; outra chave leva 403", async () => {
    estado.diretor = "cto"
    await pedir({ acao: "lancamento", operacao: "editar", id: "L1", valor: 99, categoria: "frete" })
    const ler = (q = "o=financeiro&parte=edicoes") => GET(new NextRequest(`http://x/api/externo?${q}`, { headers: { authorization: "Bearer k" } }))
    for (const d of ["cto", "cmo", "cco", "coo"]) { estado.diretor = d; expect((await ler()).status, d).toBe(403) }
    estado.diretor = "cfo"
    const j = await (await ler()).json()
    expect(j.total).toBe(2); expect(j.edicoes.map((e: { campo: string }) => e.campo).sort()).toEqual(["categoria", "valor"])
    expect(j.edicoes[0]).toMatchObject({ autor: "cto", lancamentoId: "L1" }); expect(j.edicoes[0].em).toBeTruthy()
    expect((await (await ler("o=financeiro&parte=edicoes&lancamentoId=outro")).json()).total).toBe(0)
  })
  it("desativar e estornar só atualizam (estornadoEm/estornadoPor), nunca deletam", async () => {
    for (const operacao of ["desativar", "estornar"]) {
      estado.ops = []
      const r = await pedir({ acao: "lancamento", operacao, id: "L1" })
      expect(r.status).toBe(200)
      expect(estado.ops.some(o => o.op === "update" && (o.v as Record<string, unknown>).estornadoPor === "cfo")).toBe(true); semDelete()
    }
    expect((await pedir({ acao: "lancamento", operacao: "estornar", id: "nada" })).status).toBe(404)
  })

  it("conciliacao: repassa a decisão a aplicar() e tira contraparte_doc e bruto", async () => {
    aplicarMock.mockResolvedValue({ ok: true, tx: { id: "T1", contraparte_doc: "123", bruto: {}, contraparte_nome: "Fulano" }, atualizados: [{ id: "L1", campos: {} }] })
    const r = await pedir({ acao: "conciliacao", operacao: "vincular", txId: "T1", lancamentoId: "L1", automatico: true })
    const j = await r.json()
    expect(r.status).toBe(200); expect(aplicarMock).toHaveBeenCalledWith("T1", { acao: "vincular", lancamentoId: "L1" })
    expect(j.tx).toEqual({ id: "T1", contraparte_nome: "Fulano" }); expect(JSON.stringify(j)).not.toMatch(/contraparte_doc|bruto/)
    expect(estado.conversa).toHaveLength(1)
    for (const c of [{ operacao: "vincularVarios", lancamentoIds: ["L1", "L2"] }, { operacao: "atualizar", lancamentoId: "L1", campos: { status: "pago" } }, { operacao: "criar", lancamentos: [{ tipo: "despesa", descricao: "x", valor: 2, id: "tmp1" }] }, { operacao: "ignorar", sempre: true }])
      expect((await pedir({ acao: "conciliacao", txId: "T1", ...c })).status).toBe(200)
    expect(aplicarMock.mock.calls.every(([, d]) => d.acao !== "desfazer")).toBe(true)
    expect(aplicarMock.mock.calls[3][1].lancamentos[0].id).toBeUndefined()
  })
  it("conciliacao 400 e erro do aplicar vira 409", async () => {
    for (const c of [{ operacao: "vincular", txId: "T1" }, { operacao: "vincular", lancamentoId: "L1" }, { operacao: "vincularVarios", txId: "T1", lancamentoIds: [] }, { operacao: "atualizar", txId: "T1", lancamentoId: "L1", campos: {} }, { operacao: "criar", txId: "T1", lancamentos: [] }, { operacao: "x", txId: "T1" }])
      expect((await pedir({ acao: "conciliacao", ...c })).status, JSON.stringify(c)).toBe(400)
    aplicarMock.mockResolvedValue({ ok: false, erro: "Essa transação já foi resolvida." })
    expect((await pedir({ acao: "conciliacao", operacao: "ignorar", txId: "T1" })).status).toBe(409)
  })
  it("conciliacao desfazer é lógico: não chama aplicar, não deleta, estorna o criado e volta a pendente", async () => {
    const r = await pedir({ acao: "conciliacao", operacao: "desfazer", txId: "T1" })
    expect(r.status).toBe(200); expect(aplicarMock).not.toHaveBeenCalled(); semDelete()
    expect(estado.ops.some(o => o.t === "LancamentoFinanceiro" && o.op === "update")).toBe(true)
    expect(estado.ops.some(o => o.t === "banco_transacoes" && (o.v as Record<string, unknown>).estado === "pendente")).toBe(true)
    expect(JSON.stringify(await r.json())).not.toMatch(/contraparte_doc|bruto/)
  })

  it("categoria: criar, editar e desativar mantêm o item na lista", async () => {
    let r = await pedir({ acao: "categoria", operacao: "criar", tipo: "despesa", nome: "Água", subcategorias: ["Conta"] })
    expect(r.status).toBe(200); expect((await r.json()).categoria).toMatchObject({ id: "agua", ativa: true, alteradoPor: "cfo" })
    r = await pedir({ acao: "categoria", operacao: "editar", tipo: "despesa", id: "luz", nome: "Energia" })
    expect(r.status).toBe(200)
    r = await pedir({ acao: "categoria", operacao: "desativar", tipo: "despesa", id: "luz" })
    expect(r.status).toBe(200)
    const l = estado.cfg.categoriasDespesa as { id: string; nome: string; ativa?: boolean }[]
    expect(l).toHaveLength(2); expect(l.find(c => c.id === "luz")).toMatchObject({ nome: "Energia", ativa: false })
    expect((await pedir({ acao: "categoria", operacao: "desativar", tipo: "despesa", id: "luz" })).status).toBe(200)
    expect(estado.cfg.categoriasDespesa).toHaveLength(2)
  })
  it("categoria 400 e 404", async () => {
    for (const c of [{ operacao: "criar", tipo: "despesa" }, { operacao: "criar", nome: "a" }, { operacao: "editar", tipo: "despesa", nome: "a" }, { operacao: "desativar", tipo: "receita" }, { operacao: "editar", tipo: "despesa", id: "luz" }, { operacao: "criar", tipo: "despesa", nome: "a", subcategorias: [1] }])
      expect((await pedir({ acao: "categoria", ...c })).status, JSON.stringify(c)).toBe(400)
    expect((await pedir({ acao: "categoria", operacao: "desativar", tipo: "despesa", id: "nada" })).status).toBe(404)
  })

  it("o GET de ajuda documenta as ações só para o CFO", async () => {
    const ler = async () => JSON.stringify((await (await GET(new NextRequest("http://x/api/externo", { headers: { authorization: "Bearer k" } }))).json()).escrita)
    const s = await ler()
    for (const a of ["acao:'lancamento'", "acao:'conciliacao'", "acao:'categoria'"]) expect(s).toContain(a)
    expect(s).not.toContain("operacao:'editar'")   // CFO não vê editar
    estado.diretor = "cmo"
    expect(await ler()).not.toContain("acao:'conciliacao'")
    estado.diretor = "cto"
    expect(await ler()).toContain("operacao:'editar'")
  })
})
