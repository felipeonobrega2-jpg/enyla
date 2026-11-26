import { describe, it, expect } from "vitest"
import {
  travaOffset, temEstrelaPerto, jaOrcado, faltaParaFichaOffset, textoFichaOffset, ehLeadOffset, ehQuantidadeOffset,
  ROTEIRO_OFFSET, TEXTO_PRAZO_NO_ORCAMENTO, TEXTO_FECHO_FICHA,
} from "@/app/lib/offsetRoteiro"
import { idPerto } from "@/app/lib/perto"
import { pedidoAtendente } from "@/app/lib/pedidoAtendente"
import { textoAvisoMql } from "@/app/lib/agenteLeads"
import type { DadosPedido } from "@/app/lib/atendente"

const ok = { fichaCompleta: false }
const JID = "5500000000000@s.whatsapp.net"

describe("trava 1: nunca preço nem prazo de Offset", () => {
  it.each([
    "Fica R$ 2,10 a unidade. Qual o acabamento?",
    "O unitário fica em torno de 2 reais.",
    "Em média sai por 1.800 reais o milheiro.",
    "Consigo dar um desconto se fechar hoje.",
    "Posso cobrir o outro orçamento.",
    "A faixa de preço fica entre 1 e 2.",
  ])("tira a frase de preço: %s", t => {
    const r = travaOffset(`${t} Qual o acabamento?`, ok)
    expect(r.reescrita).toBe(true)
    expect(r.motivos).toContain("preco")
    expect(r.resposta).not.toMatch(/R\$|reais|desconto|cubr|faixa|unit[aá]rio/i)
  })
  it.each([
    "O prazo é de 7 a 14 dias úteis.",
    "Fica pronto em 20 dias.",
    "Entregamos até sexta.",
    "O prazo de produção é de 3 semanas, pronto em dezembro.",
  ])("tira a frase de prazo: %s", t => {
    const r = travaOffset(t, ok)
    expect(r.motivos).toContain("prazo")
    expect(r.resposta).toBe(TEXTO_PRAZO_NO_ORCAMENTO)
  })
  it("preço sem nada útil sobrando: ficha completa fecha sem número; incompleta pede a ficha", () => {
    expect(travaOffset("Fica R$ 1,90 a unidade.", { fichaCompleta: true }).resposta).toBe(TEXTO_FECHO_FICHA)
    const inc = travaOffset("Fica R$ 1,90 a unidade.", ok).resposta
    expect(inc).toMatch(/depende da quantidade/)
    expect(inc).not.toMatch(/\d/)
  })
  it("resposta limpa passa intacta", () => {
    const t = "O prazo de produção vai no orçamento, quando ele ficar pronto."
    expect(travaOffset(t, ok)).toEqual({ resposta: t, reescrita: false, motivos: [] })
    expect(travaOffset("Consegue me passar a medida interna da caixa, em cm?", ok).reescrita).toBe(false)
  })
})

describe("trava 3: não pede cidade, CEP, frete nem data de entrega", () => {
  it.each([
    "Qual a sua cidade?",
    "Me passa o CEP para eu orçar.",
    "Para quando você precisa?",
    "Qual a data de entrega que você quer?",
    "Você precisa de frete?",
  ])("tira o pedido: %s", t => {
    const r = travaOffset(`${t} A impressão é só por fora?`, ok)
    expect(r.motivos).toContain("cidade")
    expect(r.resposta).toBe("A impressão é só por fora?")
  })
  it("explicar o frete (só se o lead perguntou) passa, sem valor", () => {
    const t = "O frete é calculado no final, pelo CEP."
    expect(travaOffset(t, ok)).toEqual({ resposta: t, reescrita: false, motivos: [] })
  })
})

describe("trava 4: nunca '1.000 por arte'", () => {
  it.each([
    "O mínimo é de 1.000 por arte.",
    "Precisa de 1.000 de cada arte.",
    "Mínimo de 1000 por modelo.",
    "São mil por fragrância.",
  ])("tira: %s", t => {
    const r = travaOffset(t, ok)
    expect(r.motivos).toContain("arte")
    expect(r.resposta).not.toMatch(/1\.?000|mil/)
  })
  it("a resposta certa (total ~1.000, conta da chapa é do Felipe) passa", () => {
    const t = "O pedido mínimo no Offset fica em torno de 1.000 no total. Me confirma quantas artes e quantas unidades de cada."
    expect(travaOffset(t, ok).reescrita).toBe(false)
  })
})

describe("trava 2: estrela do Felipe no Perto de você", () => {
  it("a marca do Felipe (perto|jid|nota) conta; outra conversa, dispensa e outros ids não", () => {
    expect(temEstrelaPerto([idPerto(JID, "quente")], JID)).toBe(true)
    expect(temEstrelaPerto([idPerto(JID)], JID)).toBe(true)    // estrela sem nota também é marca do Felipe
    expect(temEstrelaPerto([idPerto("5511@s.whatsapp.net", "x")], JID)).toBe(false)
    expect(temEstrelaPerto([`pertofora|${JID}`, `assumida|${JID}`], JID)).toBe(false)
    expect(temEstrelaPerto([], JID)).toBe(false)
  })
})

