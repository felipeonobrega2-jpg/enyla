// Porta externa, ação responder_prospecto + fila com nova tentativa + cron + leitura.
import { describe, it, expect, vi, beforeEach } from "vitest"

type Linha = Record<string, unknown>
const banco = vi.hoisted(() => ({ t: {} as Record<string, Linha[]>, seq: 1 }))
const resend = vi.hoisted(() => ({ respostas: [] as unknown[], chamadas: [] as { para: string; opcoes: unknown }[], padrao: { ok: true, id: "re_1" } as unknown }))
const nivel = vi.hoisted(() => ({ nivel: "lead" as string }))

vi.mock("@/app/lib/supabase", () => {
  function consulta(tabela: string) {
    let filtros: ((l: Linha) => boolean)[] = []
    let modo: "select" | "insert" | "update" = "select"
    let valores: Linha = {}
    let contar = false, ordem: [string, boolean] | null = null, max = Infinity
    const q: Record<string, unknown> = {}
    const linhas = () => (banco.t[tabela] ??= [])
    const achados = () => { let r = linhas().filter(l => filtros.every(f => f(l))); if (ordem) r = [...r].sort((a, b) => String(a[ordem![0]]).localeCompare(String(b[ordem![0]])) * (ordem![1] ? 1 : -1)); return r.slice(0, max) }
    const executar = () => {
      if (modo === "insert") { const n = { id: banco.seq++, status: "na_fila", tentativas: 0, ultimo_erro: null, criado_em: new Date().toISOString(), enviado_em: null, resend_id: null, ...valores }; linhas().push(n); return { data: [n], error: null } }
      if (modo === "update") { const r = achados(); r.forEach(l => Object.assign(l, valores)); return { data: r, error: null } }
      const r = achados(); return contar ? { data: null, count: r.length, error: null } : { data: r, error: null }
    }
    q.select = (_c?: string, o?: { count?: string }) => { if (o?.count) contar = true; return q }
    q.insert = (v: Linha) => { modo = "insert"; valores = v; return q }
    q.update = (v: Linha) => { modo = "update"; valores = v; return q }
    q.eq = (c: string, v: unknown) => { filtros.push(l => l[c] === v); return q }
    q.in = (c: string, v: unknown[]) => { filtros.push(l => v.includes(l[c])); return q }
    q.gte = (c: string, v: string) => { filtros.push(l => typeof l[c] === "string" && (l[c] as string) >= new Date(v).toISOString()); return q }
    q.lte = (c: string, v: string) => { filtros.push(l => typeof l[c] === "string" && (l[c] as string) <= v); return q }
    q.order = (c: string, o?: { ascending?: boolean }) => { ordem = [c, o?.ascending !== false]; return q }
    q.limit = (n: number) => { max = n; return q }
    q.maybeSingle = async () => ({ data: executar().data?.[0] ?? null, error: null })
    q.single = async () => ({ data: executar().data?.[0] ?? null, error: null })
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(executar()).then(ok)
    return q
  }
  return { supabase: { from: (t: string) => consulta(t) } }
})
vi.mock("@/app/lib/email", () => ({
  enviarEmail: vi.fn(async (para: string, _e: unknown, _a: unknown, opcoes: unknown) => { resend.chamadas.push({ para, opcoes }); return (resend.respostas.length ? resend.respostas.shift() : resend.padrao) as never }),
}))
vi.mock("@/app/lib/nivelCliente", () => ({
  carregarFontesNivel: vi.fn(async () => ({ cards: [], pedidosDigitais: [], curvas: new Map(), cadastro: [], leituraOk: true })),
  classificarNivel: vi.fn(() => ({ nivel: nivel.nivel, jaCliente: nivel.nivel !== "lead", motivo: "teste" })),
}))

import { responderProspecto, processarFila, lerRespostasProspector, tetoRespostas } from "@/app/lib/respostaProspecto"
import { enviosDoHistorico, REMETENTE_REPLY_TO } from "@/app/lib/prospectorEnvio"
import { GET } from "@/app/api/prospector/fila-respostas/route"
import { NextRequest } from "next/server"

const COTA = { ok: false, erro: "Daily quota exceeded", status: 429, cota: true }
const novoProspecto = (extra: Linha = {}) => { banco.t.prospectos_parceiros.push({ id: 7, cnpj: "11222333000181", email: "contato@grafica.com.br", etapa: "respondeu", opt_out: false, historico_etapas: [], atualizado_em: "2026-11-25T10:00:00.000Z", ...extra }) }
const fila = () => banco.t.emails_saida_fila
const depois = (min: number) => new Date(Date.now() + min * 60_000)

beforeEach(() => {
  banco.t = { prospectos_parceiros: [], emails_saida_fila: [], Cliente: [] }; banco.seq = 1
  resend.respostas = []; resend.chamadas = []; resend.padrao = { ok: true, id: "re_1" }; nivel.nivel = "lead"
  delete process.env.RESPOSTAS_TETO_EMAIL_DIA; delete process.env.PROSPECTOR_REPLY_TO
  novoProspecto()
})

