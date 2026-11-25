import { describe, it, expect } from "vitest"
import { FILTRO_PADRAO } from "@/app/lib/agenteLeads"
import { pedidoAtendente } from "@/app/lib/pedidoAtendente"
import { pedidoClassificador } from "@/app/lib/classificarLead"

const BEM_VINDO = /medicamento, farmácia, peptídeo e suplemento/i
const PROIBIDO = /dono da marca|marca de (outra empresa|terceiro)|recus\w+ (medicamento|farmácia)/i

describe("medicamento, farmácia, peptídeo e suplemento são bem-vindos", () => {
  it("filtro padrão", () => {
    expect(FILTRO_PADRAO).toMatch(BEM_VINDO)
    expect(FILTRO_PADRAO).not.toMatch(PROIBIDO)
  })
  it("prompt do Atendente", () => {
    const r = pedidoAtendente({ modelo: "m", cfg: {} as never, opts: {} as never, contexto: "", origem: "", historico: "", historicoAnterior: "", blocos: [], nomeConversa: null })
    const s = JSON.stringify(r.system)
    expect(s).toMatch(BEM_VINDO)
    expect(s).toMatch(/Nunca desqualifique/)
    expect(s).not.toMatch(PROIBIDO)
  })
  it("pedido do classificador", () => {
    const r = pedidoClassificador({ modelo: "m", nome: null, texto: "oi", filtro: FILTRO_PADRAO, ensinado: "" })
    const s = JSON.stringify(r.system)
    expect(s).toMatch(BEM_VINDO)
    expect(s).toMatch(/NÃO é motivo para nao_lead/)
  })
})
