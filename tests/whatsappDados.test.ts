import { describe, it, expect, vi, beforeEach } from "vitest"

// Banco falso: guarda o que o upsert de conversas recebeu
const upserts: Record<string, unknown>[][] = []
const gravadas = new Set<string>()   // mensagens já no banco (o upsert com ignoreDuplicates devolve só as novas)
const naoLidas: string[] = []
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (t: string) => ({
      select: () => ({ in: async () => ({ data: t === "whatsapp_conversas" ? [{ jid: "a@lid", ultima_at: "2026-10-01T00:00:00.000Z", ultima_msg: "mais nova", nome: "Ana", telefone: null, ultima_recebida_at: "2026-10-01T00:00:00.000Z", ultima_enviada_at: null }] : [] }) }),
      upsert: (linhas: Record<string, unknown>[]) => {
        if (t === "whatsapp_conversas") upserts.push(linhas)
        const novas = t === "whatsapp_mensagens" ? linhas.filter(l => !gravadas.has(l.id as string)) : []
        for (const l of novas) gravadas.add(l.id as string)
        const r = Promise.resolve({})
        return Object.assign(r, { select: async () => ({ data: novas.map(l => ({ id: l.id })) }) })
      },
    }),
    rpc: async (_f: string, a: { p_jid: string }) => { naoLidas.push(a.p_jid); return {} },
  },
}))
// Apelidos (mesma pessoa em dois identificadores): um já conhecido; juntar é observado
const juntadas: [string, string][] = []
vi.mock("@/app/lib/juntarConversas", () => ({
  lerApelidos: async () => ({ "velho@lid": "5511999990000@s.whatsapp.net" }),
  juntarConversas: async (sai: string, fica: string) => { juntadas.push([sai, fica]); return { ok: true, fica } },
  juntarGemeas: async () => 0,
}))
import { gravarLote, parDaMensagem } from "@/app/lib/whatsappDados"

const msg = (jid: string, id: string, ts: number, texto: string) => ({ key: { remoteJid: jid, fromMe: false, id }, pushName: "X", message: { conversation: texto }, messageTimestamp: ts })

describe("gravação em lote do WhatsApp", () => {
  beforeEach(() => { upserts.length = 0; juntadas.length = 0; gravadas.clear(); naoLidas.length = 0 })
  it("mesmo evento entregue duas vezes: só a primeira é nova (não conta não lida nem dispara o agente de novo)", async () => {
    const m = msg("c@lid", "77", Date.parse("2026-11-05") / 1000, "Posso encomendar?")
    const n1 = new Set<string>(), n2 = new Set<string>()
    await gravarLote([m], { contarNaoLidas: true, novas: n1 })
    await gravarLote([m], { contarNaoLidas: true, novas: n2 })
    expect([...n1]).toEqual(["77"])
    expect([...n2]).toEqual([])
    expect(naoLidas).toEqual(["c@lid"])
  })
  it("histórico antigo não apaga nem troca a prévia; toda linha leva os campos", async () => {
    await gravarLote([msg("a@lid", "1", Date.parse("2026-02-01") / 1000, "antiga"), msg("b@lid", "2", Date.parse("2026-03-01") / 1000, "nova b")])
    const [lote] = upserts
    const a = lote.find(c => c.jid === "a@lid")!, b = lote.find(c => c.jid === "b@lid")!
    expect(a.ultima_msg).toBe("mais nova")
    expect(a.ultima_at).toBe("2026-10-01T00:00:00.000Z")
    expect(b.ultima_msg).toBe("nova b")
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort())
  })

  it("mesma pessoa: mensagem do @lid com o número junto vai para a conversa do número e junta a antiga", async () => {
    const m = { key: { remoteJid: "36954@lid", remoteJidAlt: "556592476804@s.whatsapp.net", fromMe: false, id: "9" }, pushName: "Gildemar", message: { conversation: "oi" }, messageTimestamp: Date.parse("2026-11-02") / 1000 }
    await gravarLote([m])
    expect(upserts[0].map(c => c.jid)).toEqual(["556592476804@s.whatsapp.net"])
    expect(juntadas).toEqual([["36954@lid", "556592476804@s.whatsapp.net"]])
  })
  it("apelido já conhecido: mensagem só com o @lid cai na conversa do número", async () => {
    await gravarLote([msg("velho@lid", "10", Date.parse("2026-11-02") / 1000, "oi")])
    expect(upserts[0].map(c => c.jid)).toEqual(["5511999990000@s.whatsapp.net"])
    expect(juntadas).toEqual([])
  })
  it("par de identificadores", () => {
    expect(parDaMensagem({ remoteJid: "1@s.whatsapp.net", remoteJidAlt: "2@lid", fromMe: false, id: "x" })).toEqual({ lid: "2@lid", pn: "1@s.whatsapp.net" })
    expect(parDaMensagem({ remoteJid: "2@lid", fromMe: false, id: "x" })).toBeNull()
  })
})
