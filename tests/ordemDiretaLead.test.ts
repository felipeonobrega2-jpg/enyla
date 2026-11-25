// Regra do Felipe (25/11): só cliente (A, B, C) precisa do Aprovo; lead sai direto pelo agente. Indefinido = cliente.
import { describe, it, expect, vi, beforeEach } from "vitest"

const e = vi.hoisted(() => ({
  conversa: [] as { id?: string; acoes?: Record<string, unknown>[] }[], grava: null as unknown,
  nivel: { nivel: "lead", jaCliente: false, motivo: "" } as { nivel: string; jaCliente: boolean; motivo: string },
  cfg: {} as Record<string, unknown>, enviar: vi.fn(), voce: false, redigir: vi.fn(), contador: 0,
  conversas: [{ jid: "5511999990001@s.whatsapp.net", nome: "Maria Perfumes", telefone: "5511999990001", ultima_at: "2026-11-24" }] as Record<string, unknown>[],
}))
const cadeia = (rows: unknown[]) => { const q: Record<string, unknown> = { then: (r: (v: unknown) => void) => r({ data: rows }), maybeSingle: async () => ({ data: rows[0] ?? null }) }; for (const m of ["select", "order", "limit", "eq", "ilike"]) q[m] = () => q; return q }
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: (t: string) => cadeia(t === "whatsapp_conversas" ? e.conversas : []) } }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async () => ({ guiaAtendimento: "guia" })),
  mudarConfig: vi.fn(async (f: (d: Record<string, unknown>) => Record<string, unknown> | null) => {
    const d = { ordemDiretaDia: e.contador ? { cco: { dia: new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }), n: e.contador } } : {} }
    return f(d)
  }),
}))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => e.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown) => { e.grava = m; e.conversa = m as never }) }))
vi.mock("@/app/lib/funcionariosServidor", () => ({ redigirComoFuncionario: e.redigir }))
vi.mock("@/app/lib/nivelCliente", () => ({ nivelDoDestinatario: vi.fn(async () => e.nivel) }))
vi.mock("@/app/lib/prospectorTrava", () => ({ ehProspecto: vi.fn(async () => false) }))
vi.mock("@/app/lib/conversaDoFelipe", () => ({ lerConversaDoFelipe: vi.fn(async () => ({ doFelipe: e.voce, motivo: e.voce ? "escreveu nas últimas 24 h" : null })) }))
vi.mock("@/app/lib/agenteAuto", () => ({
  lerCfg: vi.fn(async () => e.cfg), enviar: e.enviar,
  lerConversa: vi.fn(async (jid: string) => ({ jid, nome: "Maria Perfumes", telefone: "5511999990001", etiquetas: [], status_lead: null })),
}))
const enviarAoCliente = vi.hoisted(() => vi.fn())
vi.mock("@/app/lib/enviarCliente", () => ({ enviarAoCliente, destinoDoCliente: vi.fn() }))
vi.mock("@/app/lib/claude", () => ({ clienteClaude: vi.fn(), MODELO: "m" }))
vi.mock("@/app/lib/gastosServidor", () => ({ registrarUsoIA: vi.fn() }))
vi.mock("@/app/lib/reuniaoDiretoria", () => ({ coletarContexto: vi.fn() }))

import { executarFerramenta, type Foto } from "@/app/lib/conversaDiretor"
import { cancelarOrdem } from "@/app/lib/cancelarOrdem"
import { MAX_DIRETOS_DIA } from "@/app/lib/ordemDireta"

const ctx = { exec: [], cultura: [], detalhes: {} } as unknown as Foto
const ordenar = (extra: Record<string, unknown> = {}, enviarLead = true) =>
  executarFerramenta("cco", "ordenar_funcionario", { funcionario: "atendente", cliente: "Maria Perfumes", ordem: "x", ...extra }, { ctx, apiKey: "k", grava: true, enviarLead })
const ligado = { ligado: true, horario: { dias: [0, 1, 2, 3, 4, 5, 6], inicio: "00:00", fim: "24:00" } }

beforeEach(() => {
  e.conversa = []; e.grava = null; e.voce = false; e.contador = 0
  e.nivel = { nivel: "lead", jaCliente: false, motivo: "" }
  e.cfg = { agenteAuto: ligado, pedidosDigitais: [], agenteLog: [] }
  e.enviar.mockReset(); e.enviar.mockResolvedValue({ ids: ["w1"] })
  e.redigir.mockReset(); e.redigir.mockResolvedValue({ ok: true, texto: "Oi Maria! Pode mandar as medidas?" })
  enviarAoCliente.mockReset()
})

