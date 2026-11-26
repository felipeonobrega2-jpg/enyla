// Envio automático do Prospector (primeiro contato e lembrete): regras puras. Nada aqui envia mensagem.
// O servidor (prospectorEnvioServidor.ts) usa estas funções e é quem fala com Resend e Evolution.

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "")

/** Termo de TERMOS_FORA_DO_RAMO achado na razão social ou no nome fantasia, ou null. */
export function termoForaDoRamo(razaoSocial: string | null | undefined, nomeFantasia: string | null | undefined): string | null {
  const nomes = [razaoSocial, nomeFantasia].map(n => semAcento(n ?? ""))
  return TERMOS_FORA_DO_RAMO.find(t => { const k = semAcento(t).trim(); return !!k && nomes.some(n => n.includes(k)) }) ?? null
}

/** `listados`: ids de CNAE (só dígitos) que estão em CNAES_PROSPECTO. Verdadeiro se o único da lista é 1822-9/01. */
export function soEncadernacao(principal: string | null | undefined, secundarios: readonly string[] | null | undefined, listados: (id: string) => boolean): boolean {
  const da = [...new Set([principal, ...(secundarios ?? [])].map(soDigitos).filter(id => id && listados(id)))]
  return da.length === 1 && da[0] === CNAE_SO_ENCADERNACAO
}

/** Nota mínima para qualificar: a configurada, ou NOTA_MINIMA_SO_SECUNDARIO (se for maior) quando o CNAE principal está fora da lista. */
export function notaMinimaDe(principal: string | null | undefined, minimoConfigurado: number, listados: (id: string) => boolean): number {
  const p = soDigitos(principal)
  // Sem CNAE principal registrado não há como saber: segue o mínimo configurado.
  return !p || listados(p) ? minimoConfigurado : Math.max(minimoConfigurado, NOTA_MINIMA_SO_SECUNDARIO)
}

/** Motivo de não qualificar (a pessoa fica na base, só não é abordada), ou null se serve. */
export function motivoNaoQualifica(
  p: { razao_social?: string | null; nome_fantasia?: string | null; cnae_principal?: string | null; cnaes_secundarios?: readonly string[] | null; nota?: number | null },
  minimoConfigurado: number, listados: (id: string) => boolean,
): string | null {
  const termo = termoForaDoRamo(p.razao_social, p.nome_fantasia)
  if (termo) return `nome fora do ramo (“${termo}”)`
  if (soEncadernacao(p.cnae_principal, p.cnaes_secundarios, listados)) return "só encadernação/plastificação (1822-9/01)"
  const min = notaMinimaDe(p.cnae_principal, minimoConfigurado, listados)
  if ((p.nota ?? 0) < min) return `CNAE da lista só como secundário: nota ${p.nota ?? 0} < mínimo ${min}`
  return null
}

export type Passo = "primeiro_contato" | "lembrete"
export type Canal = "whatsapp" | "email"
/** reservado = gravado antes de enviar (um segundo disparo já enxerga); enviado = saiu; falhou = não saiu, pode tentar de novo. */
export type StatusEnvio = "reservado" | "enviado" | "falhou"

/** Linha do histórico do funil que registra um envio. A etapa é a que o prospecto tinha na hora. */
export type EnvioHistorico = {
  passo: Passo; canal: Canal; status: StatusEnvio; em: string; texto?: string; erro?: string
  /** E-mail: id devolvido pela Resend ao aceitar o envio; é a chave que casa os eventos (delivered, bounced, opened, clicked). */
  resendId?: string
  /** E-mail do primeiro contato: token aleatório do link rastreado (/api/prospector/r/[token]). Não tem dado do prospecto. */
  token?: string
  /** Último desfecho de entrega informado pela Resend. Não muda `status`: quem já saiu nunca é reenviado. */
  entrega?: "entregue" | "bounce"
  /** Primeira abertura (pixel) e primeiro clique (link), ISO. */
  abriuEm?: string
  cliqueEm?: string
}

export const CHAVE_ENVIO_ATIVO = "prospector_envio_ativo"
export const CHAVE_NOTA_MINIMA = "prospector_nota_minima"
export const NOTA_MINIMA_PADRAO = 1
/** Nota mínima de quem tem CNAE da lista só como secundário (o principal está fora da lista): é gráfica "talvez", então exige mais.
 *  Quem tem o CNAE principal na lista usa `prospector_nota_minima`. Vale como piso: nunca fica abaixo da nota mínima configurada. */
export const NOTA_MINIMA_SO_SECUNDARIO = 2
/** Termos que, na razão social ou no nome fantasia, mostram que a empresa não é gráfica/embalagem. Fácil de editar: acrescente ou tire uma palavra.
 *  Comparação sem acento e sem maiúsculas, por trecho do nome (o termo "festa" pega "festas"). */
