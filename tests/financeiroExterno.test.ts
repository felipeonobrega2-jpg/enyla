// Porta externa, ?o=financeiro: só a chave do CFO, só leitura, sem dado pessoal de cliente nem documento do banco.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({ diretor: "cfo" as string | null, escritas: 0, tabelas: {} as Record<string, unknown[]>, cfg: {} as Record<string, unknown> }))
vi.mock("@/app/lib/acessoExterno", () => ({
  LIMITE_POR_HORA: 120,
  conferirChave: vi.fn(async () => estado.diretor ? { ok: true, diretor: estado.diretor } : { ok: false, status: 401, erro: "Sem chave." }),
}))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async () => ({})), lerConfigLinha: vi.fn(async () => ({ data: { data: estado.cfg }, error: null })),
  mudarConfig: vi.fn(async () => { estado.escritas++ }),
}))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => []), gravarConversa: vi.fn(async () => { estado.escritas++ }), lerPlanos: vi.fn() }))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn() }))
vi.mock("@/app/lib/gastosServidor", () => ({ gastosAtuais: vi.fn(async () => ({ meta: { restante: 10, diasRestantes: 1 }, ia: { diasRestantes: 1 } })) }))
vi.mock("@/app/lib/supabase", () => {
  const consulta = (t: string) => {
    const q: Record<string, unknown> = {}
    for (const m of ["select", "eq", "order", "limit", "neq", "in", "not"]) q[m] = () => q
    for (const m of ["insert", "update", "delete", "upsert"]) q[m] = () => { estado.escritas++; return q }
    q.then = (ok: (v: unknown) => unknown) => ok({ data: estado.tabelas[t] ?? [], count: (estado.tabelas[t] ?? []).length, error: null })
    return q
  }
  return { supabase: { from: (t: string) => consulta(t) } }
})

import { GET, POST } from "@/app/api/externo/route"
import { NextRequest } from "next/server"

const ler = (q = "") => GET(new NextRequest(`http://x/api/externo?${q}`, { headers: { authorization: "Bearer k" } }))
const PARTES = ["receber", "pagar", "banco", "saldos", "gastos", "margem", "depende", "asaas"]
const mes = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7)

