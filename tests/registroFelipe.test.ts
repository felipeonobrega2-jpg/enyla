import { describe, it, expect } from "vitest"
import { ehDoFelipeNoGithub, linhasDoGithub, ehDigitadaPeloFelipe, linhasDoWhatsapp, semRepetidos, paginar, quatroDigitos, paraSaida, type ItemGithub } from "../app/lib/registroFelipe"

const issue = (o: Partial<ItemGithub>): ItemGithub => ({ id: 1, number: 7, html_url: "https://github.com/x/y/issues/7", title: "T", body: "corpo", created_at: "2026-11-25T20:00:00Z", user: { login: "felipeonobrega2-jpg" }, performed_via_github_app: null, ...o })

describe("GitHub: autor", () => {
  it("do Felipe = login dele e sem app", () => {
    expect(ehDoFelipeNoGithub(issue({}))).toBe(true)
    expect(ehDoFelipeNoGithub(issue({ performed_via_github_app: undefined }))).toBe(true)
  })
  it("mesma conta pelo app Cursor é de diretor; outro login também não conta", () => {
    expect(ehDoFelipeNoGithub(issue({ performed_via_github_app: { slug: "cursor" } }))).toBe(false)
    expect(ehDoFelipeNoGithub(issue({ user: { login: "outro" } }))).toBe(false)
  })
  it("guarda texto, número e link; comentário usa o número da issue", () => {
    const ls = linhasDoGithub([issue({}), issue({ id: 2, performed_via_github_app: { slug: "cursor" } }), issue({ id: 3, issue_url: "https://api.github.com/repos/x/y/issues/152", body: "ok, aprovo", html_url: "https://github.com/x/y/issues/152#c3" })])
    expect(ls).toHaveLength(2)
    expect(ls[0]).toMatchObject({ fonte: "github", ref_externa: "github:issue:1", link: "https://github.com/x/y/issues/7" })
    expect(ls[0].texto).toContain("#7")
    expect(ls[1]).toMatchObject({ ref_externa: "github:comentario:3", texto: "#152: ok, aprovo" })
  })
})

describe("WhatsApp: só o que o Felipe digitou", () => {
  const ag = new Set(["AAA111"])
  it("descarta 3EB0, ids do agente, mensagem do cliente e vazias", () => {
    expect(ehDigitadaPeloFelipe({ id: "3EB0ABC", from_me: true, corpo: "oi" }, ag)).toBe(false)
    expect(ehDigitadaPeloFelipe({ id: "3eb0abc", from_me: true, corpo: "oi" }, ag)).toBe(false)
    expect(ehDigitadaPeloFelipe({ id: "AAA111", from_me: true, corpo: "oi" }, ag)).toBe(false)
    expect(ehDigitadaPeloFelipe({ id: "ZZZ", from_me: false, corpo: "oi" }, ag)).toBe(false)
    expect(ehDigitadaPeloFelipe({ id: "ZZZ", from_me: true, corpo: "  " }, ag)).toBe(false)
    expect(ehDigitadaPeloFelipe({ id: "ZZZ", from_me: true, corpo: "fecho por R$ 500" }, ag)).toBe(true)
  })
  it("monta linhas só das dele, com ref por id", () => {
    const ls = linhasDoWhatsapp([{ id: "3EB0X", jid: "a@s.whatsapp.net", from_me: true, corpo: "auto", ts: "t" }, { id: "K1", jid: "a@s.whatsapp.net", from_me: true, corpo: "mando amanhã", ts: "2026-11-25T10:00:00Z" }], ag)
    expect(ls).toEqual([expect.objectContaining({ ref_externa: "whatsapp:K1", fonte: "whatsapp", tipo: "mensagem" })])
  })
})

describe("ref_externa e paginação", () => {
  it("não duplica ref_externa no lote", () => {
    const l = { em: "e", fonte: "github" as const, tipo: "mensagem" as const, texto: "a", ref_externa: "github:issue:1" }
    expect(semRepetidos([l, { ...l }, { ...l, ref_externa: "github:issue:2" }])).toHaveLength(2)
  })
  it("página inteira, sem cortar item", () => {
    const todos = Array.from({ length: 65 }, (_, i) => i)
    const p1 = paginar(todos, 1, 30), p3 = paginar(todos, 3, 30)
    expect(p1.itens).toHaveLength(30); expect(p1.proxima).toBe(2); expect(p1.paginas).toBe(3)
    expect(p3.itens).toEqual(todos.slice(60)); expect(p3.proxima).toBeNull()
    expect(paginar(todos, 99, 30).pagina).toBe(3)
    expect(paginar([], 1).itens).toEqual([])
  })
})

describe("privacidade", () => {
  it("só os 4 últimos dígitos, no jid e no texto", () => {
    expect(quatroDigitos("5511987654321@s.whatsapp.net")).toBe("4321")
    const s = paraSaida({ id: 1, em: "e", fonte: "whatsapp", tipo: "mensagem", jid: "5511987654321@s.whatsapp.net", texto: "liga no +55 11 98765-4321", ref_externa: "x" })
    expect(JSON.stringify(s)).not.toContain("987654321")
    expect(s.lead).toBe("…4321")
  })
})
