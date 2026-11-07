import { describe, it, expect } from "vitest"
import { cotarDigital, montarPedido, novaArte, marcarArteEnviada, aprovarArte, pedirAjuste, esperandoAprovacao, restanteUnico, trocarFrete, restantesPagos, gravarEntrega, acertoDaSemana, semanaDe, textoParaVilla, textoArteParaAprovar, PedidoDigital } from "../app/lib/digital"
import type { DadosPedido } from "../app/lib/atendente"

const dados: DadosPedido = { produto: "perfume", volume_ml: 50, caixa_cm: null, frasco_cm: null, quantidade: 100, tem_arte: null, resumo: "" }
const cot = cotarDigital(dados)
if (!cot.ok) throw new Error("cotação")
const base = (): PedidoDigital => ({ ...montarPedido([], "1@s", "Maria Souza", dados, cot, new Date("2026-11-01T12:00:00Z")), status: "sinal_pago", sinalPagoEm: "2026-11-01T13:00:00Z" })
const arte = { url: "https://x/arte.png", nome: "arte.png", em: "2026-11-02T10:00:00Z" }

describe("digital: arte, Villa, restante e acerto", () => {
  it("arte sobe, vai para o cliente e só então pode ser aprovada", () => {
    const p1 = novaArte(base(), arte)!
    expect(esperandoAprovacao(p1)).toBe(false)
    const p2 = marcarArteEnviada(p1)!
    expect(p2.status).toBe("arte")
    expect(esperandoAprovacao(p2)).toBe(true)
    const ok = aprovarArte(p2, [p2])!
    expect(ok.status).toBe("producao")
    expect(ok.restante).toBe(Math.round((ok.total - ok.sinal) * 100) / 100)
    expect(aprovarArte(ok, [ok])).toBeNull()
  })
  it("ajuste volta para a designer e a nova versão precisa ser mandada de novo", () => {
    const p = marcarArteEnviada(novaArte(base(), arte)!)!
    const aj = pedirAjuste(p, "trocar dourado por prata")!
    expect(esperandoAprovacao(aj)).toBe(false)
    expect(aj.ajustes!.length).toBe(1)
    expect(textoArteParaAprovar(aj, "L")).toContain("ajustes")
    expect(pedirAjuste(p, "  ")).toBeNull()
  })
  it("restante tem centavos únicos e soma o frete", () => {
    const a = { ...base(), id: "DIG-0001", restante: 309.98 }
    const b = { ...base(), id: "DIG-0002", status: "producao" as const }
    const r = restanteUnico(b, [a, b])
    expect(Math.round(r * 100)).not.toBe(Math.round(a.restante * 100))
    const comFrete = trocarFrete({ ...b, restante: r }, [a, b], 25)!
    expect(comFrete.restante! - r).toBeCloseTo(25, 1)
    expect(trocarFrete({ ...b, restantePagoEm: "x" }, [b], 10)).toBeNull()
  })
  it("restante pago acha o Pix depois da aprovação", () => {
    const p = { ...base(), status: "producao" as const, arteAprovadaEm: "2026-11-03T12:00:00Z", restante: 309.97 }
    const ex = [{ id: "t1", data: "2026-11-02", valor: 309.97, tipo: "entrada" as const }, { id: "t2", data: "2026-11-04", valor: 309.97, tipo: "entrada" as const }]
    expect(restantesPagos([p], ex, new Set())).toEqual([{ id: p.id, tx: ex[1] }])
  })
  it("entrega pede CEP válido", () => {
    expect(gravarEntrega(base(), "59000-000", "Rua A, 10, Natal")!.entrega!.cep).toBe("59000000")
    expect(gravarEntrega(base(), "590", "Rua A")).toBeNull()
  })
  it("Villa recebe só o que precisa (sem o preço do cliente) e o acerto soma o custo", () => {
    const p = { ...base(), villaEnviadoEm: "2026-11-04T10:00:00Z" }
    const t = textoParaVilla(p, arte.url)
    expect(t).toContain("100 caixas")
    expect(t).not.toContain(p.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 }))
    const a = acertoDaSemana([p, { ...p, id: "DIG-0009", acertadoEm: "x" }, base()])
    expect(a.itens.map(x => x.id)).toEqual([p.id])
    expect(a.total).toBe(p.custo)
    expect(semanaDe(new Date("2026-11-09T12:00:00Z"))).toBe("2026-W46")
  })
})
