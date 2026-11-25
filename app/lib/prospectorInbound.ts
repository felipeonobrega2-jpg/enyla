// Entrada das respostas de e-mail do Prospector (webhook email.received da Resend): regras puras. Nada aqui envia mensagem.
import { createHmac, timingSafeEqual } from "node:crypto"
import { emailValido } from "./prospectorEnvio"

export const TOLERANCIA_ASSINATURA_S = 300

/** Verificação Svix (a que a Resend usa) no corpo cru. Segredo ausente ou cabeçalho faltando/errado: false. */
export function assinaturaValida(corpoCru: string, h: { id?: string | null; timestamp?: string | null; assinatura?: string | null }, segredo: string | undefined, agora: Date = new Date()): boolean {
  if (!segredo || !h.id || !h.timestamp || !h.assinatura) return false
  const ts = Number(h.timestamp)
  if (!Number.isFinite(ts) || Math.abs(agora.getTime() / 1000 - ts) > TOLERANCIA_ASSINATURA_S) return false
  const chave = Buffer.from(segredo.startsWith("whsec_") ? segredo.slice(6) : segredo, "base64")
  if (!chave.length) return false
  const esperado = createHmac("sha256", chave).update(`${h.id}.${h.timestamp}.${corpoCru}`).digest()
  return h.assinatura.split(" ").some(par => {
    const [versao, sig] = par.split(",")
    if (versao !== "v1" || !sig) return false
    const b = Buffer.from(sig, "base64")
    return b.length === esperado.length && timingSafeEqual(b, esperado)
  })
}

/** "Fulano <a@b.com>" ou "a@b.com" → só o e-mail, em minúsculas, pela regra de emailValido. */
export function enderecoDoRemetente(from: unknown): string | null {
  if (typeof from !== "string") return null
  const m = from.match(/<([^<>]+)>\s*$/)
  return emailValido(m ? m[1] : from)
}
