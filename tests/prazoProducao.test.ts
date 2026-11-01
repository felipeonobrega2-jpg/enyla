import { describe, it, expect } from "vitest"
import { prazoDeProducao, estatistica } from "@/app/lib/prazoProducao"

const r = (numero: string, datas: Record<number, string>) => ({ numero, etapas: Object.entries(datas).map(([c, d]) => ({ coluna: +c, dataHora: `${d}, 10:00:00`, tipo: "coluna" })) })

describe("prazo de produção", () => {
  it("mediana e média em dias úteis; ignora pedidos registrados de uma vez", () => {
    const p = prazoDeProducao([
      r("A", { 1: "02/11/2026", 2: "03/11/2026", 5: "05/11/2026", 6: "09/11/2026", 9: "13/11/2026" }),   // 9 dias úteis (02/11 é Finados, mas é o ponto de partida)
      r("B", { 1: "03/11/2026", 2: "03/11/2026", 5: "04/11/2026", 6: "06/11/2026", 9: "10/11/2026" }),   // 5 dias úteis
      r("C", { 1: "30/09/2026", 2: "30/09/2026", 5: "30/09/2026", 9: "30/09/2026" }),                    // arrumação: fora
    ])
    expect(p.registradosDeUmaVez).toBe(1)
    expect(p.pedidosUsados).toBe(2)
    expect(p.total).toMatchObject({ n: 2, min: 5, max: 9, mediana: 7 })
    expect(p.trechos.find(t => t.nome === "Impressão")).toMatchObject({ n: 2, mediana: 2 })
  })
  it("entrega real lançada vale mais que o card movido para Entregue", () => {
    const p = prazoDeProducao([r("A", { 1: "03/11/2026", 2: "04/11/2026", 9: "30/11/2026" })], { A: "2026-11-10" })
    expect(p.total?.mediana).toBe(5)
  })
  it("mediana resiste a um caso extremo", () => {
    expect(estatistica([3, 4, 5, 44])?.mediana).toBe(4.5)
  })
})
