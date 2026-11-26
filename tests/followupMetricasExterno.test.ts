import { describe, it, expect, vi } from "vitest"
vi.mock("@/app/lib/supabase", () => ({ supabase: {} }))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: async () => ({}) }))
vi.mock("@/app/lib/registroAgente", () => ({ temTabelas: async () => false }))
import { montarMetricas, janelaDe, lerFollowupMetricas, AJUDA_FOLLOWUP_METRICAS } from "@/app/lib/followupMetricasExterno"

const reg = (jid: string, em: string, passo: string, extra: Record<string, unknown> = {}) => ({ em, jid, nome: null, perfil: "icp", enviou: true, texto: "", motivo: `${passo}: sem resposta`, passo, ...extra }) as never
const j = janelaDe(new URLSearchParams("de=2026-11-01&ate=2026-11-10")) as Exclude<ReturnType<typeof janelaDe>, { erro: string }>

describe("?o=followup_metricas", () => {
  it("janela: padrão 30 dias, valida datas, fuso de Brasília", () => {
    const p = janelaDe(new URLSearchParams(), new Date("2026-11-26T15:00:00Z")) as { de: string; ate: string }
    expect(p).toMatchObject({ ate: "2026-11-26", de: "2026-10-28" })
    expect("erro" in janelaDe(new URLSearchParams("de=ontem"))).toBe(true)
    expect("erro" in janelaDe(new URLSearchParams("de=2026-11-10&ate=2026-11-01"))).toBe(true)
    expect((janelaDe(new URLSearchParams("desde=2026-11-01&ate=2026-11-02")) as { de: string }).de).toBe("2026-11-01")
  })
  it("conta por etapa, dia, resposta e vídeo (dados inventados)", () => {
    const regs = [
      reg("a", "2026-11-02T13:00:00Z", "F1"), reg("a", "2026-11-03T13:00:00Z", "F2", { motivo: "F2: sem resposta + vídeo “x”" }),
      reg("b", "2026-11-02T13:00:00Z", "F1"), reg("b", "2026-11-03T13:00:00Z", "F2"), reg("b", "2026-11-05T13:00:00Z", "F3"),
      reg("b", "2026-11-08T13:00:00Z", "Sem resposta", { enviou: false }),
      reg("c", "2026-11-04T13:00:00Z", "F1", { enviou: false }),
    ]
    const m = montarMetricas(regs, [{ jid: "a", ts: "2026-11-03T20:00:00Z" }, { jid: "b", ts: "2026-11-02T01:00:00Z" }], j)
    expect(m.historico_por_etapa).toBe(true)
    expect(m.etapas.F1).toMatchObject({ enviados: 2, respondidos: 0, semResposta: 1, taxaResposta: 0 })
    expect(m.etapas.F2).toMatchObject({ enviados: 2, respondidos: 1, semResposta: 1, taxaResposta: 0.5 })
    expect(m.etapas.F2.comVideo).toMatchObject({ enviados: 1, respondidos: 1, taxaResposta: 1 })
    expect(m.etapas.F2.semVideo).toMatchObject({ enviados: 1, respondidos: 0 })
    expect(m.etapas.F1.comVideo.taxaResposta).toBeNull()
    expect(m.etapas.F3.enviados).toBe(1)
    expect(m.etapas.F1.porDia["2026-11-02"]).toMatchObject({ enviados: 2, semVideo: 2, comVideo: 0 })
    expect(m.total.enviados).toBe(5)
    expect(JSON.stringify(m)).not.toMatch(/"(jid|nome|telefone)"/)
  })
  it("resposta vale até o próximo envio; fora da janela não conta", () => {
    const m = montarMetricas([reg("a", "2026-11-02T13:00:00Z", "F1"), reg("a", "2026-11-03T13:00:00Z", "F2"), reg("z", "2026-10-20T13:00:00Z", "F1")], [{ jid: "a", ts: "2026-11-04T10:00:00Z" }], j)
    expect(m.etapas.F1.respondidos).toBe(0)
    expect(m.etapas.F2.respondidos).toBe(1)
    expect(m.total.enviados).toBe(2)
  })
  it("403 para outras chaves, 400 para data ruim, ajuda documentada", async () => {
    expect((await lerFollowupMetricas("cfo", new URLSearchParams())).status).toBe(403)
    expect((await lerFollowupMetricas("coo", new URLSearchParams())).status).toBe(403)
    expect((await lerFollowupMetricas("cco", new URLSearchParams("de=x"))).status).toBe(400)
    const r = await lerFollowupMetricas("cto", new URLSearchParams())
    expect(r.status).toBe(200)
    expect(r.corpo.historico_por_etapa).toBe(false)   // sem tabela: avisa o motivo
    expect(r.corpo.historico_motivo).toBeTruthy()
    expect(AJUDA_FOLLOWUP_METRICAS).toMatch(/Só leitura/)
  })
})
