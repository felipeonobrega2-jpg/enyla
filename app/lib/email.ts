// Envio de e-mail pela Resend (https://resend.com). Sem RESEND_API_KEY configurada, não envia nada (e diz por quê):
// o resto do sistema segue igual. Remetente e "responder para" vêm das variáveis da Vercel.
import type { Email } from "./emailsEnyla"

export const emailConfigurado = () => !!process.env.RESEND_API_KEY

export async function enviarEmail(para: string, e: Email): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const chave = process.env.RESEND_API_KEY
  if (!chave) return { ok: false, erro: "e-mail ainda não configurado (falta a chave da Resend)" }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(para)) return { ok: false, erro: "e-mail inválido" }
  const de = process.env.EMAIL_REMETENTE || "ENYLA Embalagens <parceiros@enyla.com.br>"
  const responder = process.env.EMAIL_RESPONDER_PARA
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: de, to: [para], subject: e.assunto, html: e.html, text: e.texto, ...(responder ? { reply_to: responder } : {}) }),
      signal: AbortSignal.timeout(10_000),
    })
    const j = await r.json().catch(() => ({})) as { id?: string; message?: string }
    return r.ok && j.id ? { ok: true, id: j.id } : { ok: false, erro: j.message ?? `Resend respondeu ${r.status}` }
  } catch (err) { return { ok: false, erro: String(err) } }
}
