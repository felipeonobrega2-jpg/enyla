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
import { CNAES_PROSPECTO, aplicarOptOut, hojeSp, podeTransicionar, type EtapaFunil, type MudancaEtapa } from "./prospector"
import {
  ASSUNTO_EMAIL, htmlDoPrimeiroContato, textoPlanoDoPrimeiroContato, CHAVE_ENVIO_ATIVO, PRIMEIRO_CONTATO_PAUSADO, CHAVE_LIMITE_WHATSAPP_DIA, CHAVE_LIMITE_EMAIL_DIA, limiteWhatsappDia, ESPACAMENTO_EMAIL_MS, espacamentoWhatsappMs, espacamentoLiberado, CHAVE_NOTA_MINIMA, DIAS_ATE_ENCERRAR, DIAS_ATE_LEMBRETE, cadenciaSuspensaPorEmail, MAX_EMAILS_POR_EXECUCAO, tetoEmailDia, ehErroDeCota, NOTA_MINIMA_PADRAO, ORCAMENTO_MS_POR_EXECUCAO, replyToDoProspector,
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
  emailHoje: number; tetoEmailDia: number; motivoParada?: MotivoParada
  qualificados: number; primeiros: number; lembretes: number; encerrados: number; responderam: number; optOuts: number; falhas: number
}

const vazio = (): ResultadoEnvio => ({ ok: true, ativo: true, enviado: false, emailHoje: 0, tetoEmailDia: 0, qualificados: 0, primeiros: 0, lembretes: 0, encerrados: 0, responderam: 0, optOuts: 0, falhas: 0 })
export const historicoDe = (l: Linha): MudancaEtapa[] => (Array.isArray(l.historico_etapas) ? l.historico_etapas : []).filter((x): x is MudancaEtapa => !!x && typeof x === "object")
const enviosDe = (l: Linha) => enviosDoHistorico(historicoDe(l))

/** `primeiroContatoPausado` e `semEspacamento` existem só para teste; em produção valem a constante e o espaçamento. */
type Deps = { agora?: () => Date; primeiroContatoPausado?: boolean; semEspacamento?: boolean }

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
  emailsFeitosHoje: number; teto: number                        // e-mails do Prospector já enviados hoje (antes desta execução) e o teto diário (0 = sem)
  cotaEsgotada: boolean; motivoParada?: MotivoParada
  ultimoEnvioMs: Record<Canal, number | null>; espacamentoMs: Record<Canal, number>   // espaçamento mínimo entre envios do canal (0 = sem)
}

function novoEstado(): Estado {
  const m = () => ({ whatsapp: new Map<string, string>(), email: new Map<string, string>() })
  return { usados: { primeiro_contato: m(), lembrete: m() }, bloqueadosTel: new Set(), bloqueadosEmail: new Set(), emailsNestaExecucao: 0, limiteAte: Date.now() + ORCAMENTO_MS_POR_EXECUCAO, emailsFeitosHoje: 0, teto: 0, cotaEsgotada: false, ultimoEnvioMs: { whatsapp: null, email: null }, espacamentoMs: { whatsapp: 0, email: 0 } }
}

/** Esgotou o que cabe nesta execução: o que sobrar sai no próximo cron. */
const semFolga = (est: Estado) => {
  const sem = est.emailsNestaExecucao >= MAX_EMAILS_POR_EXECUCAO || Date.now() >= est.limiteAte
  if (sem) est.motivoParada ??= "limite_execucao"
  return sem
}

