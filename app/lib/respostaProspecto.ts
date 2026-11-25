// Resposta dos diretores (CCO e CMO) aos e-mails do Prospector, pela Resend, sem depender do Gmail do Felipe.
// Destinatário SEMPRE vem de prospectos_parceiros.email (nunca do corpo). Cliente A/B/C/indefinido não recebe por aqui:
// vai para o caminho do Aprovo. Cota esgotada ou erro 5xx da Resend não perde o e-mail: fica em emails_saida_fila e o cron
// /api/prospector/fila-respostas reenvia. Cota própria (RESPOSTAS_TETO_EMAIL_DIA, padrão 20 por dia de São Paulo), separada do Prospector:
// estas linhas não têm "envio" no historico_etapas do prospecto, então nada aqui entra na contagem do Prospector.
import { supabase } from "./supabase"
import { enviarEmail } from "./email"
import { hojeSp, type EtapaFunil, type MudancaEtapa } from "./prospector"
import { ASSUNTO_EMAIL, REMETENTE_REPLY_TO, emailValido } from "./prospectorEnvio"
import { carregarFontesNivel, classificarNivel } from "./nivelCliente"
import { podeAcionarComercial } from "./ordemComercial"
import type { IdDiretor } from "./diretoria"

export const REMETENTE_RESPOSTA = "ENYLA Embalagens <parceiros@enyla.com.br>"
export const TETO_RESPOSTAS_PADRAO = 20
export const MAX_TENTATIVAS = 3
export const TENTA_DE_COTA = "21:00 de Brasília"
export const TENTA_DE_TETO = "00:00 de Brasília (dia seguinte)"
const ESPERA_CRON_MS = 2 * 60_000   // a ação tenta na hora; o cron só pega o que ficou na fila há mais de 2 min (sem envio duplo)
const MAX_POR_EXECUCAO = 20
const ORCAMENTO_MS = 90_000

const TABELA = "prospectos_parceiros"
const FILA = "emails_saida_fila"

export const tetoRespostas = () => { const n = Number(process.env.RESPOSTAS_TETO_EMAIL_DIA); return Number.isFinite(n) && n >= 0 && process.env.RESPOSTAS_TETO_EMAIL_DIA ? Math.floor(n) : TETO_RESPOSTAS_PADRAO }
export const replyToResposta = () => process.env.PROSPECTOR_REPLY_TO || REMETENTE_REPLY_TO
/** Início do dia de São Paulo (UTC-3, sem horário de verão) para filtrar enviado_em. */
const inicioDoDiaSp = (agora: Date) => `${hojeSp(agora)}T00:00:00-03:00`

type Prospecto = { id: number; cnpj: string; email: string | null; etapa: string; opt_out: boolean; historico_etapas: unknown; atualizado_em: string }
type Item = { id: number; prospecto_id: number; para: string; assunto: string; texto: string; diretor: string; status: string; tentativas: number; ultimo_erro: string | null; criado_em: string; enviado_em: string | null; resend_id: string | null }
type Falha = { ok: false; erro: string; status?: number; cota?: boolean }
type Corpo = Record<string, unknown>
export type Resultado = { status: number; corpo: Corpo }

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]!)).replace(/\n/g, "<br>")
const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "")

/** Cota esgotada (429 diária/mensal) ou 5xx: guardar na fila. Qualquer outro erro é falha de verdade. */
const ehTransitorio = (f: Falha) => !!f.cota || (f.status !== undefined && f.status >= 500)

async function enviarPelaResend(i: { para: string; assunto: string; texto: string }) {
  return enviarEmail(i.para, { assunto: i.assunto, texto: i.texto, html: `<p>${esc(i.texto)}</p>` }, [], { de: REMETENTE_RESPOSTA, responderPara: replyToResposta() })
}

export async function enviadosHoje(agora = new Date()): Promise<number> {
  const { count } = await supabase.from(FILA).select("id", { count: "exact", head: true }).eq("status", "enviado").gte("enviado_em", inicioDoDiaSp(agora))
  return count ?? 0
}

