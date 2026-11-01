import { describe, it, expect } from "vitest"
import { medidasPeloNome, medidasPelosVincos, modeloPeloNome } from "../app/lib/dxf"

const vinco = (x1: number, y1: number, x2: number, y2: number) => ({
  type: "LINE", layer: "folds", nums: new Map([[10, [x1]], [20, [y1]], [11, [x2]], [21, [y2]]]),
})

describe("medidas da caixa pelo DXF", () => {
  it("lê L × P × A do nome do Pacdora", () => {
    expect(medidasPeloNome("dieline_de_caixa_com_fundo_automático_52×32×85_mm.dxf")).toEqual({ largura: 52, profundidade: 32, altura: 85 })
    expect(medidasPeloNome("Export_Dieline_2026-08-15.dxf")).toBeNull()
    expect(modeloPeloNome("dieline_de_caixa_com_fecho_inverso_20×20×40_mm (1).dxf")).toBe("Caixa com fecho inverso")
  })

  it("deduz pelos vincos do corpo do cartucho", () => {
    // painéis 52 | 32 | 52 | 32 com vincos de 85,3 mm (altura + espessura); abas horizontais menores
    const ents = [13, 65, 97, 149].map(x => vinco(x, 30.7, x, 116)).concat([vinco(13, 30.5, 64, 30.5), vinco(65, 30.5, 96, 30.5)])
    expect(medidasPelosVincos(ents)).toEqual({ largura: 52, profundidade: 32, altura: 85 })
  })

  it("sem vincos suficientes, não inventa", () => {
    expect(medidasPelosVincos([vinco(0, 0, 0, 50), vinco(10, 0, 10, 50)])).toBeNull()
  })
})
