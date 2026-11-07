import { describe, it, expect } from "vitest"
import { pendencias, Sinais } from "../app/lib/pendenciasDono"
import { escolherMidia } from "../app/lib/midiaAgente"

const s = (x: Partial<Sinais> = {}): Sinais => ({
  env: { asaas: false, pluggy: true, lalamoveProducao: false, cronSecret: false }, pluggyItens: 1,
  metaSaldo: 0.49, metaDiasRestantes: 0, metaTokenExpira: "2026-12-31T00:00:00Z", metaTokenTipo: "usuario",
  iaRecargaEm: "2026-11-05T00:00:00Z", iaDiasRestantes: 12, designer: false, villa: false, videos: 0, feitos: {}, ...x,
})

describe("depende de você", () => {
  it("urgente primeiro, feito por último", () => {
    const l = pendencias(s(), new Date("2026-11-07T12:00:00Z").getTime())
    expect(l[0].nivel).toBe("urgente")
    expect(l.find(p => p.id === "ia-saldo")!.feito).toBe(true)
    expect(l.at(-1)!.feito).toBe(true)
    expect(l.find(p => p.id === "meta-saldo")!.feito).toBe(false)
  })
  it("token perto de vencer vira urgente; item manual marcado sai", () => {
    const l = pendencias(s({ feitos: { email: "x" } }), new Date("2026-12-20T12:00:00Z").getTime())
    expect(l.find(p => p.id === "meta-token")!.nivel).toBe("urgente")
    expect(l.find(p => p.id === "email")!.feito).toBe(true)
  })
  it("biblioteca: o vídeo menos usado e ativo", () => {
    const m = [
      { id: "a", url: "", mime: "video/mp4", nome: "", descricao: "", tipo: "video" as const, em: "1", usos: 3 },
      { id: "b", url: "", mime: "video/mp4", nome: "", descricao: "", tipo: "video" as const, em: "2", usos: 1 },
      { id: "c", url: "", mime: "video/mp4", nome: "", descricao: "", tipo: "video" as const, em: "0", usos: 0, ativo: false },
    ]
    expect(escolherMidia(m, "video")!.id).toBe("b")
    expect(escolherMidia(m, "foto")).toBeNull()
  })
})
