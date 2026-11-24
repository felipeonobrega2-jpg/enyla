// Importador do Prospector: filtro, upsert idempotente, opt-out/descartado, cursor, auth da rota e "nada é enviado".
import { describe, it, expect, vi, beforeEach } from "vitest"
import { deflateRawSync } from "node:zlib"

const estado = vi.hoisted(() => ({ cfg: {} as Record<string, unknown>, tabela: [] as Record<string, unknown>[], seq: 1 }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async (c: string[]) => Object.fromEntries(c.map(k => [k, estado.cfg[k]]))),
  gravarCampos: vi.fn(async (c: Record<string, unknown>) => { estado.cfg = { ...estado.cfg, ...c } }),
}))
const enviar = vi.hoisted(() => ({ evo: vi.fn(), notificar: vi.fn(), email: vi.fn() }))
vi.mock("@/app/lib/evolution", () => ({ evo: enviar.evo }))
vi.mock("@/app/lib/notificar", () => ({ notificar: enviar.notificar }))
vi.mock("@/app/lib/emailsServidor", () => ({ emailDoCadastro: enviar.email }))
vi.mock("@/app/lib/supabase", () => {
  const from = () => {
    const filtros: [string, unknown, boolean][] = []
    let modo = "select"
    let payload: unknown
    let opcoes: { ignoreDuplicates?: boolean } = {}
    const q: Record<string, unknown> = {}
    const casa = (l: Record<string, unknown>) => filtros.every(([k, v, neg]) => (k === "cnpj_in" ? (v as string[]).includes(l.cnpj as string) : (l[k] === v) !== neg))
    q.select = () => q
    q.in = (_k: string, v: string[]) => { filtros.push(["cnpj_in", v, false]); return q }
    q.eq = (k: string, v: unknown) => { filtros.push([k, v, false]); return q }
    q.neq = (k: string, v: unknown) => { filtros.push([k, v, true]); return q }
    q.update = (p: unknown) => { modo = "update"; payload = p; return q }
    q.upsert = (p: unknown, o: typeof opcoes) => { modo = "upsert"; payload = p; opcoes = o; return q }
    q.then = (ok: (v: unknown) => unknown) => {
      if (modo === "select") return ok({ data: estado.tabela.filter(casa).map(l => ({ ...l })), error: null })
      if (modo === "update") { const alvo = estado.tabela.filter(casa); alvo.forEach(l => Object.assign(l, payload)); return ok({ data: alvo.map(l => ({ id: l.id })), error: null }) }
      const novos: { id: number }[] = []
      for (const l of payload as Record<string, unknown>[]) {
        const ja = estado.tabela.find(x => x.cnpj === l.cnpj)
        if (ja && opcoes.ignoreDuplicates) continue
        const nova = { id: estado.seq++, opt_out: false, ...l }
        estado.tabela.push(nova); novos.push(nova)
      }
      return ok({ data: novos.map(l => ({ id: l.id })), error: null })
    }
    return q
  }
  return { supabase: { from } }
})

import { candidatoDaLinha, decidirGravacao, montarProspecto, type LinhaProspecto } from "@/app/lib/prospectorImportador"
import { importar } from "@/app/lib/prospectorImportadorServidor"
import { GET } from "@/app/api/prospector/importar/route"
import { NextRequest } from "next/server"

function linha(o: { cnpj?: string; sit?: string; uf?: string; cnae?: string; sec?: string; fantasia?: string } = {}) {
  const c = (o.cnpj ?? "12345678000195")
  const f = Array(30).fill("")
  Object.assign(f, { 0: c.slice(0, 8), 1: c.slice(8, 12), 2: c.slice(12), 3: "1", 4: o.fantasia ?? "GRAFICA X", 5: o.sit ?? "02", 10: "20100315", 11: o.cnae ?? "1813001", 12: o.sec ?? "",
    13: "RUA", 14: "DAS FLORES", 15: "10", 17: "CENTRO", 18: "06400000", 19: o.uf ?? "SP", 20: "6213", 21: "11", 22: "40001234", 27: "CONTATO@X.COM" })
  return f.slice(0, 28).map(v => `"${v}"`).join(";")
}
function zip(texto: string) {
  const dados = deflateRawSync(Buffer.from(texto, "latin1"))
  const nome = Buffer.from("K3241.K03200Y0.D61114.ESTABELE")
  const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(8, 8); h.writeUInt16LE(nome.length, 26)
  return Buffer.concat([h, nome, dados])
}
const cadastro = (o: object = {}) => ({ razao_social: "GRAFICA X LTDA", nome_fantasia: "GRAFICA X", descricao_situacao_cadastral: "ATIVA", data_inicio_atividade: "2010-03-15", codigo_porte: 3, municipio: "BARUERI", uf: "SP", cep: "06400000", ...o })

