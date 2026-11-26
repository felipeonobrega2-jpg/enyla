// Porta externa: importar_prospectos (só CCO e CMO). A ordem a gráfica do Prospector está em ordemProspecto.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest"

const e = vi.hoisted(() => ({
  base: [] as Record<string, unknown>[], gravados: [] as Record<string, unknown>[], prospecto: true, enviadoDireto: vi.fn(), redigir: vi.fn(),
}))
vi.mock("@/app/lib/supabase", () => ({
  supabase: { from: (t: string) => {
    if (t === "prospectos_parceiros") return {
      select: () => ({ range: async () => ({ data: e.base, error: null }) }),
      insert: (l: Record<string, unknown>) => ({ select: async () => { e.gravados.push(l); return { data: [{ id: 100 + e.gravados.length }], error: null } } }),
      upsert: (l: Record<string, unknown>) => ({ select: async () => { e.gravados.push(l); return { data: [{ id: 100 + e.gravados.length }], error: null } } }),
    }
    const q: Record<string, unknown> = { then: (r: (v: unknown) => void) => r({ data: [] }) }
    for (const m of ["select", "order", "limit", "eq", "ilike"]) q[m] = () => q
    return q
  } },
}))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn(async () => ({})), mudarConfig: vi.fn() }))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => []), gravarConversa: vi.fn() }))
vi.mock("@/app/lib/funcionariosServidor", () => ({ redigirComoFuncionario: e.redigir }))
vi.mock("@/app/lib/prospectorTrava", () => ({ ehProspecto: vi.fn(async () => e.prospecto) }))
vi.mock("@/app/lib/nivelCliente", () => ({ nivelDoDestinatario: vi.fn(async () => ({ nivel: "lead", jaCliente: false, motivo: "" })) }))
vi.mock("@/app/lib/ordemDireta", () => ({ travasAntesDeRedigir: vi.fn(async () => null), enviarAoLead: e.enviadoDireto }))

import { importarProspectosExterno } from "@/app/lib/importarProspectosExterno"

const CNPJ = "11222333000181"   // CNPJ válido de teste (sintético)
const item = (o: Record<string, unknown> = {}) => ({ nome: "Gráfica Teste", cnpj: CNPJ, origem: "contato_felipe", ...o })

beforeEach(() => { e.base = []; e.gravados = []; e.prospecto = true; e.enviadoDireto.mockReset(); e.redigir.mockReset(); e.redigir.mockResolvedValue({ ok: true, texto: "Oi!" }) })

