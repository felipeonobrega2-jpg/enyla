import { describe, it, expect, vi, beforeEach } from "vitest"

// Banco falso: guarda o que o upsert de conversas recebeu
const upserts: Record<string, unknown>[][] = []
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (t: string) => ({
      select: () => ({ in: async () => ({ data: t === "whatsapp_conversas" ? [{ jid: "a@lid", ultima_at: "2026-10-01T00:00:00.000Z", ultima_msg: "mais nova", nome: "Ana", telefone: null }] : [] }) }),
      upsert: async (linhas: Record<string, unknown>[]) => { if (t === "whatsapp_conversas") upserts.push(linhas); return {} },
    }),
    rpc: async () => ({}),
  },
}))
import { gravarLote } from "@/app/lib/whatsappDados"

const msg = (jid: string, id: string, ts: number, texto: string) => ({ key: { remoteJid: jid, fromMe: false, id }, pushName: "X", message: { conversation: texto }, messageTimestamp: ts })

describe("gravação em lote do WhatsApp", () => {
  beforeEach(() => { upserts.length = 0 })
  it("histórico antigo não apaga nem troca a prévia; toda linha leva os campos", async () => {
    await gravarLote([msg("a@lid", "1", Date.parse("2026-02-01") / 1000, "antiga"), msg("b@lid", "2", Date.parse("2026-03-01") / 1000, "nova b")])
    const [lote] = upserts
    const a = lote.find(c => c.jid === "a@lid")!, b = lote.find(c => c.jid === "b@lid")!
    expect(a.ultima_msg).toBe("mais nova")
    expect(a.ultima_at).toBe("2026-10-01T00:00:00.000Z")
    expect(b.ultima_msg).toBe("nova b")
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort())
  })
})
