import { describe, it, expect } from "vitest"
import { lerOFX, lerCSV, conciliar, aplicarConciliacao, pagadorDaDescricao, MARCA } from "@/app/lib/conciliacao"
import { montarPedidos } from "@/app/lib/negocio"
import { card, receita } from "./fixtures"

const OFX = `<OFX><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261028120000[-3:BRT]<TRNAMT>4770.00<FITID>A1<MEMO>PIX RECEBIDO - BRUNO PERFUMES LTDA 12.345.678/0001-90</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261028<TRNAMT>-150.00<FITID>A2<MEMO>PIX ENVIADO POSTO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261029<TRNAMT>3000,00<FITID>A3<MEMO>PIX RECEBIDO MARIA SOUZA</STMTTRN>
</BANKTRANLIST></OFX>`

describe("leitura do extrato", () => {
  it("OFX: só créditos, com data, valor e pagador", () => {
    const e = lerOFX(OFX)
    expect(e.map(x => x.id)).toEqual(["A1", "A3"])
    expect(e[0]).toMatchObject({ data: "2026-10-28", valor: 4770, pagador: "BRUNO PERFUMES LTDA" })
    expect(e[1].valor).toBe(3000)
  })
  it("CSV no formato brasileiro", () => {
    const csv = "Data;Histórico;Valor\n28/10/2026;PIX RECEBIDO ANA COSMETICOS;1.200,50\n28/10/2026;TARIFA;-10,00"
    expect(lerCSV(csv)).toEqual([expect.objectContaining({ data: "2026-10-28", valor: 1200.5, pagador: "ANA COSMETICOS" })])
  })
  it("tira palavras do banco e números do nome", () => {
    expect(pagadorDaDescricao("TRANSF PIX RECEB CPF 123.456.789-00 JOAO DA SILVA")).toBe("JOAO DA SILVA")
  })
})

describe("casamento", () => {
  const bruno = card({ numero: "ORC-2", nomeCliente: "Bruno Perfumes", preco: 9540, coluna: 7 })
  const ana = card({ numero: "ORC-1", nomeCliente: "Ana Cosméticos", preco: 6540, coluna: 9 })
  const kanban = [bruno, ana]

  it("sinal de metade do pedido, pago pelo próprio cliente: baixa automática", () => {
    const pedidos = montarPedidos(kanban, [])
    const [r] = conciliar({ entradas: [{ id: "A1", data: "2026-10-28", valor: 4770, descricao: "", pagador: "BRUNO PERFUMES LTDA" }], pedidos, lancamentos: [] })
    expect(r.status).toBe("automatico")
    expect(r.sugestoes[0].candidato).toMatchObject({ tipo: "pedido", categoria: "sinal" })
    const { criar } = aplicarConciliacao(r.entrada, r.sugestoes[0].candidato)
    expect(criar).toMatchObject({ valor: 4770, status: "pago", cardId: bruno.id, obs: `${MARCA}A1` })
  })

  it("valor exato de uma cobrança lançada, pago por outra pessoa: vira sugestão", () => {
    const cobranca = receita({ valor: 3000, cardId: ana.id, status: "pendente", dataPagamento: undefined, dataVencimento: "2026-10-30" })
    const pedidos = montarPedidos(kanban, [cobranca])
    const [r] = conciliar({ entradas: [{ id: "A3", data: "2026-10-29", valor: 3000, descricao: "", pagador: "MARIA SOUZA" }], pedidos, lancamentos: [cobranca] })
    expect(r.status).toBe("sugestao")
    expect(r.sugestoes[0].candidato).toMatchObject({ tipo: "cobranca" })
    expect(aplicarConciliacao(r.entrada, r.sugestoes[0].candidato).atualizar?.campos).toMatchObject({ status: "pago", dataPagamento: "2026-10-29" })
  })

  it("aprende quem paga por quem", () => {
    const cobranca = receita({ valor: 3000, cardId: ana.id, status: "pendente", dataPagamento: undefined, dataVencimento: "2026-10-30" })
    const pedidos = montarPedidos(kanban, [cobranca])
    const [r] = conciliar({ entradas: [{ id: "A3", data: "2026-10-29", valor: 3000, descricao: "", pagador: "MARIA SOUZA" }], pedidos, lancamentos: [cobranca],
      memoria: { pagadores: { "maria souza": "Ana Cosméticos" } } })
    expect(r.status).toBe("automatico")
  })

  it("não importa duas vezes e ignora o que você marcou", () => {
    const ja = receita({ valor: 100, cardId: ana.id, obs: `${MARCA}A1` })
    const pedidos = montarPedidos(kanban, [ja])
    const r = conciliar({ entradas: [{ id: "A1", data: "2026-10-28", valor: 4770, descricao: "" }, { id: "X", data: "2026-10-28", valor: 50, descricao: "" }],
      pedidos, lancamentos: [ja], memoria: { ignorados: ["X"] } })
    expect(r.map(x => x.status)).toEqual(["ja_conciliado", "ja_conciliado"])
  })

  it("sem pista: fica para você", () => {
    const [r] = conciliar({ entradas: [{ id: "Z", data: "2026-10-28", valor: 77.7, descricao: "", pagador: "FULANO DESCONHECIDO" }], pedidos: montarPedidos(kanban, []), lancamentos: [] })
    expect(r.status).toBe("sem_par")
  })

  it("o mesmo saldo não é usado por dois Pix iguais", () => {
    const pedidos = montarPedidos(kanban, [])
    const e = { data: "2026-10-28", valor: 4770, descricao: "", pagador: "BRUNO PERFUMES" }
    const r = conciliar({ entradas: [{ ...e, id: "B1" }, { ...e, id: "B2" }], pedidos, lancamentos: [] })
    expect(r.filter(x => x.status === "automatico")).toHaveLength(1)
  })
})
