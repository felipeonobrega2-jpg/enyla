// Resposta de e-mail do Prospector: casa o remetente com o prospecto, guarda o texto, marca respondeu/opt_out.
// NUNCA envia nada: sem segundo contato, sem auto-resposta. Mesmo padrão de detectarRespostas (WhatsApp).
import { supabase } from "./supabase"
import { ehRecusa } from "./prospectorEnvio"
import { enderecoDoRemetente } from "./prospectorInbound"
import { COLUNAS, gravar, gravarOptOut, historicoDe, type Linha } from "./prospectorEnvioServidor"

export type EventoRecebido = { type?: string; data?: { email_id?: string } }
export type ResultadoInbound = { ok: boolean; status: number; motivo?: string; duplicado?: boolean; prospectos?: number; responderam?: number; optOuts?: number }

type Conteudo = { from?: unknown; to?: unknown; subject?: unknown; text?: unknown; html?: unknown; created_at?: unknown }

export async function buscarConteudo(emailId: string): Promise<Conteudo | null> {
  const chave = process.env.RESEND_API_KEY
  if (!chave) return null
  const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, { headers: { Authorization: `Bearer ${chave}` }, signal: AbortSignal.timeout(10_000) })
  return r.ok ? ((await r.json()) as Conteudo) : null
}

const semHtml = (h: string) => h.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
const escLike = (s: string) => s.replace(/[\\%_]/g, c => `\\${c}`)

export async function processarEmailRecebido(evento: EventoRecebido, agora: Date = new Date(), buscar = buscarConteudo): Promise<ResultadoInbound> {
  if (evento.type !== "email.received") return { ok: true, status: 200, motivo: "evento ignorado" }
  const emailId = evento.data?.email_id
  if (!emailId || typeof emailId !== "string") return { ok: false, status: 400, motivo: "sem email_id" }

  // Já gravado (retry da Resend): não grava nem muda etapa de novo.
  const ja = await supabase.from("prospectos_emails_recebidos").select("id").eq("email_id", emailId).maybeSingle()
  if (ja.error) return { ok: false, status: 500, motivo: "erro ao consultar" }
  if (ja.data) return { ok: true, status: 200, duplicado: true }

  const c = await buscar(emailId)
  if (!c) return { ok: false, status: 502, motivo: "não consegui buscar o conteúdo" }   // Resend tenta de novo
  const de = enderecoDoRemetente(c.from)
  if (!de) return { ok: true, status: 200, motivo: "remetente inválido" }
  const texto = (typeof c.text === "string" && c.text.trim() ? c.text : typeof c.html === "string" ? semHtml(c.html) : "").trim()

  const achados = await supabase.from("prospectos_parceiros").select(COLUNAS).ilike("email", escLike(de)).limit(50)
  if (achados.error) return { ok: false, status: 500, motivo: "erro ao consultar prospectos" }
  const linhas = ((achados.data ?? []) as Linha[]).filter(l => (l.email ?? "").trim().toLowerCase() === de)
  const alvos = linhas.filter(l => (l.etapa === "abordado" || l.etapa === "respondeu") && !l.opt_out)

  const recebidoEm = typeof c.created_at === "string" && Number.isFinite(Date.parse(c.created_at)) ? new Date(c.created_at).toISOString() : agora.toISOString()
  const para = Array.isArray(c.to) ? c.to.filter(x => typeof x === "string").join(", ") : typeof c.to === "string" ? c.to : null
  const assunto = typeof c.subject === "string" ? c.subject : null
  // A unicidade de email_id decide quem processa: o segundo a gravar (corrida) sai sem mexer em etapa.
  // Guarda uma linha só (email_id é único), ligada ao primeiro prospecto com esse e-mail, se houver.
  const registro = { email_id: emailId, prospecto_id: (linhas[0]?.id ?? null) as number | null, de, para, assunto, corpo: texto, recebido_em: recebidoEm }
  const ins = await supabase.from("prospectos_emails_recebidos").insert(registro)
  if (ins.error) {
    if ((ins.error as { code?: string }).code === "23505") return { ok: true, status: 200, duplicado: true }
    return { ok: false, status: 500, motivo: "erro ao gravar" }
  }

  const res: ResultadoInbound = { ok: true, status: 200, prospectos: alvos.length, responderam: 0, optOuts: 0 }
  const em = agora.toISOString()
  const recusa = ehRecusa(texto)
  for (const l of alvos) {
    if (recusa) {
      if (await gravarOptOut(l, em, "recusa por e-mail (não quero receber)")) res.optOuts!++
    } else if (l.etapa === "abordado") {
      if (await gravar(l, { etapa: "respondeu", historico_etapas: [...historicoDe(l), { etapa: "respondeu", em, motivo: "respondeu por e-mail" }] })) res.responderam!++
    }
  }
  return res
}
