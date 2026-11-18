import { describe, it, expect } from "vitest"
import { montarEscritorio, mesaDoRegistro } from "@/app/lib/escritorio"

const agora = new Date("2026-11-18T18:00:00.000Z").getTime()   // 15h em São Paulo
const min = (m: number) => new Date(agora - m * 60_000).toISOString()
const reg = (m: number, x: Partial<{ passo: string; enviou: boolean; nome: string; motivo: string }> = {}) =>
  ({ em: min(m), jid: "1@lid", nome: x.nome ?? "Ana Souza", perfil: "medio" as const, enviou: x.enviou ?? true, texto: "", motivo: x.motivo ?? "ok", passo: x.passo })

describe("escritório dos agentes", () => {
  it("cada registro cai na mesa certa", () => {
    expect(mesaDoRegistro({ passo: "Levantando para orçar" })).toBe("coletor")
    expect(mesaDoRegistro({ passo: "F2" })).toBe("followup")
    expect(mesaDoRegistro({ passo: "Reativação" })).toBe("reativacao")
    expect(mesaDoRegistro({ passo: "Campanha digital" })).toBe("digital")
    expect(mesaDoRegistro({})).toBe("atendente")
  })
  it("quem agiu nos últimos 10 min está trabalhando; o feed vem do mais recente", () => {
    const e = montarEscritorio({ registros: [reg(3), reg(40, { passo: "F1" })], cfg: { agenteAuto: { ligado: true } }, noHorario: true, agora })
    expect(e.mesas.find(m => m.id === "atendente")!.estado).toBe("trabalhando")
    expect(e.mesas.find(m => m.id === "followup")!.estado).toBe("plantao")
    expect(e.feed[0].texto).toBe("Respondeu Ana Souza")
    expect(e.mesas.find(m => m.id === "atendente")!.horas[14 - 8]).toBe(1)
  })
  it("cota da hora cheia trava quem fala com o cliente, não o vigia nem as propostas", () => {
    const envios = Array.from({ length: 40 }, (_, i) => min(i))
    const e = montarEscritorio({ registros: [], cfg: { agenteAuto: { ligado: true }, agenteEnviosHora: envios }, noHorario: true, agora })
    expect(e.mesas.find(m => m.id === "atendente")!.estado).toBe("travado")
    expect(e.mesas.find(m => m.id === "propostas")!.estado).not.toBe("travado")
    expect(e.cota).toEqual({ usados: 40, limite: 40 })
  })
  it("resposta segurada aparece no feed mas não conta como entrega", () => {
    const e = montarEscritorio({ registros: [reg(5, { enviou: false, motivo: "MQL: você atende" })], cfg: { agenteAuto: { ligado: true } }, noHorario: true, agora })
    expect(e.feed[0].tom).toBe("segurou")
    expect(e.mesas.find(m => m.id === "atendente")!.hoje).toBe(0)
  })
  it("fora do horário os agentes de conversa descansam", () => {
    const e = montarEscritorio({ registros: [], cfg: { agenteAuto: { ligado: true } }, noHorario: false, agora })
    expect(e.mesas.find(m => m.id === "atendente")!.estado).toBe("descansando")
    expect(e.mesas.find(m => m.id === "aprendiz")!.estado).toBe("plantao")
  })
})
