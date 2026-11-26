import { describe, it, expect, beforeAll } from "vitest"
import { acompanhamentoDigital } from "../app/lib/acompanhamentoDigital"
import { receberDigital } from "../app/lib/receberDigital"
import { lancamentosDoPedido } from "../app/lib/digitalFinanceiro"
import { tokenDigital, tokenDigitalValido } from "../app/lib/digitalLink"
import type { LancamentoFinanceiro } from "../app/types"

beforeAll(() => { process.env.NEXTAUTH_SECRET = "segredo-de-teste" })

const base = { id: "DIG-0007", nome: "Carla Mendes", jid: "5511999990000@s.whatsapp.net", email: "c@x.com", documento: "12345678900", custo: 400, margem: 600,
  status: "sinal_pago", quantidade: 200, medidas: { a: 10, l: 5, p: 5 }, total: 1001, sinal: 500.37, restante: 500.63,
  sinalPagoEm: "2026-11-10T15:00:00.000Z", pagamento: { txId: "E999TXID", valor: 500.37, data: "2026-11-10T15:00:00.000Z" }, briefing: { laminacao: "fosca" as const } }
const receberDe = (p: typeof base & Record<string, unknown>) => receberDigital([p as never], lancamentosDoPedido(p as never, "x") as LancamentoFinanceiro[], "2026-11-25")[0]

describe("acompanhamentoDigital", () => {
  it("traz os 13 campos, com pagamento copiado do a receber", () => {
    const p = { ...base, arteEnviadaEm: "2026-11-12", arteAprovadaEm: "2026-11-13", villaEnviadoEm: "2026-11-14", status: "producao", artes: [{}] }
    const a = acompanhamentoDigital(p as never, receberDe(p))!
    expect(a.numero).toBe("DIG-0007")
    expect(a.primeiroNome).toBe("Carla")
    expect(a.medida).toEqual({ altura: 10, largura: 5, profundidade: 5, unidade: "cm" })
    expect(a.quantidade).toBe(200)
    expect(a.tipo).toBe("Impressão digital · triplex 300g · laminação fosca")
    expect(a.etapaAtual).toEqual({ chave: "producao", rotulo: "Em produção", em: "2026-11-14" })
    expect(a.historico.map(e => [e.chave, e.em])).toEqual([["sinal_pago", "2026-11-10"], ["arte_preparo", "2026-11-10"], ["arte_aprovacao", "2026-11-12"], ["arte_aprovada", "2026-11-13"], ["producao", "2026-11-14"]])
    expect(a.arte).toBe("aprovada")
    expect(a.prazoEntrega.previstoDe).toBe("2026-11-25")   // 7 dias úteis depois da arte aprovada (13/11; 20/11 é feriado)
    expect(a.prazoEntrega.previstoAte).toBe("2026-11-30")
    expect(a.valorTotal).toBe(1001)
    expect(a.sinal).toBe(500.37)
    expect(a.pagamento).toEqual({ situacao: "ok", pago: 500.37, pagoEm: "2026-11-10", saldo: 500.63, vencimento: null })
  })
  it("fora do a receber: 'em conferência', sem saldo, pago nem vencimento (não calcula total - sinal)", () => {
    const a = acompanhamentoDigital(base as never, undefined)!
    expect(a.pagamento.situacao).toBe("conferencia")
    expect(Object.keys(a.pagamento)).toEqual(["situacao", "mensagem"])
    expect(JSON.stringify(a.pagamento)).not.toMatch(/500|"saldo"|"vencimento"|"pago"/)
  })
  it("arte: aprovada, esperando o cliente, ainda não enviada", () => {
    expect(acompanhamentoDigital({ ...base, arteAprovadaEm: "2026-11-13" } as never)!.arte).toBe("aprovada")
    expect(acompanhamentoDigital({ ...base, status: "arte", artes: [{}], arteEnviadaEm: "2026-11-12" } as never)!.arte).toBe("esperando_cliente")
    expect(acompanhamentoDigital({ ...base, status: "arte" } as never)!.arte).toBe("nao_enviada")
  })
  it("prazo de entrega só depois da arte aprovada", () => {
    const antes = acompanhamentoDigital(base as never)!.prazoEntrega
    expect(antes.previstoDe).toBeNull(); expect(antes.texto).toMatch(/depois da aprovação da arte/)
    const grande = acompanhamentoDigital({ ...base, quantidade: 500, arteAprovadaEm: "2026-11-13" } as never)!.prazoEntrega
    expect(grande.previstoDe).toBe(grande.previstoAte)
  })
  it("sem sinal pago ou cancelado: sem acompanhamento", () => {
    expect(acompanhamentoDigital({ ...base, status: "aguardando_sinal", sinalPagoEm: undefined } as never)).toBeNull()
    expect(acompanhamentoDigital({ ...base, status: "cancelado" } as never)).toBeNull()
  })
  it("payload público sem jid, telefone, e-mail, documento, custo, margem, txId nem cobrança", () => {
    const j = JSON.stringify(acompanhamentoDigital(base as never, receberDe(base)))
    expect(j).not.toMatch(/jid|whatsapp|5511999990000|c@x\.com|email|documento|12345678900|custo|margem|txId|E999TXID|asaas|cobranca|Mendes/)
  })
  it("etapa enviado e pronto", () => {
    const p = { ...base, status: "enviado", arteAprovadaEm: "2026-11-13", villaEnviadoEm: "2026-11-14", prontoEm: "2026-11-20", statusEm: "2026-11-23" }
    expect(acompanhamentoDigital(p as never)!.etapaAtual).toMatchObject({ chave: "enviado", em: "2026-11-23" })
    expect(acompanhamentoDigital(p as never)!.historico.map(e => e.chave)).toContain("pronto")
  })
})

