import { describe, it, expect } from "vitest"
import { quemResponder, doAnuncio, haQuanto, ConvHoje } from "../app/lib/hoje"
import { marcosDoRegistro } from "../app/lib/agenteLeads"

const agora = new Date("2026-11-05T14:00:00Z").getTime()
const h = (horas: number) => new Date(agora - horas * 3_600_000).toISOString()
const conv = (o: Partial<ConvHoje>): ConvHoje => ({
  jid: "1@lid", nome: "Teste", ultima_msg: "oi", ultima_recebida_at: h(1), ultima_enviada_at: h(2), fechada_em: null,
  status_lead: null, etiquetas: [], campanha: null, criado_em: null, ...o,
})

describe("quemResponder", () => {
  it("só bons negócios esperando entram; os sem classificar viram contagem", () => {
    const r = quemResponder([
      conv({ jid: "a", etiquetas: ["ICP"] }),
      conv({ jid: "b" }),
      conv({ jid: "c", etiquetas: ["Lead pequeno"] }),
      conv({ jid: "d", etiquetas: ["MQL"], ultima_enviada_at: h(0.5) }),   // você já respondeu
    ], {}, agora)
    expect(r.responder.map(x => x.jid)).toEqual(["a"])
    expect(r.responder[0].rotulo).toBe("ICP")
    expect(r.outros).toBe(1)
  })

  it("quem respondeu à retomada vem primeiro, mesmo sem etiqueta", () => {
    const r = quemResponder([
      conv({ jid: "a", status_lead: "mql", ultima_recebida_at: h(5), ultima_enviada_at: h(6) }),
      conv({ jid: "b", ultima_recebida_at: h(1) }),
    ], marcosDoRegistro([{ em: h(1), jid: "b", nome: null, perfil: "icp", enviou: false, texto: "", motivo: "", passo: "Respondeu" }], agora), agora)
    expect(r.responder.map(x => x.jid)).toEqual(["b", "a"])
    expect(r.responder[0].retomada).toBe(true)
  })

  it("resposta à retomada de mais de 7 dias não conta", () => {
    const r = quemResponder([conv({ jid: "b" })], marcosDoRegistro([{ em: h(24 * 8), jid: "b", nome: null, perfil: "icp", enviou: false, texto: "", motivo: "", passo: "Respondeu" }], agora), agora)
    expect(r.responder).toEqual([])
  })
})

describe("doAnuncio", () => {
  it("conta leads do anúncio das últimas 24 h pela entrada", () => {
    const an = (entrada: string, o: Partial<ConvHoje> = {}) => conv({ campanha: JSON.stringify({ canal: "anuncio", entrada }), ...o })
    expect(doAnuncio([
      an(h(2), { status_lead: "mql" }), an(h(3)), an(h(5), { etiquetas: ["Lead pequeno"] }), an(h(30)),
      conv({ campanha: JSON.stringify({ canal: "site", entrada: h(1) }) }),
    ], agora)).toEqual({ leads: 3, mql: 1, semClassificar: 1, descartados: 1 })
  })
})

it("haQuanto", () => {
  expect(haQuanto(h(0.5), agora)).toBe("há 30 min")
  expect(haQuanto(h(3), agora)).toBe("há 3 h")
  expect(haQuanto(h(50), agora)).toBe("há 2 dias")
})

it("dadosDaConversa lê o que a IA guardou e tolera lixo", async () => {
  const { dadosDaConversa } = await import("../app/lib/hoje")
  expect(dadosDaConversa(JSON.stringify({ r: { dados: { quantidade: 3000 } } }))?.quantidade).toBe(3000)
  expect(dadosDaConversa("{quebrado")).toBeNull()
  expect(dadosDaConversa(null)).toBeNull()
})

it("qualidade: sem resposta vira sumiu, mas lead pequeno continua descartado", async () => {
  const { qualidadeDoLead } = await import("../app/lib/marketing")
  expect(qualidadeDoLead({ status_lead: "descartado", etiquetas: ["Sem resposta"] })).toBe("sumiu")
  expect(qualidadeDoLead({ status_lead: null, etiquetas: ["Lead pequeno", "Sem resposta"] })).toBe("descartado")
  expect(qualidadeDoLead({ status_lead: "mql", etiquetas: ["Sem resposta"] })).toBe("mql")
})

