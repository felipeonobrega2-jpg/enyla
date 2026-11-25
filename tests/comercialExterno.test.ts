import { describe, it, expect } from "vitest"
import { lerComercial, paginar, itensComercial, TETO_PAGINA } from "@/app/lib/comercialExterno"

const lead = (i: number, extra = "") => ({ jid: `${i}@s.whatsapp.net`, nome: `Lead ${i}`, mensagem: "x".repeat(300) + extra, desde: "2026-11-24T10:00:00Z" })
const hoje = (n: number) => ({
  responder: Array.from({ length: n }, (_, i) => lead(i)), orcar: [], resolver: [{ titulo: "Proposta", jid: "r@s.whatsapp.net", detalhe: "sem retomada" }],
  meta: { resumo: { total: 3 }, travados: [lead(900)] },
})

describe("?o=detalhe&area=comercial paginado", () => {
  it("página 1 e a seguinte, totais certos e ninguém repetido", () => {
    const h = hoje(20)
    const p1 = lerComercial(h, { pagina: null, jid: null })
    const p2 = lerComercial(h, { pagina: "2", jid: null })
    expect(p1.status).toBe(200)
    expect(p1.corpo.pagina).toBe(1)
    expect(p1.corpo.totalItens).toBe(22)
    expect(p1.corpo.totalPaginas).toBeGreaterThan(1)
    expect(p2.corpo.pagina).toBe(2)
    const todos: unknown[] = []
    for (let n = 1; n <= (p1.corpo.totalPaginas as number); n++) todos.push(...(lerComercial(h, { pagina: String(n), jid: null }).corpo.itens as unknown[]))
    expect(todos).toHaveLength(22)
    expect(p1.corpo.resumo).toEqual({ total: 3 })
  })

  it("nunca corta um lead: cada página é JSON válido, dentro do teto e com itens inteiros", () => {
    const h = hoje(20)
    const total = lerComercial(h, { pagina: "1", jid: null }).corpo.totalPaginas as number
    for (let n = 1; n <= total; n++) {
      const txt = JSON.stringify(lerComercial(h, { pagina: String(n), jid: null }).corpo)
      const itens = (JSON.parse(txt).itens as { mensagem?: string }[])
      expect(txt.length).toBeLessThanOrEqual(TETO_PAGINA + 600)   // teto dos itens + cabeçalho/resumo
      for (const it of itens.filter(i => i.mensagem)) expect(it.mensagem).toHaveLength(300)
    }
  })

  it("&jid= devolve o lead completo mesmo de quem cairia depois do corte antigo", () => {
    const h = hoje(20)
    const antigo = JSON.stringify({ responder: h.responder }).slice(0, 7000)
    expect(antigo).not.toContain("19@s.whatsapp.net")
    const r = lerComercial(h, { pagina: "9", jid: "19@s.whatsapp.net" })   // jid manda: a página é ignorada
    expect(r.status).toBe(200)
    expect(r.corpo.itens).toEqual([{ ...lead(19), lista: "responder" }])
    expect(JSON.parse(JSON.stringify(r.corpo))).toEqual(r.corpo)
  })

  it("lead maior que o teto sai inteiro, sozinho na página e inteiro no jid", () => {
    const h = { responder: [lead(1), lead(2, "y".repeat(9000)), lead(3)] }
    const paginas = paginar(itensComercial(h))
    expect(paginas.map(p => p.length)).toEqual([1, 1, 1])
    const r = lerComercial(h, { pagina: null, jid: "2@s.whatsapp.net" })
    expect(((r.corpo.itens as { mensagem: string }[])[0]).mensagem).toHaveLength(9300)
  })

  it("jid inexistente dá 404", () => {
    const r = lerComercial(hoje(3), { pagina: null, jid: "nao@s.whatsapp.net" })
    expect(r.status).toBe(404)
    expect(String(r.corpo.erro)).toContain("nao@s.whatsapp.net")
  })

  it("pagina inválida dá 400 com mensagem clara", () => {
    const h = hoje(20)
    const total = lerComercial(h, { pagina: null, jid: null }).corpo.totalPaginas as number
    for (const p of ["0", "-1", String(total + 1), "abc", "1.5", ""]) {
      const r = lerComercial(h, { pagina: p, jid: null })
      expect(r.status, p).toBe(400)
      expect(String(r.corpo.erro)).toContain(`1 a ${total}`)
    }
  })

  it("lista vazia: página 1 existe e vem vazia com total 0", () => {
    const r = lerComercial({}, { pagina: null, jid: null })
    expect(r.status).toBe(200)
    expect(r.corpo).toMatchObject({ pagina: 1, totalPaginas: 1, totalItens: 0, itens: [] })
    expect(lerComercial({}, { pagina: "2", jid: null }).status).toBe(400)
  })
})
