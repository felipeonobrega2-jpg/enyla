// Envio automático do Prospector: qualifica, detecta resposta, manda o primeiro contato e o lembrete, encerra.
// Com a chave prospector_envio_ativo desligada (padrão) não lê nem envia nada além de devolver "desligado".
//
// Idempotência: antes de enviar, grava no histórico do prospecto uma linha "reservado" (passo + canal), com trava
// otimista em atualizado_em. Só envia quem conseguiu gravar. Um segundo disparo (retry do cron, duas instâncias)
// enxerga a reserva e não manda de novo. Depois do envio a linha vira "enviado" ou "falhou". Reservado sem desfecho
// (processo morreu no meio) conta como enviado: nunca reenvia. Só "falhou" libera nova tentativa do mesmo canal.
import { lerCampos } from "./configAtomica"
import { supabase } from "./supabase"
import { evo } from "./evolution"
import { randomBytes } from "node:crypto"
import { enviarEmail } from "./email"
import { CNAES_PROSPECTO, aplicarOptOut, podeTransicionar, type EtapaFunil, type MudancaEtapa } from "./prospector"
import {
  ASSUNTO_EMAIL, htmlDoPrimeiroContato, textoPlanoDoPrimeiroContato, CHAVE_ENVIO_ATIVO, PRIMEIRO_CONTATO_PAUSADO, CHAVE_NOTA_MINIMA, DIAS_ATE_ENCERRAR, DIAS_ATE_LEMBRETE, cadenciaSuspensaPorEmail, MAX_EMAILS_POR_EXECUCAO, espacoWhatsappMs, ehErroDeCota, NOTA_MINIMA_PADRAO, ORCAMENTO_MS_POR_EXECUCAO, replyToDoProspector,
  canaisDisponiveis, canaisPendentes, celularWhatsapp, chaveTelefone, dentroDoHorario, ehRecusa, emailValido, enviosDoHistorico,
  motivoNaoQualifica, passoIniciado, passoSaiu, passouDias, saiu, textoDoPasso,
  type Canal, type EnvioHistorico, type MotivoParada, type Passo,
} from "./prospectorEnvio"

const TABELA = "prospectos_parceiros"
export const COLUNAS = "id, cnpj, razao_social, nome_fantasia, cnae_principal, cnaes_secundarios, telefone, email, nota, etapa, opt_out, historico_etapas, atualizado_em"
const REMETENTE = "ENYLA Embalagens <parceiros@enyla.com.br>"
const ETAPAS_CONTATADAS = ["abordado", "respondeu", "encerrado_sem_resposta", "abriu", "cadastrou"]
const LIMITE_ELEGIVEIS = 1000

export type Linha = {
  id: number; cnpj: string; razao_social: string | null; nome_fantasia: string | null; cnae_principal?: string | null; cnaes_secundarios?: string[] | null; telefone: string | null; email: string | null
  nota: number | null; etapa: string; opt_out: boolean; historico_etapas: unknown; atualizado_em: string
}

export type ResultadoEnvio = {
  ok: boolean; ativo: boolean; enviado: boolean; motivo?: string; erro?: string
  motivoParada?: MotivoParada
  qualificados: number; primeiros: number; lembretes: number; encerrados: number; responderam: number; optOuts: number; falhas: number
}

const vazio = (): ResultadoEnvio => ({ ok: true, ativo: true, enviado: false, qualificados: 0, primeiros: 0, lembretes: 0, encerrados: 0, responderam: 0, optOuts: 0, falhas: 0 })
export const historicoDe = (l: Linha): MudancaEtapa[] => (Array.isArray(l.historico_etapas) ? l.historico_etapas : []).filter((x): x is MudancaEtapa => !!x && typeof x === "object")
const enviosDe = (l: Linha) => enviosDoHistorico(historicoDe(l))

/** `primeiroContatoPausado`, `esperar` e `sorteio` existem só para teste; em produção valem as constantes, a espera real e Math.random. */
type Deps = { agora?: () => Date; primeiroContatoPausado?: boolean; esperar?: (ms: number) => Promise<void>; sorteio?: () => number }

/** Grava com trava otimista (id + atualizado_em lido + sem opt-out). Devolve a linha nova ou null se alguém mudou antes. */
export async function gravar(l: Linha, campos: Record<string, unknown>): Promise<Linha | null> {
  const novoEm = new Date().toISOString()
  const { data, error } = await supabase.from(TABELA).update({ ...campos, atualizado_em: novoEm })
    .eq("id", l.id).eq("atualizado_em", l.atualizado_em).eq("opt_out", false).select("id")
  if (error || !Array.isArray(data) || data.length === 0) return null
  return { ...l, ...campos, atualizado_em: novoEm } as Linha
}

