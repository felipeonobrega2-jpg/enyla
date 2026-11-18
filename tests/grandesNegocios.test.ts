import { describe, it, expect } from "vitest"
import { precisaDeVoce, ordenarGrandes, sugestoesGrandes, type GrandeNegocio } from "@/app/lib/grandesNegocios"

const agora = new Date("2026-11-18T15:00:00Z").getTime()
const g = (p: Partial<GrandeNegocio>): GrandeNegocio => ({ id: Math.random().toString(), nome: "X", etapa: "contato", notas: [], criadoEm: "", atualizadoEm: "", ...p })

describe("grandes negócios", () => {
  it("cobra o próximo passo vencido, de hoje ou faltando; fechado não cobra", () => {
    expect(precisaDeVoce(g({ proximoPasso: "ligar", proximoEm: "2026-11-17" }), agora)).toBe("vencido")
    expect(precisaDeVoce(g({ proximoPasso: "ligar", proximoEm: "2026-11-18" }), agora)).toBe("hoje")
    expect(precisaDeVoce(g({ proximoPasso: "ligar", proximoEm: "2026-11-20" }), agora)).toBeNull()
    expect(precisaDeVoce(g({}), agora)).toBe("sem_passo")
    expect(precisaDeVoce(g({ etapa: "fechado" }), agora)).toBeNull()
  })
  it("ordena: o que precisa de você, depois a etapa mais avançada e o valor", () => {
    const a = g({ nome: "ok-negociacao", etapa: "negociacao", proximoPasso: "x", proximoEm: "2026-11-25", valor: 9000 })
    const b = g({ nome: "vencido-contato", etapa: "contato", proximoPasso: "x", proximoEm: "2026-11-10" })
    const c = g({ nome: "fechado", etapa: "fechado" })
    expect(ordenarGrandes([c, a, b], agora).map(x => x.nome)).toEqual(["vencido-contato", "ok-negociacao", "fechado"])
  })
  it("sugere proposta alta e conversa de volume grande que ainda não estão na lista", () => {
    const s = sugestoesGrandes({
      grandes: [g({ jid: "j1" })],
      conversas: [{ jid: "j1", nome: "Já tem", etiquetas: ["ICP"], quantidade: 50000 }, { jid: "j2", nome: "Fábrica", etiquetas: ["ICP"], quantidade: 30000 }, { jid: "j3", nome: "Pequeno", etiquetas: ["ICP"], quantidade: 2000 }],
      propostas: [{ numero: "ORC-1", nomeCliente: "Alta", preco: 18000 }, { numero: "ORC-2", nomeCliente: "Baixa", preco: 4000 }],
    })
    expect(s.map(x => x.nome)).toEqual(["Alta", "Fábrica"])
  })
})
