// Chave aprovoObrigatorio (AppConfig, padrão false): desligada, o que ia para a fila do Aprovo sai direto, com as outras travas.
import { describe, it, expect, vi, beforeEach } from "vitest"

const e = vi.hoisted(() => ({
  conversa: [] as { id?: string; acoes?: Record<string, unknown>[] }[],
  obrigatorio: undefined as boolean | undefined,
  nivel: { nivel: "A", jaCliente: true, motivo: "" } as { nivel: string; jaCliente: boolean; motivo: string },
  cfg: {} as Record<string, unknown>, enviar: vi.fn(), voce: false, redigir: vi.fn(), contador: 0, log: [] as Record<string, unknown>[],
  receber: [] as { numero: string; cliente: string; aReceber: number }[], prospecto: false,
  conversas: [{ jid: "5511999990001@s.whatsapp.net", nome: "Cliente Teste", telefone: "5511999990001", ultima_at: "2026-11-24" }] as Record<string, unknown>[],
}))
const cadeia = (rows: unknown[]) => { const q: Record<string, unknown> = { then: (r: (v: unknown) => void) => r({ data: rows }), maybeSingle: async () => ({ data: rows[0] ?? null }) }; for (const m of ["select", "order", "limit", "eq", "ilike"]) q[m] = () => q; return q }
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: (t: string) => cadeia(t === "whatsapp_conversas" ? e.conversas : []) } }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async () => ({ guiaAtendimento: "guia", ...(e.obrigatorio === undefined ? {} : { aprovoObrigatorio: e.obrigatorio }) })),
  mudarConfig: vi.fn(async (f: (d: Record<string, unknown>) => Record<string, unknown> | null) => {
    const dia = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
    const r = f({ ordemDiretaDia: e.contador ? { cco: { dia, n: e.contador } } : {}, aprovoDesligadoLog: e.log })
    if (r && "aprovoDesligadoLog" in r) e.log = r.aprovoDesligadoLog as Record<string, unknown>[]
    return r
  }),
}))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => e.conversa), gravarConversa: vi.fn() }))
vi.mock("@/app/lib/funcionariosServidor", () => ({ redigirComoFuncionario: e.redigir }))
vi.mock("@/app/lib/nivelCliente", () => ({ nivelDoDestinatario: vi.fn(async () => e.nivel) }))
vi.mock("@/app/lib/prospectorTrava", () => ({ prospectoDoJid: vi.fn(async () => e.prospecto ? { id: "p1", telefone: "5511999990001", opt_out: false, etapa: "novo" } : null), ehProspecto: vi.fn(async () => e.prospecto) }))
const prospEnviar = vi.hoisted(() => vi.fn())
vi.mock("@/app/lib/ordemProspecto", () => ({ travasDoProspecto: vi.fn(() => null), enviarAoProspecto: prospEnviar }))
vi.mock("@/app/lib/financeiroExterno", () => ({ aReceberDosPedidos: vi.fn(async () => e.receber) }))
vi.mock("@/app/lib/agenteAuto", () => ({
  lerCfg: vi.fn(async () => e.cfg), enviar: e.enviar, voceNaConversa: vi.fn(async () => e.voce),
  lerConversa: vi.fn(async (jid: string) => ({ jid, nome: "Cliente Teste", telefone: "5511999990001", etiquetas: [], status_lead: null })),
}))
const enviarAoCliente = vi.hoisted(() => vi.fn())
vi.mock("@/app/lib/enviarCliente", () => ({ enviarAoCliente, destinoDoCliente: vi.fn(async () => ({ destino: "5511999990001", jid: "5511999990001@s.whatsapp.net" })) }))
vi.mock("@/app/lib/claude", () => ({ clienteClaude: vi.fn(), MODELO: "m" }))
vi.mock("@/app/lib/gastosServidor", () => ({ registrarUsoIA: vi.fn() }))
vi.mock("@/app/lib/reuniaoDiretoria", () => ({ coletarContexto: vi.fn() }))

import { executarFerramenta, type Foto } from "@/app/lib/conversaDiretor"
import { conferirValores, valoresDoTexto } from "@/app/lib/aprovoDesligado"
import { MAX_DIRETOS_DIA } from "@/app/lib/ordemDireta"

const cobranca = { id: "cobranca", nome: "Cobrança", setor: "cfo", capacidade: "mensagem_cliente" }
const ctx = { exec: [cobranca], cultura: [], detalhes: {} } as unknown as Foto
const ordenar = (extra: Record<string, unknown> = {}) =>
  executarFerramenta("cco", "ordenar_funcionario", { funcionario: "atendente", cliente: "Cliente Teste", ordem: "x", ...extra }, { ctx, apiKey: "k", grava: true, enviarLead: true })
const ligado = { ligado: true, horario: { dias: [0, 1, 2, 3, 4, 5, 6], inicio: "00:00", fim: "24:00" } }

