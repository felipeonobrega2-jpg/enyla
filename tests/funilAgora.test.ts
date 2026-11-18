import { describe, it, expect } from "vitest"
import { montarFunilAgora } from "@/app/lib/funilAgora"

const agora = new Date("2026-11-18T18:00:00Z").getTime()
const iso = (d: number) => new Date(agora - d * 86_400_000).toISOString()

describe("funil agora", () => {
  it("conta cada etapa, soma o valor e marca os parados", () => {
    const f = montarFunilAgora({
      agora, hoje: "2026-11-18",
      conversas: [
        { jid: "a", nome: "Lead A", etiquetas: [], status_lead: null, criado_em: iso(1), ultima_at: iso(0) },
        { jid: "b", nome: "MQL B", etiquetas: ["MQL", "ICP"], status_lead: "mql", criado_em: iso(2), ultima_at: iso(0) },
        { jid: "c", nome: "Dig C", etiquetas: ["Digital"], status_lead: null, criado_em: iso(1), ultima_at: iso(0) },
      ],
      cards: [
        { id: "k1", numero: "ORC-1", nomeCliente: "X", preco: 5000, coluna: 0, createdAt: iso(3) },
        { id: "k2", numero: "ORC-2", nomeCliente: "Y", preco: 8000, coluna: 5, dataEntregaPrevista: "2026-11-10" },
        { id: "k3", numero: "ORC-3", nomeCliente: "Z", preco: 3000, coluna: 9, dataEntregaReal: iso(5) },
      ] as never,
      pedidos: [{ id: "DIG-1", jid: "d", nome: "Ana", total: 620, status: "sinal_pago", em: iso(4), statusEm: iso(3), quantidade: 100 }],
      esperando: [{ jid: "b", nome: "MQL B", minutos: 300, mensagem: "e aí?", peso: 4, rotulo: "bom negócio" }],
    })
    const o = Object.fromEntries(f.offset.map(e => [e.id, e])), d = Object.fromEntries(f.digital.map(e => [e.id, e]))
    expect([o.leads.quantos, o.mql.quantos, o.mql.parados, o.proposta.valor, o.producao.parados, o.entregue.quantos]).toEqual([1, 1, 1, 5000, 1, 1])
    expect([d.dleads.quantos, d.dsinal.quantos, d.dsinal.parados]).toEqual([1, 1, 1])
  })
})
