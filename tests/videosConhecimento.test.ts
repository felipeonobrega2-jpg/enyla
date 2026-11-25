import { describe, it, expect } from "vitest"
import { lerMarcacoes, lerMinutagem, minutagem, resumirTranscricao, porArea, textoDaLicao, confirmacao, segmentosDaGroq, textoComMinutagem, DIRETOR_DA_AREA } from "@/app/lib/videosConhecimento"

describe("minutagem", () => {
  it("converte nos dois sentidos", () => {
    expect(lerMinutagem("12:30")).toBe(750)
    expect(lerMinutagem("1:02:03")).toBe(3723)
    expect(lerMinutagem("abc")).toBeNull()
    expect(minutagem(750)).toBe("12:30")
    expect(minutagem(3723)).toBe("1:02:03")
  })
  it("segmentos da Groq (verbose_json) ficam com início e fim", () => {
    const s = segmentosDaGroq({ segments: [{ start: 0, end: 4.2, text: " Oi " }, { start: 4.2, end: 9, text: "  " }, { start: 9, end: 12, text: "caixa" }] })
    expect(s).toEqual([{ inicio: 0, fim: 4.2, texto: "Oi" }, { inicio: 9, fim: 12, texto: "caixa" }])
    expect(textoComMinutagem(s)).toBe("[00:00] Oi\n[00:09] caixa")
  })
})

describe("parser de [CORTE] (15 a 45 s)", () => {
  it("aceita de 15 a 45 s e descarta o resto", () => {
    const r = lerMarcacoes([
      "[CORTE 00:10-00:25 preco] 15 s exatos: vale",
      "[CORTE 01:00-01:45 objecao] 45 s exatos: vale",
      "[CORTE 02:00-02:14 cliente] 14 s: curto demais",
      "[CORTE 03:00-03:46 producao] 46 s: longo demais",
      "[CORTE 05:00-04:00 preco] fim antes do início",
      "[CORTE 06:00-06:30 receita] tipo que não existe",
      "[CORTE 07:00-07:30 historia] conta história de cliente",
    ].join("\n"))
    expect(r.cortes.map(c => [c.inicio, c.fim, c.tipo])).toEqual([[10, 25, "preco"], [60, 105, "objecao"], [420, 450, "cliente"]])
    expect(r.descartados).toBe(4)
  })
  it("ignora linha fora do formato e aceita travessão e hora", () => {
    const r = lerMarcacoes("Claro! Aqui vai:\n- [CORTE 1:00:00 – 1:00:20 producao] mostra a faca\nconversa solta")
    expect(r.cortes).toEqual([{ inicio: 3600, fim: 3620, tipo: "producao", texto: "mostra a faca" }])
  })
})

describe("resumo por área (IA mockada)", () => {
  const segs = [{ inicio: 0, fim: 30, texto: "Orçamento acima de 5 mil sempre pede sinal de 50%." }]
  const ia = async () => [
    "[REGRA comercial] Orçamento acima de R$ 5 mil exige sinal de 50%.",
    "[REGRA Produção] Chapa nova só entra com a faca conferida.",
    "[REGRA financeiro] Não dar prazo de boleto a cliente novo.",
    "[REGRA marketing] Mostrar a produção nos anúncios.",
    "[REGRA juridico] área que não existe",
    "[CORTE 00:05-00:35 preco] preço de referência",
  ].join("\n")
  it("separa as regras por área e marca os cortes", async () => {
    let recebido = ""
    const r = await resumirTranscricao(segs, "25/11", async (sys, usr) => { recebido = usr; return ia() })
    expect(recebido).toContain("[00:00] Orçamento")
    const a = porArea(r.regras)
    expect(a.comercial).toHaveLength(1); expect(a.producao).toHaveLength(1); expect(a.financeiro).toHaveLength(1); expect(a.marketing).toHaveLength(1)
    expect(r.regras).toHaveLength(4)
    expect(r.cortes).toHaveLength(1)
    expect(r.descartados).toBe(1)
  })
  it("área vai para o diretor dono dela, com origem e link", () => {
    expect(DIRETOR_DA_AREA).toEqual({ comercial: "cco", marketing: "cmo", producao: "coo", financeiro: "cfo" })
    expect(textoDaLicao("Sinal de 50%.", "25/11", "whatsapp-midia/midia/X")).toBe("Sinal de 50%. (origem: vídeo de 25/11, whatsapp-midia/midia/X)")
  })
  it("confirmação ao Felipe", () => {
    expect(confirmacao(4, 0)).toBe("Vídeo recebido, 4 regras guardadas.")
    expect(confirmacao(1, 2)).toBe("Vídeo recebido, 1 regra guardada e 2 cortes marcados para a Lívia.")
  })
})
