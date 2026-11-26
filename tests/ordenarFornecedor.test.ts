// Canal de fornecedor: recusa número de cliente/lead, entra na fila e não sai sem o Aprovo.
import { describe, it, expect, vi, beforeEach } from "vitest"

const e = vi.hoisted(() => ({
  conversa: [] as { id?: string; acoes?: Record<string, unknown>[] }[],
  fornecedores: [{ id: "f1", nome: "Arte Digital", categoria: "arte", telefone: "(11) 98888-7777", ativo: true }] as Record<string, unknown>[],
  clientes: [] as Record<string, unknown>[], convs: [] as Record<string, unknown>[],
  historico: {} as Record<string, Record<string, unknown>>,
  nivel: "lead", evo: vi.fn(),
}))
const cadeia = (rows: unknown[]) => { const q: Record<string, unknown> = { then: (r: (v: unknown) => void) => r({ data: rows }) }; for (const m of ["select", "order", "limit", "eq", "in"]) q[m] = () => q; return q }
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: (t: string) => cadeia(t === "Cliente" ? e.clientes : t === "whatsapp_conversas" ? e.convs : []) } }))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn(async () => ({ fornecedores: e.fornecedores })) }))
vi.mock("@/app/lib/nivelCliente", () => ({ nivelDoDestinatario: vi.fn(async () => ({ nivel: e.nivel, jaCliente: false, motivo: "" })) }))
vi.mock("@/app/lib/prospectorTrava", () => ({ ehProspecto: vi.fn(async () => false) }))
vi.mock("@/app/lib/evolution", () => ({ evo: e.evo }))
vi.mock("@/app/lib/whatsappDados", () => ({ gravarLote: vi.fn() }))
vi.mock("@/app/lib/diretoriaServidor", () => ({
  lerConversa: vi.fn(async () => e.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown) => { e.conversa = m as never }),
  gravarMensagemFornecedor: vi.fn(async (m: { id: string }) => { e.historico[m.id] = m as never }),
  listarMensagensFornecedor: vi.fn(async () => Object.values(e.historico)),
  atualizarMensagemFornecedor: vi.fn(async (id: string, p: object) => { e.historico[id] = { ...e.historico[id], ...p } }),
}))

import { ordenarFornecedor, enviarAoFornecedor } from "@/app/lib/fornecedorExterno"

const corpo = { fornecedor: "f1", pedido: "DIG-0159", texto: "Ajustar a arte: fundo mais claro." }
beforeEach(() => {
  e.conversa = []; e.clientes = []; e.convs = []; e.historico = {}; e.nivel = "lead"
  e.fornecedores = [{ id: "f1", nome: "Arte Digital", categoria: "arte", telefone: "(11) 98888-7777", ativo: true }]
  e.evo.mockReset(); e.evo.mockResolvedValue({ ok: true, status: 200, corpo: { key: { id: "w1", remoteJid: "5511988887777@s.whatsapp.net" } } })
})

describe("ordenar_fornecedor", () => {
  it("entra na fila do Aprovo e não envia nada", async () => {
    const r = await ordenarFornecedor("cco", { ...corpo, anexos: ["arte-v2.pdf"] })
    expect(r.status).toBe(200)
    expect(r.corpo.destino).toBe("fila_aprovo")
    const acao = e.conversa.flatMap(m => m.acoes ?? [])[0]
    expect(acao).toMatchObject({ tipo: "mensagem", funcionario: "fornecedor", status: "aguardando", fornecedorId: "f1", pedido: "DIG-0159" })
    expect(String(acao.texto)).toContain("arte-v2.pdf")
    expect(e.evo).not.toHaveBeenCalled()
    expect(e.historico[acao.id as string]).toMatchObject({ pedido: "DIG-0159", status: "aguardando" })
    expect(e.historico[acao.id as string].enviadaEm).toBeUndefined()
  })
  it("recusa número que é de cliente do cadastro", async () => {
    e.clientes = [{ nome: "Maria", telefone: "11988887777" }]
    const r = await ordenarFornecedor("cco", corpo)
    expect(r.status).toBe(422)
    expect(e.conversa).toEqual([]); expect(e.evo).not.toHaveBeenCalled()
  })
  it("recusa número de lead do WhatsApp e de cliente por nível", async () => {
    e.convs = [{ jid: "5511988887777@s.whatsapp.net", telefone: "5511988887777", status_lead: "mql", etiquetas: [] }]
    expect((await ordenarFornecedor("cco", corpo)).status).toBe(422)
    e.convs = [{ jid: "5511988887777@s.whatsapp.net", telefone: "5511988887777", status_lead: null, etiquetas: [] }]; e.nivel = "B"
    expect((await ordenarFornecedor("cco", corpo)).status).toBe(422)
  })
  it("recusa fornecedor fora do cadastro e pedido inválido", async () => {
    expect((await ordenarFornecedor("cco", { ...corpo, fornecedor: "zz" })).status).toBe(404)
    expect((await ordenarFornecedor("cco", { ...corpo, pedido: "x" })).status).toBe(400)
  })
  it("só o envio do Aprovo manda pelo WhatsApp", async () => {
    const r = await enviarAoFornecedor("f1", "oi")
    expect(r.ok).toBe(true)
    expect(e.evo).toHaveBeenCalledTimes(1)
  })
})
