// Porta externa mensagem_parceira: canal interno até a gráfica parceira. Dados fictícios; nada vai a cliente.
import { describe, it, expect, vi, beforeEach } from "vitest"

type P = Record<string, unknown> & { id: string }
const estado = vi.hoisted(() => ({ diretor: "coo", pedidos: [] as unknown[], contatos: {} as Record<string, string>, envios: [] as { numero: string; texto: string }[], evoOk: true }))
vi.mock("@/app/lib/acessoExterno", () => ({ LIMITE_POR_HORA: 120, conferirChave: vi.fn(async () => ({ ok: true, diretor: estado.diretor })) }))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => []), gravarConversa: vi.fn(), lerPlanos: vi.fn() }))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn(), renovarFoto: vi.fn(async () => {}) }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async () => ({})), mudarConfig: vi.fn(),
  lerConfigLinha: vi.fn(async () => ({ data: { data: { pedidosDigitais: estado.pedidos, digitalContatos: estado.contatos } } })),
}))
vi.mock("@/app/lib/agenteAuto", () => ({
  gravarCfg: vi.fn(async (mudar: (d: Record<string, unknown>) => Record<string, unknown> | null) => {
    const r = mudar({ pedidosDigitais: estado.pedidos }); if (r?.pedidosDigitais) estado.pedidos = r.pedidosDigitais as unknown[]
  }),
  enviar: vi.fn(), enviarArquivo: vi.fn(), seuNumero: vi.fn(async () => ""),
}))
vi.mock("@/app/lib/evolution", () => ({
  evo: vi.fn(async (_p: string, o: { body: string }) => { const b = JSON.parse(o.body); estado.envios.push({ numero: b.number, texto: b.text }); return { ok: estado.evoOk } }),
}))
vi.mock("@/app/lib/supabase", () => ({ supabase: {} }))
vi.mock("@/app/lib/notificar", () => ({ notificar: vi.fn() }))
vi.mock("next/server", async orig => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))

import { POST } from "@/app/api/externo/route"
import { NextRequest } from "next/server"

const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))
const original = { id: "DIG-0001", jid: "5511900000000@s.whatsapp.net", em: "2026-11-01T12:00:00.000Z", nome: "Cliente Fictício", status: "producao", total: 1000, sinal: 500, restante: 500 }
const registros = () => (estado.pedidos as P[])[0].mensagensParceira as { por: string; texto: string; em: string; enviado: boolean }[] | undefined

beforeEach(() => { estado.diretor = "coo"; estado.evoOk = true; estado.envios = []; estado.contatos = { villa: "(11) 98888-7777" }; estado.pedidos = [{ ...original }] })

describe("POST acao=mensagem_parceira", () => {
  it("manda só ao número da Villa, nunca ao cliente, e registra quem, texto e hora", async () => {
    const r = await pedir({ acao: "mensagem_parceira", id: "dig-0001", texto: "Como está o pedido? Vence hoje." })
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j.enviado).toBe(true)
    expect(estado.envios).toHaveLength(1)
    expect(estado.envios[0].numero).toBe("11988887777")
    expect(estado.envios[0].numero).not.toContain("5511900000000")
    expect(estado.envios[0].texto).toContain("Como está o pedido? Vence hoje.")
    const reg = registros()!
    expect(reg).toHaveLength(1)
    expect(reg[0]).toMatchObject({ por: "Rafael Moura", texto: "Como está o pedido? Vence hoje.", enviado: true })
    expect(Date.parse(reg[0].em)).not.toBeNaN()
  })

  it("só acrescenta: o segundo envio mantém o primeiro, e o resto do pedido fica igual", async () => {
    await pedir({ acao: "mensagem_parceira", id: "DIG-0001", texto: "Primeira" })
    estado.diretor = "cto"
    await pedir({ acao: "mensagem_parceira", id: "DIG-0001", texto: "Segunda" })
    expect(registros()!.map(m => m.texto)).toEqual(["Primeira", "Segunda"])
    expect(registros()![1].por).toBe("Diego Sato")
    const { mensagensParceira: _m, ...resto } = (estado.pedidos as P[])[0]
    expect(resto).toEqual(original)
  })

  it("sem número da Villa: registra como não enviado e não envia nada", async () => {
    estado.contatos = {}
    const j = await (await pedir({ acao: "mensagem_parceira", id: "DIG-0001", texto: "Oi" })).json()
    expect(j.enviado).toBe(false)
    expect(j.aviso).toMatch(/Sem o número/)
    expect(estado.envios).toHaveLength(0)
    expect(registros()![0].enviado).toBe(false)
  })

  it("falha no WhatsApp: fica registrado como não enviado", async () => {
    estado.evoOk = false
    const j = await (await pedir({ acao: "mensagem_parceira", id: "DIG-0001", texto: "Oi" })).json()
    expect(j.enviado).toBe(false)
    expect(registros()![0].enviado).toBe(false)
  })

  it("pedido de teste não envia", async () => {
    estado.pedidos = [{ ...original, teste: true }]
    const j = await (await pedir({ acao: "mensagem_parceira", id: "DIG-0001", texto: "Oi" })).json()
    expect(j.enviado).toBe(false)
    expect(estado.envios).toHaveLength(0)
  })

  it("só COO e CTO: outro diretor recebe 403 e nada sai nem é gravado", async () => {
    estado.diretor = "cco"
    const r = await pedir({ acao: "mensagem_parceira", id: "DIG-0001", texto: "Oi" })
    expect(r.status).toBe(403)
    expect(estado.envios).toHaveLength(0)
    expect(registros()).toBeUndefined()
  })

  it("valida id e texto (vazio ou grande demais)", async () => {
    expect((await pedir({ acao: "mensagem_parceira", id: "XYZ", texto: "Oi" })).status).toBe(400)
    expect((await pedir({ acao: "mensagem_parceira", id: "DIG-0001", texto: "   " })).status).toBe(400)
    expect((await pedir({ acao: "mensagem_parceira", id: "DIG-0001", texto: "a".repeat(1001) })).status).toBe(400)
    expect(estado.envios).toHaveLength(0)
  })

  it("pedido inexistente: 404 e nada enviado", async () => {
    const r = await pedir({ acao: "mensagem_parceira", id: "DIG-9999", texto: "Oi" })
    expect(r.status).toBe(404)
    expect(estado.envios).toHaveLength(0)
  })
})
