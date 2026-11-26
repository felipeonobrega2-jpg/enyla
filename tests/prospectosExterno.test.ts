// importar_prospectos e ordem a gráfica do Prospector (regra do Felipe, 26/11/2026): sai direto, fora do Aprovo.
import { describe, it, expect, vi, beforeEach } from "vitest"

const e = vi.hoisted(() => ({
  base: [] as Record<string, unknown>[], inseridos: [] as Record<string, unknown>[], hist: [] as unknown[],
  nivel: { nivel: "lead", jaCliente: false, motivo: "" } as { nivel: string; jaCliente: boolean; motivo: string },
  prospecto: null as Record<string, unknown> | null, evo: vi.fn(), redigir: vi.fn(), conversa: [] as unknown[],
}))
const cadeia = (rows: () => unknown[]) => {
  const q: Record<string, unknown> = {
    then: (r: (v: unknown) => void) => r({ data: rows(), error: null }),
    maybeSingle: async () => ({ data: rows()[0] ?? null }),
    upsert: (linhas: Record<string, unknown>[]) => { e.inseridos.push(...linhas); const q2 = cadeia(() => linhas.map((l, i) => ({ id: 100 + i, cnpj: l.cnpj }))); return q2 },
    update: (c: Record<string, unknown>) => { e.hist = c.historico_etapas as unknown[]; return cadeia(() => [{ id: 1 }]) },
  }
  for (const m of ["select", "order", "limit", "eq", "range", "in"]) q[m] = () => q
  return q
}
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: () => cadeia(() => e.base) } }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async () => ({})),
  mudarConfig: vi.fn(async (f: (d: Record<string, unknown>) => unknown) => f({})),
}))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => e.conversa), gravarConversa: vi.fn() }))
vi.mock("@/app/lib/funcionariosServidor", () => ({ redigirComoFuncionario: e.redigir }))
vi.mock("@/app/lib/nivelCliente", () => ({ nivelDoDestinatario: vi.fn(async () => e.nivel) }))
vi.mock("@/app/lib/prospectorTrava", () => ({ prospectoDoJid: vi.fn(async () => e.prospecto), ehProspecto: vi.fn(async () => !!e.prospecto) }))
vi.mock("@/app/lib/evolution", () => ({ evo: e.evo }))
vi.mock("@/app/lib/agenteAuto", () => ({ lerCfg: vi.fn(async () => ({})), enviar: vi.fn(), voceNaConversa: vi.fn(async () => false), lerConversa: vi.fn() }))
vi.mock("@/app/lib/claude", () => ({ clienteClaude: vi.fn(), MODELO: "m" }))
vi.mock("@/app/lib/gastosServidor", () => ({ registrarUsoIA: vi.fn() }))
vi.mock("@/app/lib/reuniaoDiretoria", () => ({ coletarContexto: vi.fn() }))

import { importarProspectos } from "@/app/lib/importarProspectosExterno"
import { executarFerramenta, type Foto } from "@/app/lib/conversaDiretor"

const ok = { nome: "Gráfica Alfa", cnpj: "11.222.333/0001-81", email: "a@alfa.com.br", celular: "(11) 99999-0001", cidade: "Barueri", origem: "contato_felipe" }

describe("importar_prospectos", () => {
  beforeEach(() => { e.base = []; e.inseridos = [] })
  it.each(["coo", "cfo", "cto"] as const)("permissão: %s recebe 403 e nada é gravado", async d => {
    const r = await importarProspectos(d, { itens: [ok] })
    expect(r).toMatchObject({ ok: false, status: 403 }); expect(e.inseridos).toHaveLength(0)
  })
  it.each(["cco", "cmo"] as const)("%s importa: grava etapa encontrado, origem e quem fez no histórico", async d => {
    const r = await importarProspectos(d, { itens: [ok] })
    expect(r.ok && r.criados).toHaveLength(1)
    expect(e.inseridos[0]).toMatchObject({ cnpj: "11222333000181", telefone: "11999990001", etapa: "encontrado", nota: null })
    expect(JSON.stringify(e.inseridos[0].historico_etapas)).toContain(d.toUpperCase()); expect(JSON.stringify(e.inseridos[0].historico_etapas)).toContain("contato_felipe")
  })
  it("validação: sem itens, itens demais, sem nome, origem, CNPJ, e-mail ou celular inválido", async () => {
    expect(await importarProspectos("cco", {})).toMatchObject({ ok: false, status: 400 })
    expect(await importarProspectos("cco", { itens: Array(201).fill(ok) })).toMatchObject({ ok: false, status: 400 })
    const r = await importarProspectos("cco", { itens: [{ ...ok, nome: "" }, { ...ok, origem: "" }, { ...ok, cnpj: "123" }, { ...ok, email: "xx" }, { ...ok, celular: "123" }] })
    expect(r.ok && r.recusados.map(x => x.motivo)).toEqual(["nome obrigatório", "origem obrigatória", "CNPJ obrigatório, com 14 dígitos", "e-mail inválido", "celular inválido (DDD + número)"])
    expect(e.inseridos).toHaveLength(0)
  })
  it("deduplica por CNPJ, telefone (com ou sem o 9 e o 55) e e-mail, inclusive dentro da chamada", async () => {
    e.base = [{ id: 7, cnpj: "99999999000199", telefone: "1199990001", email: null, opt_out: false, etapa: "encontrado" }, { id: 8, cnpj: "88888888000188", telefone: null, email: "b@beta.com", opt_out: false, etapa: "abordado" }]
    const r = await importarProspectos("cco", { itens: [
      { ...ok, cnpj: "99999999000199", email: "", celular: "" }, ok, { ...ok, cnpj: "77777777000177", email: "B@Beta.com", celular: "" }, { ...ok, cnpj: "66666666000166", email: "novo@x.com", celular: "5511999990001" },
      { ...ok, cnpj: "11222333000181", email: "z@z.com", celular: "11988880000" }, { ...ok, cnpj: "11222333000181", email: "z@z.com", celular: "11988880000" },
    ] })
    expect(r.ok && r.duplicados.map(d => d.motivo)).toEqual(["já existe (mesmo CNPJ)", "já existe (mesmo telefone)", "já existe (mesmo e-mail)", "já existe (mesmo telefone)", "repetido na própria chamada"])
    expect(r.ok && r.criados).toHaveLength(1)
  })
  it("exclusão: opt_out ou descartado é recusado com o motivo e nunca regravado", async () => {
    e.base = [{ id: 1, cnpj: "11222333000181", telefone: null, email: null, opt_out: true, etapa: "descartado" }, { id: 2, cnpj: "55555555000155", telefone: null, email: null, opt_out: false, etapa: "descartado" }]
    const r = await importarProspectos("cco", { itens: [ok, { ...ok, cnpj: "55555555000155", email: "", celular: "" }] })
    expect(r.ok && r.recusados.map(x => x.motivo)).toEqual(Array(2).fill("na lista de exclusão (descartado ou pediu para não receber)"))
    expect(e.inseridos).toHaveLength(0)
  })
})

