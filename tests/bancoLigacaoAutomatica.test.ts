import { describe, it, expect } from "vitest"
import { bloqueiaLigacaoAutomatica, pagamentoDeFatura } from "@/app/lib/banco"

const tx = (descricao: string, valor = 500, historico: { em: string; acao: string }[] = []) => ({ descricao, valor, historico })

describe("ligação automática na sincronização", () => {
  it("1. pagamento de fatura/cartão nunca liga sozinho", () => {
    expect(pagamentoDeFatura("Pagamento de fatura")).toBe(true)
    expect(pagamentoDeFatura("PAGTO FATURA CARTAO")).toBe(true)
    expect(pagamentoDeFatura("Pix Gasolina")).toBe(false)
    expect(bloqueiaLigacaoAutomatica(tx("Pagamento de fatura"), { acao: "vincular" }, 500)).toMatch(/fatura/)
  })
  it("2. vincularVarios e somas (junto) não ligam sozinhos; 1 para 1 exato liga", () => {
    expect(bloqueiaLigacaoAutomatica(tx("Pix"), { acao: "vincularVarios" })).not.toBeNull()
    expect(bloqueiaLigacaoAutomatica(tx("Pix", 50), { acao: "vincular", junto: ["x"] }, 50)).not.toBeNull()
    expect(bloqueiaLigacaoAutomatica(tx("Pix", 50), { acao: "vincular" }, 60)).not.toBeNull()
    expect(bloqueiaLigacaoAutomatica(tx("Pix", 50), { acao: "vincular" }, 50)).toBeNull()
  })
  it("3. movimento desfeito não é religado sozinho", () => {
    expect(bloqueiaLigacaoAutomatica(tx("Pix", 50, [{ em: "x", acao: "vinculada" }, { em: "y", acao: "desfeito" }]), { acao: "vincular" }, 50)).toMatch(/desfeito/)
  })
})
