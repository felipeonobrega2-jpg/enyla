// Escrita limitada da CMO na Meta Ads (porta externa, acao=meta_ads): ligar, pausar e ajustar a verba diária de
// campanha que JÁ EXISTE. Nunca cria campanha, conjunto ou anúncio, nunca publica. Regras do Felipe (24/11/2026):
// no máximo 20% de mudança por ajuste; verba diária nunca acima de R$ 200 (recusa, não corta).
// Cada ação e cada recusa vai para dados_sistema (coleção metaAdsAcoes), só com insert: o histórico não se apaga.
// O token nunca é gravado, logado nem devolvido.
import { supabase } from "./supabase"
import { resolverTokenConta, limparCacheMetaAds, ErroMeta } from "./metaAdsLeitura"

const BASE = "https://graph.facebook.com/v20.0"
export const LIMITE_MUDANCA = 0.2
export const TETO_VERBA_DIARIA = 200
export const COLECAO_ACOES = "metaAdsAcoes"
const OPERACOES = ["ligar", "pausar", "ajustar_verba"] as const
type Operacao = (typeof OPERACOES)[number]
const CHAVES_ACEITAS = ["acao", "operacao", "campanhaId", "conjuntoId", "verbaDiaria"]

type Estado = { status?: string | null; verbaDiaria?: number | null }
export type RegistroAcao = {
  id: string; diretor: string; operacao: string; campanhaId?: string; campanhaNome?: string | null
  conjuntoId?: string; conjuntoNome?: string | null
  antes: Estado; depois: Estado | null; em: string; aceita: boolean; motivo?: string
}
export type Saida = { status: number; corpo: Record<string, unknown> }

