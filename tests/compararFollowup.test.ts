import { describe, it, expect } from "vitest"
import {
  selecionarRegistros, mensagensAte, extrairFatos, compararSaidas, semFundamento, agregar, divergencias, anonimizar,
  estimarCusto, tabelaEstimativa, escolherAmostra, relatorioMarkdown, idAnonimo, iaRodou, SAIDA_MEDIA_TOKENS, type Par, type Saida, type RegistroLido,
} from "../app/lib/compararFollowup"
import { pedidoAtendente, contextoDaConversa, historicoDaConversa } from "../app/lib/pedidoAtendente"

const O = "claude-opus-5-5", S = "claude-sonnet-5-5"
const AGORA = new Date("2026-11-24T12:00:00Z").getTime()
const reg = (jid: string, passo: string, em: string, motivo = "F1: sem resposta"): RegistroLido => ({ em, jid, nome: null, perfil: "icp", enviou: true, texto: "Oi!", motivo, passo })
const saida = (resposta: string, extra: Partial<Saida> = {}): Saida => ({ resposta, alerta: "nenhum", pode_enviar_sozinho: true, perfil: "icp", ...extra })

describe("seleção", () => {
  it("só F1-F3 em que a IA rodou, dentro da janela, um por conversa e nível, limitado por nível", () => {
    const rs = [
      reg("a", "F1", "2026-11-23T10:00:00Z"), reg("a", "F1", "2026-11-22T10:00:00Z"),   // repetido: fica o mais recente
      reg("b", "F2", "2026-11-20T10:00:00Z"), reg("c", "F2", "2026-11-19T10:00:00Z"),
      reg("d", "F3", "2026-09-01T10:00:00Z"),                                            // fora dos 30 dias
      reg("e", "F1", "2026-11-23T09:00:00Z", "Lembrete do pedido X parado"),            // texto fixo, sem IA
      reg("f", "F1", "2026-11-23T08:00:00Z", "F1 segurado: você está nessa conversa agora"),
      reg("g", "Instagram", "2026-11-23T07:00:00Z"),
    ]
    const sel = selecionarRegistros(rs, AGORA, 1)
    expect(sel.map(r => `${r.jid}${r.nivel}`)).toEqual(["a1", "b2"])
    expect(selecionarRegistros(rs, AGORA).map(r => `${r.jid}${r.nivel}`)).toEqual(["a1", "b2", "c2"])
    expect(iaRodou(reg("x", "F1", "2026-11-23T10:00:00Z", "F1 segurado: lead pequeno"))).toBe(true)
  })
  it("reconstrói a conversa até o horário do registro, nas últimas 50", () => {
    const ms = Array.from({ length: 60 }, (_, i) => ({ ts: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(), i }))
    const r = mensagensAte(ms, new Date(Date.UTC(2026, 10, 1, 0, 54)).toISOString())
    expect(r.length).toBe(50)
    expect(r[r.length - 1].i).toBe(54)
  })
})

describe("fatos do texto", () => {
  it("extrai números, valores, prazos, links e próximo passo", () => {
    const f = extrairFatos("Oi! São 1.500 caixas a R$ 2,50 cada, entrega em 10 dias úteis. Veja https://enyla.com/p/abc. Quer o orçamento?")
    expect(f.numeros).toContain("1500")
    expect(f.valores).toEqual(["2.50"])
    expect(f.prazos).toEqual(["10 dias úteis"])
    expect(f.links).toEqual(["https://enyla.com/p/abc"])
    expect(f.passos).toEqual(["pergunta", "orçamento", "link"])
    expect(extrairFatos("uns 5 mil").numeros).toContain("5000")
  })
})

