import { describe, it, expect } from "vitest"
import { aprovacoesSemAmbiguidade, ehAprovacao, sugestoesDeArte, confirmarArteAprovada, type MsgZap } from "../app/lib/arteAprovadaSugestao"
import { digitaisEmProducao } from "../app/lib/digitalProducao"
import { aprovarArte } from "../app/lib/digital"

const arte = (ts: string): MsgZap => ({ id: `a${ts}`, ts, from_me: true, tipo: "image", corpo: "Segue a arte" })
const cli = (ts: string, corpo: string, id = `c${ts}`): MsgZap => ({ id, ts, from_me: false, tipo: "text", corpo })
const ped = (id: string, jid = "j1") => ({ id, jid, status: "arte", sinalPagoEm: "2026-11-10T10:00:00Z" })

describe("sugestão de arte aprovada", () => {
  it.each([
    ["DIG-0037", "Pode sim", "2026-11-13T14:00:00Z"],
    ["DIG-0052", "Pode prosseguir", "2026-11-13T15:00:00Z"],
    ["DIG-0119", "Pode fazer uma prova", "2026-11-23T14:00:00Z"],
    ["DIG-0127", "Aprovado", "2026-11-23T16:00:00Z"],
  ])("%s: %s gera sugestão", (id, texto, ts) => {
    const msgs = [arte("2026-11-12T10:00:00Z"), cli(ts, texto)]
    const r = sugestoesDeArte([ped(id)], { j1: msgs })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ pedido: id, trecho: texto, em: ts, ambigua: false })
  })
  it("'Aprovado?' da Enyla não gera", () => {
    const msgs: MsgZap[] = [arte("2026-11-12T10:00:00Z"), { id: "e1", ts: "2026-11-12T10:01:00Z", from_me: true, tipo: "text", corpo: "Aprovado?" }]
    expect(sugestoesDeArte([ped("DIG-0001")], { j1: msgs })).toEqual([])
    expect(ehAprovacao("Aprovado?")).toBe(false)
  })
  it("pedido de mudança não gera", () => {
    expect(ehAprovacao("Aprovado, mas troca a cor do logo")).toBe(false)
    expect(ehAprovacao("Pode sim, só ajusta o texto")).toBe(false)
    expect(ehAprovacao("Ainda não aprovado")).toBe(false)
  })
  it("sem arte enviada pela empresa antes, não gera", () => {
    expect(sugestoesDeArte([ped("DIG-0001")], { j1: [cli("2026-11-13T14:00:00Z", "Aprovado")] })).toEqual([])
  })
  it("só sinal_pago e arte, e não de arte já aprovada", () => {
    const msgs = [arte("2026-11-12T10:00:00Z"), cli("2026-11-13T14:00:00Z", "Aprovado")]
    expect(sugestoesDeArte([{ ...ped("A"), status: "producao" }, { ...ped("B"), arteAprovadaEm: "2026-11-13" }], { j1: msgs })).toEqual([])
  })
  it("decisão anterior apaga a sugestão", () => {
    const msgs = [arte("2026-11-12T10:00:00Z"), cli("2026-11-13T14:00:00Z", "Aprovado", "m9")]
    const d = [{ pedido: "DIG-0001", msgId: "m9", decisao: "descartada" as const, por: "x", em: "2026-11-13" }]
    expect(sugestoesDeArte([ped("DIG-0001")], { j1: msgs }, d)).toEqual([])
  })
  it("DIG-0056 e DIG-0057 na mesma conversa são ambíguos", () => {
    const msgs = [arte("2026-11-12T10:00:00Z"), cli("2026-11-13T14:00:00Z", "Pode seguir")]
    const r = sugestoesDeArte([ped("DIG-0056"), ped("DIG-0057")], { j1: msgs })
    expect(r.map(s => [s.pedido, s.ambigua])).toEqual([["DIG-0056", true], ["DIG-0057", true]])
    expect(r[0].candidatos).toEqual(["DIG-0056", "DIG-0057"])
  })
  it("sem clique, nada muda: a detecção não altera o pedido", () => {
    const p = ped("DIG-0001"), antes = JSON.stringify(p)
    sugestoesDeArte([p], { j1: [arte("2026-11-12T10:00:00Z"), cli("2026-11-13T14:00:00Z", "Aprovado")] })
    expect(JSON.stringify(p)).toBe(antes)
  })
  it("a leitura da porta mostra { trecho, em } e nada de jid", () => {
    const r = digitaisEmProducao([{ id: "DIG-0001", status: "arte", sugestaoArteAprovada: { trecho: "Aprovado", em: "2026-11-23T16:00:00Z" } }] as never, "2026-11-24")
    expect(r[0].sugestaoArteAprovada).toEqual({ trecho: "Aprovado", em: "2026-11-23T16:00:00Z" })
  })
  it("aprovarArte existente continua exigindo arte enviada (o clique novo não passa por ele)", () => {
    expect(aprovarArte({ id: "X", status: "arte" } as never, [])).toBeNull()
  })
  it("o clique muda só a aprovação da arte (etapa e valores intactos) e registra quem e quando", () => {
    const p = { id: "DIG-0001", status: "arte", total: 500, restante: undefined, arte: 0 }
    const n = confirmarArteAprovada(p, { em: "2026-11-23T16:00:00Z", trecho: "Aprovado" }, "Painel", "2026-11-24T09:00:00Z")!
    expect(n.arteAprovadaEm).toBe("2026-11-23T16:00:00Z")
    expect(n.arteAprovadaPor).toEqual({ por: "Painel", em: "2026-11-24T09:00:00Z", trecho: "Aprovado" })
    const { arteAprovadaEm: _a, arteAprovadaPor: _b, ...resto } = n
    void _a; void _b
    expect(resto).toEqual(p)
    expect(confirmarArteAprovada({ ...p, status: "producao" }, { em: "x", trecho: "y" }, "P", "z")).toBeNull()
  })

  describe("gravação automática da aprovação não ambígua", () => {
    const grava = (pedidos: ReturnType<typeof ped>[], msgs: MsgZap[], decisoes: Parameters<typeof sugestoesDeArte>[2] = []) =>
      aprovacoesSemAmbiguidade(sugestoesDeArte(pedidos, { j1: msgs }, decisoes)).map(s => ({ s, n: confirmarArteAprovada(pedidos.find(p => p.id === s.pedido)!, s, "sistema", "2026-11-25T20:00:00Z") }))
    const msgs = [arte("2026-11-12T10:00:00Z"), cli("2026-11-13T14:00:00Z", "Pode sim", "m1")]
    it("inequívoca: grava o ts da mensagem, por sistema, sem mudar a etapa", () => {
      const [{ n }] = grava([ped("DIG-0001")], msgs)
      expect(n!.arteAprovadaEm).toBe("2026-11-13T14:00:00Z")
      expect(n!.arteAprovadaPor).toEqual({ por: "sistema", em: "2026-11-25T20:00:00Z", trecho: "Pode sim" })
      expect(n!.status).toBe("arte")
    })
    it("segunda passagem não sobrescreve", () => {
      const [{ n }] = grava([ped("DIG-0001")], msgs)
      expect(sugestoesDeArte([n!], { j1: msgs })).toEqual([])
      expect(confirmarArteAprovada(n!, { em: "2026-11-24T00:00:00Z", trecho: "x" }, "sistema", "2026-11-26T00:00:00Z")).toBeNull()
    })
    it("decisão confirmada registrada impede a sugestão de reaparecer", () => {
      const d = [{ pedido: "DIG-0001", msgId: "m1", decisao: "confirmada" as const, por: "sistema", em: "2026-11-25T20:00:00Z" }]
      expect(grava([ped("DIG-0001")], msgs, d)).toEqual([])
    })
    it("ajuste ou negação na mesma mensagem: não grava", () => {
      for (const t of ["Aprovado, mas troca a cor", "Não aprovo", "Pode sim, ajusta o texto"])
        expect(grava([ped("DIG-0001")], [arte("2026-11-12T10:00:00Z"), cli("2026-11-13T14:00:00Z", t)])).toEqual([])
    })
    it("dois pedidos no mesmo jid: ambígua, não grava sozinho", () => {
      expect(grava([ped("DIG-0056"), ped("DIG-0057")], msgs)).toEqual([])
    })
    it("clique dias depois: arteAprovadaEm é a data da mensagem; a do clique fica só em arteAprovadaPor.em", () => {
      const [s] = sugestoesDeArte([ped("DIG-0001")], { j1: msgs })
      const n = confirmarArteAprovada(ped("DIG-0001"), s, "Painel", "2026-11-25T20:50:00Z")!
      expect(n.arteAprovadaEm).toBe("2026-11-13T14:00:00Z")
      expect(n.arteAprovadaPor.em).toBe("2026-11-25T20:50:00Z")
      expect(n.status).toBe("arte")
    })
    it("nenhuma mensagem sai: a regra é pura e só devolve o pedido", () => {
      const [{ n }] = grava([ped("DIG-0001")], msgs)
      expect(Object.keys(n!).sort()).toEqual(["arteAprovadaEm", "arteAprovadaPor", "id", "jid", "sinalPagoEm", "status"])
    })
  })
})