const reais = (c: unknown) => c == null || c === "" || !Number.isFinite(Number(c)) ? null : Number(c) / 100
const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`

type Campanha = { id?: string; name?: string; status?: string; daily_budget?: string; lifetime_budget?: string; account_id?: string; campaign_id?: string }
type Erro = { error?: { code?: number; type?: string; message?: string; error_subcode?: number } }

// Message da Meta sem o token (o literal, access_token=... e qualquer EAA...), curta, para ir ao erro e ao registro.
function limparMensagem(m: unknown, token: string): string {
  let t = typeof m === "string" ? m : ""
  if (token) t = t.split(token).join("[token removido]")
  t = t.replace(/access_token=[^\s&"']+/gi, "access_token=[removido]").replace(/\bEAA[A-Za-z0-9]{10,}/g, "[token removido]")
  return t.replace(/\s+/g, " ").trim().slice(0, 300)
}

function erroGraph(j: Erro, escrita: boolean, conjunto = false, token = ""): ErroMeta {
  const cod = j.error?.code
  const sub = j.error?.error_subcode
  const msgMeta = limparMensagem(j.error?.message, token)
  const detalhe = msgMeta || sub != null ? ` Meta: ${msgMeta || "sem mensagem"}${sub != null ? ` (subcode ${sub})` : ""}.` : ""
  if (cod === 190) return new ErroMeta(401, "TOKEN_EXPIRED", "A Meta recusou o token (venceu ou foi derrubado).")
  if (cod === 100 && !escrita) return new ErroMeta(404, "CAMPANHA_NAO_ENCONTRADA", `${conjunto ? "A Meta não achou esse conjunto." : "A Meta não achou essa campanha."}${detalhe}`)
  if (cod === 100) {
    // Escrita: o GET do mesmo id já achou o objeto, então não é "não encontrado".
    if (sub === 33 || /unsupported post request|permiss|ads_management/i.test(msgMeta))
      return new ErroMeta(403, "SEM_ADS_MANAGEMENT", `A Meta recusou a escrita (o id existe): o token provavelmente não tem a permissão ads_management para esta conta, ou não pode editar este objeto.${detalhe}`)
    return new ErroMeta(400, "PARAMETRO_INVALIDO", `A Meta recusou a escrita por parâmetro inválido (o id existe e foi lido).${detalhe}`)
  }
  if (escrita && (cod === 200 || cod === 10 || j.error?.type === "OAuthException"))
    return new ErroMeta(403, "SEM_ADS_MANAGEMENT", `A Meta recusou a escrita: o token provavelmente não tem a permissão ads_management para esta conta.${detalhe}`)
  if (j.error?.type === "OAuthException") return new ErroMeta(403, "SEM_ACESSO_CONTA", conjunto ? "O token não tem acesso a este conjunto." : "O token não tem acesso a esta campanha.")
  return new ErroMeta(502, "META_ERRO", escrita ? "A Meta devolveu um erro ao gravar a mudança." : conjunto ? "A Meta devolveu um erro ao ler o conjunto." : "A Meta devolveu um erro ao ler a campanha.")
}

async function lerCampanha(id: string, token: string, conjunto = false): Promise<Campanha> {
  const qs = new URLSearchParams({ fields: conjunto ? "id,name,status,daily_budget,lifetime_budget,account_id,campaign_id" : "id,name,status,daily_budget,lifetime_budget,account_id", access_token: token })
  let r: Response
  try { r = await fetch(`${BASE}/${id}?${qs}`, { signal: AbortSignal.timeout(15000) }) }
  catch { throw new ErroMeta(502, "META_INDISPONIVEL", "Não consegui falar com a Meta.") }
  const j = await r.json().catch(() => ({})) as Campanha & Erro
  if (j.error) throw erroGraph(j, false, conjunto, token)
  return j
}

// Única escrita possível: status ou daily_budget (centavos) da campanha existente. O token vai no corpo, não na URL.
async function escreverCampanha(id: string, campos: { status: string } | { daily_budget: string }, token: string, conjunto = false) {
  const corpo = new URLSearchParams({ ...campos, access_token: token })
  let r: Response
  try { r = await fetch(`${BASE}/${id}`, { method: "POST", body: corpo, signal: AbortSignal.timeout(15000) }) }
  catch { throw new ErroMeta(502, "META_INDISPONIVEL", "Não consegui falar com a Meta.") }
  const j = await r.json().catch(() => ({})) as Erro & { success?: boolean }
  if (j.error) throw erroGraph(j, true, conjunto, token)
}

async function registrar(r: RegistroAcao): Promise<boolean> {
  try {
    const { error } = await supabase.from("dados_sistema").insert({ colecao: COLECAO_ACOES, id: r.id, dados: r, v: 1 })
    return !error
  } catch { return false }
}

const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const falha = (status: number, erro: string, extra: Record<string, unknown> = {}): Saida => ({ status, corpo: { erro, ...extra } })

export async function acaoMetaAds(diretor: string, b: Record<string, unknown>): Promise<Saida> {
  if (diretor !== "cmo") return falha(403, "meta_ads é só para a chave da CMO.")

  const extra = Object.keys(b).filter(k => !CHAVES_ACEITAS.includes(k))
  if (extra.length) return falha(400, `Campo não aceito: ${extra.join(", ")}. Só é possível ligar, pausar ou ajustar a verba diária de campanha existente.`)
  const operacao = b.operacao as Operacao
  if (!OPERACOES.includes(operacao)) return falha(400, `operacao: ${OPERACOES.join(" | ")}. Criar campanha, conjunto ou anúncio e publicar continuam com o Felipe.`)
  const idDe = (v: unknown) => typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : ""
  if (b.campanhaId !== undefined && b.conjuntoId !== undefined) return falha(400, "Mande campanhaId ou conjuntoId, nunca os dois.")
  const conjunto = b.conjuntoId !== undefined
  const campanhaId = idDe(conjunto ? b.conjuntoId : b.campanhaId)   // id do alvo (campanha ou conjunto)
  if (!/^\d{1,30}$/.test(campanhaId)) return falha(400, conjunto ? "conjuntoId: o id numérico de um conjunto que já existe." : "campanhaId: o id numérico de uma campanha que já existe.")
  let pedida: number | null = null
  if (operacao === "ajustar_verba") {
    const v = b.verbaDiaria
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return falha(400, "verbaDiaria: número maior que zero, em reais.")
    pedida = Math.round(v * 100) / 100
  } else if (b.verbaDiaria !== undefined) return falha(400, "verbaDiaria só vale em ajustar_verba.")

  let token: string, conta: string
  try { ({ token, conta } = await resolverTokenConta()) }
  catch (e) { return e instanceof ErroMeta ? falha(e.status, e.message, { codigo: e.codigo }) : falha(500, "Falha ao ler a configuração da Meta.") }

  try {
    const c = await lerCampanha(campanhaId, token, conjunto)
    if (String(c.id) !== campanhaId || !c.account_id || `act_${c.account_id}` !== conta)
      return falha(404, `${conjunto ? "Esse conjunto" : "Essa campanha"} não existe ou não pertence à conta de anúncios configurada.`)
    const antes: Estado = { status: c.status ?? null, verbaDiaria: reais(c.daily_budget) }
    const alvo = conjunto
      ? { conjuntoId: campanhaId, conjuntoNome: c.name ?? null, ...(c.campaign_id ? { campanhaId: String(c.campaign_id) } : {}) }
      : { campanhaId, campanhaNome: c.name ?? null }
    const base = { id: novoId(), diretor, operacao, ...alvo, antes }

    const recusar = async (motivo: string): Promise<Saida> => {
      const reg: RegistroAcao = { ...base, depois: null, em: new Date().toISOString(), aceita: false, motivo }
      const gravado = await registrar(reg)
      return falha(400, motivo, { registro: reg, registroGravado: gravado })
    }

    let campos: { status: string } | { daily_budget: string }
    let depois: Estado
    if (operacao === "ajustar_verba") {
      const atual = antes.verbaDiaria
      const novoC = Math.round(pedida! * 100)
      if (conjunto && (!atual || atual <= 0)) {
        if (c.lifetime_budget) return recusar("O conjunto tem só verba total (lifetime), sem verba diária: não há base para o limite de 20%. Nada foi alterado.")
        return recusar("A verba deste conjunto está na campanha (CBO): use campanhaId para ajustar. Nada foi alterado.")
      }
      const unidade = conjunto ? "conjunto" : "campanha"
      if (novoC > TETO_VERBA_DIARIA * 100) return recusar(`Verba diária pedida (${brl(pedida!)}) passa do teto de ${brl(TETO_VERBA_DIARIA)} por ${unidade}. Nada foi alterado.`)
      if (!atual || atual <= 0) return recusar("A campanha não tem verba diária atual (zero ou só verba total): não há base para o limite de 20%. Nada foi alterado.")
      const atualC = Math.round(atual * 100)
      if (Math.abs(novoC - atualC) > atualC * LIMITE_MUDANCA)
        return recusar(`Mudança de ${brl(atual)} para ${brl(pedida!)} passa de 20%. Aceito entre ${brl(atual * 0.8)} e ${brl(atual * 1.2)}. Nada foi alterado.`)
      campos = { daily_budget: String(novoC) }
      depois = { status: antes.status, verbaDiaria: pedida }
    } else {
      const status = operacao === "ligar" ? "ACTIVE" : "PAUSED"
      campos = { status }
      depois = { status, verbaDiaria: antes.verbaDiaria }
    }

    try { await escreverCampanha(campanhaId, campos, token, conjunto) }
    catch (e) {
      if (!(e instanceof ErroMeta)) throw e
      const reg: RegistroAcao = { ...base, depois: null, em: new Date().toISOString(), aceita: false, motivo: `${e.message} (${e.codigo})` }
      const gravado = await registrar(reg)
      return falha(e.status, e.message, { codigo: e.codigo, registro: reg, registroGravado: gravado })
    }
    limparCacheMetaAds()
    const reg: RegistroAcao = { ...base, depois, em: new Date().toISOString(), aceita: true }
    const gravado = await registrar(reg)
    return { status: 200, corpo: { ok: true, registro: reg, registroGravado: gravado } }
  } catch (e) {
    if (e instanceof ErroMeta) return falha(e.status, e.message, { codigo: e.codigo })
    return falha(500, "Falha ao falar com a Meta Ads.")
  }
}
