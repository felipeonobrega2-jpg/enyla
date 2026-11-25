import { describe, it, expect } from "vitest"
import { quemEspera, momentoValido } from "@/app/lib/esperando"

const agora = new Date("2026-11-18T18:00:00Z").getTime()
const min = (m: number) => new Date(agora - m * 60_000).toISOString()
const c = (p: Record<string, unknown>) => ({ jid: "1@s.whatsapp.net", nome: "Ana", etiquetas: [], status_lead: null, ultima_msg: "Quanto fica?", ultima_recebida_at: min(40), ultima_enviada_at: min(60), ...p })

describe("ninguém sem resposta", () => {
  it("pega quem escreveu por último há 20+ min e ordena pela qualificação", () => {
    const r = quemEspera([
      c({ jid: "a", nome: "Mateus", etiquetas: ["Digital"], ultima_msg: "Fico no aguardo dos valores", ultima_recebida_at: min(1200), ultima_enviada_at: min(1202) }),
      c({ jid: "h", nome: "Auto", ultima_msg: "Olá! Seja muito bem-vindo(a) à Loja Exemplo!" }),
      c({ jid: "i", nome: "Vai mandar", ultima_msg: "Vou providenciar" }),
      c({ jid: "j", nome: "Fechada", fechada_em: min(30) }),
      c({ jid: "b", nome: "Bom", status_lead: "mql" }),
      c({ jid: "c", nome: "Recente", ultima_recebida_at: min(5) }),
      c({ jid: "d", nome: "Ok", ultima_msg: "ok, obrigado" }),
      c({ jid: "e", nome: "Respondido", ultima_enviada_at: min(1) }),
      c({ jid: "f", nome: "Fornec", etiquetas: ["Fornecedora"] }),
      c({ jid: "g", nome: "Volta", proxima_acao: JSON.stringify({ r: { momento: "com_ele" } }) }),
    ], agora)
    expect(r.map(x => x.nome)).toEqual(["Bom", "Mateus"])   // qualificação primeiro: MQL antes de digital
  })
})

describe("a IA fecha só o óbvio", () => {
  it("fecha quem encerrou depois da nossa resposta; não fecha pergunta nossa, orçamento aberto nem quem disse que volta", async () => {
    const { podeFecharSozinha } = await import("@/app/lib/esperando")
    const base = { jid: "1@s.whatsapp.net", nome: "Ana", etiquetas: [], status_lead: null, ultima_msg: "Ok, obrigado!", ultima_recebida_at: min(40), ultima_enviada_at: min(50) }
    expect(podeFecharSozinha({ ...base, penultimaNossa: "Fechado, te mando o rastreio amanhã." }, agora)).toBe("o cliente encerrou a conversa")
    expect(podeFecharSozinha({ ...base, penultimaNossa: "Quer que eu já separe as 1.000?" }, agora)).toBeNull()
    expect(podeFecharSozinha({ ...base, kanban_card_id: "k1", penultimaNossa: "Fechado." }, agora)).toBeNull()
    expect(podeFecharSozinha({ ...base, ultima_msg: "Vou ver com meu sócio e te falo", penultimaNossa: "Fechado." }, agora)).toBeNull()
    expect(podeFecharSozinha({ ...base, ultima_recebida_at: min(10), penultimaNossa: "Fechado." }, agora)).toBeNull()
    expect(podeFecharSozinha({ ...base, etiquetas: ["Descartado"], ultima_msg: "Quanto custa?", ultima_recebida_at: min(90), ultima_enviada_at: min(80) }, agora)).toBe("não é lead e já foi respondido")
  })
})

describe("checklist antes de passar para o Felipe", () => {
  it("bom negócio só vai para o Felipe com tudo para orçar (ou esperando 3 h+)", async () => {
    const { paraOFelipe } = await import("@/app/lib/esperando")
    const e = { jid: "x", nome: "Adriano", minutos: 30, mensagem: "", peso: 3, rotulo: "bom negócio" }
    expect(paraOFelipe({ ...e, checklistOk: false })).toBe(false)
    expect(paraOFelipe({ ...e, checklistOk: true })).toBe(true)
    expect(paraOFelipe({ ...e, checklistOk: false, minutos: 200 })).toBe(true)
    expect(paraOFelipe({ ...e, peso: 2, checklistOk: true })).toBe(false)
  })
})

describe("momento velho não tira o lead da fila", () => {
  const pa = (momento: string, emMin: number) => JSON.stringify({ em: min(emMin), r: { momento } })
  const dias7 = 7 * 1440 + 40
  it("com_ele, sem_pressa e nao_atende velhos (anteriores à última mensagem) entram; recentes ficam fora", () => {
    for (const m of ["com_ele", "sem_pressa", "nao_atende"]) {
      expect(quemEspera([c({ proxima_acao: pa(m, dias7) })], agora)).toHaveLength(1)
      expect(quemEspera([c({ proxima_acao: pa(m, 10) })], agora)).toHaveLength(0)
    }
  })
  it("proxima_acao nulo ou inválido entra; FECHO continua fora mesmo com momento velho", () => {
    expect(quemEspera([c({ proxima_acao: null }), c({ jid: "b", proxima_acao: "{lixo" })], agora)).toHaveLength(2)
    expect(quemEspera([c({ ultima_msg: "Blz", proxima_acao: pa("com_ele", dias7) })], agora)).toHaveLength(0)
  })
  it("momentoValido", () => {
    expect(momentoValido(pa("com_ele", dias7), min(40))).toBeNull()
    expect(momentoValido(pa("com_ele", 10), min(40))).toBe("com_ele")
  })
})