describe("marcar (marcos duráveis do agente)", () => {
  const r = (o: Record<string, unknown>) => ({ em: h(1), jid: "x", nome: null, perfil: "indefinido" as const, enviou: true, texto: "", motivo: "", ...o })
  it("guarda passos, retomada enviada, lead pequeno e o que segurou", async () => {
    const { marcar } = await import("../app/lib/agenteLeads")
    let m = marcar({}, r({ passo: "F1", enviou: false }), agora)
    m = marcar(m, r({ passo: "Reativação", enviou: false, em: h(0.9) }), agora)
    expect(m.x.passos).toEqual({ F1: h(1) })
    m = marcar(m, r({ passo: "Reativação", em: h(0.8) }), agora)
    m = marcar(m, r({ perfil: "pequeno", em: h(0.7) }), agora)
    m = marcar(m, r({ enviou: false, motivo: "precisa de você (desconto)", em: h(0.6) }), agora)
    expect(m.x.passos).toEqual({ F1: h(1), "Reativação": h(0.8), Pequeno: h(0.7) })
    expect(m.x.segurou?.motivo).toBe("precisa de você (desconto)")
    expect(marcar(m, r({ em: h(0.5) }), agora).x.segurou).toBeNull()
  })
  it("esquece depois de 15 dias, menos quem recebeu retomada (45)", async () => {
    const { marcar } = await import("../app/lib/agenteLeads")
    const velho = { velho: { em: h(24 * 20) }, retomado: { em: h(24 * 20), passos: { "Reativação": h(24 * 20) } }, antigo: { em: h(24 * 50), passos: { "Reativação": h(24 * 50) } } }
    expect(Object.keys(marcar(velho, r({}), agora)).sort()).toEqual(["retomado", "x"])
  })
})

