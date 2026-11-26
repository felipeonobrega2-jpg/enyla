// Porta externa: cadastrar_fornecedor (só COO). Dados fictícios.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({ cfg: {} as Record<string, unknown>, diretor: "coo" as string, conversa: [] as unknown[] }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async (campos: string[]) => Object.fromEntries(campos.filter(c => estado.cfg[c] !== undefined).map(c => [c, structuredClone(estado.cfg[c])]))),
  mudarConfig: vi.fn(async (f: (d: Record<string, unknown>) => Record<string, unknown> | null) => {
    const m = f(structuredClone(estado.cfg)); if (m) estado.cfg = { ...estado.cfg, ...m }; return estado.cfg
  }),
}))
vi.mock("@/app/lib/acessoExterno", () => ({ LIMITE_POR_HORA: 120, conferirChave: vi.fn(async () => ({ ok: true, diretor: estado.diretor })) }))
vi.mock("@/app/lib/diretoriaServidor", () => ({
  lerConversa: vi.fn(async () => estado.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown[]) => { estado.conversa = m }), lerPlanos: vi.fn(),
}))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn(), renovarFoto: vi.fn() }))
vi.mock("@/app/lib/supabase", () => ({ supabase: {} }))

import { POST, GET } from "@/app/api/externo/route"
import { NextRequest } from "next/server"

const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))
const forn = () => ((estado.cfg.producao as { fornecedores: Record<string, unknown>[] }).fornecedores)
const base = { acao: "cadastrar_fornecedor", nome: "Gráfica Fictícia", celular: "(11) 91111-2222" }

beforeEach(() => {
  estado.diretor = "coo"; estado.conversa = []
  estado.cfg = { producao: { fornecedores: [{ id: "f-antigo", nome: "Existente Fictícia", ativo: true, servicos: {}, frete: 0, prazoDias: 7, telefone: "11 98888-7777" }], padroes: {} } }
})

describe("cadastrar_fornecedor", () => {
  it("COO cria fornecedor ativo, E.164, com servicos, e registra quem e quando", async () => {
    const r = await pedir({ ...base, contato: "Fulano", prazo: 4, obs: "teste", servicos: { laminacao: { tipo: "por_m2", valor: 1.05, acerto: 100 }, hot_stamping: { tipo: "por_trabalho", valor: 50 } } })
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.criado).toBe(true)
    expect(j.id).toMatch(/^f-/)
    expect(forn()).toHaveLength(2)
    const novo = forn()[1] as Record<string, unknown>
    expect(novo).toMatchObject({ nome: "Gráfica Fictícia", ativo: true, telefone: "+5511911112222", prazoDias: 4, contato: "Fulano", obs: "teste" })
    expect(novo.servicos).toEqual({ laminacao: { tipo: "por_m2", valor: 1.05, acerto: 100 }, hotStamping: { tipo: "por_trabalho", valor: 50 } })
    const aud = estado.cfg.fornecedoresCadastradosPorta as { autor: string; emIso: string; id: string }[]
    expect(aud).toHaveLength(1)
    expect(aud[0]).toMatchObject({ autor: "coo", id: j.id }); expect(aud[0].emIso).toBeTruthy()
  })

  it("outro papel recebe 403 e nada é gravado", async () => {
    for (const d of ["cfo", "cco", "cmo", "cto"]) {
      estado.diretor = d
      const r = await pedir(base)
      expect(r.status).toBe(403)
    }
    expect(forn()).toHaveLength(1)
    expect(estado.cfg.fornecedoresCadastradosPorta).toBeUndefined()
  })

  it("celular duplicado devolve o existente e não altera nada", async () => {
    const antes = structuredClone(estado.cfg)
    const r = await pedir({ ...base, nome: "Outro Nome", celular: "+55 (11) 8888-7777".replace("8888", "98888") })
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j).toMatchObject({ criado: false, id: "f-antigo" })
    expect(estado.cfg).toEqual(antes)
  })

  it("campo obrigatório faltando ou inválido dá 400", async () => {
    for (const corpo of [
      { acao: "cadastrar_fornecedor", celular: "11911112222" },
      { acao: "cadastrar_fornecedor", nome: "X" },
      { ...base, celular: "123" },
      { ...base, servicos: { foto: { tipo: "por_m2" } } },
      { ...base, servicos: { verniz: { tipo: "invalido" } } },
      { ...base, prazo: 0 },
    ]) expect((await pedir(corpo)).status).toBe(400)
    expect(forn()).toHaveLength(1)
  })

  it("não envia nada e está documentada no GET", async () => {
    const r = await GET(new NextRequest("http://x/api/externo", { headers: { authorization: "Bearer k" } }))
    const j = await r.json()
    expect(Object.keys(j.escrita).some(k => k.includes("cadastrar_fornecedor"))).toBe(true)
  })
})