beforeEach(() => {
  estado.diretor = "cfo"; estado.escritas = 0
  estado.cfg = { contas: [{ id: "c1", nome: "Itaú", banco: "Itaú", tipo: "corrente", cor: "#000", saldo: 1500, ativa: true }, { id: "c2", nome: "Cartão", banco: "X", tipo: "credito", cor: "#000", saldo: 300, ativa: true }],
    gastosFixos: [{ id: "g1", nome: "Railway", categoriaId: "servicos", valor: 100, diaVencimento: 5, ativa: true }],
    pluggyStatus: { em: "2026-11-01", novas: 0, contas: [{ id: "p1", nome: "Itaú", banco: "Itaú", saldo: 1500 }] },
    pluggy: { itens: [{ id: "i", token: "SEGREDO" }] }, groqKey: "SEGREDO-GROQ",
    pedidosDigitais: [
      { id: "DIG-0001", nome: "Digital Um", jid: "5511988887777@s.whatsapp.net", email: "dig@cliente.com", documento: "98765432100", status: "producao", total: 1000.37, sinal: 500.13, restante: 500.24, sinalPagoEm: "2026-11-10T12:00:00Z",
        pagamento: { txId: "asaas:pay_sinal1", valor: 500.13, data: "2026-11-10" }, asaas: { sinal: { id: "pay_sinal1" }, restante: { id: "pay_rest1" } } },
      { id: "DIG-0002", nome: "Digital Dois", status: "arte", total: 800.5, sinal: 400.25, restante: 400.25, sinalPagoEm: "2026-11-12T12:00:00Z", pagamento: { txId: "tx-pluggy-9", valor: 400.25, data: "2026-11-12" } },
      { id: "DIG-0003", nome: "Digital Teste", status: "arte", teste: true, total: 10, sinal: 5, sinalPagoEm: "2026-11-12T12:00:00Z" },
    ] }
  estado.tabelas = {
    KanbanCard: [{ id: "k1", numero: "100", nomeCliente: "Cliente A", telefone: "11999990000", email: "a@cliente.com", cnpj: "12.345.678/0001-90", coluna: 1, preco: 1000, quantidade: 100, data: "01/11/2026, 10:00:00" }],
    LancamentoFinanceiro: [
      { id: "l1", tipo: "receita", descricao: "Sinal", valor: 400, dataVencimento: "2026-10-01", status: "pago", dataPagamento: "2026-10-01", cardId: "k1", cardNumero: "100", nomeCliente: "Cliente A", criadoEm: "x" },
      { id: "l2", tipo: "receita", descricao: "Saldo", valor: 600, dataVencimento: "2026-10-20", status: "pendente", cardId: "k1", cardNumero: "100", nomeCliente: "Cliente A", criadoEm: "x" },
      { id: "l3", tipo: "despesa", descricao: "Papel", valor: 250, dataVencimento: "2026-10-10", status: "pendente", categoria: "materiais", criadoEm: "x" },
      { id: "l4", tipo: "despesa", descricao: "Conta forn.", valor: 90, dataVencimento: "2026-10-10", status: "pendente", formaPagamento: "conta", criadoEm: "x" },
      { id: "l5", tipo: "despesa", descricao: "Café", valor: 30, dataVencimento: `${mes}-02`, dataPagamento: `${mes}-02`, status: "pago", categoria: "outros", criadoEm: "x" },
      { id: "l6", tipo: "despesa", descricao: "Railway nov", valor: 100, dataVencimento: `${mes}-05`, dataPagamento: `${mes}-05`, status: "pago", categoria: "servicos", criadoEm: "x" },
    ],
    NegocioParceiro: [], HistoricoItem: [],
    banco_transacoes: [{ id: "t1", conta_id: "c1", conta_nome: "Itaú", data: "2026-11-02", valor: 50, tipo: "saida", descricao: "Pix", contraparte_nome: "Fulano", contraparte_doc: "123.456.789-00", bruto: { x: 1 }, categoria_pluggy: null, estado: "pendente", lancamento_ids: [], sugestao: null }],
  }
})

describe("Digital em ?o=financeiro", () => {
  it("parte=receber traz o bloco digital: sinal sem vínculo em conferência, saldo exato, vencimento vazio", async () => {
    const j = await (await ler("o=financeiro&parte=receber")).json()
    expect(j.digital.pedidos.map((p: { id: string }) => p.id)).toEqual(["DIG-0001", "DIG-0002"])
    expect(j.digital.pedidos[0]).toMatchObject({ pago: 500.13, emConferencia: 0, saldo: 500.24, vencimentoSaldo: null, atrasado: false })
    expect(j.digital.pedidos[1]).toMatchObject({ pago: 0, emConferencia: 400.25, saldo: 400.25 })
    expect(j.pedidos.map((p: { numero: string }) => p.numero)).toEqual(["100"])   // o Offset segue como era
  })
  it("parte=asaas: por pedido, só leitura, sem dado pessoal e sem teste; com vínculo bancário vira confirmado", async () => {
    let j = await (await ler("o=financeiro&parte=asaas")).json()
    expect(j.pedidos.map((p: { id: string }) => p.id)).toEqual(["DIG-0001", "DIG-0002"])
    expect(j.pedidos[0].sinal).toEqual({ cobrancaAsaas: "pay_sinal1", valor: 500.13, status: "confirmado pelo Asaas", recebidoEm: "2026-11-10" })
    expect(j.pedidos[0].restante).toMatchObject({ cobrancaAsaas: "pay_rest1", status: "aguardando pagamento" })
    expect(j.pedidos[1].sinal).toMatchObject({ cobrancaAsaas: null, status: "em conferência", recebidoEm: null })
    expect(JSON.stringify(j)).not.toMatch(/Digital Um|Digital Dois|5511988887777|dig@cliente|98765432100|jid|documento/)
    estado.tabelas.banco_transacoes = [{ id: "t9", lancamento_ids: ["dig-DIG-0002-sinal"], data: "2026-11-13" }]
    j = await (await ler("o=financeiro&parte=asaas")).json()
    expect(j.pedidos[1].sinal).toMatchObject({ status: "confirmado pelo banco", recebidoEm: "2026-11-13" })
    expect(estado.escritas).toBe(0)
  })
})

