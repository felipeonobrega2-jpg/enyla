// Canal dos diretores até o Claude Code: 400 sem pergunta, 503 sem token, 429 no 21º, 404 na issue de outro diretor.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const banco = vi.hoisted(() => ({ linhas: [] as { dados: unknown }[] }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: { from: () => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.limit = () => Promise.resolve({ data: banco.linhas, error: null })
    q.insert = (r: { dados: unknown }) => { banco.linhas.push({ dados: r.dados }); return Promise.resolve({ error: null }) }
    return q
  } },
}))

import { perguntarClaude, lerPedidosClaude } from "@/app/lib/pedidoClaude"

const resp = (status: number, json: unknown) => Promise.resolve(new Response(JSON.stringify(json), { status }))
let chamadas: { url: string; init?: RequestInit }[]
beforeEach(() => {
  banco.linhas = []; chamadas = []
  process.env.GITHUB_DIRETORES_TOKEN = "tok"
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    chamadas.push({ url, init })
    if (init?.method === "POST") return resp(201, { number: 7, html_url: "https://github.com/x/y/issues/7" })
    if (url.endsWith("/issues/9")) return resp(200, { number: 9, html_url: "u", title: "t", state: "open", created_at: "2026-11-25", comments: 0, labels: [{ name: "diretor:cfo" }] })
    return resp(200, [])
  }))
})
afterEach(() => { vi.unstubAllGlobals(); delete process.env.GITHUB_DIRETORES_TOKEN })

describe("pedido ao Claude Code", () => {
  it("400 sem pergunta, tipo inválido ou texto longo", async () => {
    expect((await perguntarClaude("cco", { tipo: "consulta" })).status).toBe(400)
    expect((await perguntarClaude("cco", { pergunta: "oi", tipo: "outro" })).status).toBe(400)
    expect((await perguntarClaude("cco", { pergunta: "a".repeat(4001), tipo: "consulta" })).status).toBe(400)
    expect(chamadas).toHaveLength(0)
  })
  it("503 sem token e nunca devolve o token", async () => {
    delete process.env.GITHUB_DIRETORES_TOKEN
    const r = await perguntarClaude("cco", { pergunta: "oi", tipo: "consulta" })
    expect(r.status).toBe(503)
    expect(String(r.corpo.erro)).toContain("GITHUB_DIRETORES_TOKEN")
  })
  it("cria a issue com título, rótulos, @claude e regras", async () => {
    const r = await perguntarClaude("cco", { pergunta: "Quantos leads hoje?", contexto: "ctx", tipo: "consulta" })
    expect(r.status).toBe(200)
    expect(r.corpo).toMatchObject({ ok: true, id: 7 })
    const b = JSON.parse(String(chamadas[0].init!.body))
    expect(b.title).toMatch(/^\[Diretor .+\] Quantos leads hoje\?/)
    expect(b.labels).toEqual(["diretor:cco", "tipo:consulta"])
    expect(b.body).toContain("@claude")
    expect(b.body).toContain("Não leia nem escreva valores de variáveis de ambiente.")
    expect(JSON.stringify(b)).not.toContain("tok")
  })
  it("429 no 21º pedido do dia e nada é criado", async () => {
    for (let i = 0; i < 20; i++) expect((await perguntarClaude("cco", { pergunta: "p", tipo: "consulta" })).status).toBe(200)
    const n = chamadas.length
    expect((await perguntarClaude("cco", { pergunta: "p", tipo: "consulta" })).status).toBe(429)
    expect(chamadas).toHaveLength(n)
  })
  it("404 ao ler a issue de outro diretor; o dono e o CTO leem", async () => {
    expect((await lerPedidosClaude("cco", "9")).status).toBe(404)
    expect((await lerPedidosClaude("cfo", "9")).status).toBe(200)
    expect((await lerPedidosClaude("cto", "9")).status).toBe(200)
  })
})
