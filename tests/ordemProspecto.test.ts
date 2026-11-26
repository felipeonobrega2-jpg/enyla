// Ordem a gráfica do Prospector (regra do Felipe, 26/11/2026): sai direto, fora do Aprovo.
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

import { executarFerramenta, type Foto } from "@/app/lib/conversaDiretor"

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
