// Diretoria aciona Atendente/Follow-up/Reativação por lead: só CCO e CMO, cartão "aguardando", nada sai sem o Aprovo.
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"

const e = vi.hoisted(() => ({
  conversa: [] as { acoes?: unknown[] }[], enviado: [] as unknown[][], redigir: vi.fn(),
  conversas: [{ jid: "5511999990001@s.whatsapp.net", nome: "Maria Perfumes", telefone: "5511999990001", ultima_at: "2026-11-24" }] as Record<string, string>[],
  grava: null as unknown,
}))
const cadeia = (rows: unknown[]) => { const q: Record<string, unknown> = { then: (r: (v: unknown) => void) => r({ data: rows }) }; for (const m of ["select", "order", "limit", "eq", "ilike"]) q[m] = () => q; return q }
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: (t: string) => cadeia(t === "whatsapp_conversas" ? e.conversas : []) } }))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn(async () => ({ guiaAtendimento: "guia" })), mudarConfig: vi.fn(), lerConfigLinha: vi.fn() }))
vi.mock("@/app/lib/diretoriaServidor", () => ({
  lerConversa: vi.fn(async () => e.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown) => { e.grava = m }),
  gravarPlano: vi.fn(), pedirFerramenta: vi.fn(), lerFoto: vi.fn(), gravarFoto: vi.fn(),
}))
vi.mock("@/app/lib/funcionariosServidor", () => ({ redigirComoFuncionario: e.redigir }))
vi.mock("@/app/lib/enviarCliente", () => ({ enviarAoCliente: vi.fn(async (...a: unknown[]) => { e.enviado.push(a); return { ok: true, jid: a[2] } }), destinoDoCliente: vi.fn() }))
vi.mock("@/app/lib/claude", () => ({ clienteClaude: vi.fn(), MODELO: "m" }))
vi.mock("@/app/lib/gastosServidor", () => ({ registrarUsoIA: vi.fn() }))
vi.mock("@/app/lib/reuniaoDiretoria", () => ({ coletarContexto: vi.fn() }))

import { executarFerramenta, responderAcao, type Foto } from "@/app/lib/conversaDiretor"
import { MAX_PENDENTES, comerciaisDoDiretor } from "@/app/lib/ordemComercial"

const ctx = { exec: [{ id: "posvenda", nome: "Pós-venda", capacidade: "mensagem_cliente", status: "contratado", aprendizados: [], qualificacao: "", onboarding: { conceitos: [], pode: [], naoPode: [] } }], cultura: [], detalhes: {} } as unknown as Foto
const ordenar = (d: "cco" | "cmo" | "coo" | "cfo" | "cto", x: Record<string, unknown>) => executarFerramenta(d, "ordenar_funcionario", x, { ctx, apiKey: "k", grava: true })
const JID = "5511999990001@s.whatsapp.net"

beforeEach(() => {
  e.conversa = []; e.enviado = []; e.grava = null
  e.redigir.mockReset(); e.redigir.mockResolvedValue({ ok: true, texto: "Oi Maria! Pode mandar as medidas?" })
})

