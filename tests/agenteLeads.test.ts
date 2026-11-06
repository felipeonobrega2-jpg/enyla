import { describe, it, expect } from "vitest"
import { travaDoEnvio, valoresEmReais, partesDaResposta, ehMensagemAutomaticaDoWhatsapp, ContextoEnvio, FILTRO_PADRAO } from "@/app/lib/agenteLeads"

const ok: ContextoEnvio = {
  ligado: true, resposta: "Oi, tudo bem? Que volume você precisa?", alerta: "nenhum", podeSozinho: true,
  lead: { perfil: "indefinido", quantidade_total: null, motivo: "" }, conversaNova: true, clienteCadastrado: false,
  manualRecente: false, enviadasHoje: 0, maxPorDia: 6, jaEncerrouPequeno: false, precosDoFiltro: valoresEmReais(FILTRO_PADRAO),
}

describe("agente de leads: o que pode sair sem o Felipe", () => {
  it("lead novo, pergunta de filtro: envia", () => expect(travaDoEnvio(ok)).toBeNull())
  it("desligado, vazio, não é lead, cliente, contato antigo, você na conversa: segura", () => {
    expect(travaDoEnvio({ ...ok, ligado: false })).toMatch(/desligado/)
    expect(travaDoEnvio({ ...ok, resposta: " " })).toMatch(/nada/)
    expect(travaDoEnvio({ ...ok, lead: { ...ok.lead, perfil: "nao_lead" } })).toMatch(/não é lead/)
    expect(travaDoEnvio({ ...ok, clienteCadastrado: true })).toMatch(/cliente/)
    expect(travaDoEnvio({ ...ok, conversaNova: false })).toMatch(/antigo/)
    expect(travaDoEnvio({ ...ok, manualRecente: true })).toMatch(/você está/)
  })
  it("desconto, reclamação, decisão sua ou a IA em dúvida: segura; pergunta de preço pode", () => {
    expect(travaDoEnvio({ ...ok, alerta: "desconto" })).toMatch(/desconto/)
    expect(travaDoEnvio({ ...ok, alerta: "decisao_sua" })).toMatch(/decisao_sua/)
    expect(travaDoEnvio({ ...ok, podeSozinho: false })).toMatch(/IA pediu/)
    expect(travaDoEnvio({ ...ok, alerta: "preco" })).toBeNull()
  })
  it("só cita valor que está no filtro", () => {
    expect(travaDoEnvio({ ...ok, resposta: "Em 5 mil fica R$ 0,85 a unidade." })).toBeNull()
    expect(travaDoEnvio({ ...ok, resposta: "Fica R$ 1,20 cada." })).toMatch(/1,20/)
    expect(travaDoEnvio({ ...ok, resposta: "Sai 0,60 centavos." })).toMatch(/0,60/)
  })
  it("lead pequeno é orientado uma vez só; limite por dia", () => {
    const peq = { ...ok, lead: { perfil: "pequeno" as const, quantidade_total: 100, motivo: "" } }
    expect(travaDoEnvio(peq)).toBeNull()
    expect(travaDoEnvio({ ...peq, jaEncerrouPequeno: true })).toMatch(/orientado/)
    expect(travaDoEnvio({ ...ok, jaEncerrouPequeno: true, lead: { ...ok.lead, perfil: "indefinido" } })).toBeNull()
    expect(travaDoEnvio({ ...ok, enviadasHoje: 6 })).toMatch(/6×/)
  })
  it("partes, valores e mensagem de ausência", () => {
    expect(partesDaResposta("Oi!\n\nQue volume?\n \nOk")).toEqual(["Oi!", "Que volume?", "Ok"])
    expect(valoresEmReais("R$ 1.200,50 e R$0,85")).toEqual(["1200,50", "0,85"])
    expect(ehMensagemAutomaticaDoWhatsapp("Estou fora do horário no momento, retorno em breve.")).toBe(true)
    expect(ehMensagemAutomaticaDoWhatsapp("Bom dia")).toBe(false)
  })
})

