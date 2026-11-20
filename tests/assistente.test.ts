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