beforeEach(() => {
  e.conversa = []; e.voce = false; e.contador = 0; e.log = []; e.obrigatorio = undefined; e.prospecto = false; prospEnviar.mockReset()
  e.nivel = { nivel: "A", jaCliente: true, motivo: "" }
  e.cfg = { agenteAuto: ligado, pedidosDigitais: [], agenteLog: [] }
  e.receber = [{ numero: "1001", cliente: "Cliente Teste", aReceber: 400 }]
  e.enviar.mockReset(); e.enviar.mockResolvedValue({ ids: ["w1"] })
  e.redigir.mockReset(); e.redigir.mockResolvedValue({ ok: true, texto: "Oi! Pode mandar as medidas?" })
  enviarAoCliente.mockReset(); enviarAoCliente.mockResolvedValue({ ok: true, jid: "5511999990001@s.whatsapp.net" })
})

describe("cartões de Aprovo já pendentes", () => {
  it("com a chave desligada, nada pendente é enviado: só o novo sai e o cartão antigo segue aguardando", async () => {
    const antigo = { id: "velho", tipo: "mensagem", funcionario: "Atendente", cliente: "Outro", texto: "mensagem antiga", status: "aguardando" }
    e.conversa = [{ id: "c1", acoes: [antigo] }]
    const r = await ordenar()
    expect(r.destino).toBe("enviado_direto")
    expect(e.enviar).toHaveBeenCalledTimes(1)
    expect(e.enviar.mock.calls[0][1]).toBe("Oi! Pode mandar as medidas?")
    expect(antigo.status).toBe("aguardando")
    expect(e.log).toHaveLength(1)
  })
})

describe("chave desligada (padrão): sai direto", () => {
  it.each(["A", "B", "C", "indefinido"])("cliente %s: enviado direto, com registro", async nivel => {
    e.nivel = { nivel, jaCliente: true, motivo: "" }
    const r = await ordenar()
    expect(r.destino).toBe("enviado_direto"); expect(r.motivo).toContain("aprovo_desligado")
    expect(e.enviar).toHaveBeenCalledTimes(1)
    expect(r.acao).toMatchObject({ status: "enviado", direto: true, destino: "enviado_direto", motivo: "aprovo_desligado", diretor: "cco", funcionario: "Atendente", texto: "Oi! Pode mandar as medidas?" })
    expect((r.acao as { em?: string }).em).toBeTruthy()
    expect(e.log).toHaveLength(1)
    expect(e.log[0]).toMatchObject({ destino: "enviado_direto", motivo: "aprovo_desligado", diretor: "cco", agente: "Atendente", texto: "Oi! Pode mandar as medidas?" })
    expect(e.log[0].em).toBeTruthy()
  })
  it("funcionário do quadro (Cobrança): sai direto pelo envio ao cliente", async () => {
    e.redigir.mockResolvedValue({ ok: true, texto: "O saldo do pedido é R$ 400,00." })
    const r = await ordenar({ funcionario: "cobranca" })
    expect(r.destino).toBe("enviado_direto"); expect(enviarAoCliente).toHaveBeenCalledTimes(1)
    expect(e.log[0]).toMatchObject({ destino: "enviado_direto", agente: "Cobrança", texto: "O saldo do pedido é R$ 400,00." })
  })
})

describe("chave ligada: fila como hoje", () => {
  it("cliente A vai para a fila e nada é enviado; a Cobrança também", async () => {
    e.obrigatorio = true
    const r = await ordenar()
    expect(r.destino).toBe("fila_aprovo"); expect(r.acao).toMatchObject({ status: "aguardando" })
    expect(e.enviar).not.toHaveBeenCalled(); expect(e.log).toHaveLength(0)
    const c = await ordenar({ funcionario: "cobranca" })
    expect(c.acao).toMatchObject({ status: "aguardando" }); expect(enviarAoCliente).not.toHaveBeenCalled()
  })
})

describe("as outras travas continuam", () => {
  it("fora do horário: 409, nada sai, nada na fila", async () => {
    e.cfg = { ...e.cfg, agenteAuto: { ...ligado, horario: { dias: [], inicio: "00:00", fim: "24:00" } } }
    const r = await ordenar()
    expect(r.status).toBe(409); expect(r.acao).toBeUndefined(); expect(e.enviar).not.toHaveBeenCalled()
  })
  it("exclusão (nao_lead): nada sai", async () => {
    e.cfg = { ...e.cfg, agenteLog: [{ jid: "5511999990001@s.whatsapp.net", perfil: "nao_lead" }] }
    const r = await ordenar()
    expect(r.status).toBe(400); expect(e.enviar).not.toHaveBeenCalled()
  })
  it("gráfica do Prospector (nível lead): sai direto pelo caminho do Prospector, sem 409 e sem fila", async () => {
    e.prospecto = true; e.nivel = { nivel: "lead", jaCliente: false, motivo: "" }
    prospEnviar.mockResolvedValue({ saida: "enviado", destino: "enviado_direto", motivo: "prospector", nivel: "lead" })
    const r = await ordenar()
    expect(r.destino).toBe("enviado_direto"); expect(r.status).toBeUndefined(); expect(prospEnviar).toHaveBeenCalled()
  })
  it("promete orçamento sem link real: 409 com o motivo, em vez de fila", async () => {
    e.redigir.mockResolvedValue({ ok: true, texto: "Segue o orçamento em anexo." })
    const r = await ordenar()
    expect(r.status).toBe(409); expect(r.motivo).toBe("prometia orçamento sem proposta real"); expect(r.acao).toBeUndefined()
    expect(e.enviar).not.toHaveBeenCalled(); expect(e.log[0]).toMatchObject({ destino: "recusado" })
  })
  it("limite diário por diretor: a 21ª volta 429", async () => {
    e.contador = MAX_DIRETOS_DIA
    const r = await ordenar()
    expect(r.status).toBe(429); expect(e.enviar).not.toHaveBeenCalled()
  })
})

