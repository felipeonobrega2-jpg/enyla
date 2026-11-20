import { describe, it, expect } from "vitest"
import { ehComandoDoDono, ehConfirmacao, ehCancelamento } from "@/app/lib/assistente"

describe("assistente do Felipe pelo WhatsApp", () => {
  const dono = "5511999042987"
  it("só a mensagem digitada por ele no chat 'você mesmo' vira comando", () => {
    expect(ehComandoDoDono({ fromMe: true, remoteJid: `${dono}@s.whatsapp.net`, id: "2A016A4F99" }, dono)).toBe(true)
    expect(ehComandoDoDono({ fromMe: true, remoteJid: `${dono}@s.whatsapp.net`, id: "3EB0BF1234" }, dono)).toBe(false)   // aviso do próprio sistema
    expect(ehComandoDoDono({ fromMe: false, remoteJid: `${dono}@s.whatsapp.net`, id: "2A01" }, dono)).toBe(false)
    expect(ehComandoDoDono({ fromMe: true, remoteJid: "5511988887777@s.whatsapp.net", id: "2A01" }, dono)).toBe(false)     // ele falando com cliente
    expect(ehComandoDoDono({ fromMe: true, remoteJid: `${dono}@s.whatsapp.net`, id: "2A01" }, null)).toBe(false)
  })
  it("confirma e cancela só com resposta clara", () => {
    for (const s of ["sim", "Sim!", "ok", "pode", "confirmo", "manda"]) expect(ehConfirmacao(s)).toBe(true)
    for (const s of ["simples assim", "talvez", "quanto vendi?"]) expect(ehConfirmacao(s)).toBe(false)
    for (const s of ["não", "nao", "cancela"]) expect(ehCancelamento(s)).toBe(true)
  })
})

describe("lote e número pessoal", () => {
  it("reconhece número de lote (não orçamento)", async () => {
    const { pareceLote } = await import("@/app/lib/assistente")
    for (const s of ["MAU-003", "fel-001", "OHP-004"]) expect(pareceLote(s)).toBe(true)
    for (const s of ["ORC-2026-204", "DIG-0012", "Maurício"]) expect(pareceLote(s)).toBe(false)
  })
  it("número pessoal (WhatsApp institucional): só mensagem recebida dele", async () => {
    const { ehDoNumeroPessoal } = await import("@/app/lib/assistente")
    expect(ehDoNumeroPessoal({ fromMe: false, remoteJid: "5511988887777@s.whatsapp.net" }, "(11) 98888-7777")).toBe(true)
    expect(ehDoNumeroPessoal({ fromMe: true, remoteJid: "5511988887777@s.whatsapp.net" }, "11988887777")).toBe(false)
    expect(ehDoNumeroPessoal({ fromMe: false, remoteJid: "5511988887777@s.whatsapp.net" }, null)).toBe(false)
  })
})

describe("memória da conversa inteira", () => {
  it("das mensagens antigas fica só o que foi combinado", async () => {
    const { resumoDoHistorico } = await import("@/app/lib/atendenteServidor")
    const r = resumoDoHistorico([
      { from_me: false, corpo: "bom dia", ts: "2026-09-01T12:00:00Z" },
      { from_me: false, corpo: "preciso de 2000 caixas de 50ml", ts: "2026-09-01T12:01:00Z" },
      { from_me: true, corpo: "fica R$ 1,72 a unidade, prazo de 12 dias", ts: "2026-09-01T12:05:00Z" },
      { from_me: false, corpo: "ok obrigado", ts: "2026-09-01T12:06:00Z" },
    ])
    expect(r).toContain("2000 caixas")
    expect(r).toContain("EU: fica R$ 1,72")
    expect(r).not.toContain("bom dia")
    expect(r).not.toContain("ok obrigado")
  })
})
