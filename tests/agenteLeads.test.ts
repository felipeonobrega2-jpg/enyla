import { describe, it, expect } from "vitest"
import { travaDoEnvio, valoresEmReais, partesDaResposta, ehMensagemAutomaticaDoWhatsapp, ehSaudacaoAutomaticaDoLead, ContextoEnvio, FILTRO_PADRAO } from "@/app/lib/agenteLeads"

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
  it("faixas por modelo e arte (24/11/2026)", async () => {
    const f = filtroDoModo(FILTRO_PADRAO, false)
    expect(f).not.toContain("de 20 a 500")
    expect(f).not.toContain("orçamento é pela quantidade total")
    expect(SECAO_DIGITAL).not.toContain("de 20 a 500")
    expect(SECAO_DIGITAL).not.toContain("orçamento é pela quantidade total")
    expect(SECAO_DIGITAL).toContain("até 200 unidades da arte: vale no digital")     // 200, uma arte
    expect(SECAO_DIGITAL).toContain("de 201 a 999 unidades da arte (inclusive 500): inviável") // 300 e 500
    expect(SECAO_DIGITAL).toContain("pelo menos 1.000 no offset")
    expect(SECAO_DIGITAL).toContain("nunca some modelos")                              // 2×500 mesma faca
    expect(SECAO_DIGITAL).toContain("não vira 1.000 de offset")
    expect(SECAO_DIGITAL).toMatch(/1\.000 ou mais da arte: offset[^\n]*não passe valor/)  // sem inventar preço
    const { pedidoAtendente } = await import("@/app/lib/pedidoAtendente")
    const pedido = JSON.stringify(pedidoAtendente({ modelo: "m", cfg: { agenteAuto: { pequenoParceiro: false } } as any, opts: {}, contexto: "", origem: "", historico: "", historicoAnterior: "", blocos: [], nomeConversa: null }))
    expect(pedido).toContain("2 artes de 500 = cada uma em 500")
    expect(pedido).toContain("De 201 a 999 por arte (inclusive 500) NÃO emita orçamento")
    expect(pedido).toContain("sem valor")
  })
  it("filtro seu sem a seção: acrescenta a regra no fim", () => {
    expect(filtroDoModo("OBJETIVO\nvender caixa", false)).toContain(SECAO_DIGITAL)
  })
  it("digital: etiqueta Digital, sem Descartado", () => {
    expect(org(["F1", "Cliente VIP"], "pequeno", true)).toEqual({ etiquetas: ["Cliente VIP", "Digital", "Lead pequeno"], etapa: null })
    expect(org(["Digital", "Lead pequeno"], "icp")).toEqual({ etiquetas: ["MQL", "ICP"], etapa: "mql" })
  })
})

describe("retomada: lead que ficou sem resposta", async () => {
  const { paradoParaRetomar } = await import("../app/lib/agenteLeads")
  const agora = Date.parse("2026-11-06T20:00:00Z")
  const base = {
    ultima: { id: "m1", from_me: false, ts: "2026-11-06T19:30:00Z" }, agora, feitas: new Set<string>(), primeiraEm: "2026-11-06T18:00:00Z",
    diasConversaNova: 4, horas: 72, ultimoRegistro: { em: "2026-11-06T19:00:00Z" }, digital: false, suasDoCelular: 0,
  }
  it("lead respondeu e ninguém mais falou: retoma", () => expect(paradoParaRetomar(base)).toBe(true))
  it("acabou de chegar (resposta normal a caminho): espera", () => expect(paradoParaRetomar({ ...base, ultima: { ...base.ultima, ts: "2026-11-06T19:57:00Z" } })).toBe(false))
  it("o agente já registrou algo depois (enviou ou segurou): não retoma", () => expect(paradoParaRetomar({ ...base, ultimoRegistro: { em: "2026-11-06T19:31:00Z", motivo: "nada a responder" } })).toBe(false))
  it("a IA falhou depois: retoma", () => expect(paradoParaRetomar({ ...base, ultimoRegistro: { em: "2026-11-06T19:31:00Z", motivo: "IA falhou: timeout" } })).toBe(true))
  it("WhatsApp fora do ar (não enviou): retoma quando voltar", () => expect(paradoParaRetomar({ ...base, ultimoRegistro: { em: "2026-11-06T19:31:00Z", motivo: "não enviou (400)" } })).toBe(true))
  it("já retomada uma vez: não repete", () => expect(paradoParaRetomar({ ...base, feitas: new Set(["m1"]) })).toBe(false))
  it("contato antigo: não", () => expect(paradoParaRetomar({ ...base, primeiraEm: "2026-10-01T10:00:00Z" })).toBe(false))
  it("fora da janela: não", () => expect(paradoParaRetomar({ ...base, ultima: { ...base.ultima, ts: "2026-11-03T10:00:00Z" }, primeiraEm: "2026-11-03T09:00:00Z" })).toBe(false))
  it("você escreveu do celular: a conversa é sua", () => expect(paradoParaRetomar({ ...base, suasDoCelular: 1 })).toBe(false))
  it("lead digital: é do agente mesmo se você escreveu", () => expect(paradoParaRetomar({ ...base, suasDoCelular: 1, digital: true })).toBe(true))
})

