import { describe, it, expect } from "vitest"
import { estadoDoMql, resumirMeta, comMedidaPadrao, textoDoTravado, momentoDoLead, MsgMeta } from "../app/lib/metaMql"
import type { DadosPedido } from "../app/lib/atendente"

const agora = new Date("2026-11-07T15:00:00Z").getTime()
const dados = (d: Partial<DadosPedido>): DadosPedido => ({ produto: "", volume_ml: null, caixa_cm: null, frasco_cm: null, quantidade: null, tem_arte: null, resumo: "", ...d })
const lead = (ts: string, corpo = "oi"): MsgMeta => ({ from_me: false, tipo: "conversation", ts, corpo })
const eu = (ts: string, corpo: string, tipo = "conversation"): MsgMeta => ({ from_me: true, tipo, ts, corpo })

describe("meta: orçar todo MQL em 24 h", () => {
  it("orçado pelo PDF ou preço no texto, medindo as horas desde a primeira mensagem dele", () => {
    const e = estadoDoMql([lead("2026-11-06T10:00:00Z"), eu("2026-11-06T20:00:00Z", "", "documentMessage")], dados({}), [], agora)!
    expect(e.estado).toBe("orcado"); expect(e.horas).toBe(10)
    const p = estadoDoMql([lead("2026-11-05T10:00:00Z"), eu("2026-11-06T16:00:00Z", "Fica R$ 1.850 as mil")], dados({}), [], agora)!
    expect(p.estado).toBe("orcado"); expect(p.horas).toBe(30)
  })
  it("orçamento no sistema também conta; o de antes da primeira mensagem não", () => {
    expect(estadoDoMql([lead("2026-11-06T10:00:00Z")], dados({}), ["2026-11-06T12:00:00.000Z"], agora)!.estado).toBe("orcado")
    expect(estadoDoMql([lead("2026-11-06T10:00:00Z")], dados({}), ["2026-11-01T12:00:00.000Z"], agora)!.estado).not.toBe("orcado")
  })
  it("fora da janela: lead que já falava antes da semana", () => {
    expect(estadoDoMql([lead("2026-10-20T10:00:00Z"), lead("2026-11-06T10:00:00Z")], dados({}), [], agora)).toBeNull()
  })
  it("travado: falta medida, dá com a caixa padrão do ml, ou já tem tudo", () => {
    const m = [lead("2026-11-06T10:00:00Z")]
    expect(estadoDoMql(m, dados({ quantidade: 1000 }), [], agora)!.estado).toBe("falta")
    const pad = estadoDoMql(m, dados({ quantidade: 1000, volume_ml: 100 }), [], agora)!
    expect(pad.estado).toBe("padrao"); expect(pad.padraoMl).toBe(100)
    expect(estadoDoMql(m, dados({ quantidade: 1000, caixa_cm: { frente: 6, lateral: 3, altura: 10 } }), [], agora)!.estado).toBe("pronto")
    expect(estadoDoMql(m, dados({ quantidade: 1000, frasco_cm: "50ml quadrado" }), [], agora)!.estado).toBe("falta")
    expect(estadoDoMql(m, dados({ quantidade: 1000, frasco_cm: "9,6 com a válvula" }), [], agora)!.estado).toBe("pronto")
    expect(textoDoTravado(estadoDoMql(m, dados({ volume_ml: 50 }), [], agora)!)).toBe("Falta a quantidade")
  })
  it("caixa padrão vai para o orçamento; medida do cliente não é trocada", () => {
    expect(comMedidaPadrao(dados({ volume_ml: 100 })).caixa_cm).toEqual({ frente: 6.2, lateral: 6.2, altura: 13.2 })
    const cx = { frente: 6, lateral: 3, altura: 10 }
    expect(comMedidaPadrao(dados({ volume_ml: 100, caixa_cm: cx })).caixa_cm).toBe(cx)
  })
  it("não é a sua vez: ficou de mandar ou decidir, sem pressa, produto que não fazemos", () => {
    const d = dados({ quantidade: 1000 })
    expect(momentoDoLead(null, ["1000", "Amanhã te envio as medidas das caixas"], d)).toBe("com_ele")
    expect(momentoDoLead(null, ["Entendo ! Eu vou conversar com meu irmão"], d)).toBe("com_ele")
    expect(momentoDoLead(null, ["a ideia é mais iniciar esse contato", "Para botarmos em prática o lançamento até janeiro"], d)).toBe("sem_pressa")
    expect(momentoDoLead(null, ["1000 Maços / 100 display"], d)).toBe("nao_atende")
    expect(momentoDoLead("sem_pressa", ["quero 1000"], d)).toBe("sem_pressa")          // a leitura da IA vale
    expect(momentoDoLead(null, ["Amanhã te envio as medidas", "10x5x5"], d)).toBe("agora")  // mandou depois: volta
    expect(momentoDoLead(null, ["Quero 1.000 caixinhas de 50ml"], d)).toBe("agora")
  })
  it("falta dado e você falou por último: a vez é dele", () => {
    const m = [lead("2026-11-06T10:00:00Z", "1000"), eu("2026-11-06T11:00:00Z", "Qual a medida?")]
    expect(estadoDoMql(m, dados({ quantidade: 1000 }), [], agora)!.momento).toBe("com_ele")
    expect(estadoDoMql([m[0]], dados({ quantidade: 1000 }), [], agora)!.momento).toBe("agora")
    expect(estadoDoMql([lead("2026-11-06T10:00:00Z", "1000 maços de cigarro")], dados({}), [], agora)).toBeNull()
  })
  it("placar: orçados, no prazo e atrasados", () => {
    expect(resumirMeta([{ estado: "orcado", horas: 10 }, { estado: "orcado", horas: 30 }, { estado: "falta", horas: 40 }, { estado: "padrao", horas: 5 },
      { estado: "falta", horas: 50, momento: "com_ele" }, { estado: "pronto", horas: 60, momento: "sem_pressa" }]))
      .toEqual({ total: 4, orcados: 2, noPrazo: 1, atrasados: 1, prontos: 0, padrao: 1, falta: 1, comEle: 1, semPressa: 1 })
  })
})