describe("ordenar_funcionario: lead sai direto", () => {
  it("lead: enviado_direto pelo enviar do agenteAuto (proativo), com rastro direto:true", async () => {
    const r = await ordenar()
    expect(r.destino).toBe("enviado_direto"); expect(r.nivel).toBe("lead"); expect(r.motivo).toBe("lead sem compra: enviado pelo Atendente")
    expect(e.enviar).toHaveBeenCalledTimes(1)
    expect(e.enviar.mock.calls[0][1]).toBe("Oi Maria! Pode mandar as medidas?")
    expect(e.enviar.mock.calls[0][3]).toEqual({ proativo: true })
    expect(r.acao).toMatchObject({ tipo: "mensagem", status: "enviado", direto: true })
    expect((r.acao as { em?: string }).em).toBeTruthy()
    expect(enviarAoCliente).not.toHaveBeenCalled()
  })
  it.each(["A", "B", "C"])("cliente %s: fila do Aprovo, nada enviado", async n => {
    e.nivel = { nivel: n, jaCliente: true, motivo: "" }
    const r = await ordenar()
    expect(r.destino).toBe("fila_aprovo"); expect(r.nivel).toBe(n); expect(r.motivo).toBe(`cliente ${n}: precisa do Aprovo do Felipe`)
    expect(r.acao).toMatchObject({ status: "aguardando" })
    expect(e.enviar).not.toHaveBeenCalled(); expect(enviarAoCliente).not.toHaveBeenCalled()
  })
  it("nível indefinido (compra antiga ou só digital, ligação fraca, erro de leitura): fila por segurança", async () => {
    e.nivel = { nivel: "indefinido", jaCliente: false, motivo: "" }
    const r = await ordenar()
    expect(r.destino).toBe("fila_aprovo"); expect(r.motivo).toBe("nível indefinido: fila por segurança")
    expect(e.enviar).not.toHaveBeenCalled()
  })
  it("sem enviarLead (conversa com o Felipe) tudo vai à fila, até lead", async () => {
    const r = await ordenar({}, false)
    expect(r.acao).toMatchObject({ status: "aguardando" }); expect(e.enviar).not.toHaveBeenCalled()
  })
  it("lead que promete orçamento sem link real: fila com o texto reescrito", async () => {
    e.redigir.mockResolvedValue({ ok: true, texto: "Oi Maria! Segue o orçamento do seu pedido." })
    const r = await ordenar()
    expect(r.destino).toBe("fila_aprovo"); expect(r.motivo).toBe("prometia orçamento sem proposta real")
    expect(e.enviar).not.toHaveBeenCalled()
    expect((r.acao as { texto: string }).texto).not.toMatch(/segue o orçamento/i)
  })
  it("lead fora do horário (agente desligado): 409, nada enviado, nada criado, IA nem chamada", async () => {
    e.cfg = { agenteAuto: { ...ligado, ligado: false }, pedidosDigitais: [] }
    const r = await ordenar()
    expect(r.status).toBe(409); expect(r.motivo).toBe("fora do horário do agente"); expect(r.acao).toBeUndefined()
    expect(e.enviar).not.toHaveBeenCalled(); expect(e.redigir).not.toHaveBeenCalled()
  })
  it("lead fora do horário do agente configurado: 409", async () => {
    e.cfg = { agenteAuto: { ligado: true, horario: { dias: [], inicio: "08:00", fim: "18:00" } } }
    expect((await ordenar()).status).toBe(409)
  })
  it("o Felipe escreveu há pouco: fila, sem envio", async () => {
    e.voce = true
    const r = await ordenar()
    expect(r.destino).toBe("fila_aprovo"); expect(e.enviar).not.toHaveBeenCalled()
  })
  it("não é lead (nao_lead): 400; grupo: 400", async () => {
    e.cfg = { agenteAuto: ligado, agenteLog: [{ jid: "5511999990001@s.whatsapp.net", perfil: "nao_lead" }] }
    expect((await ordenar()).status).toBe(400)
    e.cfg = { agenteAuto: ligado, agenteLog: [] }
    e.conversas = [{ jid: "123@g.us", nome: "Grupo", telefone: null, ultima_at: "2026-11-24" }]
    // grupo nem é achado pelo acharLead (404): em qualquer caso, nada sai
    expect([400, 404]).toContain((await ordenar({ cliente: "Grupo" })).status)
    expect(e.enviar).not.toHaveBeenCalled()
    e.conversas = [{ jid: "5511999990001@s.whatsapp.net", nome: "Maria Perfumes", telefone: "5511999990001", ultima_at: "2026-11-24" }]
  })
  it("enviar com erro (limite por hora / WhatsApp fora): 429/503, sem fila", async () => {
    e.enviar.mockResolvedValue({ ids: [], erro: "não enviou (limite por hora)" })
    const r = await ordenar()
    expect(r.status).toBe(429); expect(r.acao).toBeUndefined()
    e.enviar.mockResolvedValue({ ids: [], erro: "não enviou (500)" })
    expect((await ordenar()).status).toBe(503)
  })
  it("a 21ª ordem direta do dia volta 429", async () => {
    e.contador = MAX_DIRETOS_DIA
    const r = await ordenar()
    expect(r.status).toBe(429); expect(e.enviar).not.toHaveBeenCalled()
  })
})

describe("cancelar_ordem", () => {
  const cartao = (id: string, status: string) => ({ id, tipo: "mensagem", funcionario: "Atendente", cliente: "Maria", texto: "Oi", status })
  it("cancela ordem própria aguardando: só muda o status e mantém a ação e a mensagem", async () => {
    e.conversa = [{ id: "m1", acoes: [cartao("a1", "aguardando")] }, { id: "m2" }]
    const r = await cancelarOrdem("cco", { id: "a1" })
    expect(r.status).toBe(200)
    expect(e.conversa).toHaveLength(2)
    expect(e.conversa[0].acoes![0]).toMatchObject({ id: "a1", status: "cancelado", canceladoPor: "cco", texto: "Oi" })
    expect(e.conversa[0].acoes![0].canceladoEm).toBeTruthy()
  })
  it.each(["enviado", "descartado", "erro", "cancelado"])("ordem %s: 409 e nada muda", async st => {
    e.conversa = [{ acoes: [cartao("a1", st)] }]
    const r = await cancelarOrdem("cco", { id: "a1" })
    expect(r.status).toBe(409); expect(e.grava).toBeNull(); expect(e.conversa[0].acoes![0].status).toBe(st)
  })
  it("ordem inexistente ou de outro diretor (não está na conversa dele): 404", async () => {
    e.conversa = [{ acoes: [cartao("a1", "aguardando")] }]
    expect((await cancelarOrdem("cco", { id: "zzz" })).status).toBe(404)
    expect((await cancelarOrdem("cco", {})).status).toBe(400)
    expect(e.grava).toBeNull()
  })
})
