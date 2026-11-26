import { describe, it, expect } from "vitest"
import { escolherMidia, etapaValida, type MidiaAgente } from "../app/lib/midiaAgente"

const m = (id: string, etapa: MidiaAgente["etapa"], usos: number, extra: Partial<MidiaAgente> = {}): MidiaAgente =>
  ({ id, url: `https://x/${id}.mp4`, mime: "video/mp4", nome: `${id}.mp4`, descricao: id, tipo: "video", em: "2026-01-01T00:00:00Z", usos, etapa, ...extra })

describe("escolherMidia por etapa", () => {
  const lista = [m("a", "F1", 3), m("b", "F2", 5), m("c", "F2", 1), m("d", undefined, 0), m("e", "F2", 0, { ativo: false }), m("f", "reativacao", 0)]
  it("pega o menos usado ativo daquela etapa", () => { expect(escolherMidia(lista, "video", "F2")?.id).toBe("c") })
  it("sem vídeo da etapa, devolve nulo (só texto)", () => { expect(escolherMidia(lista, "video", "F3")).toBeNull() })
  it("ignora vídeo sem etapa quando a etapa é pedida", () => { expect(escolherMidia([m("d", undefined, 0)], "video", "F1")).toBeNull() })
  it("sem etapa pedida, mantém o comportamento antigo", () => { expect(escolherMidia(lista, "video")?.id).toBe("d") })
  it("valida etapa", () => { expect(etapaValida("F3")).toBe("F3"); expect(etapaValida("F4")).toBeUndefined() })
})