/** O e-mail ou o CNPJ do prospecto casa com cliente que já comprou (A, B, C) ou indefinido? Leitura falha = trata como cliente. */
export async function clienteDoProspecto(p: { email: string | null; cnpj: string }): Promise<{ bloqueia: boolean; nivel?: string; motivo?: string }> {
  const email = emailValido(p.email)?.toLowerCase()
  const cnpj = soDigitos(p.cnpj)
  const { data, error } = await supabase.from("Cliente").select("nome, telefone, email, cnpj")
  if (error) return { bloqueia: true, nivel: "indefinido", motivo: "não consegui ler o cadastro de clientes: tratado como cliente por segurança" }
  const casados = ((data ?? []) as { nome: string | null; telefone: string | null; email?: string | null; cnpj?: string | null }[])
    .filter(c => (email && c.email?.trim().toLowerCase() === email) || (cnpj.length === 14 && soDigitos(c.cnpj) === cnpj))
  if (!casados.length) return { bloqueia: false }
  const f = await carregarFontesNivel()
  for (const c of casados) {
    const jid = "prospecto:vinculo"
    const n = classificarNivel({ jid, nome: c.nome, telefone: c.telefone }, { ...f, vinculos: { ...(f.vinculos ?? {}), [jid]: c.nome ?? "" } })
    if (n.nivel !== "lead") return { bloqueia: true, nivel: n.nivel, motivo: n.motivo }
  }
  return { bloqueia: false }
}

/** Grava no historico_etapas do prospecto, sem mudar a etapa. Trava otimista; relê e tenta de novo se alguém gravou antes. */
async function registrarNoHistorico(prospectoId: number, diretor: string, em: string) {
  for (let i = 0; i < 3; i++) {
    const { data } = await supabase.from(TABELA).select("id, etapa, historico_etapas, atualizado_em").eq("id", prospectoId).maybeSingle()
    const p = data as Pick<Prospecto, "id" | "etapa" | "historico_etapas" | "atualizado_em"> | null
    if (!p) return
    const h = (Array.isArray(p.historico_etapas) ? p.historico_etapas : []) as unknown[]
    const nova = { etapa: p.etapa as EtapaFunil, em, motivo: `resposta por e-mail (${diretor})`, resposta: { canal: "email", diretor, em } } satisfies MudancaEtapa & { resposta: unknown }
    const { data: g, error } = await supabase.from(TABELA).update({ historico_etapas: [...h, nova], atualizado_em: new Date().toISOString() }).eq("id", p.id).eq("atualizado_em", p.atualizado_em).select("id")
    if (!error && Array.isArray(g) && g.length) return
  }
}

async function fechar(it: Item, campos: Record<string, unknown>) {
  await supabase.from(FILA).update(campos).eq("id", it.id)
}

/** Tenta enviar um item da fila e grava o desfecho. cota: a Resend recusou por cota (não conta tentativa). */
async function tentar(it: Item, agora: Date): Promise<{ ok: true } | (Falha & { novoStatus: string })> {
  let r: Awaited<ReturnType<typeof enviarEmail>>
  try { r = await enviarPelaResend(it) } catch (e) { r = { ok: false, erro: String(e) } }
  if (r.ok) {
    await fechar(it, { status: "enviado", tentativas: it.tentativas + 1, enviado_em: agora.toISOString(), resend_id: r.id, ultimo_erro: null })
    await registrarNoHistorico(it.prospecto_id, it.diretor, agora.toISOString())
    return { ok: true }
  }
  if (r.cota) { await fechar(it, { ultimo_erro: r.erro }); return { ...r, novoStatus: "na_fila" } }
  const tentativas = it.tentativas + 1
  const novoStatus = tentativas >= MAX_TENTATIVAS ? "falhou" : "na_fila"
  await fechar(it, { tentativas, ultimo_erro: r.erro, status: novoStatus })
  return { ...r, novoStatus }
}