describe("ordenar_funcionario com os agentes do Comercial", () => {
  for (const d of ["cco", "cmo"] as const) {
    it(`${d} ordena a atendente: cartão aguardando com o jid do lead e nenhum envio`, async () => {
      const r = await ordenar(d, { funcionario: "atendente", cliente: "Maria Perfumes", ordem: "cobrar medidas" })
      expect(r.acao).toMatchObject({ tipo: "mensagem", status: "aguardando", funcionario: "Atendente", cliente: "Maria Perfumes", jid: JID })
      expect(e.redigir).toHaveBeenCalledWith(expect.objectContaining({ jid: JID, guia: "guia" }))
      expect(e.enviado).toHaveLength(0)
    })
  }
  it("aceita o lead pelo jid e pelo telefone", async () => {
    expect((await ordenar("cco", { funcionario: "followup", jid: JID, ordem: "retomar" })).acao).toMatchObject({ jid: JID })
    expect((await ordenar("cmo", { funcionario: "reativacao", cliente: "(11) 99999-0001", ordem: "reativar" })).acao).toMatchObject({ jid: JID })
  })
  it("COO, CFO e CTO não acionam; Pós-venda continua como antes", async () => {
    for (const d of ["coo", "cfo", "cto"] as const) {
      const r = await ordenar(d, { funcionario: "atendente", cliente: "Maria Perfumes", ordem: "x" })
      expect(r.acao).toBeUndefined(); expect(r.status).toBe(403)
    }
    expect(e.redigir).not.toHaveBeenCalled()
    const r = await ordenar("coo", { funcionario: "posvenda", cliente: "Maria", ordem: "avisar atraso" })
    expect(r.acao).toMatchObject({ tipo: "mensagem", funcionario: "Pós-venda", status: "aguardando" })
    expect((r.acao as { jid?: string }).jid).toBeUndefined()
  })
  it("lista os três só para CCO e CMO", () => {
    expect(comerciaisDoDiretor("cco").map(f => f.id)).toEqual(["atendente", "followup", "reativacao"])
    expect(comerciaisDoDiretor("cmo")).toHaveLength(3)
    expect(comerciaisDoDiretor("coo")).toHaveLength(0)
  })
  it("lead sem WhatsApp: erro claro, sem cartão e sem redigir", async () => {
    const r = await ordenar("cco", { funcionario: "atendente", cliente: "Fulano Sem Conversa", ordem: "x" })
    expect(r.acao).toBeUndefined(); expect(r.status).toBe(404); expect(r.saida).toMatch(/Não achei WhatsApp/)
    expect(e.redigir).not.toHaveBeenCalled()
  })
  it("a 21ª ordem pendente volta 429", async () => {
    const card = (i: number) => ({ id: `a${i}`, tipo: "mensagem", status: i < MAX_PENDENTES ? "aguardando" : "enviado" })
    e.conversa = [{ acoes: Array.from({ length: MAX_PENDENTES + 3 }, (_, i) => card(i)) }]
    const r = await ordenar("cco", { funcionario: "atendente", cliente: "Maria Perfumes", ordem: "x" })
    expect(r.acao).toBeUndefined(); expect(r.status).toBe(429); expect(r.saida).toMatch(/máximo 20/)
    e.conversa = [{ acoes: Array.from({ length: MAX_PENDENTES - 1 }, (_, i) => card(i)) }]
    expect((await ordenar("cco", { funcionario: "atendente", cliente: "Maria Perfumes", ordem: "x" })).acao).toBeDefined()
  })
})

describe("Aprovo", () => {
  const cartao = () => ({ id: "c1", tipo: "mensagem", funcionario: "Atendente", cliente: "Maria Perfumes", jid: JID, texto: "Oi!", status: "aguardando" })
  it("aprovo envia para o jid certo", async () => {
    e.conversa = [{ acoes: [cartao()] }]
    await responderAcao("cco", "c1", "aprovo")
    expect(e.enviado).toEqual([["Maria Perfumes", "Oi!", JID]])
  })
  it("descartar não envia", async () => {
    e.conversa = [{ acoes: [cartao()] }]
    await responderAcao("cco", "c1", "descartar")
    expect(e.enviado).toHaveLength(0)
  })
})

describe("envio só com Aprovo", () => {
  it("o arquivo novo nunca envia nada (nem importa o envio nem fala com a Evolution)", () => {
    const src = readFileSync("app/lib/ordemComercial.ts", "utf8")
    expect(src).not.toMatch(/enviarAoCliente|enviarCliente|sendText|evolution|reservarVezDeEnviar/)
  })
  it("ordenar não chama o envio em nenhum caminho (sucesso, falha, bloqueio)", async () => {
    await ordenar("cco", { funcionario: "atendente", cliente: "Maria Perfumes", ordem: "x" })
    e.redigir.mockResolvedValueOnce({ ok: false, erro: "sem texto" })
    await ordenar("cmo", { funcionario: "followup", jid: JID, ordem: "x" })
    await ordenar("coo", { funcionario: "atendente", cliente: "Maria Perfumes", ordem: "x" })
    expect(e.enviado).toHaveLength(0)
  })
  it("o único envio de cartão de lead exige o Aprovo (status enviado não reenvia)", async () => {
    e.conversa = [{ acoes: [{ id: "c1", tipo: "mensagem", cliente: "M", jid: JID, texto: "x", status: "enviado" }] }]
    await responderAcao("cco", "c1", "aprovo")
    expect(e.enviado).toHaveLength(0)
  })
})
