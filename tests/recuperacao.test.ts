import { describe, expect, test } from "vitest"
import { situacao, esfriouDeVez, mensagem, linkWhats, type PedidoParado } from "@/app/caixaria/lib/recuperacao"

const H = 3_600_000
const t0 = Date.parse("2026-11-08T12:00:00Z")
const p: PedidoParado = { id: "1", numero: "CX-261108-Z9WE", criadoEm: new Date(t0).toISOString(), total: 839.9,
  cliente: { nome: "MARIA souza", telefone: "11 99999-0000" }, itens: [{ nome: "Caixa para caneta aplicadora", qtd: 1000 }] }
const iso = (ms: number) => new Date(ms).toISOString()

describe("recuperar quem parou no pagamento", () => {
  test("1º toque meia hora depois do pedido", () => {
    expect(situacao(p, undefined, t0 + 10 * 60_000)).toMatchObject({ tipo: "esperar" })
    expect(situacao(p, undefined, t0 + H)).toMatchObject({ tipo: "chamar", toque: 1 })
  })
  test("2º toque no dia seguinte ao 1º, 3º três dias depois", () => {
    const r = { toques: [iso(t0 + H)] }
    expect(situacao(p, r, t0 + 5 * H)).toMatchObject({ tipo: "esperar", toque: 2 })
    expect(situacao(p, r, t0 + 26 * H)).toMatchObject({ tipo: "chamar", toque: 2 })
    expect(situacao(p, { toques: [iso(t0 + H), iso(t0 + 26 * H)] }, t0 + 74 * H)).toMatchObject({ tipo: "chamar", toque: 3 })
  })
  test("depois de 3 toques e uma semana, esfriou", () => {
    const s = situacao(p, { toques: [iso(t0), iso(t0 + 24 * H), iso(t0 + 72 * H)] }, t0 + 72 * H + 8 * 24 * H)
    expect(s.tipo).toBe("esfriou")
    expect(esfriouDeVez(s, t0 + 72 * H + 8 * 24 * H)).toBe(true)
  })
  test("pedido antigo nunca chamado não vira 1º toque", () => {
    expect(situacao(p, undefined, t0 + 30 * 24 * H).tipo).toBe("esfriou")
  })
  test("arquivado", () => {
    expect(situacao(p, { toques: [], arquivado: { em: iso(t0), motivo: "Achou caro" } })).toMatchObject({ tipo: "arquivado", motivo: "Achou caro" })
  })
  test("mensagens: nome, link e sem falar de chapa", () => {
    const m1 = mensagem(p, 1)
    expect(m1).toContain("Oi, Maria!")
    expect(m1).toContain("https://caixaria.com/pedido/CX-261108-Z9WE")
    expect(m1).toContain("1.000 caixas para caneta aplicadora")
    expect(mensagem({ ...p, recusado: true }, 1)).toContain("nada foi cobrado")
    for (const t of [1, 2, 3] as const) expect(mensagem(p, t)).not.toMatch(/chapa/i)
  })
  test("link do WhatsApp com DDI", () => {
    expect(linkWhats("11 99999-0000", "oi")).toBe("https://wa.me/5511999990000?text=oi")
    expect(linkWhats("5511999990000", "")).toBe("https://wa.me/5511999990000?text=")
  })
})
