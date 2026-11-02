import { describe, it, expect, vi } from "vitest"
vi.mock("@/app/lib/supabase", () => ({ supabase: {} }))
import { paresPeloNome, qualFica } from "@/app/lib/juntarConversas"

describe("mesma pessoa em duas conversas", () => {
  it("junta número + @lid com o mesmo nome (acento e maiúscula não importam)", () => {
    expect(paresPeloNome([{ jid: "556592476804@s.whatsapp.net", nome: "Gildemar" }, { jid: "369@lid", nome: "gildemar " }]))
      .toEqual([{ sai: "369@lid", fica: "556592476804@s.whatsapp.net" }])
    expect(paresPeloNome([{ jid: "1@s.whatsapp.net", nome: "José Antônio" }, { jid: "2@lid", nome: "Jose Antonio" }])).toHaveLength(1)
  })
  it("não junta quando não dá para saber quem é quem", () => {
    // dois do mesmo lado com o mesmo nome
    expect(paresPeloNome([{ jid: "1@s.whatsapp.net", nome: "Ana" }, { jid: "2@s.whatsapp.net", nome: "Ana" }, { jid: "3@lid", nome: "Ana" }])).toEqual([])
    // nome que é só número, ou curto demais
    expect(paresPeloNome([{ jid: "1@s.whatsapp.net", nome: "5511999" }, { jid: "2@lid", nome: "5511999" }])).toEqual([])
    expect(paresPeloNome([{ jid: "1@s.whatsapp.net", nome: "Jo" }, { jid: "2@lid", nome: "Jo" }])).toEqual([])
    // os dois pelo @lid
    expect(paresPeloNome([{ jid: "1@lid", nome: "Bia" }, { jid: "2@lid", nome: "Bia" }])).toEqual([])
    // grupo não entra
    expect(paresPeloNome([{ jid: "1@g.us", nome: "Equipe" }, { jid: "2@lid", nome: "Equipe" }])).toEqual([])
  })
  it("fica a do número", () => {
    expect(qualFica("2@lid", "1@s.whatsapp.net")).toEqual({ fica: "1@s.whatsapp.net", sai: "2@lid" })
    expect(qualFica("1@s.whatsapp.net", "2@lid")).toEqual({ fica: "1@s.whatsapp.net", sai: "2@lid" })
  })
})