/** POST {acao:'responder_prospecto', prospecto_id, texto, assunto?} (CCO e CMO). */
export async function responderProspecto(diretor: IdDiretor, b: Record<string, unknown>, agora = new Date()): Promise<Resultado> {
  if (!podeAcionarComercial(diretor)) return { status: 403, corpo: { erro: "responder_prospecto é só para as chaves do CCO e da CMO." } }
  const id = Number(b.prospecto_id)
  if (!Number.isInteger(id) || id <= 0) return { status: 400, corpo: { erro: "prospecto_id obrigatório (número do prospecto)." } }
  const texto = typeof b.texto === "string" ? b.texto.trim().slice(0, 4000) : ""
  if (!texto) return { status: 400, corpo: { erro: "texto vazio" } }
  const assunto = (typeof b.assunto === "string" && b.assunto.trim() ? b.assunto.trim() : `Re: ${ASSUNTO_EMAIL}`).slice(0, 200).replace(/[\r\n]+/g, " ")

  const { data, error } = await supabase.from(TABELA).select("id, cnpj, email, etapa, opt_out, historico_etapas, atualizado_em").eq("id", id).maybeSingle()
  if (error) return { status: 503, corpo: { erro: "Não consegui ler o prospecto." } }
  const p = data as Prospecto | null
  if (!p) return { status: 404, corpo: { erro: "Prospecto não encontrado." } }
  if (p.opt_out || p.etapa === "descartado") return { status: 409, corpo: { erro: "Prospecto pediu para sair ou está descartado: não se escreve a ele.", motivo: p.opt_out ? "opt_out" : "descartado" } }
  const para = emailValido(p.email)   // sempre do banco; o corpo nunca escolhe o destinatário
  if (!para) return { status: 422, corpo: { erro: "Este prospecto não tem e-mail válido cadastrado." } }

  const n = await clienteDoProspecto(p)
  if (n.bloqueia) return { status: 409, corpo: { ok: false, erro: "O e-mail ou o CNPJ é de cliente (nível A, B, C ou indefinido): não envio por aqui. Use ordenar_funcionario, que segue no Aprovo do Felipe.", destino: "fila_aprovo", nivel: n.nivel, motivo: n.motivo } }

  const { data: criado, error: e2 } = await supabase.from(FILA).insert({ prospecto_id: p.id, para, assunto, texto, diretor, status: "na_fila", tentativas: 0 }).select("*").single()
  if (e2 || !criado) return { status: 503, corpo: { erro: "Não consegui guardar o e-mail (a tabela emails_saida_fila existe? Rode a migração 20261128_emails_saida_fila.sql)." } }
  const it = criado as Item

  if (await enviadosHoje(agora) >= tetoRespostas()) return { status: 202, corpo: { ok: true, fila: true, tentaDe: TENTA_DE_TETO, id: it.id, motivo: `teto de ${tetoRespostas()} respostas por dia` } }
  const r = await tentar(it, agora)
  if (r.ok) return { status: 200, corpo: { ok: true, enviado: true, id: it.id, para } }
  if (ehTransitorio(r)) return { status: 202, corpo: { ok: true, fila: true, tentaDe: TENTA_DE_COTA, id: it.id } }
  return { status: 502, corpo: { ok: false, erro: r.erro, id: it.id, status: r.novoStatus } }
}

export type ResultadoFila = { ok: boolean; enviados: number; falhas: number; fica: number; paradoPorCota: boolean; erro?: string }

