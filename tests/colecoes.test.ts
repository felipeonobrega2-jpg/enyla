import { describe, it, expect } from "vitest"
import { COLECOES } from "@/app/lib/configAtomica"

const ida_volta = (col: string, v: unknown) => {
  const l = COLECOES[col].paraLinhas(v)
  return COLECOES[col].deLinhas([...l.entries()].map(([id, dados]) => ({ id, dados })))
}
describe("gaveta única: coleções em tabela", () => {
  it("lista com id: volta igual, na ordem do mais novo; id repetido fica o mais novo", () => {
    const ped = [{ id: "DIG-2", em: "2026-11-20" }, { id: "DIG-1", em: "2026-11-19" }, { id: "DIG-2", em: "2026-11-01", velho: true }]
    expect(ida_volta("pedidosDigitais", ped)).toEqual([{ id: "DIG-2", em: "2026-11-20" }, { id: "DIG-1", em: "2026-11-19" }])
  })
  it("mapa: chave → valor (memória por contato, apelidos)", () => {
    const m = { "55119@s.whatsapp.net": { em: "x", passos: { F1: "y" } }, "5521@s.whatsapp.net": { em: "z" } }
    expect(ida_volta("agenteMarcos", m)).toEqual(m)
    expect(ida_volta("apelidosWhatsapp", { "123@lid": "5511@s.whatsapp.net" })).toEqual({ "123@lid": "5511@s.whatsapp.net" })
  })
  it("conjunto: mantém a ordem (mais novo primeiro)", () => {
    expect(ida_volta("vigiaTentouV3", ["c", "b", "a"])).toEqual(["c", "b", "a"])
  })
})