describe("?o=financeiro", () => {
  it("403 para as outras chaves e 401 sem chave, em todas as partes", async () => {
    for (const d of ["coo", "cco", "cmo", "cto"]) {
      estado.diretor = d
      for (const q of ["o=financeiro", ...PARTES.map(p => `o=financeiro&parte=${p}`)]) expect((await ler(q)).status, `${d} ${q}`).toBe(403)
    }
    estado.diretor = null
    expect((await ler("o=financeiro")).status).toBe(401)
  })
  it("o GET de ajuda documenta ?o=financeiro e as partes só para o CFO", async () => {
    const j = await (await ler()).json()
    const txt = JSON.stringify(j.leitura)
    expect(txt).toContain("?o=financeiro"); expect(txt).toContain("CFO")
    for (const p of PARTES) expect(txt).toContain(`parte=${p}`)
    estado.diretor = "cmo"
    expect(JSON.stringify((await (await ler()).json()).leitura)).not.toContain("parte=banco")
  })
  it("resumo traz a lista das partes", async () => {
    const j = await (await ler("o=financeiro")).json()
    expect(j.partes).toEqual(PARTES)
    expect(j.aReceber.total).toBe(600); expect(j.aReceber.vencido).toBe(600)
    expect(j.aPagar).toMatchObject({ total: 250, vencido: 250, quantidade: 1 })
    expect(j.saldos.total).toBe(1500); expect(j.mes).toHaveProperty("recebidoMes")
  })
  it("cada parte devolve o formato esperado", async () => {
    const g = async (p: string, extra = "") => (await ler(`o=financeiro&parte=${p}${extra}`)).json()
    const rec = await g("receber")
    expect(rec.pedidos[0]).toMatchObject({ numero: "100", cliente: "Cliente A", aReceber: 600 }); expect(rec.vencidos[0]).toMatchObject({ cliente: "Cliente A", valor: 600 })
    const pag = await g("pagar")
    expect(pag.itens).toHaveLength(1); expect(pag.itens[0]).toMatchObject({ id: "l3", vencido: true })
    const ban = await g("banco")
    expect(ban.transacoes[0]).toMatchObject({ id: "t1", contraparte_nome: "Fulano", estado: "pendente" }); expect(ban.pendentes).toBe(1)
    const sal = await g("saldos")
    expect(sal.total).toBe(1500); expect(sal.contas).toHaveLength(2); expect(sal.pluggy.contas[0].id).toBe("p1")
    const gas = await g("gastos")
    expect(gas.fixos.totalAtivos).toBe(100); expect(gas.variaveis.total).toBe(30); expect(gas.variaveis.porCategoria[0].categoria).toBe("outros")
    const mar = await g("margem", "&periodo=tudo")
    expect(mar.dre).toHaveProperty("margemBruta"); expect(Array.isArray(mar.pedidos)).toBe(true)
    const dep = await g("depende")
    expect(dep.itens.map((i: { id: string }) => i.id).sort()).toEqual(["asaas", "ia-saldo", "meta-saldo", "pluggy"])
    expect(dep.itens[0]).toHaveProperty("nivel")
  })
  it("400 para parte, período ou estado inválidos", async () => {
    for (const q of ["parte=x", "periodo=x", "parte=banco&estado=x"]) expect((await ler(`o=financeiro&${q}`)).status).toBe(400)
  })
  it("nenhum payload traz documento do banco, bruto, contato de cliente nem segredo", async () => {
    let tudo = JSON.stringify(await (await ler("o=financeiro")).json())
    for (const p of PARTES) tudo += JSON.stringify(await (await ler(`o=financeiro&parte=${p}&periodo=tudo&estado=todas`)).json())
    for (const proibido of ["contraparte_doc", "123.456.789-00", "bruto", "11999990000", "a@cliente.com", "12.345.678", "telefone", "email", "cnpj", "SEGREDO"]) expect(tudo, proibido).not.toContain(proibido)
  })
  it("estornados ficam fora dos totais por padrão e voltam com incluirEstornados", async () => {
    const ls = estado.tabelas.LancamentoFinanceiro as Record<string, unknown>[]
    ls.push({ id: "l7", tipo: "despesa", descricao: "Estornada", valor: 70, dataVencimento: "2026-10-12", status: "pendente", categoria: "materiais", estornadoEm: "2026-11-24T10:00:00Z", estornadoPor: "cfo", criadoEm: "x" })
    ls.push({ id: "l8", tipo: "despesa", descricao: "Gasto estornado", valor: 55, dataVencimento: `${mes}-03`, dataPagamento: `${mes}-03`, status: "pago", categoria: "outros", estornadoEm: "2026-11-24T10:00:00Z", criadoEm: "x" })
    ls.push({ id: "l9", tipo: "receita", descricao: "Receita estornada", valor: 900, dataVencimento: "2026-10-25", status: "pendente", cardId: "k1", cardNumero: "100", nomeCliente: "Cliente A", estornadoEm: "2026-11-24T10:00:00Z", criadoEm: "x" })
    const j = await (await ler("o=financeiro")).json()
    expect(j.incluirEstornados).toBe(false)
    expect(j.aPagar).toMatchObject({ total: 250, quantidade: 1 }); expect(j.aReceber.total).toBe(600)
    const pag = await (await ler("o=financeiro&parte=pagar")).json()
    expect(pag.itens.map((i: { id: string }) => i.id)).toEqual(["l3"])
    const gas = await (await ler("o=financeiro&parte=gastos")).json()
    expect(gas.variaveis.total).toBe(30)
    const rec = await (await ler("o=financeiro&parte=receber")).json()
    expect(rec.pedidos[0].aReceber).toBe(600)
    for (const v of ["1", "true", "sim"]) {
      const k = await (await ler(`o=financeiro&incluirEstornados=${v}`)).json()
      expect(k.incluirEstornados).toBe(true); expect(k.aPagar).toMatchObject({ total: 320, quantidade: 2 })
    }
    const pag2 = await (await ler("o=financeiro&parte=pagar&incluirEstornados=1")).json()
    expect(pag2.incluirEstornados).toBe(true); expect(pag2.itens.map((i: { id: string }) => i.id).sort()).toEqual(["l3", "l7"])
    expect((await (await ler("o=financeiro&parte=gastos&incluirEstornados=1")).json()).variaveis.total).toBe(85)
    expect((await ler("o=financeiro&incluirEstornados=talvez")).status).toBe(400)
    expect((await ler("o=financeiro&incluirEstornados=0")).status).toBe(400)
  })
  it("nada é gravado", async () => {
    await ler("o=financeiro")
    for (const p of PARTES) await ler(`o=financeiro&parte=${p}`)
    expect(estado.escritas).toBe(0)
  })
  it("gasto_fixo continua só para o CFO", async () => {
    estado.diretor = "cmo"
    const r = await POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify({ acao: "gasto_fixo", operacao: "criar", nome: "x", valor: 1 }) }))
    expect(r.status).toBe(403)
  })
})
