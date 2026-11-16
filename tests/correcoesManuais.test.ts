import { describe, it, expect } from "vitest"
import { registrarCorrecao, correcoesParecidas, sugerirAjustes, aplicarSugestao, desfazerAjuste, chaveDaCorrecao } from "@/app/lib/aprendizado"
import { normalizarProducao } from "@/app/lib/producao"
import { config } from "./fixtures"

const cfg0 = config()
const forn = normalizarProducao(cfg0.producao).fornecedores.find(f => f.ativo && f.servicos.corteVinco)!
const corr = (cliente: string, motor: number, manual: number, tipo: "preco" | "motor" | "excecao" = "motor", motivo = "") =>
  ({ cliente, quantidade: 1000, etapa: "corteVinco", fornecedorId: forn.id, fornecedor: forn.nome, motor, manual, todas: false, tipo, motivo })
const hoje = new Date("2026-11-16T12:00:00Z")

describe("correções do motor no orçamento", () => {
  it("3 clientes corrigindo o corte e vinco ~20% para cima viram sugestão de calibragem, com os motivos", () => {
    let cfg = cfg0
    cfg = registrarCorrecao(cfg, corr("Perfumaria Modelo", 100, 120, "preco", "subiu o milheiro"), hoje)
    cfg = registrarCorrecao(cfg, corr("Óleos Exemplo", 150, 182), hoje)
    expect(correcoesParecidas(cfg, corr("x", 1, 1), hoje)).toBe(2)
    cfg = registrarCorrecao(cfg, corr("Aromas Teste", 200, 238, "motor", "fornecedor cobra acerto maior"), hoje)
    const s = sugerirAjustes([], cfg, hoje).find(x => x.origem === "correcoes")!
    expect(s).toBeTruthy()
    expect(s.titulo).toContain("suas correções")
    expect(s.fator).toBeCloseTo(540 / 450, 2)
    expect(s.motivos).toEqual(["fornecedor cobra acerto maior", "subiu o milheiro"])
    // aplica e desfaz
    const aplicado = aplicarSugestao(cfg, s, "2026-11-16")
    const f2 = normalizarProducao(aplicado.producao).fornecedores.find(f => f.id === forn.id)!
    expect(f2.servicos.corteVinco).not.toEqual(forn.servicos.corteVinco)
    const aj = normalizarProducao(aplicado.producao).aprendizado!.ajustes[0]
    const desfeito = desfazerAjuste(aplicado, aj.id)
    expect(normalizarProducao(desfeito.producao).fornecedores.find(f => f.id === forn.id)!.servicos.corteVinco).toEqual(forn.servicos.corteVinco)
  })
  it("exceção não ensina; o mesmo cliente conta uma vez só", () => {
    let cfg = cfg0
    cfg = registrarCorrecao(cfg, corr("Perfumaria Modelo", 100, 130), hoje)
    cfg = registrarCorrecao(cfg, { ...corr("Perfumaria Modelo", 200, 260), quantidade: 3000 }, hoje)
    cfg = registrarCorrecao(cfg, corr("Óleos Exemplo", 100, 130, "excecao", "cliente negociou"), hoje)
    cfg = registrarCorrecao(cfg, corr("Aromas Teste", 100, 130), hoje)
    expect(correcoesParecidas(cfg, corr("x", 1, 1), hoje)).toBe(2)
    expect(sugerirAjustes([], cfg, hoje).filter(x => x.origem === "correcoes")).toHaveLength(0)
  })
  it("chave por ponto do motor", () => {
    expect(chaveDaCorrecao({ etapa: "faca" })).toBe("faca")
    expect(chaveDaCorrecao({ etapa: "papel", materialId: "cartao300" })).toBe("papel|cartao300")
    expect(chaveDaCorrecao({ etapa: "verniz", fornecedorId: "f1" })).toBe("servico|acabamento|f1")
    expect(chaveDaCorrecao({ etapa: "arte" })).toBeNull()
  })
})
