import { describe, it, expect } from "vitest"
import { linhasDeOrcamento, taxa, referenciaParaOrcamento } from "@/app/lib/precoQueFecha"
import { card } from "./fixtures"

const tabela = (quantidade: number, custo: number) => ({ tabela: [{ quantidade, custoTotalSemFaca: custo }] as never })

describe("preço que fecha", () => {
  const kanban = [
    card({ numero: "A1", nomeCliente: "Ana", preco: 2000, quantidade: 3000, coluna: 9, data: "01/07/2026, 10:00:00", dataFechamento: "2026-07-01" }),
    card({ numero: "A2", nomeCliente: "Ana", preco: 2200, quantidade: 3000, coluna: 5, data: "01/09/2026, 10:00:00", dataFechamento: "2026-09-02" }),
    card({ numero: "B1", nomeCliente: "Bia", preco: 3000, quantidade: 3000, coluna: 10, motivoPerdido: "Preço", data: "01/08/2026, 10:00:00" }),
    card({ numero: "C1", nomeCliente: "Caio", preco: 2500, quantidade: 3000, coluna: 10, motivoPerdido: "Orçamento sem conclusão", data: "01/08/2026, 10:00:00" }),
    card({ numero: "D1", nomeCliente: "Duda", preco: 1500, quantidade: 3000, coluna: 0, data: "01/10/2026, 10:00:00" }),
  ]
  const historico = [{ numero: "A1", calculo: tabela(3000, 1000) }, { numero: "B1", calculo: tabela(3000, 1000) }]
  const ls = linhasDeOrcamento(kanban, historico)

  it("separa ganho, recusado e sem resposta; orçamento aberto fica de fora", () => {
    expect(ls.map(l => l.desfecho).sort()).toEqual(["ganho", "ganho", "recusado", "semResposta"])
    expect(taxa(ls).taxa).toBe(0.5)
  })
  it("recorrente só a partir da segunda compra; markup pelo custo do motor", () => {
    expect(ls.find(l => l.card.numero === "A1")?.recorrente).toBe(false)
    expect(ls.find(l => l.card.numero === "A2")?.recorrente).toBe(true)
    expect(ls.find(l => l.card.numero === "B1")?.markup).toBe(3)
  })
  it("referência: último preço do cliente e recusas por preço", () => {
    const r = referenciaParaOrcamento(ls, { nomeCliente: "ana", quantidade: 3000, kanban })
    expect(r.recorrente).toBe(true)
    expect(r.ultimoPedido?.numero).toBe("A2")
    expect(r.markupGanhos).toBe(2)
    expect(r.porMotivoPreco).toBe(1)
  })
})
