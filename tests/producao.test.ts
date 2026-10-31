import { describe, it, expect } from "vitest"
import { desfazerMovimentosAteColuna, movimentosPorEtapa, normalizarProducao, MovimentoFornecedor } from "@/app/lib/producao"
import { config } from "./fixtures"

const k = "card-1"
const mov = (id: string, etapa: MovimentoFornecedor["etapa"], recebido?: boolean, key = k): MovimentoFornecedor =>
  ({ id, pedidoKey: key, pedidoLabel: "P", fornecedorId: "jero", etapa, enviadoEm: "2026-10-01", recebidoEm: recebido ? "2026-10-05" : undefined })

describe("voltar o pedido no quadro", () => {
  const base = normalizarProducao({ movimentos: [
    mov("auto-a", "arte", true), mov("auto-i", "impressao", true), mov("auto-c", "acabamento"),
    mov("manual", "colagem"), mov("auto-outro", "arte", false, "card-2"),
  ] })
  const ids = (c: number) => desfazerMovimentosAteColuna(base, k, c)?.map(m => `${m.id}${m.recebidoEm ? "✓" : ""}`)

  it("de acabamento para impressão: some o envio ao acabamento e a impressão reabre", () => {
    expect(ids(5)).toEqual(["auto-a✓", "auto-i", "manual", "auto-outro"])
  })
  it("para orçamento: somem todos os envios automáticos do pedido; manuais e de outros pedidos ficam", () => {
    expect(ids(0)).toEqual(["manual", "auto-outro"])
  })
  it("sem mudança quando ainda está depois de tudo", () => {
    expect(desfazerMovimentosAteColuna(base, k, 8)).toBeNull()
  })
})

describe("automação de envios", () => {
  it("impressão abre envio ao impressor; acabamento recebe a impressão e envia ao acabamento", () => {
    const p = normalizarProducao(config().producao)
    const imp = movimentosPorEtapa(p, k, "P", 5, "jero", "2026-10-01")!
    expect(imp.find(m => m.etapa === "impressao" && !m.recebidoEm)?.fornecedorId).toBe("jero")
    const acab = movimentosPorEtapa({ ...p, movimentos: imp }, k, "P", 6, "jero", "2026-10-03", ["verniz", "corteVinco"])!
    expect(acab.find(m => m.etapa === "impressao")?.recebidoEm).toBe("2026-10-03")
    expect(acab.some(m => m.fornecedorId === "acab" && !m.recebidoEm)).toBe(true)
  })
})