describe("responder_prospecto", () => {
  it("só CCO e CMO", async () => {
    for (const d of ["coo", "cfo", "cto"] as const) expect((await responderProspecto(d, { prospecto_id: 7, texto: "oi" })).status).toBe(403)
    expect(resend.chamadas).toHaveLength(0)
  })
  it("envia na hora, só para o e-mail do banco, e grava no histórico sem mudar a etapa", async () => {
    const r = await responderProspecto("cco", { prospecto_id: 7, texto: "Olá!", para: "outro@x.com", email: "outro@x.com" })
    expect(r.status).toBe(200)
    expect(resend.chamadas).toEqual([{ para: "contato@grafica.com.br", opcoes: { de: "ENYLA Embalagens <parceiros@enyla.com.br>", responderPara: REMETENTE_REPLY_TO } }])
    expect(fila()[0]).toMatchObject({ status: "enviado", resend_id: "re_1", assunto: "Re: ENYLA, gráfica de embalagens em Barueri", para: "contato@grafica.com.br" })
    const p = banco.t.prospectos_parceiros[0]
    expect(p.etapa).toBe("respondeu")
    expect((p.historico_etapas as { resposta?: unknown }[])[0].resposta).toMatchObject({ canal: "email", diretor: "cco" })
    expect(enviosDoHistorico(p.historico_etapas as unknown[])).toHaveLength(0)   // não entra na conta do Prospector
  })
  it("reply_to vem de PROSPECTOR_REPLY_TO quando preenchida", async () => {
    process.env.PROSPECTOR_REPLY_TO = "diretoria@enyla.com.br"
    await responderProspecto("cmo", { prospecto_id: 7, texto: "Olá", assunto: "Outro assunto" })
    expect((resend.chamadas[0].opcoes as { responderPara: string }).responderPara).toBe("diretoria@enyla.com.br")
    expect(fila()[0].assunto).toBe("Outro assunto")
  })
  it("cota esgotada vai para a fila e não perde", async () => {
    resend.respostas = [COTA]
    const r = await responderProspecto("cco", { prospecto_id: 7, texto: "Olá" })
    expect(r).toMatchObject({ status: 202, corpo: { fila: true, tentaDe: "21:00 de Brasília" } })
    expect(fila()[0]).toMatchObject({ status: "na_fila", tentativas: 0, texto: "Olá" })
  })
  it("erro 5xx também vai para a fila", async () => {
    resend.respostas = [{ ok: false, erro: "Resend respondeu 503", status: 503 }]
    expect((await responderProspecto("cco", { prospecto_id: 7, texto: "Olá" })).status).toBe(202)
    expect(fila()[0].status).toBe("na_fila")
  })
  it("opt-out e descartado são recusados, sem fila e sem envio", async () => {
    banco.t.prospectos_parceiros[0].opt_out = true
    expect((await responderProspecto("cco", { prospecto_id: 7, texto: "Olá" })).status).toBe(409)
    banco.t.prospectos_parceiros[0].opt_out = false; banco.t.prospectos_parceiros[0].etapa = "descartado"
    expect((await responderProspecto("cco", { prospecto_id: 7, texto: "Olá" })).status).toBe(409)
    expect(fila()).toHaveLength(0); expect(resend.chamadas).toHaveLength(0)
  })
  it.each(["A", "B", "C", "indefinido"])("cliente nível %s: 409, fila do Aprovo, nada enviado", async n => {
    nivel.nivel = n
    banco.t.Cliente.push({ nome: "Gráfica X", telefone: null, email: "CONTATO@grafica.com.br", cnpj: null })
    const r = await responderProspecto("cco", { prospecto_id: 7, texto: "Olá" })
    expect(r).toMatchObject({ status: 409, corpo: { destino: "fila_aprovo", nivel: n } })
    expect(fila()).toHaveLength(0); expect(resend.chamadas).toHaveLength(0)
  })
  it("cliente casado pelo CNPJ também é recusado; cadastro sem compra (lead) passa", async () => {
    banco.t.Cliente.push({ nome: "Gráfica X", email: null, cnpj: "11.222.333/0001-81" })
    nivel.nivel = "B"
    expect((await responderProspecto("cco", { prospecto_id: 7, texto: "Olá" })).status).toBe(409)
    nivel.nivel = "lead"
    expect((await responderProspecto("cco", { prospecto_id: 7, texto: "Olá" })).status).toBe(200)
  })
  it("teto próprio de respostas por dia: acima fica na fila, sem chamar a Resend", async () => {
    process.env.RESPOSTAS_TETO_EMAIL_DIA = "2"
    expect(tetoRespostas()).toBe(2)
    for (let i = 0; i < 2; i++) expect((await responderProspecto("cco", { prospecto_id: 7, texto: `m${i}` })).status).toBe(200)
    const r = await responderProspecto("cco", { prospecto_id: 7, texto: "m3" })
    expect(r.status).toBe(202)
    expect(resend.chamadas).toHaveLength(2)
    expect(fila()[2].status).toBe("na_fila")
  })
})

