import { describe, it, expect } from "vitest"
import { digitalParado } from "@/app/lib/resolverServidor"

const dia = 86_400_000, agora = new Date("2026-11-18T15:00:00Z").getTime()
const iso = (d: number) => new Date(agora - d * dia).toISOString()

describe("digital parado além do prazo", () => {
  it("arte atrasada, cliente sem aprovar e produção longa; o resto não aparece", () => {
    const r = digitalParado([
      { id: "DIG-1", nome: "Ana", jid: "1", total: 300, status: "sinal_pago", statusEm: iso(3) },
      { id: "DIG-2", nome: "Bia", jid: "2", total: 300, status: "arte", statusEm: iso(5), arteEnviadaEm: iso(2) },
      { id: "DIG-3", nome: "Caio", jid: "3", total: 300, status: "producao", arteAprovadaEm: iso(8) },
      { id: "DIG-4", nome: "Duda", jid: "4", total: 300, status: "sinal_pago", statusEm: iso(1) },
      { id: "DIG-5", nome: "Eva", jid: "5", total: 300, status: "aguardando_sinal", statusEm: iso(9) },
    ], agora)
    expect(r.map(x => x.numero)).toEqual(["DIG-1", "DIG-2", "DIG-3"])
    expect(r[0].detalhe).toMatch(/Leandro/)
  })
})

describe("fornecedor: dias descontados (parado pelo cliente)", () => {
  it("não contam no prazo nem no atraso", async () => {
    const { diasNoFornecedor, atrasouNoFornecedor } = await import("@/app/lib/producao")
    // seg 02/11 → seg 09/11 = 5 dias úteis; prazo sex 06/11 = 4
    const m = { enviadoEm: "2026-11-02", recebidoEm: "2026-11-09", prazoPrevisto: "2026-11-06" }
    expect(atrasouNoFornecedor(m)).toBe(true)
    expect(diasNoFornecedor({ ...m, diasDescontados: 2 })).toBe(diasNoFornecedor(m) - 2)
    expect(atrasouNoFornecedor({ ...m, diasDescontados: 2 })).toBe(false)
  })
})
