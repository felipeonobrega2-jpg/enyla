// Classificação inline: só paga a IA quando o cliente escreveu depois do que a última classificação guardada já viu.
import { describe, it, expect, vi, beforeEach } from "vitest"
import { classificacaoReaproveitavel } from "../app/lib/classificarLead"

const est = vi.hoisted(() => ({ guardada: null as unknown, msgs: [] as { from_me: boolean; corpo: string; tipo: string; ts: string }[], ia: vi.fn(), updates: [] as Record<string, unknown>[] }))

vi.mock("@/app/lib/configAtomica", () => ({ lerConfigLinha: vi.fn(async () => ({ data: { data: {} } })), mudarConfig: vi.fn(async () => ({})) }))
vi.mock("../app/lib/configAtomica", () => ({ lerConfigLinha: vi.fn(async () => ({ data: { data: {} } })), mudarConfig: vi.fn(async () => ({})) }))
vi.mock("../app/lib/notificar", () => ({ notificar: vi.fn(), LINK_SISTEMA: "" }))
vi.mock("../app/lib/claude", () => ({ MODELO: "m", clienteClaude: () => ({ beta: { messages: { create: est.ia } } }) }))
vi.mock("../app/lib/supabase", () => ({
  supabase: {
    from: (tabela: string) => {
      let atualizar: Record<string, unknown> | null = null
      let colunas = ""
      const b: Record<string, unknown> = {
        select: (c: string) => { colunas = c; return b },
        update: (v: Record<string, unknown>) => { atualizar = v; est.updates.push(v); return b },
        eq: () => b, order: () => b, limit: () => b,
        maybeSingle: async () => {
          if (tabela === "whatsapp_conversas" && colunas === "classificacao_guardada") return { data: { classificacao_guardada: est.guardada } }
          return { data: { jid: "j", nome: "N", telefone: null, etiquetas: [], status_lead: null, ultima_at: null, ultima_classificacao_at: null } }
        },
        then: (ok: (v: unknown) => unknown) => ok({ data: tabela === "whatsapp_mensagens" && !atualizar ? [...est.msgs].reverse() : [] }),
      }
      return b
    },
  },
}))

import { classificarConversa } from "../app/lib/classificarLeadServidor"

const t = (h: number) => new Date(Date.UTC(2026, 10, 24, h)).toISOString()
const c = { perfil: "medio", quantidade_total: 2000, recorrente: false, evidencia: "2000 caixas", motivo: "guardado", fornecedor: false }
const respostaIA = { content: [{ type: "text", text: JSON.stringify({ ...c, motivo: "da IA" }) }] }

beforeEach(() => {
  est.guardada = null; est.updates = []; est.ia.mockReset(); est.ia.mockResolvedValue(respostaIA)
  est.msgs = [{ from_me: false, corpo: "quero 2000 caixas", tipo: "text", ts: t(10) }, { from_me: true, corpo: "ok", tipo: "text", ts: t(11) }]
})

describe("classificacaoReaproveitavel", () => {
  it("vale só se a guardada viu a última mensagem do cliente", () => {
    expect(classificacaoReaproveitavel({ c, em: t(12), ate: t(10) }, t(10))).toEqual(c)
    expect(classificacaoReaproveitavel({ c, em: t(12), ate: t(10) }, t(11))).toBeNull()
    expect(classificacaoReaproveitavel(null, t(10))).toBeNull()
    expect(classificacaoReaproveitavel({ lixo: 1 }, t(10))).toBeNull()
  })
})

describe("classificarConversa inline (reusar)", () => {
  it("classificação guardada mais nova que a mensagem do cliente: não chama a IA e usa o guardado", async () => {
    est.guardada = { c, em: t(12), ate: t(10) }
    const r = await classificarConversa("j", { cfg: { apiKey: "k" }, aplicar: false, reusar: true })
    expect(est.ia).not.toHaveBeenCalled()
    expect(r?.classificacao.perfil).toBe("medio")
    expect(r?.classificacao.motivo).toBe("guardado")
  })
  it("mensagem nova do cliente: chama a IA e guarda o resultado", async () => {
    est.guardada = { c, em: t(12), ate: t(10) }
    est.msgs.push({ from_me: false, corpo: "agora 3000", tipo: "text", ts: t(13) })
    const r = await classificarConversa("j", { cfg: { apiKey: "k" }, aplicar: false, reusar: true })
    expect(est.ia).toHaveBeenCalledTimes(1)
    expect(r?.classificacao.motivo).toBe("da IA")
    expect(est.updates.some(u => "classificacao_guardada" in u)).toBe(true)
  })
  it("sem guardada: chama a IA", async () => {
    await classificarConversa("j", { cfg: { apiKey: "k" }, aplicar: false, reusar: true })
    expect(est.ia).toHaveBeenCalledTimes(1)
  })
  it("sem reusar (rodada de fundo): sempre chama a IA", async () => {
    est.guardada = { c, em: t(12), ate: t(10) }
    await classificarConversa("j", { cfg: { apiKey: "k" }, aplicar: false })
    expect(est.ia).toHaveBeenCalledTimes(1)
  })
})
