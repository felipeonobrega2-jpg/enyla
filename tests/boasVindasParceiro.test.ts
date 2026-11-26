// Mensagem fixa (sem IA) à gráfica do Prospector com o modo parceiro desligado. Tudo simulado; só fixtures fictícias.
import { describe, it, expect, vi, beforeEach } from "vitest"

type Linha = Record<string, unknown>
const mundo = vi.hoisted(() => ({
  prospectos: [] as Linha[], nivel: "lead" as string,
  evo: vi.fn(async (..._a: unknown[]) => ({ ok: true, status: 200, corpo: { key: { id: "x" } } })),
}))

vi.mock("@/app/lib/evolution", () => ({ evo: mundo.evo }))
vi.mock("@/app/lib/nivelCliente", () => ({ nivelDoDestinatario: vi.fn(async () => ({ nivel: mundo.nivel })) }))
vi.mock("@/app/lib/juntarConversas", () => ({ lerApelidos: vi.fn(async () => ({})) }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (_t: string) => {
      const filtros: ((r: Linha) => boolean)[] = []
      let patch: Linha | null = null
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.update = (p: Linha) => { patch = p; return q }
      q.eq = (c: string, v: unknown) => { filtros.push(r => r[c] === v); return q }
      q.range = () => q
      q.maybeSingle = async () => ({ data: mundo.prospectos.find(r => filtros.every(f => f(r))) ?? null, error: null })
      q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        const achadas = mundo.prospectos.filter(r => filtros.every(f => f(r)))
        if (patch) achadas.forEach(r => Object.assign(r, patch))
        return Promise.resolve({ data: structuredClone(achadas), error: null }).then(ok, ko)
      }
      return q
    },
  },
}))

import { boasVindasParceiro, TEXTO_BOAS_VINDAS, MARCA_BOAS_VINDAS } from "@/app/lib/boasVindasParceiro"

const JID = "5511987654321@s.whatsapp.net"
const DENTRO = new Date("2026-11-26T15:00:00Z")   // quinta, 12h em Brasília
const FORA = new Date("2026-11-26T01:00:00Z")      // quarta, 22h em Brasília
const SABADO = new Date("2026-11-28T15:00:00Z")

beforeEach(() => {
  mundo.evo.mockClear(); mundo.nivel = "lead"
  mundo.prospectos = [{ id: 1, telefone: "(11) 98765-4321", razao_social: "Gráfica Teste", nome_fantasia: null, etapa: "respondeu", opt_out: false, historico_etapas: [], atualizado_em: "2026-11-26T10:00:00.000Z" }]
})

describe("boas-vindas fixa ao parceiro do Prospector", () => {
  it("envia uma vez só, com o link oficial, sem o Felipe e assinada ENYLA", async () => {
    expect((await boasVindasParceiro(JID, DENTRO)).enviou).toBe(true)
    expect((await boasVindasParceiro(JID, DENTRO)).motivo).toBe("ja_enviada")
    expect(mundo.evo).toHaveBeenCalledTimes(1)
    expect(TEXTO_BOAS_VINDAS).toContain("https://app.enyla.com.br/parceiros")
    expect(TEXTO_BOAS_VINDAS).toMatch(/Termos de Parceria/)
    expect(TEXTO_BOAS_VINDAS).not.toMatch(/felipe/i)
    expect(TEXTO_BOAS_VINDAS).toMatch(/Equipe ENYLA$/)
    const hist = mundo.prospectos[0].historico_etapas as Linha[]
    expect(hist.some(e => e.marca === MARCA_BOAS_VINDAS)).toBe(true)
    expect(hist.some(e => (e.mensagem as Linha | undefined)?.direcao === "enviada")).toBe(true)
  })
  it("dois disparos ao mesmo tempo enviam uma só", async () => {
    const r = await Promise.all([boasVindasParceiro(JID, DENTRO), boasVindasParceiro(JID, DENTRO)])
    expect(r.filter(x => x.enviou)).toHaveLength(1)
    expect(mundo.evo).toHaveBeenCalledTimes(1)
  })
  it("não envia para telefone que não é do Prospector", async () => {
    expect((await boasVindasParceiro("5521999990000@s.whatsapp.net", DENTRO)).motivo).toBe("nao_prospecto")
    expect(mundo.evo).not.toHaveBeenCalled()
  })
  it.each(["A", "B", "C", "indefinido"])("não envia para cliente %s", async nv => {
    mundo.nivel = nv
    expect((await boasVindasParceiro(JID, DENTRO)).motivo).toBe("nao_e_lead")
    expect(mundo.evo).not.toHaveBeenCalled()
  })
  it("não envia fora da janela nem no fim de semana, e depois ainda envia", async () => {
    expect((await boasVindasParceiro(JID, FORA)).motivo).toBe("fora_da_janela")
    expect((await boasVindasParceiro(JID, SABADO)).motivo).toBe("fora_da_janela")
    expect(mundo.evo).not.toHaveBeenCalled()
    expect((await boasVindasParceiro(JID, DENTRO)).enviou).toBe(true)
  })
  it.each([
    ["opt_out", { opt_out: true }, "excluido"],
    ["descartado", { etapa: "descartado" }, "excluido"],
    ["cadastrou", { etapa: "cadastrou" }, "ja_cadastrou"],
  ])("respeita %s", async (_n, extra, motivo) => {
    Object.assign(mundo.prospectos[0], extra)
    expect((await boasVindasParceiro(JID, DENTRO)).motivo).toBe(motivo)
    expect(mundo.evo).not.toHaveBeenCalled()
  })
})