import { organizarLead, proximoFollowUp, semFollowUp, horarioDeFollowUp } from "@/app/lib/agenteLeads"

describe("agente de leads: etiquetas e follow-up", () => {
  it("lead bom vai para MQL; ruim para Descartado; suas etiquetas ficam", () => {
    expect(organizarLead(["Cliente VIP", "F1"], "icp")).toEqual({ etiquetas: ["Cliente VIP", "MQL", "ICP"], etapa: "mql" })
    expect(organizarLead([], "medio")).toEqual({ etiquetas: ["MQL", "Lead médio"], etapa: "mql" })
    expect(organizarLead(["Lead médio", "MQL"], "pequeno")).toEqual({ etiquetas: ["Descartado", "Lead pequeno"], etapa: "descartado" })
    expect(organizarLead(["F2"], "indefinido")).toEqual({ etiquetas: ["F2"], etapa: null })
    expect(organizarLead(["Lead pequeno", "Descartado"], "oportunidade")).toEqual({ etiquetas: ["MQL", "Oportunidade"], etapa: "mql" })
  })
  it("MQL trava o automático", () => {
    expect(travaDoEnvio({ ...ok, emMql: true })).toMatch(/MQL/)
    for (const perfil of ["icp", "medio", "oportunidade"] as const) expect(travaDoEnvio({ ...ok, lead: { ...ok.lead, perfil } })).toMatch(/MQL/)
  })
  it("F1 → F2 → F3 → Sem resposta, cada um no seu tempo", () => {
    expect(proximoFollowUp([], 2)).toBeNull()
    expect(proximoFollowUp([], 3)).toEqual({ tipo: "mensagem", nivel: 1, etiquetas: ["F1"] })
    expect(proximoFollowUp(["F1"], 10)).toBeNull()
    expect(proximoFollowUp(["X", "F1"], 24)).toEqual({ tipo: "mensagem", nivel: 2, etiquetas: ["X", "F2"] })
    expect(proximoFollowUp(["F2"], 72)).toEqual({ tipo: "mensagem", nivel: 3, etiquetas: ["F3"] })
    expect(proximoFollowUp(["F3"], 95)).toBeNull()
    expect(proximoFollowUp(["F3"], 96)).toEqual({ tipo: "encerrar", etiquetas: ["Sem resposta"] })
    expect(proximoFollowUp(["Sem resposta"], 999)).toBeNull()
  })
  it("respondeu: sai do follow-up; horário comercial", () => {
    expect(semFollowUp(["F2", "MQL", "Sem resposta"])).toEqual(["MQL"])
    expect(horarioDeFollowUp(new Date("2026-11-05T13:00:00Z"))).toBe(true)   // 10h em SP
    expect(horarioDeFollowUp(new Date("2026-11-05T02:00:00Z"))).toBe(false)  // 23h em SP
  })
})

import { jaViuVitrine } from "@/app/lib/agenteLeads"

describe("agente de leads: Instagram", () => {
  it("não repete o link se já foi (por você ou pela mensagem de ausência)", () => {
    expect(jaViuVitrine([null, "Oi, tudo bem?"])).toBe(false)
    expect(jaViuVitrine(["Estou fora do horário no momento, retorno em breve. Enquanto isso, dá uma olhada no nosso portfólio: instagram.com/enyla.embalagens"])).toBe(true)
    expect(jaViuVitrine(["Dá uma olhada no nosso Instagram: Instagram.com/enyla.embalagens"])).toBe(true)
  })
})

import { textoAvisoMql, FILTRO_PADRAO as FP } from "@/app/lib/agenteLeads"