describe("trava de valor: a receber ao centavo", () => {
  it("Cobrança com saldo divergente não sai, devolve 409 e registra", async () => {
    e.redigir.mockResolvedValue({ ok: true, texto: "Seu saldo é R$ 350,00." })
    const r = await ordenar({ funcionario: "cobranca" })
    expect(r.status).toBe(409); expect(r.motivo).toContain("divergente"); expect(r.acao).toBeUndefined()
    expect(enviarAoCliente).not.toHaveBeenCalled()
    expect(e.log[0]).toMatchObject({ destino: "recusado", texto: "Seu saldo é R$ 350,00.", agente: "Cobrança", diretor: "cco" })
  })
  it("divergência de 1 centavo (R$ 400,01 contra R$ 400,00) não sai", async () => {
    e.redigir.mockResolvedValue({ ok: true, texto: "Falta pagar R$ 400,01 do pedido." })
    const r = await ordenar()
    expect(r.status).toBe(409); expect(e.enviar).not.toHaveBeenCalled(); expect(e.log[0]).toMatchObject({ destino: "recusado" })
  })
  it("ao centavo certo sai; valor que não é de saldo (total) não é conferido", async () => {
    e.redigir.mockResolvedValue({ ok: true, texto: "O pedido é de R$ 1.000,00 e o saldo é R$ 400,00." })
    expect((await ordenar()).destino).toBe("enviado_direto")
  })
  it("o a receber é lido na hora: mudou depois de redigir, não sai", async () => {
    e.redigir.mockImplementation(async () => { e.receber = [{ numero: "1001", cliente: "Cliente Teste", aReceber: 399.99 }]; return { ok: true, texto: "Saldo: R$ 400,00." } })
    expect((await ordenar()).status).toBe(409)
  })
  it("link do Digital: valor de saldo tem de bater com o pedido DIG", async () => {
    e.receber = [{ numero: "DIG-0007", cliente: "Outro Nome", aReceber: 250.5 }]
    e.redigir.mockResolvedValue({ ok: true, texto: "Acompanhe em https://x.test/d/DIG-0007?t=abc. Resta R$ 250,50." })
    expect((await ordenar({ cliente: "Cliente Teste" })).destino).toBe("enviado_direto")
    e.redigir.mockResolvedValue({ ok: true, texto: "Acompanhe em https://x.test/d/DIG-0007?t=abc. Resta R$ 250,00." })
    expect((await ordenar({ cliente: "Cliente Teste" })).status).toBe(409)
  })
})

describe("conferirValores (função pura)", () => {
  const p = [{ numero: "1", cliente: "Fulano", aReceber: 100.1 }]
  it("valor colado à palavra de saldo conta; o de total não", () => {
    expect(valoresDoTexto("Restam R$ 10,00 de saldo; total R$ 90,00").map(v => v.saldo)).toEqual([true, false])
    expect(valoresDoTexto("O total é R$ 90,00 e R$ 10,00 em aberto").map(v => v.saldo)).toEqual([false, true])
  })
  it("lê os formatos de valor", () => {
    expect(valoresDoTexto("R$1.234,5 e R$ 20").map(v => v.centavos)).toEqual([123450, 2000])
  })
  it("centavo a mais ou a menos barra; igual passa", () => {
    expect(conferirValores("Saldo: R$ 100,10", p, { cliente: "Fulano" }).ok).toBe(true)
    expect(conferirValores("Saldo: R$ 100,11", p, { cliente: "Fulano" }).ok).toBe(false)
    expect(conferirValores("Saldo: R$ 100,09", p, { cliente: "Fulano" }).ok).toBe(false)
  })
  it("saldo citado sem pedido com saldo para conferir: barra", () => {
    expect(conferirValores("Falta pagar R$ 50,00", p, { cliente: "Beltrano" }).ok).toBe(false)
  })
  it("sem valor de saldo no texto, passa", () => {
    expect(conferirValores("Sua caixa custa R$ 3,50 a unidade.", p, { cliente: "Fulano" }).ok).toBe(true)
  })
})