describe("filtro", () => {
  it("aceita SP, ativa (02) e CNAE principal ou secundário da lista, inclusive o 1813-0/02", () => {
    expect(candidatoDaLinha(linha())?.cnpj).toBe("12345678000195")
    expect(candidatoDaLinha(linha({ cnae: "4711301", sec: "5611201,1732000" }))?.cnaesSecundarios).toEqual(["5611201", "1732000"])
    expect(candidatoDaLinha(linha({ cnae: "1813002" }))).not.toBeNull()
  })
  it("recusa outra UF, situação não ativa e CNAE fora da lista", () => {
    expect(candidatoDaLinha(linha({ uf: "RJ" }))).toBeNull()
    expect(candidatoDaLinha(linha({ sit: "08" }))).toBeNull()
    expect(candidatoDaLinha(linha({ cnae: "4711301", sec: "5611201" }))).toBeNull()
  })
  it("preenche endereço, e-mail e telefone do cadastro", () => {
    const c = candidatoDaLinha(linha())!
    expect(c).toMatchObject({ email: "contato@x.com", telefone: "1140001234", cep: "06400000", abertura: "2010-03-15" })
    expect(c.endereco).toBe("RUA DAS FLORES, 10 - CENTRO")
  })
})

describe("gravação", () => {
  const agora = new Date("2026-11-24T12:00:00Z")
  const l = montarProspecto(candidatoDaLinha(linha())!, cadastro(), agora) as LinhaProspecto
  it("usa notaDoProspect e começa em encontrado", () => {
    expect(l.nota).toBeGreaterThan(0)
    const g = decidirGravacao(null, l, agora)
    expect(g.tipo === "inserir" && g.linha.etapa).toBe("encontrado")
    expect(l.servicos).toEqual(["offset"])
  })
  it("não reabre descartado nem opt-out, e não mexe na etapa de quem avançou", () => {
    expect(decidirGravacao({ id: 1, etapa: "descartado", opt_out: false }, l, agora)).toMatchObject({ tipo: "ignorar" })
    expect(decidirGravacao({ id: 1, etapa: "descartado", opt_out: true }, l, agora)).toMatchObject({ tipo: "ignorar", motivo: "opt-out" })
    const g = decidirGravacao({ id: 1, etapa: "abordado", opt_out: false }, l, agora)
    expect(g.tipo).toBe("atualizar")
    expect(g.tipo === "atualizar" && "etapa" in g.campos).toBe(false)
    expect(g.tipo === "atualizar" && "historico_etapas" in g.campos).toBe(false)
  })
  it("empresa que a BrasilAPI mostra como não ativa não entra", () => {
    const x = montarProspecto(candidatoDaLinha(linha())!, cadastro({ descricao_situacao_cadastral: "BAIXADA" }), agora)!
    expect(decidirGravacao(null, x, agora)).toMatchObject({ tipo: "ignorar" })
  })
})