describe("próximo passo e quem falou por último", async () => {
  const { listaDoHoje, ehSoConfirmacao } = await import("../app/lib/hoje")
  const d = (n: number) => h(24 * n)
  const mql = (o: Partial<ConvHoje>) => conv({ status_lead: "mql", ...o })

  it("ok, obrigado e 👍 são só confirmação; pergunta não é", () => {
    for (const t of ["ok", "Ok!", "obrigado", "Muito obrigada!", "👍👍👍", "valeu 🙏", "show", "Beleza.", "tá bom", "[stickerMessage]"]) expect(ehSoConfirmacao(t)).toBe(true)
    for (const t of ["ok, e o prazo?", "Quanto fica 3 mil?", "oi", "pode mandar o pix", ""]) expect(ehSoConfirmacao(t)).toBe(false)
  })
  it("ele escreveu de verdade: responder", () => {
    expect(listaDoHoje(mql({ ultima_msg: "E o prazo?", ultima_recebida_at: h(1), ultima_enviada_at: h(2) }), undefined, agora)?.lista).toBe("responder")
  })
  it("ele só confirmou: não é responder; vira retomar depois de 3 dias", () => {
    expect(listaDoHoje(mql({ ultima_msg: "👍", ultima_recebida_at: h(1), ultima_enviada_at: h(2) }), undefined, agora)).toBeNull()
    expect(listaDoHoje(mql({ ultima_msg: "👍", ultima_recebida_at: d(4), ultima_enviada_at: d(4.1) }), undefined, agora)?.lista).toBe("retomar")
  })
  it("você falou por último: retomar entre 3 e 10 dias (depois é a Reativação)", () => {
    expect(listaDoHoje(mql({ ultima_recebida_at: d(5), ultima_enviada_at: d(2) }), undefined, agora)).toBeNull()
    expect(listaDoHoje(mql({ ultima_recebida_at: d(5), ultima_enviada_at: d(4) }), undefined, agora)?.lista).toBe("retomar")
    expect(listaDoHoje(mql({ ultima_recebida_at: d(12), ultima_enviada_at: d(11) }), undefined, agora)).toBeNull()
  })
  it("negócio grande (ICP/Oportunidade): retomar já no dia seguinte", () => {
    expect(listaDoHoje(mql({ etiquetas: ["MQL", "ICP"], ultima_recebida_at: d(2), ultima_enviada_at: h(20) }), undefined, agora)).toBeNull()
    expect(listaDoHoje(mql({ etiquetas: ["MQL", "Oportunidade"], ultima_recebida_at: d(2), ultima_enviada_at: h(26) }), undefined, agora)?.lista).toBe("retomar")
    expect(listaDoHoje(mql({ etiquetas: ["MQL", "Lead médio"], ultima_recebida_at: d(2), ultima_enviada_at: h(26) }), undefined, agora)).toBeNull()
  })
  it("esperando o cliente: some; um ok dele não traz de volta; mensagem de verdade traz; no prazo volta para retomar", () => {
    const passo = { tipo: "esperando" as const, em: h(10), ate: new Date(agora + 2 * 86_400_000).toISOString() }
    expect(listaDoHoje(mql({ ultima_msg: "E o prazo?", ultima_recebida_at: h(11), ultima_enviada_at: h(12) }), passo, agora)).toBeNull()
    expect(listaDoHoje(mql({ ultima_msg: "ok obrigado", ultima_recebida_at: h(1), ultima_enviada_at: h(12) }), passo, agora)).toBeNull()
    expect(listaDoHoje(mql({ ultima_msg: "Fechado, manda o pix", ultima_recebida_at: h(1), ultima_enviada_at: h(12) }), passo, agora)?.lista).toBe("responder")
    const venceu = { ...passo, ate: h(1) }
    expect(listaDoHoje(mql({ ultima_recebida_at: h(30), ultima_enviada_at: h(12) }), venceu, agora)?.lista).toBe("retomar")
  })
  it("lembrete com nota volta no dia, com a nota; se você já falou com ele depois do dia, sai", () => {
    const passo = { tipo: "lembrar" as const, em: d(5), ate: h(2), nota: "vai mandar a arte" }
    expect(listaDoHoje(mql({ ultima_recebida_at: d(5), ultima_enviada_at: d(5.1) }), passo, agora)).toEqual({ lista: "retomar", desde: d(5), nota: "vai mandar a arte" })
    expect(listaDoHoje(mql({ ultima_recebida_at: d(5), ultima_enviada_at: h(1) }), passo, agora)).toBeNull()
  })
  it("fechou ou perdido: sai de vez", () => {
    expect(listaDoHoje(mql({ status_lead: "pedido", ultima_msg: "manda o pix" }), undefined, agora)).toBeNull()
    expect(listaDoHoje(mql({ status_lead: "perdido", ultima_msg: "e aí?" }), undefined, agora)).toBeNull()
  })
})

describe("orçamento para fazer", async () => {
  const { deveOrcamento } = await import("../app/lib/hoje")
  const pronto = (o: Partial<ConvHoje> = {}) => conv({ status_lead: "mql", etiquetas: ["MQL", "ICP"], ultima_recebida_at: h(10), ultima_enviada_at: h(9.9),
    proxima_acao: JSON.stringify({ r: { etapa: "orcamento" } }), ...o })
  const nada = { documento: false, orcamentoNoSistema: false }
  it("passou tudo, você disse 'pode deixar' e não mandou nada: o orçamento está com você", () => {
    expect(deveOrcamento(pronto(), nada, undefined, agora)).toBe(true)
  })
  it("já mandou o PDF ou criou o orçamento no sistema: sai", () => {
    expect(deveOrcamento(pronto(), { ...nada, documento: true }, undefined, agora)).toBe(false)
    expect(deveOrcamento(pronto(), { ...nada, orcamentoNoSistema: true }, undefined, agora)).toBe(false)
  })
  it("ainda levantando dados, lead pequeno, mais de 7 dias ou próximo passo marcado depois: não entra", () => {
    expect(deveOrcamento(pronto({ proxima_acao: JSON.stringify({ r: { etapa: "levantando_dados" } }) }), nada, undefined, agora)).toBe(false)
    expect(deveOrcamento(pronto({ status_lead: null, etiquetas: ["Lead pequeno"] }), nada, undefined, agora)).toBe(false)
    expect(deveOrcamento(pronto({ ultima_recebida_at: h(24 * 8) }), nada, undefined, agora)).toBe(false)
    expect(deveOrcamento(pronto(), nada, { tipo: "esperando", em: h(1), ate: h(-48) }, agora)).toBe(false)
  })
})
