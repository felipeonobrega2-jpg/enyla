import { describe, it, expect, vi, beforeEach } from "vitest"

const est = vi.hoisted(() => ({ tabelas: {} as Record<string, unknown[]>, escritas: [] as string[], cfg: {} as Record<string, unknown> }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (t: string) => {
      const cadeia: Record<string, unknown> = {}
      for (const m of ["select", "in", "order", "limit", "eq"]) cadeia[m] = () => cadeia
      for (const m of ["insert", "update", "upsert", "delete"]) cadeia[m] = () => { est.escritas.push(`${t}.${m}`); return cadeia }
      cadeia.then = (ok: (v: unknown) => unknown) => ok(est.tabelas[t] === undefined && t === "prospectos_emails_recebidos" ? { data: null, error: { message: "não existe" } } : { data: est.tabelas[t] ?? [], count: (est.tabelas[t] ?? []).length, error: null })
      return cadeia
    },
  },
}))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn(async () => est.cfg) }))

import { mascararEmail, mascararTelefone, montarCadastros, leituraParceiros } from "@/app/lib/parceirosExterno"

const cad = (p: Record<string, unknown>) => ({ id: "c1", em: "2026-11-20T10:00:00Z", status: "novo", nomeFantasia: "Gráfica Boa", razaoSocial: "Boa LTDA", documento: "11222333000181", tipoDocumento: "cnpj", whatsapp: "11987654321", email: "maria@grafica.com.br", rua: "Rua X", ...p })

beforeEach(() => { est.tabelas = {}; est.escritas = []; est.cfg = {} })

describe("mascaramento", () => {
  it("e-mail", () => { expect(mascararEmail("maria@grafica.com.br")).toBe("ma***@grafica.com.br"); expect(mascararEmail("x")).toBeNull() })
  it("telefone com os 4 últimos dígitos", () => { expect(mascararTelefone("(11) 98765-4321")).toBe("***4321"); expect(mascararTelefone("12")).toBeNull() })
})

describe("origem e ordem", () => {
  it("prospector quando o documento casa com um prospecto; direto senão", () => {
    const r = montarCadastros([cad({}), cad({ id: "c2", documento: "99999999000199", em: "2026-11-22T10:00:00Z" })] as never, [{ cnpj: "11222333000181", etapa: "cadastrou" }])
    expect(r.map(x => x.id)).toEqual(["c2", "c1"])
    expect(r[1]).toMatchObject({ origem: "prospector", etapaProspector: "cadastrou" })
    expect(r[0]).toMatchObject({ origem: "direto" }); expect(r[0]).not.toHaveProperty("etapaProspector")
  })
  it("limita a 100 e não vaza documento, e-mail ou telefone completos", () => {
    const muitos = Array.from({ length: 130 }, (_, i) => cad({ id: `c${i}` }))
    const r = montarCadastros(muitos as never, [])
    expect(r).toHaveLength(100)
    const txt = JSON.stringify(r)
    for (const v of ["11222333000181", "maria@grafica", "11987654321", "Rua X"]) expect(txt).not.toContain(v)
  })
})

describe("leituraParceiros", () => {
  it("sem a tabela de e-mails recebidos devolve respostas só pela etapa, sem erro", async () => {
    est.cfg = { cadastrosParceiros: [cad({})] }
    est.tabelas.prospectos_parceiros = [{ id: "p1", cnpj: "11222333000181", nome_fantasia: "Boa", etapa: "respondeu", historico_etapas: [{ etapa: "respondeu", em: "2026-11-21T00:00:00Z" }] }]
    const { status, corpo } = await leituraParceiros()
    expect(status).toBe(200)
    expect((corpo.respostas as { porEtapa: unknown[]; mensagens?: unknown }).porEtapa).toHaveLength(1)
    expect((corpo.respostas as { mensagens?: unknown }).mensagens).toBeUndefined()
    expect(Object.keys(corpo.funil as object)).toEqual(["encontrado", "qualificado", "abordado", "abriu", "cadastrou", "respondeu"])
    expect(est.escritas).toEqual([])
  })
  it("com a tabela, traz até 300 caracteres do corpo", async () => {
    est.tabelas.prospectos_parceiros = [{ id: "p1", cnpj: "1", nome_fantasia: "Boa", etapa: "respondeu" }]
    est.tabelas.prospectos_emails_recebidos = [{ prospecto_id: "p1", recebido_em: "2026-11-21T00:00:00Z", assunto: "Oi", corpo: "a".repeat(500) }]
    const { corpo } = await leituraParceiros()
    const m = (corpo.respostas as { mensagens: { nome: string; corpo: string }[] }).mensagens
    expect(m[0].corpo).toHaveLength(300); expect(m[0].nome).toBe("Boa")
  })
})
