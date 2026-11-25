// Porta externa, ação lead: só CCO e COO; perdido sem motivo = 400; nada é apagado nem enviado.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({ diretor: "cco" as string, conversa: [] as unknown[], leads: new Map<string, unknown>(), envios: 0 }))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn(async () => ({ vinculosWhatsapp: { "5511@s.whatsapp.net": "Anderson" } })), mudarConfig: vi.fn() }))
vi.mock("@/app/lib/acessoExterno", () => ({ LIMITE_POR_HORA: 120, conferirChave: vi.fn(async () => ({ ok: true, diretor: estado.diretor })) }))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => estado.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown[]) => { estado.conversa = m }), lerPlanos: vi.fn() }))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn() }))
vi.mock("@/app/lib/leadEstadoServidor", () => ({
  lerEstadoLead: vi.fn(async (jid: string) => estado.leads.get(jid) ?? null),
  gravarEstadoLead: vi.fn(async (e: { jid: string }) => { estado.leads.set(e.jid, e) }),
}))
vi.mock("@/app/lib/supabase", () => ({ supabase: {} }))

import { POST } from "@/app/api/externo/route"
import { NextRequest } from "next/server"

const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))

beforeEach(() => { estado.diretor = "cco"; estado.conversa = []; estado.leads.clear() })

describe("POST acao=lead", () => {
  it.each(["cmo", "cfo", "cto"])("403 para %s", async d => {
    estado.diretor = d
    expect((await pedir({ acao: "lead", operacao: "perdido", jid: "1@s", motivo: "x" })).status).toBe(403)
    expect(estado.leads.size).toBe(0)
  })
  it("400 sem motivo em perdido", async () => {
    expect((await pedir({ acao: "lead", operacao: "perdido", jid: "1@s" })).status).toBe(400)
    expect(estado.leads.size).toBe(0)
  })
  it("CCO e COO marcam perdido, por jid ou cliente, e reabrem sem apagar", async () => {
    const r = await pedir({ acao: "lead", operacao: "perdido", cliente: "Anderson", motivo: "fechou com outra a R$ 0,98" })
    expect(r.status).toBe(200)
    expect(estado.conversa).toHaveLength(1)
    estado.diretor = "coo"
    expect((await pedir({ acao: "lead", operacao: "reabrir", jid: "5511@s.whatsapp.net" })).status).toBe(200)
    const e = estado.leads.get("5511@s.whatsapp.net") as { atual: unknown; historico: unknown[] }
    expect(e.atual).toBeNull()
    expect(e.historico).toHaveLength(2)
  })
  it("orcado manual", async () => {
    expect((await pedir({ acao: "lead", operacao: "orcado", jid: "1@s" })).status).toBe(200)
    expect((estado.leads.get("1@s") as { atual: { tipo: string } }).atual.tipo).toBe("orcado")
  })
})