export async function reler(id: number): Promise<Linha | null> {
  const { data } = await supabase.from(TABELA).select(COLUNAS).eq("id", id).maybeSingle()
  return (data as Linha | null) ?? null
}

function marcarOptOut(l: Linha, em: string): Record<string, unknown> {
  const novo = aplicarOptOut({ etapa: l.etapa as EtapaFunil, optOut: l.opt_out, historico: historicoDe(l) }, em)
  return { etapa: "descartado", opt_out: true, opt_out_em: em, historico_etapas: novo.historico }
}

export async function gravarOptOut(l: Linha, em: string, motivo: string): Promise<Linha | null> {
  for (let i = 0; i < 3; i++) {
    const atual = i === 0 ? l : await reler(l.id)
    if (!atual || atual.opt_out) return null
    const campos = marcarOptOut(atual, em)
    const h = campos.historico_etapas as MudancaEtapa[]
    h[h.length - 1] = { ...h[h.length - 1], motivo }
    // opt-out não pode perder para a trava de "sem opt-out": a trava só exige opt_out = false, que é o caso aqui
    const g = await gravar(atual, campos)
    if (g) return g
  }
  return null
}

type Estado = {
  usados: Record<Passo, Record<Canal, Map<string, string>>>   // chave do telefone/e-mail → CNPJ que já recebeu
  bloqueadosTel: Set<string>; bloqueadosEmail: Set<string>      // quem pediu para sair (qualquer CNPJ com o mesmo contato)
  emailsNestaExecucao: number; limiteAte: number                // limite técnico por execução (rota de 120s)
  esperar: (ms: number) => Promise<void>; sorteio: () => number  // espaçamento entre WhatsApps
  zapNestaExecucao: number
  cotaEsgotada: boolean; motivoParada?: MotivoParada
}

function novoEstado(): Estado {
  const m = () => ({ whatsapp: new Map<string, string>(), email: new Map<string, string>() })
  return { usados: { primeiro_contato: m(), lembrete: m() }, bloqueadosTel: new Set(), bloqueadosEmail: new Set(), emailsNestaExecucao: 0, limiteAte: Date.now() + ORCAMENTO_MS_POR_EXECUCAO, esperar: ms => new Promise(r => setTimeout(r, ms)), sorteio: Math.random, zapNestaExecucao: 0, cotaEsgotada: false }
}

/** Esgotou o que cabe nesta execução: o que sobrar sai no próximo cron. */
const semFolga = (est: Estado) => {
  const sem = est.emailsNestaExecucao >= MAX_EMAILS_POR_EXECUCAO || Date.now() >= est.limiteAte
  if (sem) est.motivoParada ??= "limite_execucao"
  return sem
}

/** E-mail parado até o próximo cron: a Resend recusou por cota. Só o e-mail para; o WhatsApp segue. Não há teto diário do Prospector. */
function emailParado(est: Estado): boolean {
  if (est.cotaEsgotada) { est.motivoParada = "cota_resend"; return true }
  return false
}

const chaveCanal = (c: Canal, l: Linha) => (c === "whatsapp" ? chaveTelefone(celularWhatsapp(l.telefone)) : emailValido(l.email) ?? "")

function registrarUsos(est: Estado, l: Linha) {
  for (const e of enviosDe(l)) if (saiu(e)) {
    const k = chaveCanal(e.canal, l)
    if (k) est.usados[e.passo][e.canal].set(k, l.cnpj)
  }
}

/** O mesmo telefone (ou e-mail) já recebeu este passo por outro CNPJ, ou pediu para sair: não manda. */
function bloqueado(est: Estado, passo: Passo, canal: Canal, l: Linha): boolean {
  const k = chaveCanal(canal, l)
  if (!k) return true
  if (canal === "whatsapp" ? est.bloqueadosTel.has(k) : est.bloqueadosEmail.has(k)) return true
  const dono = est.usados[passo][canal].get(k)
  return !!dono && dono !== l.cnpj
}

type ResultadoCanal = { ok: true; id?: string } | { ok: false; erro: string; cota?: true }

