// Link para gravar um áudio pelo celular (QR code na conversa). Leva a conversa e a validade, assinados com o
// segredo do servidor: só envia áudio para aquela conversa e só por 10 minutos. Só roda no servidor.

import { timingSafeEqual } from "crypto"
import { assinar } from "./aprovacao"

export const VALIDADE_GRAVACAO_MIN = 10

export function criarTokenGravacao(jid: string, nome: string, agora = Date.now()) {
  const expira = agora + VALIDADE_GRAVACAO_MIN * 60_000
  const dados = Buffer.from(JSON.stringify({ j: jid, n: nome.slice(0, 60), e: expira })).toString("base64url")
  return { token: `${dados}.${assinar("gravar", dados, 22)}`, expira }
}

export function lerTokenGravacao(token: string | null | undefined, agora = Date.now()): { jid: string; nome: string; expira: number } | null {
  const [dados, sig] = (token ?? "").split(".")
  if (!dados || !sig) return null
  const esperado = Buffer.from(assinar("gravar", dados, 22)), recebido = Buffer.from(sig)
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null
  try {
    const o = JSON.parse(Buffer.from(dados, "base64url").toString()) as { j: string; n: string; e: number }
    return o.e > agora ? { jid: o.j, nome: o.n, expira: o.e } : null
  } catch { return null }
}
