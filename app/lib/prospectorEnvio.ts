// Envio automático do Prospector (primeiro contato e lembrete): regras puras. Nada aqui envia mensagem.
// O servidor (prospectorEnvioServidor.ts) usa estas funções e é quem fala com Resend e Evolution.

export type Passo = "primeiro_contato" | "lembrete"
export type Canal = "whatsapp" | "email"
/** reservado = gravado antes de enviar (um segundo disparo já enxerga); enviado = saiu; falhou = não saiu, pode tentar de novo. */
export type StatusEnvio = "reservado" | "enviado" | "falhou"

/** Linha do histórico do funil que registra um envio. A etapa é a que o prospecto tinha na hora. */
export type EnvioHistorico = { passo: Passo; canal: Canal; status: StatusEnvio; em: string; texto?: string; erro?: string }

export const CHAVE_ENVIO_ATIVO = "prospector_envio_ativo"
export const CHAVE_NOTA_MINIMA = "prospector_nota_minima"
export const NOTA_MINIMA_PADRAO = 1
/** Cota de primeiros contatos por dia (dia de São Paulo), só do WhatsApp. E-mail não tem teto diário. */
export const LIMITE_WHATSAPP_PRIMEIROS_POR_DIA = 10
/** Limite técnico por execução (a rota tem maxDuration de 120s): e-mails enviados (primeiro contato e lembrete) e tempo total. O resto fica para o próximo cron. */
export const MAX_EMAILS_POR_EXECUCAO = 60
export const ORCAMENTO_MS_POR_EXECUCAO = 90_000
export const DIAS_ATE_LEMBRETE = 3
export const DIAS_ATE_ENCERRAR = 3
/**
 * Lembrete (e o encerramento por falta de resposta) para quem recebeu o primeiro contato por e-mail.
 * Desligado porque a resposta ao e-mail cai só no Gmail (Reply-To) e nenhum código a detecta: quem já respondeu
 * ainda estaria `abordado` e receberia o lembrete. Volta a `true` quando a entrada de e-mail (detecção de resposta) existir.
 * Quem foi abordado só por WhatsApp não é afetado: a detecção de resposta do WhatsApp já para a cadência.
 */
export const LEMBRETE_EMAIL_ATIVO = false
export const HORA_INICIO = 8
export const HORA_FIM = 20
export const MAX_FALHAS_POR_CANAL = 3
export const REMETENTE_REPLY_TO = "felipeonobrega2@gmail.com"
export const ASSUNTO_EMAIL = "ENYLA, gráfica de embalagens em Barueri"

const CORPO_PRIMEIRO = "tudo bem? Aqui é da ENYLA, somos uma gráfica de embalagens em Barueri. Vocês fazem serviços de terceirização para outras gráficas?"
export const TEXTO_LEMBRETE = "Oi, tudo bem? Aqui é da ENYLA, de Barueri, de novo. Só para saber se vocês fazem serviços de terceirização para outras gráficas."

const fmt = (agora: Date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", hourCycle: "h23", weekday: "short", hour: "2-digit", minute: "2-digit", year: "numeric", month: "2-digit", day: "2-digit",
}).formatToParts(agora)

export function relogioSp(agora: Date): { dia: string; hora: number; diaSemana: number } {
  const p = Object.fromEntries(fmt(agora).map(x => [x.type, x.value]))
  const semana: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), diaSemana: semana[p.weekday] ?? 0 }
}

/** Segunda a sexta, das 8h (inclusive) às 20h (exclusive), America/Sao_Paulo. */
export function dentroDoHorario(agora: Date): boolean {
  const { hora, diaSemana } = relogioSp(agora)
  return diaSemana >= 1 && diaSemana <= 5 && hora >= HORA_INICIO && hora < HORA_FIM
}

/** "Bom dia" antes das 12h, "Boa tarde" depois (America/Sao_Paulo). */
export function textoPrimeiroContato(agora: Date): string {
  return `${relogioSp(agora).hora < 12 ? "Bom dia" : "Boa tarde"}, ${CORPO_PRIMEIRO}`
}

export function textoDoPasso(passo: Passo, agora: Date): string {
  return passo === "primeiro_contato" ? textoPrimeiroContato(agora) : TEXTO_LEMBRETE
}