describe("nunca fala de sistema", async () => {
  const { FALA_DE_SISTEMA } = await import("../app/lib/agenteLeads")
  it("segura", () => {
    for (const t of ["Com a quantidade e o ml, o sistema já te manda o orçamento", "É um atendimento automático", "sou um robô", "a IA montou"]) expect(FALA_DE_SISTEMA.test(t)).toBe(true)
  })
  it("não confunde com caixa e verbo", () => {
    for (const t of ["Caixa com fundo automático 5x8", "eu ia te mandar agora", "Me passa a quantidade"]) expect(FALA_DE_SISTEMA.test(t)).toBe(false)
  })
})

describe("mensagem automática do WhatsApp Business", async () => {
  const { ehMensagemAutomaticaDoWhatsapp } = await import("../app/lib/agenteLeads")
  it("fora do horário", () => expect(ehMensagemAutomaticaDoWhatsapp("Estou fora do horário de atendimento")).toBe(true))
  it("botões sem texto, em rajada: automática", () => expect(ehMensagemAutomaticaDoWhatsapp(null, "interactiveMessage")).toBe(true))
  it("você digitando: não", () => expect(ehMensagemAutomaticaDoWhatsapp("Oi, tudo bem?", "conversation")).toBe(false))
  it("mensagem com botões e texto: não", () => expect(ehMensagemAutomaticaDoWhatsapp("Escolha uma opção", "interactiveMessage")).toBe(false))
})

describe("horário do agente", async () => {
  const { dentroDoHorario } = await import("../app/lib/agenteLeads")
  // 10/11/2026 é terça; horários em São Paulo (UTC−3)
  const sp = (iso: string) => new Date(iso + "-03:00")
  it("sem horário: sempre", () => expect(dentroDoHorario(undefined, sp("2026-11-10T03:00:00"))).toBe(true))
  it("24 h todos os dias", () => expect(dentroDoHorario({ dias: [0, 1, 2, 3, 4, 5, 6], inicio: "00:00", fim: "24:00" }, sp("2026-11-10T03:00:00"))).toBe(true))
  const comercial = { dias: [1, 2, 3, 4, 5], inicio: "08:00", fim: "20:00" }
  it("dentro da faixa", () => expect(dentroDoHorario(comercial, sp("2026-11-10T09:30:00"))).toBe(true))
  it("madrugada: fora", () => expect(dentroDoHorario(comercial, sp("2026-11-10T03:00:00"))).toBe(false))
  it("às 20h em ponto: fora", () => expect(dentroDoHorario(comercial, sp("2026-11-10T20:00:00"))).toBe(false))
  it("domingo: fora", () => expect(dentroDoHorario(comercial, sp("2026-11-08T10:00:00"))).toBe(false))
  const noite = { dias: [2], inicio: "20:00", fim: "02:00" }
  it("atravessa a meia-noite: terça 23h dentro", () => expect(dentroDoHorario(noite, sp("2026-11-10T23:00:00"))).toBe(true))
  it("atravessa a meia-noite: quarta 1h dentro (continuação da terça)", () => expect(dentroDoHorario(noite, sp("2026-11-11T01:00:00"))).toBe(true))
  it("atravessa a meia-noite: quarta 3h fora", () => expect(dentroDoHorario(noite, sp("2026-11-11T03:00:00"))).toBe(false))
  it("nenhum dia: nunca", () => expect(dentroDoHorario({ dias: [], inicio: "00:00", fim: "24:00" }, sp("2026-11-10T10:00:00"))).toBe(false))
})