async function enviarPeloCanal(canal: Canal, l: Linha, texto: string, token?: string): Promise<ResultadoCanal> {
  if (canal === "whatsapp") {
    const numero = celularWhatsapp(l.telefone)
    if (!numero) return { ok: false, erro: "sem celular válido" }
    const r = await evo<{ key?: { id?: string } }>("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: numero, text: texto }) })
    return r.ok && r.corpo?.key?.id ? { ok: true } : { ok: false, erro: `WhatsApp não enviou (${r.status})` }
  }
  const para = emailValido(l.email)
  if (!para) return { ok: false, erro: "e-mail inválido" }
  const r = await enviarEmail(para, { assunto: ASSUNTO_EMAIL, texto: textoPlanoDoPrimeiroContato(texto, token), html: htmlDoPrimeiroContato(texto, token) }, [], { de: REMETENTE, responderPara: replyToDoProspector() })
  return r.ok ? { ok: true, id: r.id } : { ok: false, erro: r.erro, ...(r.cota ? { cota: true as const } : {}) }
}

/** Reserva, envia e fecha um canal de um passo. Devolve se saiu, se falhou, ou null se não reservou (alguém foi mais rápido). */
async function enviarCanal(est: Estado, l: Linha, passo: Passo, canal: Canal, agora: Date): Promise<{ linha: Linha; ok: boolean } | null> {
  const texto = textoDoPasso(passo, agora)
  const em = agora.toISOString()
  // Só o primeiro contato por e-mail leva o link rastreado; o token nasce na reserva e fica no histórico (sem dado do prospecto).
  const token = passo === "primeiro_contato" && canal === "email" ? randomBytes(12).toString("base64url") : undefined
  const envio: EnvioHistorico = { passo, canal, status: "reservado", em, texto, ...(token ? { token } : {}) }
  const reservada = await gravar(l, { historico_etapas: [...historicoDe(l), { etapa: l.etapa as EtapaFunil, em, motivo: `${passo} (${canal}): reservado`, envio }] })
  if (!reservada) return null
  const k = chaveCanal(canal, l)
  if (k) est.usados[passo][canal].set(k, l.cnpj)
  let r: ResultadoCanal
  try { r = await enviarPeloCanal(canal, l, texto, token) } catch (e) { r = { ok: false, erro: String(e) } }
  // Cota da Resend esgotada: o e-mail para pelo resto do dia. A linha fica "falhou" com a mensagem de cota, que não conta como falha do lead.
  if (!r.ok && canal === "email" && (r.cota || ehErroDeCota(r.erro))) est.cotaEsgotada = true
  // Fecha a reserva. Se a trava perder (outra gravação no meio), relê e tenta de novo; a reserva já protege contra duplicata.
  let atual: Linha | null = reservada
  for (let i = 0; i < 4 && atual; i++) {
    const h = historicoDe(atual).map(x => {
      const e = x.envio as EnvioHistorico | undefined
      return e && e.passo === passo && e.canal === canal && e.em === em && e.status === "reservado"
        ? { ...x, motivo: `${passo} (${canal}): ${r.ok ? "enviado" : "falhou"}`, envio: { ...e, status: r.ok ? "enviado" : "falhou", ...(r.ok ? (r.id ? { resendId: r.id } : {}) : { erro: r.erro }) } }
        : x
    })
    const campos: Record<string, unknown> = { historico_etapas: h }
    if (r.ok && passo === "primeiro_contato" && podeTransicionar(atual.etapa as EtapaFunil, "abordado", atual.opt_out)) {
      campos.etapa = "abordado"
      h.push({ etapa: "abordado", em, motivo: `primeiro contato enviado por ${canal}` })
    }
    const g = await gravar(atual, campos)
    if (g) return { linha: g, ok: r.ok }
    atual = await reler(l.id)
    if (atual?.opt_out) break
  }
  return { linha: atual ?? reservada, ok: r.ok }
}

/** Manda o passo para os canais pendentes. Conta falhas no resultado. */
async function mandarPasso(est: Estado, l: Linha, passo: Passo, canais: Canal[], agora: Date, res: ResultadoEnvio): Promise<{ linha: Linha; algumOk: boolean }> {
  let atual = l
  let algumOk = false
  for (const canal of canais) {
    if (bloqueado(est, passo, canal, atual)) continue
    if (semFolga(est)) break
    if (canal === "email" && emailParado(est)) continue
    if (canal === "email") est.emailsNestaExecucao++
    if (canal === "whatsapp") {
      // Espaçamento aleatório de 20 a 60 s entre WhatsApps. Se a espera não cabe no orçamento da execução, o resto fica para o próximo cron.
      if (est.zapNestaExecucao > 0) {
        const espera = espacoWhatsappMs(est.sorteio())
        if (Date.now() + espera >= est.limiteAte) { est.motivoParada ??= "limite_execucao"; break }
        await est.esperar(espera)
      }
      est.zapNestaExecucao++
    }
    const r = await enviarCanal(est, atual, passo, canal, agora)
    if (!r) break
    atual = r.linha
    if (r.ok) algumOk = true; else res.falhas++
  }
  return { linha: atual, algumOk }
}

// ── Respostas ────────────────────────────────────────────────────────────────
async function detectarRespostas(linhas: Linha[], agora: Date, res: ResultadoEnvio) {
  const alvos = linhas.filter(l => (l.etapa === "abordado" || l.etapa === "respondeu") && !l.opt_out)
  const comZap = alvos.map(l => ({ l, chave: chaveTelefone(celularWhatsapp(l.telefone)), desde: passoSaiu(enviosDe(l), "primeiro_contato")?.em ?? "" }))
    .filter(x => x.chave && x.desde && enviosDe(x.l).some(e => e.canal === "whatsapp" && saiu(e)))
  if (!comZap.length) return
  const desde = comZap.map(x => x.desde).sort()[0]
  const { data } = await supabase.from("whatsapp_mensagens").select("jid, corpo, ts").eq("from_me", false).gte("ts", desde).order("ts", { ascending: true }).limit(5000)
  const msgs = (data ?? []) as { jid: string; corpo: string | null; ts: string }[]
  for (const { l, chave, desde: d } of comZap) {
    const dele = msgs.filter(m => m.ts >= d && typeof m.jid === "string" && m.jid.endsWith("@s.whatsapp.net") && chaveTelefone(m.jid.split("@")[0]) === chave)
    if (!dele.length) continue
    const em = agora.toISOString()
    if (dele.some(m => ehRecusa(m.corpo))) {
      const g = await gravarOptOut(l, em, "recusa por WhatsApp (não quero receber)")
      if (g) { l.etapa = "descartado"; l.opt_out = true; l.historico_etapas = g.historico_etapas; l.atualizado_em = g.atualizado_em; res.optOuts++ }
    } else if (l.etapa === "abordado") {
      const g = await gravar(l, { etapa: "respondeu", historico_etapas: [...historicoDe(l), { etapa: "respondeu", em, motivo: "respondeu no WhatsApp" }] })
      if (g) { l.etapa = "respondeu"; l.historico_etapas = g.historico_etapas; l.atualizado_em = g.atualizado_em; res.responderam++ }
    }
  }
}

// ── Execução ─────────────────────────────────────────────────────────────────
export async function executarEnvio(deps: Deps = {}): Promise<ResultadoEnvio> {
  const res = vazio()
  const cfg = await lerCampos<Record<string, unknown>>([CHAVE_ENVIO_ATIVO, CHAVE_NOTA_MINIMA])
  if (cfg[CHAVE_ENVIO_ATIVO] !== true) return { ...res, ativo: false, motivo: "envio desligado (prospector_envio_ativo)" }
  const agora = (deps.agora ?? (() => new Date()))()
  const minimo = typeof cfg[CHAVE_NOTA_MINIMA] === "number" && Number.isFinite(cfg[CHAVE_NOTA_MINIMA]) ? (cfg[CHAVE_NOTA_MINIMA] as number) : NOTA_MINIMA_PADRAO
  // Fora do horário nada roda, nem a leitura de respostas: a rota recusa mesmo que o cron dispare.
  if (!dentroDoHorario(agora)) return { ...res, motivo: "fora do horário (segunda a sexta, 8h às 20h, America/Sao_Paulo)" }

  const [contatadas, elegiveis, saidas] = await Promise.all([
    supabase.from(TABELA).select(COLUNAS).in("etapa", ETAPAS_CONTATADAS).eq("opt_out", false).limit(5000),
    supabase.from(TABELA).select(COLUNAS).in("etapa", ["encontrado", "qualificado"]).eq("opt_out", false).gte("nota", minimo)
      .or("telefone.not.is.null,email.not.is.null").order("nota", { ascending: false, nullsFirst: false }).limit(LIMITE_ELEGIVEIS),
    supabase.from(TABELA).select("telefone, email").eq("opt_out", true).limit(5000),
  ])
  if (contatadas.error || elegiveis.error) return { ...res, ok: false, erro: (contatadas.error ?? elegiveis.error)!.message }
  const est = novoEstado()
  if (deps.esperar) est.esperar = deps.esperar
  if (deps.sorteio) est.sorteio = deps.sorteio
  for (const s of (saidas.data ?? []) as { telefone: string | null; email: string | null }[]) {
    const t = chaveTelefone(celularWhatsapp(s.telefone)); if (t) est.bloqueadosTel.add(t)
    const e = emailValido(s.email); if (e) est.bloqueadosEmail.add(e)
  }
  const jaContatadas = (contatadas.data ?? []) as Linha[]
  const lista = (elegiveis.data ?? []) as Linha[]
  for (const l of [...jaContatadas, ...lista]) registrarUsos(est, l)

  await detectarRespostas(jaContatadas, agora, res)

  // Lembrete e encerramento 
  for (const l0 of jaContatadas.filter(x => x.etapa === "abordado" && !x.opt_out)) {
    const l = l0
    const envios = enviosDe(l)
    const primeiro = passoSaiu(envios, "primeiro_contato")
    if (!primeiro || !passouDias(primeiro.em, DIAS_ATE_LEMBRETE, agora)) continue
    // Primeiro contato por e-mail: sem detecção de resposta por e-mail, nem lembrete (em nenhum canal) nem encerramento.
    if (cadenciaSuspensaPorEmail(envios)) continue
    const lembrete = passoSaiu(envios, "lembrete")
    if (lembrete && passouDias(lembrete.em, DIAS_ATE_ENCERRAR, agora)) {
      if (await gravar(l, { etapa: "encerrado_sem_resposta", historico_etapas: [...historicoDe(l), { etapa: "encerrado_sem_resposta", em: agora.toISOString(), motivo: "sem resposta ao lembrete" }] })) res.encerrados++
      continue
    }
    const canaisDoPrimeiro = canaisDisponiveis(l).filter(c => envios.some(e => e.passo === "primeiro_contato" && e.canal === c && saiu(e)))
    const pendentes = canaisPendentes(envios, "lembrete", canaisDoPrimeiro)
    if (!pendentes.length) {
      // Lembrete que nunca saiu (todas as tentativas falharam): depois de mais 3 dias, encerra do mesmo jeito
      if (!lembrete && passoIniciado(envios, "lembrete") && passouDias(primeiro.em, DIAS_ATE_LEMBRETE + DIAS_ATE_ENCERRAR, agora)) {
        if (await gravar(l, { etapa: "encerrado_sem_resposta", historico_etapas: [...historicoDe(l), { etapa: "encerrado_sem_resposta", em: agora.toISOString(), motivo: "lembrete não saiu e o prazo passou" }] })) res.encerrados++
      }
      continue
    }
    const r = await mandarPasso(est, l, "lembrete", pendentes, agora, res)
    if (r.algumOk) res.lembretes++
  }

  // Qualificação: encontrado + nota mínima + celular ou e-mail → qualificado
  const fila: Linha[] = []
  for (const l0 of lista) {
    let l = l0
    if (l.etapa === "encontrado") {
      if (!canaisDisponiveis(l).length) continue
      // Fica na base, mas não qualifica nem é abordado: nome fora do ramo, só encadernação, ou CNAE da lista só como secundário com nota baixa.
      if (motivoNaoQualifica(l, minimo, id => id in CNAES_PROSPECTO)) continue
      const g = await gravar(l, { etapa: "qualificado", historico_etapas: [...historicoDe(l), { etapa: "qualificado", em: agora.toISOString(), motivo: `nota ${l.nota} >= mínimo ${minimo}, com contato` }] })
      if (!g) continue
      l = g
      res.qualificados++
    }
    if (l.etapa === "qualificado" && !motivoNaoQualifica(l, minimo, id => id in CNAES_PROSPECTO)) fila.push(l)
  }

  // Primeiro contato, nota decrescente. Sem teto diário em nenhum canal: só o limite técnico da execução e o espaçamento entre WhatsApps.
  const pausado = deps.primeiroContatoPausado ?? PRIMEIRO_CONTATO_PAUSADO
  const abordadosComFalha = jaContatadas.filter(l => l.etapa === "abordado" && !l.opt_out && !passoIniciado(enviosDe(l), "lembrete"))
  for (const l0 of pausado ? [] : [...fila, ...abordadosComFalha].sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0))) {
    if (semFolga(est)) break
    const envios = enviosDe(l0)
    const iniciado = passoIniciado(envios, "primeiro_contato")
    const pendentes = canaisPendentes(envios, "primeiro_contato", canaisDisponiveis(l0))
      .filter(c => !bloqueado(est, "primeiro_contato", c, l0))
    if (!pendentes.length) continue
    const r = await mandarPasso(est, l0, "primeiro_contato", pendentes, agora, res)
    if (r.algumOk && !iniciado) res.primeiros++
  }

  emailParado(est)
  if (est.motivoParada) res.motivoParada = est.motivoParada
  res.enviado = res.primeiros + res.lembretes > 0
  return res
}