/** Celular brasileiro: DDD (2 dígitos) + 9 + 8 dígitos. Devolve o número com 55, ou null. */
export function celularWhatsapp(telefone: string | null | undefined): string | null {
  let d = (telefone ?? "").replace(/\D/g, "")
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2)
  if (d.length === 12 && d.startsWith("55")) return null
  if (d.length === 11 && /^[1-9][1-9]9\d{8}$/.test(d)) return `55${d}`
  return null
}

export function emailValido(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null
}

export function canaisDisponiveis(p: { telefone?: string | null; email?: string | null }): Canal[] {
  const c: Canal[] = []
  if (celularWhatsapp(p.telefone)) c.push("whatsapp")
  if (emailValido(p.email)) c.push("email")
  return c
}

/** Telefone sem 55 e sem o 9 extra, para casar o mesmo número em jids antigos e novos. */
export function chaveTelefone(v: string | null | undefined): string {
  let d = (v ?? "").replace(/\D/g, "")
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2)
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3)
  return d
}

export function envioDe(x: unknown): EnvioHistorico | null {
  if (!x || typeof x !== "object") return null
  const e = (x as { envio?: unknown }).envio as Partial<EnvioHistorico> | undefined
  if (!e || (e.passo !== "primeiro_contato" && e.passo !== "lembrete") || (e.canal !== "whatsapp" && e.canal !== "email")) return null
  if (e.status !== "reservado" && e.status !== "enviado" && e.status !== "falhou") return null
  return { passo: e.passo, canal: e.canal, status: e.status, em: String(e.em ?? ""), ...(e.texto ? { texto: e.texto } : {}), ...(e.erro ? { erro: e.erro } : {}) }
}

export function enviosDoHistorico(historico: readonly unknown[]): EnvioHistorico[] {
  return historico.map(envioDe).filter((e): e is EnvioHistorico => !!e)
}

/** Reservado conta como enviado: se o processo morreu no meio, melhor perder um envio do que mandar duas vezes. */
export const saiu = (e: EnvioHistorico) => e.status === "enviado" || e.status === "reservado"

export function canaisPendentes(envios: readonly EnvioHistorico[], passo: Passo, disponiveis: readonly Canal[]): Canal[] {
  return disponiveis.filter(c => {
    const doCanal = envios.filter(e => e.passo === passo && e.canal === c)
    if (doCanal.some(saiu)) return false
    return doCanal.filter(e => e.status === "falhou").length < MAX_FALHAS_POR_CANAL
  })
}

export function passoIniciado(envios: readonly EnvioHistorico[], passo: Passo): boolean {
  return envios.some(e => e.passo === passo)
}

export function passoSaiu(envios: readonly EnvioHistorico[], passo: Passo): EnvioHistorico | null {
  const feitos = envios.filter(e => e.passo === passo && saiu(e)).sort((a, b) => a.em.localeCompare(b.em))
  return feitos[0] ?? null
}

/** Cadência (lembrete e encerramento) suspensa: o primeiro contato saiu por e-mail e ainda não há detecção de resposta por e-mail. */
export function cadenciaSuspensaPorEmail(envios: readonly EnvioHistorico[]): boolean {
  return !LEMBRETE_EMAIL_ATIVO && envios.some(e => e.passo === "primeiro_contato" && e.canal === "email" && saiu(e))
}

export const MS_DIA = 86_400_000
export const passouDias = (desde: string, dias: number, agora: Date) => {
  const t = Date.parse(desde)
  return Number.isFinite(t) && agora.getTime() - t >= dias * MS_DIA
}

/** Recusa clara. Só texto curto: uma frase longa com "não" no meio é conversa, não opt-out. */
export function ehRecusa(texto: string | null | undefined): boolean {
  const t = (texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()
  if (!t) return false
  if (/\b(nao|n) (quero|queremos|desejo|desejamos) (mais )?(receber|contato|mensagens?|ser contatad[oa]s?)\b/.test(t)) return true
  if (/\b(pare|parem|parar) (de )?(enviar|mandar|escrever|me chamar|nos chamar|mensagens?)\b/.test(t)) return true
  if (/\b(remov|tire|tirar|retire|excluir|exclua)\w* (meu|nosso|o meu|o nosso)? ?(numero|contato|cadastro|telefone|email)\b/.test(t)) return true
  if (/\bsair da lista\b|\bnao me (chame|chamem|envie|enviem|mande|mandem)\b|\bnao (tenho|temos) interesse\b|\bsem interesse\b/.test(t)) return true
  return /^(nao|n|nao obrigad[oa]|nao quero|nao queremos|nao precisa|nao faco|nao fazemos)$/.test(t)
}