describe("importar_prospectos", () => {
  it("só CCO e CMO: COO, CFO e CTO recebem 403 e nada é gravado", async () => {
    for (const d of ["coo", "cfo", "cto"] as const) expect(await importarProspectosExterno({ itens: [item()] }, d)).toMatchObject({ ok: false, status: 403 })
    expect(e.gravados).toHaveLength(0)
  })
  it("valida o corpo: sem itens, lista vazia e mais de 200 são 400", async () => {
    expect(await importarProspectosExterno({}, "cco")).toMatchObject({ ok: false, status: 400 })
    expect(await importarProspectosExterno({ itens: [] }, "cco")).toMatchObject({ ok: false, status: 400 })
    expect(await importarProspectosExterno({ itens: Array(201).fill(item()) }, "cmo")).toMatchObject({ ok: false, status: 400 })
  })
  it("cria, normaliza o telefone e registra quem importou e a origem", async () => {
    const r = await importarProspectosExterno({ itens: [item({ celular: "(11) 99999-0001", email: "A@B.com", cidade: "Barueri" })] }, "cco")
    expect(r).toMatchObject({ ok: true, criados: [{ indice: 0 }], duplicados: [], recusados: [] })
    expect(e.gravados[0]).toMatchObject({ cnpj: CNPJ, telefone: "11999990001", email: "a@b.com", municipio: "Barueri", etapa: "encontrado" })
    expect(JSON.stringify(e.gravados[0].historico_etapas)).toContain("CCO")
    expect(JSON.stringify(e.gravados[0].historico_etapas)).toContain("contato_felipe")
  })
  it("item sem CNPJ entra (grava cnpj nulo) quando tem celular ou e-mail", async () => {
    const r = await importarProspectosExterno({ itens: [item({ cnpj: "", celular: "11977776666" }), item({ cnpj: undefined, email: "s@c.com" })] }, "cco")
    expect(r.ok && r.criados).toHaveLength(2)
    expect(e.gravados[0]).toMatchObject({ cnpj: null, telefone: "11977776666" })
  })
  it("sem CNPJ, celular nem e-mail é recusado; CNPJ inválido continua recusado", async () => {
    const r = await importarProspectosExterno({ itens: [item({ cnpj: "" }), item({ cnpj: "123" })] }, "cco")
    expect(r.ok && r.recusados.map(x => x.motivo)).toEqual(["sem CNPJ, celular nem e-mail (não há como deduplicar)", "CNPJ inválido"])
    expect(e.gravados).toHaveLength(0)
  })
  it("celular repetido sem CNPJ é duplicado (com e sem o 9, e dentro do lote); e-mail também", async () => {
    e.base = [{ cnpj: null, telefone: "551199990002", email: "y@y.com", etapa: "encontrado", opt_out: false }]
    const r = await importarProspectosExterno({ itens: [item({ cnpj: "", celular: "(11) 9999-0002" }), item({ cnpj: "", email: "Y@y.com" }), item({ cnpj: "", celular: "11955554444" }), item({ cnpj: "", celular: "11 95555-4444" })] }, "cco")
    expect(r.ok && r.criados).toHaveLength(1)
    expect(r.ok && r.duplicados.map(x => x.indice)).toEqual([0, 1, 3])
  })
  it("recusa item sem nome, sem origem, sem CNPJ, CNPJ, telefone ou e-mail inválido", async () => {
    const r = await importarProspectosExterno({ itens: [item({ nome: "" }), item({ origem: "" }), item({ cnpj: "11111111111111" }), item({ celular: "123" }), item({ email: "xx" })] }, "cmo")
    expect(r.ok && r.recusados.map(x => x.motivo)).toEqual(["sem nome", "sem origem", "CNPJ inválido", "telefone inválido", "e-mail inválido"])
    expect(e.gravados).toHaveLength(0)
  })
  it("deduplica por CNPJ, telefone (com e sem o 9) e e-mail, também dentro do mesmo lote", async () => {
    e.base = [{ cnpj: "00000000000191", telefone: "551199990002", email: "x@x.com", etapa: "abordado", opt_out: false }]
    const r = await importarProspectosExterno({ itens: [item({ cnpj: "00000000000191" }), item({ celular: "1199990002" }), item({ celular: "11999990002" }), item({ email: "X@x.com" }), item({ celular: "11988887777" }), item({ celular: "(11) 98888-7777" })] }, "cco")
    expect(r.ok && r.duplicados.map(d => d.indice)).toEqual([0, 1, 2, 3, 5])
    expect(r.ok && r.criados).toHaveLength(1)
  })
  it("respeita a lista de exclusão: opt-out e descartado são recusados, não duplicados", async () => {
    e.base = [{ cnpj: CNPJ, telefone: null, email: null, etapa: "descartado", opt_out: true }, { cnpj: "00000000000191", telefone: null, email: null, etapa: "descartado", opt_out: false }]
    const r = await importarProspectosExterno({ itens: [item(), item({ cnpj: "00000000000191" })] }, "cco")
    expect(r.ok && r.recusados.map(x => x.motivo)).toEqual(["lista de exclusão (pediu para não receber)", "descartado antes (lista de exclusão)"])
    expect(r.ok && r.criados).toHaveLength(0)
    expect(e.gravados).toHaveLength(0)
  })
})
