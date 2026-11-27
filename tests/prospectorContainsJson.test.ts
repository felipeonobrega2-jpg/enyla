// Regressão #284: contains() com array de objetos serializava `{[object Object]}` (22P02 no Postgres).
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

async function urlGerada(valor: unknown): Promise<string> {
  let url = ""
  const cli = createClient("http://localhost", "chave", {
    global: { fetch: (async (u: unknown) => { url = String(u); return new Response("[]", { status: 200, headers: { "content-type": "application/json" } }) }) as typeof fetch },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await cli.from("t").select("id").contains("historico_etapas", valor as any)
  return decodeURIComponent(url)
}

describe("contains em historico_etapas", () => {
  it("JSON serializado gera filtro JSON válido", async () => {
    const u = await urlGerada(JSON.stringify([{ envio: { canal: "email" } }]))
    expect(u).toContain('historico_etapas=cs.[{"envio":{"canal":"email"}}]')
    expect(u).not.toContain("[object Object]")
  })
  it("nenhum contains de historico_etapas passa array cru", () => {
    for (const f of ["parceirosExterno", "prospectorEnvioServidor", "prospectorEventosServidor"]) {
      const src = readFileSync(`app/lib/${f}.ts`, "utf8")
      expect(src).not.toMatch(/contains\("historico_etapas", \[/)
    }
  })
})
