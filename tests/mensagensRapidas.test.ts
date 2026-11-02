import { describe, it, expect } from "vitest"
import { filtrar, preencher, Rapida } from "@/app/lib/mensagensRapidas"

const r = (atalho: string, corpo: string, ativa = true): Rapida => ({ id: atalho, atalho, corpo, quando_usar: "—", ativa, ordem: 0 })

describe("mensagens rápidas", () => {
  it("filtra por atalho ou texto, só as ativas", () => {
    const lista = [r("/oi", "Olá {{nome}}"), r("/pix", "Segue o link"), r("/velha", "x", false)]
    expect(filtrar(lista, "/p").map(x => x.atalho)).toEqual(["/pix"])
    expect(filtrar(lista, "/").map(x => x.atalho)).toEqual(["/oi", "/pix"])
  })
  it("preenche nome do cliente ligado e links só quando usados", async () => {
    let buscou = false
    const t = await preencher("Oi {{nome}}! Sua página: {{pagina_cliente}}", { contato: "Rani", cliente: "Raniere Péricles", links: { pagina: async () => "https://x/c/1", proposta: async () => { buscou = true; return "p" } } })
    expect(t).toBe("Oi Raniere! Sua página: https://x/c/1")
    expect(buscou).toBe(false)
  })
})
