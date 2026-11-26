import { describe, it, expect, vi } from "vitest"
import { readFileSync } from "node:fs"
import { gravarPerda, corpoPerda, nomeConfere, podeExcluirDefinitivo } from "@/app/lib/perdido"
import { COL_PERDIDO } from "@/app/types"

describe("X do card = Marcar como Perdido", () => {
  it("vai para a coluna Perdido (10) com o motivo, só por PATCH", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true })
    expect(await gravarPerda(f, "c1", "  Preço alto ")).toBe(true)
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe("/api/kanban/c1")
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body)).toEqual({ coluna: COL_PERDIDO, motivoPerdido: "Preço alto" })
    expect(COL_PERDIDO).toBe(10)
  })
  it("sem motivo não grava nada", async () => {
    const f = vi.fn()
    expect(await gravarPerda(f, "c1", "   ")).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
  it("nenhuma chamada do fluxo é DELETE", async () => {
    const f = vi.fn().mockResolvedValue({})
    await gravarPerda(f, "c1", "Sumiu")
    expect(f.mock.calls.every(c => c[1]?.method !== "DELETE")).toBe(true)
    expect(corpoPerda("x")).not.toHaveProperty("DELETE")
  })
  it("o botão X do Kanban não chama onDelete nem confirm de remoção", () => {
    const src = readFileSync("app/components/KanbanView.tsx", "utf8")
    expect(src).not.toMatch(/Remover do quadro/)
    expect(src).not.toMatch(/onDelete/)
    expect(src).toMatch(/Marcar como Perdido/)
  })
  it("Excluir definitivamente: só admin e só digitando o nome do cliente", () => {
    expect(podeExcluirDefinitivo("admin")).toBe(true)
    expect(podeExcluirDefinitivo("diretor")).toBe(false)
    expect(podeExcluirDefinitivo(null)).toBe(false)
    expect(nomeConfere(" gráfica alfa ", "Gráfica Alfa")).toBe(true)
    expect(nomeConfere("Gráfica", "Gráfica Alfa")).toBe(false)
    expect(nomeConfere("", "")).toBe(false)
  })
})
