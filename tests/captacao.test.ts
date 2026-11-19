import { describe, it, expect } from "vitest"
import { montarCandidatos, lerListaManual, textoConvite, precisaLembrete, funil, relevancia, TEMPLATE_PADRAO, type Convite } from "@/app/lib/captacao"

describe("Captador de parceiros", () => {
  it("candidatos: tira grupo, já cadastrado e já convidado; gráficos primeiro", () => {
    const r = montarCandidatos({
      conversas: [
        { jid: "5511911111111@s.whatsapp.net", nome: "Frascos Brasil", ultima_msg: "segue tabela de frascos" },
        { jid: "5511922222222@s.whatsapp.net", nome: "MAX ARTES GRAFICAS", ultima_msg: "ok" },
        { jid: "5511933333333@s.whatsapp.net", nome: "Já Cadastrada", ultima_msg: "corte e vinco" },
        { jid: "123@g.us", nome: "Grupo", ultima_msg: "" },
        { jid: "5511944444444@s.whatsapp.net", nome: "Convidado", ultima_msg: "gráfica" },
      ],
      fornecedores: [{ nome: "Colagem Boa", telefone: "(11) 95555-5555" }],
      cadastrosWhatsapp: ["11933333333"],
      convites: [{ id: "CV1", jid: "5511944444444@s.whatsapp.net", nome: "x", origem: "whatsapp", status: "enviado", texto: "", criadoEm: "" }],
    })
    expect(r.map(c => c.nome)).toEqual(["Colagem Boa", "MAX ARTES GRAFICAS", "Frascos Brasil"])
    expect(r[2].relevante).toBe(false)
  })
  it("lista colada e texto com nome opcional", () => {
    expect(lerListaManual("Gráfica X; 11 98888-7777\nlixo\n(21) 3333-4444")).toEqual([{ nome: "Gráfica X", jid: "5511988887777@s.whatsapp.net" }, { nome: null, jid: "552133334444@s.whatsapp.net" }])
    expect(textoConvite(TEMPLATE_PADRAO, "Marcos", "L")).toMatch(/^Oi, Marcos, tudo bem\?/)
    expect(textoConvite(TEMPLATE_PADRAO, null, "L")).toMatch(/^Oi, tudo bem\?/)
    expect(relevancia(["Adesão Etiquetas Patrícia"])).toBe("rótulos e adesivos")
  })
  it("lembrete só uma vez, 4 dias depois, para quem não abriu", () => {
    const c: Convite = { id: "CV1", jid: "j", nome: null, origem: "whatsapp", status: "enviado", texto: "", criadoEm: "", enviadoEm: new Date(Date.now() - 5 * 86_400_000).toISOString() }
    expect(precisaLembrete(c)).toBe(true)
    expect(precisaLembrete({ ...c, status: "abriu" })).toBe(false)
    expect(precisaLembrete({ ...c, lembreteEm: "x" })).toBe(false)
    expect(funil([c, { ...c, id: "2", status: "cadastrou" }, { ...c, id: "3", status: "fila" }])).toMatchObject({ naFila: 1, enviados: 2, cadastraram: 1 })
  })
})

import { trouxeDadosNovos } from "@/app/lib/digital"
describe("digital: só recota com dado novo", () => {
  const m = (from_me: boolean, corpo: string, tipo = "text") => ({ from_me, corpo, tipo })
  it("pergunta sem número depois do orçamento: não recota (caso Thays)", () => {
    expect(trouxeDadosNovos([m(false, "150 do sérum e 100 do gel"), m(true, "Montei os orçamentos…"), m(false, "Bom dia!"), m(false, "quanto tempo me entregam, após a aprovação da arte?")])).toBe(false)
  })
  it("mudou a quantidade ou mandou foto: recota", () => {
    expect(trouxeDadosNovos([m(true, "Montei…"), m(false, "na verdade quero 300")])).toBe(true)
    expect(trouxeDadosNovos([m(true, "Montei…"), m(false, "", "image")])).toBe(true)
  })
})

import { leadQuente } from "@/app/lib/agenteAuto"
describe("lead quente ignora o limite por hora", () => {
  it("MQL, etiqueta boa, perfil bom, pedido digital ou proposta em aberto", () => {
    expect(leadQuente({ jid: "a", status_lead: "mql" })).toBe(true)
    expect(leadQuente({ jid: "a", etiquetas: ["Lead médio"] })).toBe(true)
    expect(leadQuente({ jid: "a", perfil: "icp" })).toBe(true)
    expect(leadQuente({ jid: "a", pedidosDigitais: [{ jid: "a", status: "aguardando_sinal" }] })).toBe(true)
    expect(leadQuente({ jid: "a", propostas: [{ jid: "a", status: "enviada", em: new Date().toISOString() }] })).toBe(true)
    expect(leadQuente({ jid: "a", etiquetas: ["Lead pequeno"], perfil: "pequeno" })).toBe(false)
  })
})