describe("link do cliente", () => {
  it("token inválido não abre", () => {
    expect(tokenDigitalValido("DIG-0007", tokenDigital("DIG-0007"))).toBe(true)
    expect(tokenDigitalValido("DIG-0007", "errado")).toBe(false)
    expect(tokenDigitalValido("DIG-0007", tokenDigital("DIG-0008"))).toBe(false)
    expect(tokenDigitalValido("DIG-0007", null)).toBe(false)
  })

  it("prazo gravado vence o calculado (uma data, dd/mm/aaaa)", () => {
    const a = acompanhamentoDigital({ ...base, arteAprovadaEm: "2026-11-13", prazoEntregaEm: "2026-12-05" } as never)!.prazoEntrega
    expect(a).toEqual({ previstoDe: "2026-12-05", previstoAte: "2026-12-05", texto: "Entrega prevista até 05/12/2026." })
    expect(acompanhamentoDigital({ ...base, prazoEntregaEm: "2026-12-05" } as never)!.prazoEntrega.texto).toBe("Entrega prevista até 05/12/2026.")
    expect(acompanhamentoDigital({ ...base, arteAprovadaEm: "2026-11-13", prazoEntregaEm: "lixo" } as never)!.prazoEntrega.previstoDe).toBe("2026-11-25")
  })
  it("situacaoArte manda na etapa da arte", () => {
    const arte = (situacaoArte: string, extra = {}) => acompanhamentoDigital({ ...base, situacaoArte, ...extra } as never)!.arte
    expect(arte("aprovada")).toBe("aprovada"); expect(arte("prova autorizada")).toBe("aprovada")
    expect(arte("ajustes pedidos")).toBe("ajustes_pedidos"); expect(arte("enviada")).toBe("esperando_cliente"); expect(arte("sem arte")).toBe("nao_enviada")
    expect(arte("sem arte", { arteAprovadaEm: "2026-11-13" })).toBe("nao_enviada")
  })
  it("arte aprovada sem arteAprovadaEm: etapa aprovada sem data", () => {
    const h = acompanhamentoDigital({ ...base, situacaoArte: "aprovada" } as never)!.historico
    expect(h.find(e => e.chave === "arte_aprovada")).toEqual({ chave: "arte_aprovada", rotulo: "Arte aprovada (fila de produção)", em: null })
  })
  it("em produção acende com o status do painel, mesmo sem villaEnviadoEm", () => {
    const a = acompanhamentoDigital({ ...base, status: "producao" } as never)!
    expect(a.etapaAtual.chave).toBe("producao")
    expect(acompanhamentoDigital(base as never)!.historico.some(e => e.chave === "producao")).toBe(false)
  })
})

describe("previsão de entrega em pt-BR", () => {
  it("texto usa dd/mm, nunca a data ISO", () => {
    const t = acompanhamentoDigital({ ...base, arteAprovadaEm: "2026-11-13" } as never)!.prazoEntrega.texto
    expect(t).toMatch(/\d{2}\/\d{2}/); expect(t).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })
})