describe("cron da fila", () => {
  const antigo = (extra: Linha = {}) => fila().push({ id: banco.seq++, prospecto_id: 7, para: "contato@grafica.com.br", assunto: "Re: x", texto: "t", diretor: "cco", status: "na_fila", tentativas: 0, ultimo_erro: null, criado_em: new Date(Date.now() - 10 * 60_000).toISOString(), enviado_em: null, resend_id: null, ...extra })
  it("reenvia o que ficou na fila (mais antigo primeiro) e grava no histórico", async () => {
    antigo({ id: 50, criado_em: new Date(Date.now() - 20 * 60_000).toISOString() }); antigo({ id: 51 })
    const r = await processarFila()
    expect(r).toMatchObject({ enviados: 2, fica: 0 })
    expect(fila().map(f => f.status)).toEqual(["enviado", "enviado"])
    expect(banco.t.prospectos_parceiros[0].historico_etapas as unknown[]).toHaveLength(2)
  })
  it("não pega o que acabou de entrar (a ação ainda está tentando)", async () => {
    antigo({ criado_em: new Date().toISOString() })
    expect((await processarFila()).enviados).toBe(0)
    expect(resend.chamadas).toHaveLength(0)
  })
  it("cota esgotada não conta tentativa e para o resto da rodada", async () => {
    antigo(); antigo()
    resend.respostas = [COTA]
    const r = await processarFila()
    expect(r).toMatchObject({ enviados: 0, paradoPorCota: true, fica: 2 })
    expect(fila().map(f => [f.status, f.tentativas])).toEqual([["na_fila", 0], ["na_fila", 0]])
    expect(resend.chamadas).toHaveLength(1)
  })
  it("outro erro conta tentativa e na 3ª vira falhou", async () => {
    antigo()
    resend.padrao = { ok: false, erro: "Resend respondeu 422", status: 422 }
    await processarFila(); expect(fila()[0]).toMatchObject({ status: "na_fila", tentativas: 1, ultimo_erro: "Resend respondeu 422" })
    await processarFila()
    const r = await processarFila()
    expect(fila()[0]).toMatchObject({ status: "falhou", tentativas: 3 }); expect(r.falhas).toBe(1)
    await processarFila(); expect(resend.chamadas).toHaveLength(3)
  })
  it("respeita o teto diário somando ação e cron", async () => {
    process.env.RESPOSTAS_TETO_EMAIL_DIA = "1"
    await responderProspecto("cco", { prospecto_id: 7, texto: "um" })
    antigo()
    const r = await processarFila(depois(0))
    expect(r.enviados).toBe(0); expect(r.fica).toBe(1)
    expect(resend.chamadas).toHaveLength(1)
  })
  it("prospecto que saiu depois de entrar na fila não recebe", async () => {
    antigo(); banco.t.prospectos_parceiros[0].opt_out = true
    const r = await processarFila()
    expect(r.enviados).toBe(0); expect(fila()[0].status).toBe("falhou"); expect(resend.chamadas).toHaveLength(0)
  })
  it("rota: 401 sem a senha, 200 com", async () => {
    process.env.CRON_SECRET = "s"
    expect((await GET(new NextRequest("https://x/api/prospector/fila-respostas"))).status).toBe(401)
    expect((await GET(new NextRequest("https://x/api/prospector/fila-respostas", { headers: { authorization: "Bearer s" } }))).status).toBe(200)
    delete process.env.CRON_SECRET
  })
})

describe("?o=respostas_prospector", () => {
  it("403 fora do CCO e da CMO", async () => { expect((await lerRespostasProspector("cfo")).status).toBe(403) })
  it("lista a fila sem o corpo e conta o que saiu hoje", async () => {
    resend.respostas = [COTA]
    await responderProspecto("cco", { prospecto_id: 7, texto: "segredo do corpo" })
    await responderProspecto("cmo", { prospecto_id: 7, texto: "segundo" })
    const r = await lerRespostasProspector("cmo")
    const c = r.corpo as { teto: number; enviadosHoje: number; naFila: Linha[]; enviadosHojeLista: Linha[] }
    expect(r.status).toBe(200)
    expect(c).toMatchObject({ teto: 20, enviadosHoje: 1 })
    expect(c.naFila).toHaveLength(1); expect(c.enviadosHojeLista).toHaveLength(1)
    expect(JSON.stringify(r.corpo)).not.toContain("segredo do corpo")
    expect(c.naFila[0]).toMatchObject({ status: "na_fila", tentativas: 0 })
  })
})