export const TERMOS_FORA_DO_RAMO: readonly string[] = ["inflavel", "inflaveis", "balao", "baloes", "figurinha", "brinquedo", "festa"]
/** Único CNAE da lista que, sozinho, não qualifica: encadernação e plastificação (1822-9/01). */
const CNAE_SO_ENCADERNACAO = "1822901"
/** Cota de primeiros contatos por dia (dia de São Paulo), só do WhatsApp. E-mail não tem teto diário. */
export const LIMITE_WHATSAPP_PRIMEIROS_POR_DIA = 10
/** Teto diário de e-mails do Prospector (primeiro contato + lembrete), PROSPECTOR_TETO_EMAIL_DIA. Padrão 80: cota Free da Resend (100/dia) menos 20 de reserva
 *  para o que não é prospecção (transacional a cliente e resposta da diretoria, que não entram neste teto). 0 = sem teto (plano pago). Vazio ou inválido = padrão. */
export const TETO_EMAIL_DIA_PADRAO = 80
export function tetoEmailDia(valor: string | null | undefined = process.env.PROSPECTOR_TETO_EMAIL_DIA): number {
  const v = (valor ?? "").trim()
  return /^\d+$/.test(v) ? Number(v) : TETO_EMAIL_DIA_PADRAO
}
export type MotivoParada = "teto_diario" | "cota_resend" | "limite_execucao"
/** Erro de cota da Resend (já gravado no histórico): não é culpa do lead e não conta para MAX_FALHAS_POR_CANAL. */
export const ehErroDeCota = (erro: string | null | undefined) => /(daily|monthly)\b.*\bquota|quota_exceeded/i.test(erro ?? "")
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
/**
 * Segura todo primeiro contato (e-mail e WhatsApp): ninguém novo é abordado, quem está `qualificado` continua `qualificado`, sem erro.
 * Desligada (`false`) com o link de cadastro rastreado no e-mail; o limite diário abaixo continua valendo. Lembrete e leitura de respostas não são afetados.
 */
export const PRIMEIRO_CONTATO_PAUSADO = false
/** Máximo de primeiros contatos novos por dia útil (America/Sao_Paulo), somando todas as execuções e canais. Vale também depois da pausa. */
export const LIMITE_PRIMEIROS_CONTATOS_POR_DIA = 10
export const HORA_INICIO = 8
export const HORA_FIM = 20
export const MAX_FALHAS_POR_CANAL = 3
export const REMETENTE_REPLY_TO = "felipeonobrega2@gmail.com"
/** Reply-To do primeiro contato e do lembrete. Só troca quando PROSPECTOR_REPLY_TO está preenchida com um e-mail válido (entrada de respostas no ar); senão segue o Gmail. */
export function replyToDoProspector(env: string | undefined = process.env.PROSPECTOR_REPLY_TO): string {
  return emailValido(env) ?? REMETENTE_REPLY_TO
}
/** Destino final do link rastreado do e-mail (formulário de cadastro de parceiros). */
export const URL_CADASTRO_PARCEIROS = "https://app.enyla.com.br/parceiros"
/** O mesmo destino com a origem: o formulário marca o cadastro como vindo da prospecção. */
export const URL_CADASTRO_DA_PROSPECCAO = `${URL_CADASTRO_PARCEIROS}?o=prospector`
export const URL_BASE_APP = "https://app.enyla.com.br"
export const urlRastreada = (token: string) => `${URL_BASE_APP}/api/prospector/r/${token}`
/** Linha do link no primeiro contato. O texto do link não mostra endereço (mostrar um e apontar para outro é marcado como spam). */
export const LINHA_LINK_CADASTRO = "Para ser parceira da ENYLA, cadastre a sua gráfica aqui:"
export const TEXTO_LINK_CADASTRO = "Cadastrar minha gráfica"
/** HTML do e-mail do primeiro contato: o texto comercial intacto, mais a linha com o link rastreado. Sem token, só o texto. */
export function htmlDoPrimeiroContato(texto: string, token?: string): string {
  const esc = texto.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]!))
  return `<p>${esc}</p>` + (token ? `<p>${LINHA_LINK_CADASTRO} <a href="${urlRastreada(token)}">${TEXTO_LINK_CADASTRO}</a></p>` : "")
}
/** Versão em texto puro do primeiro contato: o texto e, com token, `Cadastrar minha gráfica: {link}`. */
export function textoPlanoDoPrimeiroContato(texto: string, token?: string): string {
  return token ? `${texto}\n\n${LINHA_LINK_CADASTRO}\n${TEXTO_LINK_CADASTRO}: ${urlRastreada(token)}` : texto
}
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
  return {
    passo: e.passo, canal: e.canal, status: e.status, em: String(e.em ?? ""), ...(e.texto ? { texto: e.texto } : {}), ...(e.erro ? { erro: e.erro } : {}),
    ...(e.resendId ? { resendId: e.resendId } : {}), ...(e.token ? { token: e.token } : {}),
    ...(e.entrega === "entregue" || e.entrega === "bounce" ? { entrega: e.entrega } : {}),
    ...(e.abriuEm ? { abriuEm: e.abriuEm } : {}), ...(e.cliqueEm ? { cliqueEm: e.cliqueEm } : {}),
  }
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
    return doCanal.filter(e => e.status === "falhou" && !ehErroDeCota(e.erro)).length < MAX_FALHAS_POR_CANAL
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
