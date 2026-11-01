import { describe, it, expect } from "vitest"
import { pendencias } from "@/app/lib/pendencias"
import { montarPedidos } from "@/app/lib/negocio"
import { card, config } from "./fixtures"

const HOJE = new Date("2026-11-02T12:00:00")
const roda = (kanban: ReturnType<typeof card>[], cfg = config()) =>
  pendencias({ pedidos: montarPedidos(kanban, []), kanban, lancamentos: [], historico: [], propostasCustom: [], clientes: [], config: cfg, hoje: HOJE })

describe("Precisa de você", () => {
  const aprov = (cardId: string, extra = {}) => ({ numero: "ORC-A", cardId, nomeCliente: "Cliente", aprovadoPor: "Teste", quantidade: 6000, preco: 9540, sinal: 4770, em: "2026-10-31T21:45:00Z", ...extra })

  it("aprovação online aparece enquanto o pedido está fechado", () => {
    const c = card({ numero: "ORC-A", preco: 9540, coluna: 1 })
    expect(roda([c], config({ aprovacoesOnline: [aprov(c.id)] })).some(p => p.tipo === "aprovado")).toBe(true)
  })
  it("pedido voltou para orçamento: a aprovação some (teste do ORC-2026-233)", () => {
    const c = card({ numero: "ORC-A", preco: 9540, coluna: 0 })
    expect(roda([c], config({ aprovacoesOnline: [aprov(c.id)] })).some(p => p.tipo === "aprovado")).toBe(false)
    const fechado = card({ numero: "ORC-A", preco: 9540, coluna: 1 })
    expect(roda([fechado], config({ aprovacoesOnline: [aprov(fechado.id, { desfeita: true })] })).some(p => p.tipo === "aprovado")).toBe(false)
  })
  it("cliente de relacionamento só é cobrado depois do prazo combinado", () => {
    const c = card({ numero: "MAU-T", nomeCliente: "Maurício", preco: 260, coluna: 9, dataEntregaReal: "2026-10-30" })
    expect(roda([c]).some(p => p.tipo === "semCobranca")).toBe(true)
    const rel = config({ clientesRelacionamento: [{ nome: "Maurício", diasAposEntrega: 30 }] })
    expect(roda([c], rel).some(p => p.tipo === "semCobranca")).toBe(false)
    const antigo = card({ numero: "MAU-V", nomeCliente: "Maurício", preco: 260, coluna: 9, dataEntregaReal: "2026-09-01" })
    expect(roda([antigo], rel).some(p => p.tipo === "semCobranca")).toBe(true)
  })

  it("cliente abriu a proposta: aparece por 3 dias e no lugar do 'vencendo'", () => {
    const c = card({ numero: "ORC-V", preco: 3890, coluna: 0, data: "01/11/2026, 10:00:00" })
    const visita = (ultima: string) => config({ visitasProposta: { "ORC-V": { primeira: ultima, ultima, vezes: 2 } } })
    const r = roda([c], visita("2026-11-02T13:10:00Z"))
    expect(r.find(p => p.tipo === "abriuProposta")?.sub).toMatch(/hoje às 10:10 · 2 vezes/)
    expect(r.some(p => p.tipo === "orcamentoVencendo")).toBe(false)
    expect(roda([c], visita("2026-10-28T13:00:00Z")).some(p => p.tipo === "abriuProposta")).toBe(false)
  })
  it("entregue há poucos dias e sem avaliação: pedir o 'Como ficou?'", () => {
    const c = card({ numero: "ANA-1", preco: 3000, coluna: 9, dataEntregaReal: "2026-10-30" })
    const r = roda([c])
    expect(r.find(p => p.tipo === "comoFicou")?.whatsapp).toMatch(/^\/api\/cliente\/whatsapp\?modelo=como-ficou/)
    const key = montarPedidos([c], [])[0].key
    const avaliado = config({ avaliacoes: [{ key, numero: "ANA-1", nomeCliente: "Cliente Teste", nota: 5, em: "2026-11-01T12:00:00Z" }] })
    const r2 = roda([c], avaliado)
    expect(r2.some(p => p.tipo === "comoFicou")).toBe(false)
    expect(r2.find(p => p.tipo === "avaliado")?.tom).toBe("sucesso")
    expect(roda([card({ numero: "ANA-2", preco: 3000, coluna: 9, dataEntregaReal: "2026-10-10" })]).some(p => p.tipo === "comoFicou")).toBe(false)
  })
})