/** E-mail parado pelo resto do dia: a Resend recusou por cota, ou o teto diário do Prospector foi atingido. Só o e-mail para; o WhatsApp segue. */
function emailParado(est: Estado): boolean {
  if (est.cotaEsgotada) { est.motivoParada = "cota_resend"; return true }
  if (est.teto > 0 && est.emailsFeitosHoje + est.emailsNestaExecucao >= est.teto) { est.motivoParada ??= "teto_diario"; return true }
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
  const texto = textoDoPasso(passo, canal)
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
    // Nunca em rajada: o canal só envia se já passou o espaçamento desde o último envio dele (histórico do dia ou desta execução).
    if (!espacamentoLiberado(est.ultimoEnvioMs[canal], agora.getTime(), est.espacamentoMs[canal])) continue
    if (canal === "email") est.emailsNestaExecucao++
    const r = await enviarCanal(est, atual, passo, canal, agora)
    if (!r) break
    est.ultimoEnvioMs[canal] = agora.getTime()
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
  const cfg = await lerCampos<Record<string, unknown>>([CHAVE_ENVIO_ATIVO, CHAVE_NOTA_MINIMA, CHAVE_LIMITE_WHATSAPP_DIA, CHAVE_LIMITE_EMAIL_DIA])
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
  for (const s of (saidas.data ?? []) as { telefone: string | null; email: string | null }[]) {
    const t = chaveTelefone(celularWhatsapp(s.telefone)); if (t) est.bloqueadosTel.add(t)
    const e = emailValido(s.email); if (e) est.bloqueadosEmail.add(e)
  }
  // Teto diário de e-mail: conta no banco, de TODOS os prospectos (não só os elegíveis desta lista), os envios de e-mail do Prospector
  // (primeiro contato e lembrete, enviado ou reservado) do dia de São Paulo, somando todas as execuções. O cron roda das 11h às 22h UTC
  // (8h às 19h em SP): nessa janela o dia de SP e o dia UTC da Resend são o mesmo. Transacional e resposta da diretoria não passam por aqui.
  est.teto = tetoEmailDia(cfg[CHAVE_LIMITE_EMAIL_DIA])
  res.tetoEmailDia = est.teto
  const limiteZap = limiteWhatsappDia(cfg[CHAVE_LIMITE_WHATSAPP_DIA])
  if (!deps.semEspacamento) { est.espacamentoMs.email = ESPACAMENTO_EMAIL_MS; est.espacamentoMs.whatsapp = espacamentoWhatsappMs(limiteZap) }
  const hoje = hojeSp(agora)
  {
    // Todo envio grava atualizado_em, então só as linhas tocadas hoje (SP, UTC-3) interessam. O PostgREST corta em 1000 linhas por
    // chamada (max-rows): pagina com range até vir página incompleta. Falha em qualquer página: nada sai nesta execução.
    // Dessas linhas saem o total de e-mails do dia (teto) e o instante do último envio de cada canal (espaçamento).
    const inicioDoDia = new Date(`${hoje}T00:00:00-03:00`).toISOString()
    const PAGINA = 1000
    let feitos = 0
    for (const canal of ["email", "whatsapp"] as const) for (let de = 0; ; de += PAGINA) {
      const { data, error } = await supabase.from(TABELA).select("id, historico_etapas").contains("historico_etapas", [{ envio: { canal } }])
        .gte("atualizado_em", inicioDoDia).order("id", { ascending: true }).range(de, de + PAGINA - 1)
      if (error) return { ...res, ok: false, erro: `não consegui contar os envios de hoje: ${error.message}` }
      const pagina = (data ?? []) as Linha[]
      for (const l of pagina) for (const e of enviosDe(l)) {
        if (e.canal !== canal || !saiu(e) || hojeSp(new Date(e.em)) !== hoje) continue
        if (canal === "email") feitos++
        const t = new Date(e.em).getTime()
        if (Number.isFinite(t) && t > (est.ultimoEnvioMs[canal] ?? 0)) est.ultimoEnvioMs[canal] = t
      }
      if (pagina.length < PAGINA) break
    }
    est.emailsFeitosHoje = feitos
  }
  const jaContatadas = (contatadas.data ?? []) as Linha[]
  const lista = (elegiveis.data ?? []) as Linha[]
  for (const l of [...jaContatadas, ...lista]) registrarUsos(est, l)

  await detectarRespostas(jaContatadas, agora, res)

  // Cota do WhatsApp: primeiros contatos por WhatsApp que começaram hoje, em horário de São Paulo (limite em AppConfig, padrão 30).
  const zapHoje = (l: Linha) => enviosDe(l).some(e => e.passo === "primeiro_contato" && e.canal === "whatsapp" && saiu(e) && hojeSp(new Date(e.em)) === hoje)
  let zapFeitosHoje = [...jaContatadas, ...lista].filter(zapHoje).length

  // Lembrete e encerramento (fora da cota do WhatsApp)
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

  // Primeiro contato, nota decrescente. Cada canal tem o seu teto diário (WhatsApp em AppConfig, padrão 30; e-mail em AppConfig, padrão 100) e o seu
  // espaçamento mínimo. Quem tem os dois canais: o e-mail sai mesmo com a cota do WhatsApp cheia; o WhatsApp fica pendente para o próximo dia com vaga.
  const pausado = deps.primeiroContatoPausado ?? PRIMEIRO_CONTATO_PAUSADO
  const abordadosComFalha = jaContatadas.filter(l => l.etapa === "abordado" && !l.opt_out && !passoIniciado(enviosDe(l), "lembrete"))
  for (const l0 of pausado ? [] : [...fila, ...abordadosComFalha].sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0))) {
    if (semFolga(est)) break
    const envios = enviosDe(l0)
    const ehNovo = !passoSaiu(envios, "primeiro_contato")
    const iniciado = passoIniciado(envios, "primeiro_contato")
    const pendentes = canaisPendentes(envios, "primeiro_contato", canaisDisponiveis(l0))
      .filter(c => !bloqueado(est, "primeiro_contato", c, l0))
      .filter(c => c !== "whatsapp" || zapFeitosHoje < limiteZap)
    if (!pendentes.length) continue
    const r = await mandarPasso(est, l0, "primeiro_contato", pendentes, agora, res)
    const zapSaiu = enviosDe(r.linha).some(e => e.passo === "primeiro_contato" && e.canal === "whatsapp" && saiu(e)) && !envios.some(e => e.passo === "primeiro_contato" && e.canal === "whatsapp" && saiu(e))
    if (zapSaiu) zapFeitosHoje++
    if (r.algumOk && !iniciado) res.primeiros++
  }

  emailParado(est)
  res.emailHoje = est.emailsFeitosHoje + est.emailsNestaExecucao
  if (est.motivoParada) res.motivoParada = est.motivoParada
  res.enviado = res.primeiros + res.lembretes > 0
  return res
}