describe("trava 5: lead já orçado não sobe de novo", () => {
  const msg = (ts: string, from_me: boolean, corpo: string | null, tipo = "conversation", id = ts) => ({ id, ts, from_me, corpo, tipo })
  const pergunta = msg("2026-11-20T10:00:00Z", false, "Quanto custa 2000 caixas 5x5x10 cm?")
  it("o Felipe mandou PDF: já orçado", () => {
    const r = jaOrcado({ jid: JID, mensagens: [pergunta, msg("2026-11-20T11:00:00Z", true, null, "documentMessage")] })
    expect(r.orcado).toBe(true)
  })
  it("proposta enviada ou com número ORC: já orçado; aguardando não", () => {
    expect(jaOrcado({ jid: JID, mensagens: [pergunta], propostas: [{ jid: JID, status: "enviada" }] }).orcado).toBe(true)
    expect(jaOrcado({ jid: JID, mensagens: [pergunta], propostas: [{ jid: JID, status: "aguardando", numero: "ORC-0001" }] }).orcado).toBe(true)
    expect(jaOrcado({ jid: JID, mensagens: [pergunta], propostas: [{ jid: JID, status: "aguardando" }] }).orcado).toBe(false)
    expect(jaOrcado({ jid: JID, mensagens: [pergunta], propostas: [{ jid: "outro@s", status: "enviada" }] }).orcado).toBe(false)
  })
  it("mensagem do agente com valor não conta como orçamento do Felipe", () => {
    const r = jaOrcado({ jid: JID, mensagens: [pergunta, msg("2026-11-20T11:00:00Z", true, "R$ 1,00 a unidade", "conversation", "AG1")], idsDoAgente: ["AG1"] })
    expect(r.orcado).toBe(false)
  })
})

describe("ficha de 6 itens e aviso ao Felipe", () => {
  const base: DadosPedido = { produto: "perfume", volume_ml: 50, caixa_cm: { frente: 6, lateral: 6, altura: 14 }, frasco_cm: null, quantidade: 3000, tem_arte: null, referencia: null, acabamento: "laminação fosca, triplex 300 g", modelos: 3, resumo: "" }
  const completa: DadosPedido = { ...base, offset: { formato: "cartucho", janela: "não", modelos_detalhe: "1.000 de cada", impressao_faca: "só por fora; já tem faca", arte_formato: null, concorrente: null, formato_novo: null, recado: null, marca: null } }
  it("faltando item aponta qual; completa devolve null (referência e arte não são obrigatórias)", () => {
    expect(faltaParaFichaOffset(base)).toMatch(/formato.*janela.*impressão/)
    expect(faltaParaFichaOffset(completa)).toBeNull()
    expect(faltaParaFichaOffset(null)).toMatch(/faltam/)
  })
  it("o texto usa 'não informado' e não inventa nada", () => {
    const t = textoFichaOffset({ perfil: "icp", estrela: false, dados: base })
    expect(t).toMatch(/FICHA OFFSET — pronta para o Felipe orçar/)
    expect(t).toMatch(/1\. Formato: não informado/)
    expect(t).toMatch(/Preço de concorrente.*não informado/)
    expect(t).toMatch(/Estrela no Perto de você: não/)
  })
  it("textoAvisoMql usa a ficha quando vem fichaOffset; sem ela, o aviso de sempre", () => {
    const f = textoFichaOffset({ perfil: "icp", estrela: false, dados: completa })
    expect(textoAvisoMql({ nome: null, telefone: null, perfil: "icp", quantidade: 3000, motivo: "", dados: completa, fichaOffset: f })).toContain("FICHA OFFSET")
    expect(textoAvisoMql({ nome: null, telefone: null, perfil: "icp", quantidade: 3000, motivo: "", dados: completa })).toContain("Pronto para orçar")
  })
})

describe("quando vale o roteiro", () => {
  it("1.000 ou mais é Offset; menos não", () => {
    expect(ehQuantidadeOffset(1000)).toBe(true)
    expect(ehQuantidadeOffset(999)).toBe(false)
    expect(ehLeadOffset({ perfil: "pequeno", quantidade_total: 300 })).toBe(false)
    expect(ehLeadOffset({ perfil: "icp", quantidade_total: 5000 })).toBe(true)
    expect(ehLeadOffset({ perfil: "medio", quantidade_total: null })).toBe(true)
    expect(ehLeadOffset({ perfil: "indefinido", quantidade_total: null })).toBe(false)
  })
})

describe("o roteiro entra no prompt do Atendente", () => {
  it("system prompt traz o roteiro, e o texto do roteiro não traz preço nem prazo próprio", () => {
    const p = pedidoAtendente({ modelo: "m", cfg: {}, opts: {}, contexto: "", origem: "", historico: "", historicoAnterior: "", blocos: [], nomeConversa: null })
    const sys = p.system.map(b => b.text).join("\n")
    expect(sys).toContain("<roteiro_offset>")
    expect(sys).toContain("Perfeito. Vou preparar o seu orçamento e te retorno.")
    expect(ROTEIRO_OFFSET).not.toMatch(/R\$\s?\d/)
    expect(JSON.stringify(p.output_config.format.schema)).toContain("impressao_faca")
  })
})
