// Porta externa, ação gravar_digital: só situacaoArte e/ou prazoEntrega, motivo obrigatório, com autor/data/motivo. Dados fictícios.
import { describe, it, expect, vi, beforeEach } from "vitest"

type P = Record<string, unknown> & { id: string }
const estado = vi.hoisted(() => ({ diretor: "coo", conversa: [] as unknown[], pedidos: [] as unknown[], gravacoes: 0 }))
vi.mock("@/app/lib/acessoExterno", () => ({ LIMITE_POR_HORA: 120, conferirChave: vi.fn(async () => ({ ok: true, diretor: estado.diretor })) }))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => estado.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown[]) => { estado.conversa = m }), lerPlanos: vi.fn() }))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn(), renovarFoto: vi.fn(async () => {}) }))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn(async () => ({})), mudarConfig: vi.fn() }))
vi.mock("@/app/lib/digitalServidor", () => ({
  lerPedido: vi.fn(async (id: string) => ({ pedido: (estado.pedidos as P[]).find(p => p.id === id) ?? null, cfg: {} })),
  gravarPedido: vi.fn(async (id: string, mudar: (p: P) => P | null) => {
    let novo: P | null = null
    estado.pedidos = (estado.pedidos as P[]).map(p => { if (p.id !== id) return p; const n = mudar(p); if (n) { novo = n; estado.gravacoes++ } return n ?? p })
    return novo
  }),
}))
vi.mock("next/server", async orig => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))

import { POST } from "@/app/api/externo/route"
import { NextRequest } from "next/server"

const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))
const original = { id: "DIG-0001", em: "2026-11-01T12:00:00.000Z", nome: "Cliente Fictício", status: "producao", total: 1000, sinal: 500, restante: 500, pagamento: { txId: "asaas:x", valor: 500, data: "2026-11-10" }, custo: 100 }

beforeEach(() => { estado.diretor = "coo"; estado.conversa = []; estado.gravacoes = 0; estado.pedidos = [{ ...original }] })

