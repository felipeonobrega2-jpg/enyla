import { describe, it, expect, vi, beforeEach } from "vitest"

const est = vi.hoisted(() => ({ tabelas: {} as Record<string, unknown[]>, escritas: [] as string[], cfg: {} as Record<string, unknown> }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (t: string) => {
      const cadeia: Record<string, unknown> = {}
      for (const m of ["select", "or", "in", "gte", "order", "limit", "like", "eq", "not"]) cadeia[m] = () => cadeia
      for (const m of ["insert", "update", "upsert", "delete"]) cadeia[m] = () => { est.escritas.push(`${t}.${m}`); return cadeia }
      cadeia.then = (ok: (v: unknown) => unknown) => ok({ data: est.tabelas[t] ?? [], error: null })
      return cadeia
    },
  },
}))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn(async () => est.cfg) }))

import { lerPertoExterno, montarPerto, LIMITE_PERTO } from "@/app/lib/pertoExterno"

const agora = new Date("2026-11-24T15:00:00Z").getTime()
const dia = (n: number) => new Date(agora - n * 86_400_000).toISOString()
const conv = (p: Record<string, unknown>) => ({ jid: "1@s.whatsapp.net", nome: "Ana Souza", etiquetas: ["ICP"], status_lead: "mql", ultima_at: dia(1), ultima_recebida_at: dia(1), ultima_enviada_at: dia(2), ...p })

beforeEach(() => {
  est.escritas = []
  est.cfg = { vinculosWhatsapp: {}, pedidosDigitais: [{ id: "DIG-0007", jid: "b@s.whatsapp.net", em: dia(10), status: "producao" }] }
  est.tabelas = {
    agente_tratadas: [{ id: "perto|a@s.whatsapp.net|" + encodeURIComponent("quer 5 mil"), em: dia(3) }],
    whatsapp_conversas: [
      conv({ jid: "a@s.whatsapp.net", nome: "Carla Dias", ultima_recebida_at: dia(1), ultima_enviada_at: dia(2) }),
      conv({ jid: "b@s.whatsapp.net", nome: "Bruno", ultima_recebida_at: dia(3), ultima_enviada_at: dia(1), ultima_at: dia(1) }),
    ],
    KanbanCard: [{ numero: "P-100", nomeCliente: "Carla Dias", coluna: 3, createdAt: dia(30) }, { numero: "P-120", nomeCliente: "Carla Dias", coluna: 5, createdAt: dia(5) }],
  }
})

describe("?o=perto", () => {
  it("CCO e CMO recebem a lista; estrela primeiro, jaCliente e esperando certos", async () => {
    for (const d of ["cco", "cmo"] as const) {
      const r = await lerPertoExterno(d)
      expect(r.status).toBe(200)
      const itens = r.corpo.itens as { jid: string; estrela: boolean; nota: string | null; esperando: { quem: string }; jaCliente: boolean; ultimoPedido: string | null }[]
      expect(r.corpo.total).toBe(2)
      expect(itens.map(i => i.jid)).toEqual(["a@s.whatsapp.net", "b@s.whatsapp.net"])
      expect(itens[0]).toMatchObject({ estrela: true, nota: "quer 5 mil", esperando: { quem: "lead" }, jaCliente: true, ultimoPedido: "P-120" })
      expect(itens[1]).toMatchObject({ estrela: false, nota: null, esperando: { quem: "nos" }, jaCliente: true, ultimoPedido: "DIG-0007" })
      expect(JSON.stringify(r.corpo)).not.toMatch(/telefone|email/i)
    }
  })
  it("as outras chaves recebem 403 e nada é lido", async () => {
    for (const d of ["coo", "cfo", "cto"] as const) expect((await lerPertoExterno(d)).status).toBe(403)
  })
  it("não grava nada", async () => {
    await lerPertoExterno("cco")
    expect(est.escritas).toEqual([])
  })
  it("orçamento sem pedido fechado e digital sem sinal não é cliente; limita a 100 e mostra o total", () => {
    const recentes = Array.from({ length: 130 }, (_, i) => conv({ jid: `j${i}@s.whatsapp.net`, nome: `Lead ${i}`, ultima_at: dia(1) }))
    const r = montarPerto({ marcas: [], fora: new Set(), daLista: [], recentes: recentes as never, agora,
      cards: [{ numero: "P-1", nomeCliente: "Lead 0", coluna: 0, createdAt: dia(1) }],
      pedidosDigitais: [{ id: "DIG-1", jid: "j1@s.whatsapp.net", em: dia(1), status: "aguardando_sinal" }] })
    expect(r.total).toBe(130)
    expect(r.itens).toHaveLength(LIMITE_PERTO)
    expect(r.itens.some(i => i.jaCliente)).toBe(false)
  })
})