const ctx = { exec: [], cultura: [], detalhes: {} } as unknown as Foto
const ordenar = (extra: Record<string, unknown> = {}, diretor: "cco" | "coo" = "cco") =>
  executarFerramenta(diretor, "ordenar_funcionario", { funcionario: "atendente", jid: "5511999990001@s.whatsapp.net", ordem: "x", ...extra }, { ctx, apiKey: "k", grava: true, enviarLead: true })
const util = new Date("2026-11-26T15:00:00Z").getTime()   // quinta, 12h em São Paulo
const sabado = new Date("2026-11-28T15:00:00Z").getTime()

describe("ordenar_funcionario a gráfica do Prospector", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(util)
    e.nivel = { nivel: "lead", jaCliente: false, motivo: "" }; e.conversa = []; e.hist = []
    e.prospecto = { id: 1, razao_social: "Gráfica Alfa", nome_fantasia: null, telefone: "11999990001", etapa: "encontrado", opt_out: false, historico_etapas: [], atualizado_em: "2026-11-26T00:00:00Z" }
    e.evo.mockReset(); e.evo.mockResolvedValue({ ok: true, status: 201, corpo: { key: { id: "w1" } } })
    e.redigir.mockReset(); e.redigir.mockResolvedValue({ ok: true, texto: "Oi! Vocês fazem terceirização?" })
  })
  it("sai direto, sem conversa anterior, e grava no histórico com quem fez", async () => {
    const r = await ordenar()
    expect(r.destino).toBe("enviado_direto"); expect(r.acao).toMatchObject({ status: "enviado", direto: true })
    expect(JSON.parse(e.evo.mock.calls[0][1].body)).toEqual({ number: "5511999990001", text: "Oi! Vocês fazem terceirização?" })
    expect(JSON.stringify(e.hist)).toContain("CCO"); expect(JSON.stringify(e.hist)).toContain("enviada")
  })
  it("prospecto excluído: 409 e nada sai", async () => {
    e.prospecto!.opt_out = true
    const r = await ordenar()
    expect(r.status).toBe(409); expect(r.acao).toBeUndefined(); expect(e.evo).not.toHaveBeenCalled(); expect(e.redigir).not.toHaveBeenCalled()
    e.prospecto!.opt_out = false; e.prospecto!.etapa = "descartado"
    expect((await ordenar()).status).toBe(409); expect(e.evo).not.toHaveBeenCalled()
  })
  it("fora do horário (sábado ou 21h): 409 e nada sai", async () => {
    vi.setSystemTime(sabado)
    expect((await ordenar()).status).toBe(409)
    vi.setSystemTime(new Date("2026-11-26T00:30:00Z"))   // quarta, 21h30 em São Paulo
    expect((await ordenar()).status).toBe(409)
    expect(e.evo).not.toHaveBeenCalled()
  })
  it.each(["A", "B", "C", "indefinido"])("cliente %s continua na fila do Aprovo, nada sai", async n => {
    e.nivel = { nivel: n, jaCliente: true, motivo: "" }
    const r = await ordenar()
    expect(r.destino).not.toBe("enviado_direto"); expect(e.evo).not.toHaveBeenCalled()
  })
  it("diretor sem permissão (COO) recebe 403 e nada sai", async () => {
    const r = await ordenar({}, "coo")
    expect(r.status).toBe(403); expect(e.evo).not.toHaveBeenCalled()
  })
})
