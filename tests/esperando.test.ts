import { describe, it, expect } from "vitest"
import { quemEspera } from "@/app/lib/esperando"

const agora = new Date("2026-11-18T18:00:00Z").getTime()
const min = (m: number) => new Date(agora - m * 60_000).toISOString()
const c = (p: Record<string, unknown>) => ({ jid: "1@s.whatsapp.net", nome: "Ana", etiquetas: [], status_lead: null, ultima_msg: "Quanto fica?", ultima_recebida_at: min(40), ultima_enviada_at: min(60), ...p })

describe("ninguém sem resposta", () => {
  it("pega quem escreveu por último há 20+ min e prioriza bom negócio e digital", () => {
    const r = quemEspera([
      c({ jid: "a", nome: "Mateus", etiquetas: ["Digital"], ultima_msg: "Fico no aguardo dos valores", ultima_recebida_at: min(1200), ultima_enviada_at: min(1202) }),
      c({ jid: "h", nome: "Auto", ultima_msg: "Olá! Seja muito bem-vindo(a) à Loja Exemplo!" }),
      c({ jid: "i", nome: "Vai mandar", ultima_msg: "Vou providenciar" }),
      c({ jid: "b", nome: "Bom", status_lead: "mql" }),
      c({ jid: "c", nome: "Recente", ultima_recebida_at: min(5) }),
      c({ jid: "d", nome: "Ok", ultima_msg: "ok, obrigado" }),
      c({ jid: "e", nome: "Respondido", ultima_enviada_at: min(1) }),
      c({ jid: "f", nome: "Fornec", etiquetas: ["Fornecedora"] }),
      c({ jid: "g", nome: "Volta", proxima_acao: JSON.stringify({ r: { momento: "com_ele" } }) }),
    ], agora)
    expect(r.map(x => x.nome)).toEqual(["Mateus", "Bom"])
  })
})
