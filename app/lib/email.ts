// Envio de e-mail pela Resend (https://resend.com). Sem RESEND_API_KEY configurada, não envia nada (e diz por quê):
// o resto do sistema segue igual. Remetente e "responder para" vêm das variáveis da Vercel.
import type { Email } from "./emailsEnyla"

// Limite da Resend: 10 requisições por segundo por time (compartilhado entre todas as chaves). Ficamos bem abaixo (~3/s)
// para sobrar para o resto do sistema; em 429 respeita o Retry-After e tenta de novo poucas vezes.
export const PAUSA_ENTRE_EMAILS_MS = 350
export const MAX_TENTATIVAS_429 = 3
const MAX_ESPERA_429_MS = 10_000
const dormir = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
let ultimaChamada = 0

async function esperarVez() {
  const falta = ultimaChamada + PAUSA_ENTRE_EMAILS_MS - Date.now()
  ultimaChamada = Math.max(Date.now(), ultimaChamada + PAUSA_ENTRE_EMAILS_MS)  // reserva a vez antes de dormir (chamadas concorrentes não furam a fila)
  if (falta > 0) await dormir(falta)
}

/** Retry-After em segundos (ou data HTTP). Sem valor válido, 1s; no máximo 10s. */
export function esperaDoRetryAfter(v: string | null): number {
  const n = Number(v)
  const ms = v && Number.isFinite(n) ? n * 1000 : v && Number.isFinite(Date.parse(v)) ? Date.parse(v) - Date.now() : 1000
  return Math.min(Math.max(ms, 500), MAX_ESPERA_429_MS)
}

export const emailConfigurado = () => !!process.env.RESEND_API_KEY

export async function enviarEmail(para: string, e: Email, anexos: { nome: string; base64: string }[] = [], opcoes: { de?: string; responderPara?: string } = {}): Promise<{ ok: true; id: string } | { ok: false; erro: string; status?: number; cota?: boolean }> {
  const chave = process.env.RESEND_API_KEY
  if (!chave) return { ok: false, erro: "e-mail ainda não configurado (falta a chave da Resend)" }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(para)) return { ok: false, erro: "e-mail inválido" }
  const de = opcoes.de || process.env.EMAIL_REMETENTE || "ENYLA Embalagens <parceiros@enyla.com.br>"
  // opcoes.responderPara vale só para quem pede (Prospector); as demais mensagens seguem com EMAIL_RESPONDER_PARA
  const responder = opcoes.responderPara || process.env.EMAIL_RESPONDER_PARA
  try {
    const corpo = JSON.stringify({ from: de, to: [para], subject: e.assunto, html: e.html, text: e.texto, ...(responder ? { reply_to: responder } : {}), ...(anexos.length ? { attachments: anexos.map(a => ({ filename: a.nome, content: a.base64 })) } : {}) })
    let r: Response
    for (let tentativa = 1; ; tentativa++) {
      await esperarVez()
      r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
        body: corpo,
        signal: AbortSignal.timeout(anexos.length ? 30_000 : 10_000),
      })
      if (r.status !== 429 || tentativa >= MAX_TENTATIVAS_429) break
      await dormir(esperaDoRetryAfter(r.headers.get("retry-after")))
    }
    const j = await r.json().catch(() => ({})) as { id?: string; message?: string; name?: string }
    if (r.ok && j.id) return { ok: true, id: j.id }
    // cota diária/mensal esgotada (429 com name *_quota_exceeded): quem chama pode guardar na fila em vez de perder
    const cota = r.status === 429 && /quota/i.test(`${j.name ?? ""} ${j.message ?? ""}`)
    return { ok: false, erro: j.message ?? `Resend respondeu ${r.status}`, status: r.status, ...(cota ? { cota: true } : {}) }
  } catch (err) { return { ok: false, erro: String(err) } }
}