/** Cron: envia os na_fila mais antigos primeiro. Cota esgotada não conta tentativa; outro erro conta, e na 3ª vira falhou. */
export async function processarFila(agora = new Date()): Promise<ResultadoFila> {
  const res: ResultadoFila = { ok: true, enviados: 0, falhas: 0, fica: 0, paradoPorCota: false }
  const { data, error } = await supabase.from(FILA).select("*").eq("status", "na_fila").lte("criado_em", new Date(agora.getTime() - ESPERA_CRON_MS).toISOString()).order("criado_em", { ascending: true }).limit(200)
  if (error) return { ...res, ok: false, erro: error.message }
  const fila = (data ?? []) as Item[]
  let vagas = Math.max(0, tetoRespostas() - await enviadosHoje(agora))
  const limite = Date.now() + ORCAMENTO_MS
  let feitos = 0
  for (const it of fila) {
    if (vagas <= 0 || res.paradoPorCota || feitos >= MAX_POR_EXECUCAO || Date.now() >= limite) { res.fica++; continue }
    // quem pediu para sair depois de entrar na fila não recebe
    const { data: pd } = await supabase.from(TABELA).select("opt_out, etapa").eq("id", it.prospecto_id).maybeSingle()
    const p = pd as { opt_out: boolean; etapa: string } | null
    if (!p || p.opt_out || p.etapa === "descartado") { await fechar(it, { status: "falhou", ultimo_erro: "prospecto saiu (opt-out ou descartado) antes do envio" }); res.falhas++; continue }
    feitos++
    const r = await tentar(it, agora)
    if (r.ok) { res.enviados++; vagas--; continue }
    if (r.cota) { res.paradoPorCota = true; res.fica++; continue }
    if (r.novoStatus === "falhou") res.falhas++; else res.fica++
  }
  return res
}

/** GET ?o=respostas_prospector: a fila (sem o corpo do e-mail) e o que saiu hoje. Só CCO e CMO. */
export async function lerRespostasProspector(diretor: IdDiretor, agora = new Date()): Promise<Resultado> {
  if (!podeAcionarComercial(diretor)) return { status: 403, corpo: { erro: "?o=respostas_prospector é só para as chaves do CCO e da CMO." } }
  const { data, error } = await supabase.from(FILA).select("id, prospecto_id, para, assunto, texto, diretor, status, tentativas, ultimo_erro, criado_em, enviado_em").order("criado_em", { ascending: false }).limit(100)
  if (error) return { status: 503, corpo: { erro: "Não consegui ler a fila (rode a migração 20261128_emails_saida_fila.sql?)." } }
  const itens = (data ?? []) as Item[]
  const hoje = await enviadosHoje(agora)
  const teto = tetoRespostas()
  const tira = ({ texto, ...resto }: Item) => ({ ...resto, tamanhoDoTexto: texto.length })   // sem o corpo completo
  return { status: 200, corpo: {
    teto, enviadosHoje: hoje, restanteHoje: Math.max(0, teto - hoje),
    naFila: itens.filter(i => i.status === "na_fila").map(tira),
    falhou: itens.filter(i => i.status === "falhou").map(tira),
    enviadosHojeLista: itens.filter(i => i.status === "enviado" && i.enviado_em && i.enviado_em >= inicioDoDiaSp(agora)).map(tira),
  } }
}

export const AJUDA_RESPOSTAS = "SÓ CCO e CMO. A fila de respostas por e-mail aos prospectos (status, tentativas, último erro, sem o corpo do e-mail) e quantos saíram hoje (teto próprio, dia de São Paulo)"
export const AJUDA_RESPONDER = "SÓ CCO e CMO (as outras recebem 403). Responde por e-mail (Resend, de parceiros@enyla.com.br) a um prospecto do Prospector de Parceiros. O destinatário é SEMPRE o e-mail do prospecto no banco (o corpo não escolhe). texto obrigatório (até 4000); assunto opcional (padrão 'Re: ' + assunto do Prospector). Recusa 409 se o prospecto pediu para sair ou foi descartado, e 409 destino 'fila_aprovo' se o e-mail ou o CNPJ for de cliente A, B, C ou indefinido (use ordenar_funcionario, que vai ao Aprovo). Se a Resend estiver sem cota (429 diária/mensal) ou com erro 5xx, o e-mail fica na fila e a resposta é 202 { fila: true, tentaDe: '21:00 de Brasília' }; o cron reenvia a cada 15 min (3 erros que não são de cota = falhou). Teto próprio de respostas por dia (padrão 20), fora do teto do Prospector; acima disso fica na fila para o dia seguinte. Enviado: 200 { ok, enviado, id } e o histórico do prospecto ganha { resposta }. Acompanhe em ?o=respostas_prospector"