describe("importar", () => {
  const urls: string[] = []
  function fetchFalso(texto: string, cad: (cnpj: string) => Response = () => Response.json(cadastro())) {
    return vi.fn(async (u: string | URL | Request) => {
      const url = String(u); urls.push(url)
      if (url.includes("receitafederal")) return new Response(new Uint8Array(zip(texto)), { status: 200 })
      return cad(url.split("/").pop()!)
    }) as unknown as typeof fetch
  }
  beforeEach(() => { estado.cfg = {}; estado.tabela = []; estado.seq = 1; urls.length = 0; vi.clearAllMocks() })
  const csv = [linha({ cnpj: "11111111000111" }), linha({ cnpj: "22222222000122", uf: "RJ" }), linha({ cnpj: "33333333000133", cnae: "1731100" })].join("\n") + "\n"

  it("importa só quem passa no filtro e é idempotente por CNPJ", async () => {
    const r1 = await importar({ fetch: fetchFalso(csv), maxCnpjs: 100 })
    expect(r1).toMatchObject({ ok: true, inseridos: 2, lidos: 3 })
    expect(estado.tabela.map(x => x.cnpj)).toEqual(["11111111000111", "33333333000133"])
    estado.cfg = {}   // reexecuta do começo
    const r2 = await importar({ fetch: fetchFalso(csv), maxCnpjs: 100 })
    expect(r2).toMatchObject({ inseridos: 0, atualizados: 2 })
    expect(estado.tabela).toHaveLength(2)
  })
  it("não reabre descartado/opt-out e não volta a etapa de quem avançou", async () => {
    estado.tabela = [
      { id: 1, cnpj: "11111111000111", etapa: "descartado", opt_out: true, razao_social: "A", historico_etapas: [] },
      { id: 2, cnpj: "33333333000133", etapa: "abordado", opt_out: false, razao_social: "B", historico_etapas: [{ etapa: "abordado" }] },
    ]
    await importar({ fetch: fetchFalso(csv), maxCnpjs: 100 })
    expect(estado.tabela[0]).toMatchObject({ etapa: "descartado", opt_out: true, razao_social: "A" })
    expect(estado.tabela[1]).toMatchObject({ etapa: "abordado", razao_social: "GRAFICA X LTDA", historico_etapas: [{ etapa: "abordado" }] })
    expect(estado.tabela[1].nota).toBeGreaterThan(0)
  })
  it("guarda o cursor, continua de onde parou e passa ao próximo arquivo no fim", async () => {
    const f = fetchFalso(csv)
    const r1 = await importar({ fetch: f, maxCnpjs: 1 })
    expect(r1.inseridos).toBe(1)
    expect(r1.cursor).toMatchObject({ arquivo: 0, offset: linha({ cnpj: "11111111000111" }).length + 1 })
    const r2 = await importar({ fetch: f, maxCnpjs: 1 })
    expect(estado.tabela.map(x => x.cnpj)).toEqual(["11111111000111", "33333333000133"])
    expect(r2.cursor?.arquivo).toBe(0)
    const r3 = await importar({ fetch: f, maxCnpjs: 100 })
    expect(r3.cursor).toMatchObject({ arquivo: 1, offset: 0 })
  })
  it("se a BrasilAPI falha (429), o cursor não passa do CNPJ que falhou", async () => {
    const r = await importar({ fetch: fetchFalso(csv, () => new Response("", { status: 429 })), maxCnpjs: 100 })
    expect(r.inseridos).toBe(0)
    expect(r.cursor?.offset).toBe(0)
  })
  it("nada é enviado: só leitura na Receita e na BrasilAPI", async () => {
    await importar({ fetch: fetchFalso(csv), maxCnpjs: 100 })
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every(u => /^https:\/\/(arquivos\.receitafederal\.gov\.br|brasilapi\.com\.br)\//.test(u))).toBe(true)
    expect(enviar.evo).not.toHaveBeenCalled(); expect(enviar.notificar).not.toHaveBeenCalled(); expect(enviar.email).not.toHaveBeenCalled()
  })
})

describe("rota", () => {
  const pedido = (h: Record<string, string>) => new NextRequest("https://app.enyla.test/api/prospector/importar", { headers: h })
  beforeEach(() => { vi.unstubAllEnvs() })
  it("com CRON_SECRET exige Bearer", async () => {
    vi.stubEnv("CRON_SECRET", "s")
    expect((await GET(pedido({ "user-agent": "vercel-cron/1.0" }))).status).toBe(401)
    expect((await GET(pedido({ authorization: "Bearer errado" }))).status).toBe(401)
  })
  it("sem CRON_SECRET só aceita o agendador da Vercel", async () => {
    vi.stubEnv("CRON_SECRET", "")
    expect((await GET(pedido({ "user-agent": "Mozilla/5.0" }))).status).toBe(401)
  })
})