describe("saudação automática do WhatsApp Business que o lead manda", () => {
  it("template: true (acento e caixa variam)", () => {
    for (const t of [
      "Olá! Agradecemos seu contato. No momento não podemos atender. Em breve retornaremos.",
      "Obrigado por entrar em contato. Como podemos ajudar?",
      "Estou ausente no momento, retornarei em breve.",
      "Esta é uma mensagem automática. Fora do horário de atendimento.",
      "AGRADECE SEU CONTATO!", "agradecemos o seu contato", "Retornaremos em breve", "Este é um aviso automático",
    ]) expect(ehSaudacaoAutomaticaDoLead(t), t).toBe(true)
  })
  it("fala humana: false", () => {
    for (const t of [
      "Oi", "Bom dia", "Tudo bem?", "Oi, como podemos fechar o pedido?", "Obrigado pelo contato, quero 5.000 caixas",
      "Em breve te retorno o volume", "Pode me ajudar com um orçamento?",
      "Agradecemos o contato. Preciso de 3000 caixas 10x5x5 cm com verniz, entrega em SP e prazo de 20 dias, " + "detalhe ".repeat(50),
    ]) expect(ehSaudacaoAutomaticaDoLead(t), t).toBe(false)
    expect(ehSaudacaoAutomaticaDoLead(null)).toBe(false)
    expect(ehSaudacaoAutomaticaDoLead("agradecemos seu contato, preciso de 2000 caixas")).toBe(false)
  })
  it("limite conhecido: humano que escreve só 'como podemos ajudar?' é segurado (o Felipe decide)", () => {
    expect(ehSaudacaoAutomaticaDoLead("Como podemos ajudar?")).toBe(true)
  })
  it("não muda a detecção das automáticas nossas", () => {
    expect(ehMensagemAutomaticaDoWhatsapp("Agradecemos seu contato. Em breve retornaremos.")).toBe(false)
  })
  it("depois de um follow-up nosso, a saudação do lead não parece conversa nova", () => {
    const msgs = [
      { from_me: true, corpo: "Oi! Conseguiu ver a proposta?", tipo: "text" },
      { from_me: false, corpo: "Agradecemos seu contato. Em breve retornaremos.", tipo: "text" },
    ]
    expect(soAbertura(msgs)).toBe(false)
    expect(soAbertura([msgs[1]])).toBe(false)
  })
  it("semFollowUp continua limpando F1/F2/F3 (por isso o agente não pode chamá-lo na saudação)", () => {
    expect(semFollowUp(["F1", "MQL"])).not.toContain("F1")
  })
})

import { travaPromessaDeOrcamento, prometeEnvioDeOrcamento, TEXTO_PREPARANDO_ORCAMENTO } from "@/app/lib/agenteLeads"

describe("promessa de orçamento sem proposta real", () => {
  const sem = { idsExistentes: [] as string[] }
  it("«segue o orçamento» e equivalentes sem link/PDF real: não passam", () => {
    for (const f of ["Segue o orçamento!", "Tô finalizando, já te mando.", "Vou montar seu orçamento e já te mando", "Segue em anexo.", "Segue o orçamento: https://app.enyla.com.br/d/DIG-9999?t=x"]) {
      expect(prometeEnvioDeOrcamento(f)).toBe(true)
      const r = travaPromessaDeOrcamento(f, sem)
      expect(r.reescrita).toBe(true)
      expect(r.resposta).toBe(TEXTO_PREPARANDO_ORCAMENTO)
    }
  })
  it("mantém o resto da fala quando só uma frase promete", () => {
    expect(travaPromessaDeOrcamento("Anotei tudo. Segue o orçamento.", sem).resposta).toBe("Anotei tudo.")
  })
  it("com link de proposta existente ou PDF anexado: não impede a fala", () => {
    const f = "Segue o orçamento: https://app.enyla.com.br/d/DIG-12?t=x"
    expect(travaPromessaDeOrcamento(f, { idsExistentes: ["DIG-12"] })).toEqual({ resposta: f, reescrita: false })
    expect(travaPromessaDeOrcamento("Segue em anexo.", { idsExistentes: [], pdfAnexado: true }).reescrita).toBe(false)
  })
  it("«vou preparar o seu orçamento» continua válido", () => {
    const f = "Perfeito, vou preparar o seu orçamento."
    expect(prometeEnvioDeOrcamento(f)).toBe(false)
    expect(travaPromessaDeOrcamento(f, sem)).toEqual({ resposta: f, reescrita: false })
  })
})
