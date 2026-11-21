import { describe, it, expect } from "vitest"
import { idPerto, lerMarca, sugestoesPerto, situacao } from "../app/lib/perto"

const agora = new Date("2026-11-21T12:00:00Z").getTime()
const h = (horas: number) => new Date(agora - horas * 3_600_000).toISOString()

describe("perto de você", () => {
  it("guarda e lê a nota no id (com | e acento)", () => {
    const m = lerMarca(idPerto("5511@s.whatsapp.net", "quer 20 mil | no ano, ação"), "x")
    expect(m).toEqual({ jid: "5511@s.whatsapp.net", nota: "quer 20 mil | no ano, ação", em: "x" })
    expect(lerMarca("pertofora|5511@lid", "x")).toBeNull()
  })
  it("sugere só bom negócio da semana, fora da lista, ICP primeiro", () => {
    const convs = [
      { jid: "a", nome: "A", status_lead: "mql", etiquetas: ["Lead médio"], ultima_at: h(1) },
      { jid: "b", nome: "B", status_lead: "mql", etiquetas: ["ICP"], ultima_at: h(30) },
      { jid: "c", nome: "C", status_lead: "mql", etiquetas: ["ICP"], ultima_at: h(24 * 9) },        // velho
      { jid: "d", nome: "D", status_lead: null, etiquetas: ["Lead pequeno"], ultima_at: h(1) },     // pequeno
      { jid: "e", nome: "E", status_lead: "mql", etiquetas: ["Oportunidade"], ultima_at: h(2) },
      { jid: "f", nome: "F", status_lead: "mql", etiquetas: ["ICP"], ultima_at: h(2) },             // já na lista
      { jid: "g", nome: "G", status_lead: "mql", etiquetas: ["ICP"], ultima_at: h(2) },             // dispensado
    ]
    expect(sugestoesPerto(convs, new Set(["f"]), new Set(["g"]), agora).map(c => c.jid)).toEqual(["b", "e", "a"])
  })
  it("diz quem está esperando quem", () => {
    expect(situacao({ jid: "x", nome: null, ultima_recebida_at: h(2), ultima_enviada_at: h(5) }, agora)).toMatchObject({ esperandoVoce: true, texto: "esperando você · hoje" })
    expect(situacao({ jid: "x", nome: null, ultima_recebida_at: h(80), ultima_enviada_at: h(72) }, agora)).toMatchObject({ esperandoVoce: false, texto: "você falou por último · há 3 dias" })
  })
})