describe("agente de leads: aviso de MQL e parceiro", () => {
  it("aviso traz perfil, volume, nome, motivo e link", () => {
    const t = textoAvisoMql({ nome: "Ruglia", telefone: "5511999990000", perfil: "icp", quantidade: 12000, motivo: "Lotes de 12 mil", resumo: "perfume 100ml" })
    expect(t).toContain("Novo MQL* · ICP · 12.000 un")
    expect(t).toContain("*Ruglia*")
    expect(t).toContain("wa.me/5511999990000")
  })
  it("filtro já traz o contato do parceiro e o cupom", () => {
    expect(FP).toContain("(11) 96843-7324")
    expect(FP).toContain("pedir o meu cupom")
    expect(FP).not.toMatch(/preencha aqui/i)
  })
})

import { saudacaoDoFiltro, soAbertura, ehSemCredito } from "@/app/lib/agenteLeads"

describe("agente de leads: economia de IA", () => {
  const m = (corpo: string, from_me = false) => ({ from_me, corpo, tipo: "text" })
  it("saudação sai do filtro", () => {
    expect(saudacaoDoFiltro(FP)).toMatch(/^Oi, tudo bem\? aqui é o Luiz Felipe/)
  })
  it("só a mensagem do anúncio (ou oi): sem IA; qualquer coisa a mais: IA", () => {
    expect(soAbertura([m("Olá, Gostaria se saber mais sobre as caixinhas.")])).toBe(true)   // o texto do anúncio, com "se saber"
    expect(soAbertura([m("Olá, gostaria de saber mais sobre as caixinhas")])).toBe(true)
    expect(soAbertura([m("Posso encomendar?")])).toBe(true)
    expect(soAbertura([m("Boa tarde"), m("Olá, gostaria de solicitar um orçamento.")])).toBe(true)
    expect(soAbertura([m("Posso encomendar?"), m("Qual pedido mínimo e qual valor ?")])).toBe(false)
    expect(soAbertura([m("Oi"), m("Estou fora do horário no momento, retorno em breve.", true)])).toBe(true)
    expect(soAbertura([m("Oi"), m("Oi, tudo bem? aqui é o Luiz Felipe", true)])).toBe(false)
    expect(soAbertura([{ from_me: false, corpo: null, tipo: "audio" }])).toBe(false)
  })
  it("reconhece falta de crédito", () => {
    expect(ehSemCredito("400 Your credit balance is too low to access the Anthropic API")).toBe(true)
    expect(ehSemCredito("400 You have reached your specified API usage limits. You will regain access on 2026-12-01")).toBe(true)
    expect(ehSemCredito("Erro da IA (529): overloaded")).toBe(false)
  })
})

describe("lead pequeno: parceiro ou digital", async () => {
  const { filtroDoModo, filtroDoAgente, FILTRO_PADRAO, SECAO_DIGITAL, organizarLead: org } = await import("@/app/lib/agenteLeads")
  it("parceiro (padrão): filtro igual", () => {
    expect(filtroDoAgente({})).toBe(FILTRO_PADRAO)
    expect(filtroDoAgente({ agenteAuto: { pequenoParceiro: true } })).toBe(FILTRO_PADRAO)
  })
  it("digital: troca a seção do lead pequeno e tira o contato do parceiro", () => {
    const f = filtroDoModo(FILTRO_PADRAO, false)
    expect(f).toContain(SECAO_DIGITAL)
    expect(f).not.toContain("96843-7324")
    expect(f).not.toContain("não é nosso cliente")
    expect(f).toContain("O QUE NÃO FAZEMOS")      // o resto do filtro continua
    expect(f).toContain("LEVANTAR DADOS")
  })
  it("filtro seu sem a seção: acrescenta a regra no fim", () => {
    expect(filtroDoModo("OBJETIVO\nvender caixa", false)).toContain(SECAO_DIGITAL)
  })
  it("digital: etiqueta Digital, sem Descartado", () => {
    expect(org(["F1", "Cliente VIP"], "pequeno", true)).toEqual({ etiquetas: ["Cliente VIP", "Digital", "Lead pequeno"], etapa: null })
    expect(org(["Digital", "Lead pequeno"], "icp")).toEqual({ etiquetas: ["MQL", "ICP"], etapa: "mql" })
  })
})
