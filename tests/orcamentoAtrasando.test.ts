import { describe, it, expect } from "vitest"
import { orcamentosAtrasados, tempoDeEspera, type ItemHoje } from "@/app/lib/hoje"
import { resumirMeta } from "@/app/lib/metaMql"

const agora = new Date("2026-11-16T15:00:00Z").getTime()
const item = (jid: string, rotulo: string, horasAtras: number): ItemHoje => ({
  jid, nome: jid, mensagem: null, desde: new Date(agora - horasAtras * 3_600_000).toISOString(), rotulo, retomada: false, lista: "orcar", dados: null, cliente: null,
})

describe("orçamento atrasando", () => {
  it("ICP/Oportunidade avisa com 2 h; os demais com 6 h; ICP primeiro", () => {
    const r = orcamentosAtrasados([item("a", "MQL", 3), item("b", "ICP", 2.5), item("c", "Lead médio", 7), item("d", "Oportunidade", 1)], {}, agora)
    expect(r.map(x => x.jid)).toEqual(["b", "c"])
  })
  it("não avisa de novo a mesma espera, mas avisa quando ele escreve de novo", () => {
    const b = item("b", "ICP", 3)
    expect(orcamentosAtrasados([b], { b: b.desde }, agora)).toHaveLength(0)
    expect(orcamentosAtrasados([b], { b: "2026-11-10T10:00:00.000Z" }, agora)).toHaveLength(1)
  })
  it("tempo de espera legível", () => {
    expect(tempoDeEspera(0.4)).toBe("24 min")
    expect(tempoDeEspera(5.2)).toBe("5 h")
    expect(tempoDeEspera(27)).toBe("1 dia e 3 h")
    expect(tempoDeEspera(48)).toBe("2 dias")
  })
  it("mediana do tempo até o orçamento só dos orçados", () => {
    expect(resumirMeta([{ estado: "orcado", horas: 2 }, { estado: "orcado", horas: 10 }, { estado: "orcado", horas: 30 }, { estado: "pronto", horas: 50 }]).medianaHoras).toBe(10)
    expect(resumirMeta([{ estado: "orcado", horas: 2 }, { estado: "orcado", horas: 4 }]).medianaHoras).toBe(3)
    expect(resumirMeta([{ estado: "pronto", horas: 5 }]).medianaHoras).toBeNull()
  })
})
