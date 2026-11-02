import { describe, it, expect, beforeAll } from "vitest"

beforeAll(() => { process.env.AUTH_SECRET = "segredo-de-teste" })

describe("link de gravação pelo celular", () => {
  it("vale para a conversa por 10 minutos", async () => {
    const { criarTokenGravacao, lerTokenGravacao } = await import("@/app/lib/tokenGravacao")
    const agora = 1_700_000_000_000
    const { token } = criarTokenGravacao("123@lid", "Camilo", agora)
    expect(lerTokenGravacao(token, agora + 60_000)).toMatchObject({ jid: "123@lid", nome: "Camilo" })
    expect(lerTokenGravacao(token, agora + 11 * 60_000)).toBeNull()
  })
  it("adulterado não vale", async () => {
    const { criarTokenGravacao, lerTokenGravacao } = await import("@/app/lib/tokenGravacao")
    const { token } = criarTokenGravacao("123@lid", "Camilo")
    const [dados, sig] = token.split(".")
    const outro = Buffer.from(JSON.stringify({ j: "999@lid", n: "X", e: Date.now() + 60_000 })).toString("base64url")
    expect(lerTokenGravacao(`${outro}.${sig}`)).toBeNull()
    expect(lerTokenGravacao(`${dados}.xxx`)).toBeNull()
    expect(lerTokenGravacao("")).toBeNull()
  })
})