describe("comparação por par", () => {
  it("concorda quando decisões e informações são as mesmas, mesmo com palavras diferentes", () => {
    const r = compararSaidas(saida("Oi! Conseguiu ver o orçamento de 1.000 caixas?"), saida("Olá, tudo bem? Viu o orçamento das 1000 caixas?"))
    expect(Object.values(r.concorda).every(Boolean)).toBe(true)
  })
  it("aponta decisão diferente e informação que está só de um lado", () => {
    const r = compararSaidas(saida("Oi! Fica R$ 900 em 7 dias."), saida("", { alerta: "preco", pode_enviar_sozinho: false, perfil: "medio" }))
    expect(r.concorda.resposta_vazia).toBe(false)
    expect(r.concorda.alerta).toBe(false)
    expect(r.concorda.pode_enviar_sozinho).toBe(false)
    expect(r.concorda.perfil).toBe(false)
    expect(r.concorda.valores).toBe(false)
    expect(r.soNoOpus).toContain("valor: 900")
    expect(r.soNoOpus).toContain("prazo: 7 dias")
    expect(r.soNoSonnet).toEqual([])
  })
  it("erro factual: valor, prazo e número que não estão no que a IA leu", () => {
    const lido = "Cliente: quero 2000 caixas. Filtro: acima de 1.000 é R$ 3,10 cada. Entrega 15 dias."
    expect(semFundamento("Fica R$ 3,10 cada, 2.000 caixas, em 15 dias.", lido)).toEqual([])
    expect(semFundamento("Fica R$ 2,00, entrega em 5 dias, 3500 caixas.", lido).sort()).toEqual(["número 3500", "prazo 5 dias", "valor R$ 2"].sort())
  })
  it("agrega concordância, falhas e erros factuais; lista divergências", () => {
    const pares: Par[] = [
      { id: "a", nivel: 1, entrada: "x 100", por: { [O]: saida("Oi! Viu?"), [S]: saida("Oi, conseguiu ver?") } },
      { id: "b", nivel: 2, entrada: "x 100", por: { [O]: saida("Oi!"), [S]: saida("Fica R$ 50 em 3 dias", { alerta: "preco" }) } },
      { id: "c", nivel: 3, entrada: "x", por: { [O]: saida("Oi"), [S]: null } },
    ]
    const c = agregar(pares)
    expect(c.comparados).toBe(2)
    expect(c.falhas[S]).toBe(1)
    expect(c.concordancia.alerta).toBe(1)
    expect(c.concordancia.perfil).toBe(2)
    expect(c.inventados[S]).toBe(1)
    const d = divergencias(pares)
    expect(d.map(x => x.id)).toEqual(["b"])
    expect(d[0].criterios).toContain("alerta")
  })
})

describe("anonimização", () => {
  it("troca nome, telefone, e-mail, CNPJ, endereço e links por marcadores", () => {
    const t = anonimizar("Oi Maria Silva! Fala com (11) 91234-5678 ou maria@loja.com.br. CNPJ 12.345.678/0001-90. Rua das Flores, 123, centro. Veja https://enyla.com/p/abc", ["Maria Silva"])
    expect(t).not.toMatch(/Maria|Silva|91234|maria@|12\.345|Flores|enyla\.com/)
    for (const m of ["[NOME]", "[TELEFONE]", "[E-MAIL]", "[CNPJ]", "[ENDEREÇO]", "[LINK]"]) expect(t).toContain(m)
  })
  it("não mexe em quantidades e valores comuns", () => {
    expect(anonimizar("1000 caixas a R$ 2,50")).toBe("1000 caixas a R$ 2,50")
  })
  it("id anônimo não contém o jid", () => {
    expect(idAnonimo("5511999998888@s.whatsapp.net", "s")).toMatch(/^[0-9a-f]{10}$/)
  })
})

