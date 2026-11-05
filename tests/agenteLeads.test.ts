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
    expect(travaDoEnvio({ ...ok, jaEncerrouPequeno: true, lead: { ...ok.lead, perfil: "medio" } })).toBeNull()
    expect(travaDoEnvio({ ...ok, enviadasHoje: 6 })).toMatch(/6×/)
  })
  it("partes, valores e mensagem de ausência", () => {
    expect(partesDaResposta("Oi!\n\nQue volume?\n \nOk")).toEqual(["Oi!", "Que volume?", "Ok"])
    expect(valoresEmReais("R$ 1.200,50 e R$0,85")).toEqual(["1200,50", "0,85"])
    expect(ehMensagemAutomaticaDoWhatsapp("Estou fora do horário no momento, retorno em breve.")).toBe(true)
    expect(ehMensagemAutomaticaDoWhatsapp("Bom dia")).toBe(false)
  })
})