describe("POST acao=gravar_digital", () => {
  it("grava os campos, registra autor/data/motivo e não mexe no resto do pedido", async () => {
    const r = await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "aprovada", prazoEntrega: "2026-11-26", motivo: "Felipe, 25/11" })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, id: "DIG-0001", situacaoArte: "aprovada", prazoEntrega: "2026-11-26", arteAprovadaEm: null })
    const p = (estado.pedidos as P[])[0] as P & { edicaoAcomp: { por: string; em: string; motivo: string } }
    expect(p.edicaoAcomp).toMatchObject({ motivo: "Felipe, 25/11", por: expect.any(String) })
    expect(p.edicaoAcomp.em).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
    const { situacaoArte, prazoEntregaEm, edicaoAcomp, ...resto } = p
    void situacaoArte; void prazoEntregaEm
    expect(resto).toEqual({ ...original, edicoesAcomp: [edicaoAcomp] })
  })
  it("grava só um dos campos e deixa o outro como estava", async () => {
    const r = await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "enviada", motivo: "x" })
    expect(await r.json()).toMatchObject({ situacaoArte: "enviada", prazoEntrega: null })
  })
  it("recusa sem motivo, vazio ou com mais de 300 caracteres", async () => {
    for (const motivo of [undefined, "", "  ", "a".repeat(301)])
      expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "aprovada", motivo })).status).toBe(400)
    expect(estado.gravacoes).toBe(0)
  })
  it("recusa id inexistente (404), sem campos, situação ou data inválida", async () => {
    expect((await pedir({ acao: "gravar_digital", id: "DIG-9999", situacaoArte: "aprovada", motivo: "x" })).status).toBe(404)
    expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", motivo: "x" })).status).toBe(400)
    expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "quase", motivo: "x" })).status).toBe(400)
    expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", prazoEntrega: "26/11/2026", motivo: "x" })).status).toBe(400)
    expect((await pedir({ acao: "gravar_digital", id: "ORC-1", situacaoArte: "aprovada", motivo: "x" })).status).toBe(400)
    expect(estado.gravacoes).toBe(0)
  })
  it("prazoEntrega vazio limpa o prazo", async () => {
    estado.pedidos = [{ ...original, prazoEntregaEm: "2026-11-26" }]
    const r = await pedir({ acao: "gravar_digital", id: "DIG-0001", prazoEntrega: "", motivo: "voltou a confirmar" })
    expect((await r.json()).prazoEntrega).toBeNull()
  })
  it("qualquer diretor pode", async () => {
    estado.diretor = "cmo"
    expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "aprovada", motivo: "x" })).status).toBe(200)
  })

  describe("arteAprovadaEm (só CTO e COO)", () => {
    const aprov = (extra: Record<string, unknown> = {}) => ({ acao: "gravar_digital", id: "DIG-0001", arteAprovadaEm: "2026-11-13T14:00:00.000Z", motivo: "aprovada no WhatsApp", ...extra })
    const ped = () => (estado.pedidos as P[])[0] as P & { arteAprovadaEm?: string; edicaoAcomp: Record<string, unknown> }
    for (const d of ["cto", "coo"]) it(`${d} grava, guarda o valor anterior (null) e não muda o status`, async () => {
      estado.diretor = d
      const r = await pedir(aprov())
      expect(r.status).toBe(200)
      expect(await r.json()).toEqual({ ok: true, id: "DIG-0001", situacaoArte: null, prazoEntrega: null, arteAprovadaEm: "2026-11-13T14:00:00.000Z" })
      expect(ped().arteAprovadaEm).toBe("2026-11-13T14:00:00.000Z")
      expect(ped().edicaoAcomp).toMatchObject({ motivo: "aprovada no WhatsApp", arteAprovadaAntes: null })
      expect(ped().status).toBe("producao")
      expect(ped().pagamento).toEqual(original.pagamento)
      expect(ped().custo).toBe(100)
    })
    it("guarda o valor anterior quando já havia", async () => {
      estado.pedidos = [{ ...original, arteAprovadaEm: "2026-11-05T10:00:00.000Z" }]
      await pedir(aprov({ arteAprovadaEm: "2026-11-06T10:00:00.000Z" }))
      expect(ped().edicaoAcomp.arteAprovadaAntes).toBe("2026-11-05T10:00:00.000Z")
    })
    it("outras chaves recebem 403 e nada é gravado", async () => {
      for (const d of ["cmo", "cfo", "cco"]) { estado.diretor = d; expect((await pedir(aprov())).status).toBe(403) }
      expect(estado.gravacoes).toBe(0)
      expect(ped().arteAprovadaEm).toBeUndefined()
    })
    it("403 mesmo com outros campos válidos junto", async () => {
      estado.diretor = "cmo"
      expect((await pedir(aprov({ situacaoArte: "aprovada" }))).status).toBe(403)
      expect(estado.gravacoes).toBe(0)
    })
    it("recusa instante no futuro ou anterior à criação do pedido", async () => {
      expect((await pedir(aprov({ arteAprovadaEm: "2999-01-01T00:00:00.000Z" }))).status).toBe(400)
      expect((await pedir(aprov({ arteAprovadaEm: "2026-10-31T23:59:59.000Z" }))).status).toBe(400)
      expect(estado.gravacoes).toBe(0)
    })
    it("recusa ISO inválido, sem fuso, só a data ou vazio", async () => {
      for (const v of ["", "13/11/2026", "2026-11-13", "2026-11-13T14:00:00", "2026-13-45T14:00:00Z", 123, null])
        expect((await pedir(aprov({ arteAprovadaEm: v }))).status).toBe(400)
      expect(estado.gravacoes).toBe(0)
    })
    it("continua exigindo motivo e aceita junto com os outros campos", async () => {
      expect((await pedir(aprov({ motivo: "" }))).status).toBe(400)
      const r = await pedir(aprov({ situacaoArte: "aprovada", prazoEntrega: "2026-11-26" }))
      expect(await r.json()).toMatchObject({ situacaoArte: "aprovada", prazoEntrega: "2026-11-26", arteAprovadaEm: "2026-11-13T14:00:00.000Z" })
    })
  })
})