describe("estimativa", () => {
  it("usa a tabela PRECO_IA: Sonnet custa menos que Opus e o total soma os dois", () => {
    const e = estimarCusto([1000, 1000])
    expect(e[0].entrada).toBe(2000)
    expect(e[0].saida).toBe(2 * SAIDA_MEDIA_TOKENS)
    expect(e[0].usd).toBeCloseTo((2000 * 4 + 1000 * 20) / 1e6)
    expect(e[1].usd).toBeCloseTo((2000 * 2 + 1000 * 10) / 1e6)
    expect(tabelaEstimativa({ 1: 1, 2: 1, 3: 0 }, [1000, 1000])).toContain("F1: 1, F2: 1, F3: 0")
  })
})

describe("relatório", () => {
  it("tem concordância, divergências, amostra e não leva o jid", () => {
    const pares: Par[] = ["a", "b", "c"].map((id, i) => ({ id, nivel: i + 1, entrada: "", por: { [O]: saida("Oi! Viu?"), [S]: saida("Oi, viu?") } }))
    const amostra = escolherAmostra(pares, 2).map(p => ({ id: p.id, nivel: p.nivel, opus: "Oi [NOME]", sonnet: "Olá [NOME]" }))
    expect(amostra.map(a => a.nivel)).toEqual([1, 2])
    const md = relatorioMarkdown({ pares, amostra, uso: {}, geradoEm: "2026-11-24" })
    expect(md).toContain("## Concordância por critério")
    expect(md).toContain("100.0% (3/3)")
    expect(md).toContain("## Amostra lado a lado (2 pares")
    expect(md).not.toContain("@s.whatsapp.net")
  })
})

describe("pedido do atendente (pura)", () => {
  const ms = [
    { id: "1", from_me: false, corpo: "Quero 3000 caixas", tipo: "conversation", ts: "2026-11-20T10:00:00Z" },
    { id: "2", from_me: true, corpo: "Já te mando", tipo: "conversation", ts: "2026-11-20T10:05:00Z" },
  ]
  const base = () => {
    const { contexto, origem } = contextoDaConversa({ conv: { jid: "x@s.whatsapp.net", nome: "Ana" }, cards: [], mensagens: ms, primeiraTs: ms[0].ts, agoraMs: new Date("2026-11-24T12:00:00Z").getTime() })
    return { contexto, origem, historico: historicoDaConversa(ms, { numero: new Map() }) }
  }
  const pedido = (opts: Parameters<typeof pedidoAtendente>[0]["opts"]) => pedidoAtendente({
    modelo: O, cfg: { guiaAtendimento: "GUIA", filtroLeads: "FILTRO" }, opts, ...base(), historicoAnterior: "", blocos: [], nomeConversa: "Ana", agora: "Agora: teste",
  })
  it("mantém modelo, esforço, max_tokens, esquema e cache do atendente", () => {
    const p = pedido({ automatico: true, followUp: 2 })
    expect(p.model).toBe(O)
    expect(p.max_tokens).toBe(6000)
    expect(p.output_config.effort).toBe("medium")
    expect(p.system[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" })
    expect(p.system[0].text).toContain("<guia>\nGUIA\n</guia>")
    const texto = (p.messages[0].content[0] as { text: string }).text
    expect(texto).toContain("Follow-up 2 de 3")
    expect(texto).toContain("Nome para chamar: Ana")
    expect(texto).toContain("Agora: teste")
    expect(texto).toContain("Modo automático")
    expect(texto.endsWith("Prepare a próxima mensagem do Felipe.")).toBe(true)
  })
  it("o nível 3 avisa que é o último e o modelo só muda o campo model", () => {
    const a = pedido({ automatico: true, followUp: 3 }), b = pedidoAtendente({ ...{ modelo: S, cfg: { guiaAtendimento: "GUIA", filtroLeads: "FILTRO" }, opts: { automatico: true, followUp: 3 as const }, ...base(), historicoAnterior: "", blocos: [], nomeConversa: "Ana", agora: "Agora: teste" } })
    expect(JSON.stringify(a.messages)).toContain("É o último")
    expect({ ...a, model: S }).toEqual(b)
  })
})
