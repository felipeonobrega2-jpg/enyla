import { describe, it, expect } from "vitest"
import { REGRA_PRODUTO, FILTRO_PADRAO } from "@/app/lib/agenteLeads"
import { pedidoAtendente } from "@/app/lib/pedidoAtendente"
import { pedidoClassificador } from "@/app/lib/classificarLead"

// Sem chamar IA: só o texto do pedido
const sistema = (f: ReturnType<typeof pedidoAtendente>) => f.system.map(b => b.text).join("\n")
const atendente = (filtroLeads?: string) => sistema(pedidoAtendente({
  modelo: "m", cfg: { filtroLeads } as never, opts: {} as never, contexto: "", origem: "", historico: "", historicoAnterior: "", blocos: [], nomeConversa: null, agora: "agora",
}))
const classificador = (filtro: string) => pedidoClassificador({ modelo: "m", nome: null, texto: "oi", filtro, ensinado: "" }).system

const PERGUNTA_DONO = /(é|seja)\s+(o\s+)?(dono|proprietári[oa])\s+da\s+marca|pode\s+usar\s+a\s+marca|autoriza(ção|do)\s+da\s+marca/i
const RECUSA = /(não|nao)\s+(fa[çc]o|fazemos|atend\w+)[^.\n]*(marca\s+(de\s+)?(outra|terceiro|alheia)|medicament|farm[áa]cia|peptíd|suplement)/i

describe("regra de produto (25/11, 8h29)", () => {
  it("o texto novo está no filtro padrão, no atendente e no classificador", () => {
    expect(REGRA_PRODUTO).toMatch(/medicamento, farmácia, peptídeo, suplemento e de qualquer marca, inclusive marca de terceiro/)
    expect(FILTRO_PADRAO).toContain(REGRA_PRODUTO)
    expect(atendente()).toContain(REGRA_PRODUTO)
    expect(atendente("filtro editado pelo Felipe")).toContain(REGRA_PRODUTO)
    expect(classificador("filtro editado")).toContain(REGRA_PRODUTO)
    expect(classificador("filtro editado")).toMatch(/nunca viram nao_lead nem descem de perfil/)
  })
  it("nenhum prompt pergunta se o cliente é dono da marca nem recusa marca de terceiro ou medicamento", () => {
    for (const t of [FILTRO_PADRAO, atendente(), classificador(FILTRO_PADRAO)]) {
      expect(t.split(REGRA_PRODUTO).join("")).not.toMatch(PERGUNTA_DONO)
      expect(t.split(REGRA_PRODUTO).join("")).not.toMatch(RECUSA)
    }
  })
  it("a recusa de cigarro não é mexida por esta regra", () => {
    expect(REGRA_PRODUTO).not.toMatch(/cigarro/i)
  })
})
