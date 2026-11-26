// Biblioteca de textos do Prospector (teste A/B): regras puras. Nada aqui lê banco nem envia mensagem.
// A coleção `prospectorTextos` mora em dados_sistema (prospectorTextosServidor.ts). Texto nunca é sobrescrito:
// editar é criar uma versão nova. Sem versão ativa na etapa, vale o texto padrão do código (TEXTOS_PADRAO).
import { ASSUNTO_EMAIL, URL_CADASTRO_PARCEIROS } from "./prospectorEnvio"

export const COLECAO_TEXTOS = "prospectorTextos"
export const ETAPAS_TEXTO = ["primeira", "resposta_sim", "resposta_nao"] as const
export type EtapaTexto = (typeof ETAPAS_TEXTO)[number]

export const CANAIS_TEXTO = ["whatsapp", "email"] as const
export type CanalTexto = (typeof CANAIS_TEXTO)[number]

export type TextoProspector = {
  id: string
  /** Canal do envio. Versão gravada antes do canal existir vale como whatsapp. */
  canal: CanalTexto
  etapa: EtapaTexto
  /** Só e-mail: assunto da mensagem. */
  assunto?: string
  /** Rótulo da versão no teste: A, B, C... */
  rotulo: string
  /** Corpo com as variáveis {nome}, {remetente} e {link}. */
  corpo: string
  ativo: boolean
  criadoEm: string
}

/** Chave de configuração do nome que assina a primeira mensagem ({remetente}). */
export const CHAVE_REMETENTE = "prospector_remetente"
export const REMETENTE_PADRAO = "Felipe"

/** Texto do código, usado quando não há versão ativa na etapa. `{link}` = URL_CADASTRO_PARCEIROS. A primeira mensagem não leva link. */
export const TEXTOS_PADRAO: Readonly<Record<EtapaTexto, string>> = {
  primeira: "Oi, {nome}, tudo bem? Aqui é o {remetente}, da ENYLA. Vocês pegam serviço terceirizado de outra gráfica?",
  resposta_sim: "Ótimo! A ENYLA vende impressão pro Brasil todo. Quando entra pedido do que vocês fazem, a gente passa pra uma gráfica parceira. Pra entrar nessa lista, é só se cadastrar aqui: {link}. Qualquer dúvida, me chama.",
  resposta_nao: "Sem problema, obrigado pelo retorno! Bom trabalho aí.",
}

/** Padrão do e-mail, etapa `primeira`: já leva o {link} (não há a pergunta em duas etapas). */
export const ASSUNTO_EMAIL_PADRAO = "Vocês pegam serviço terceirizado?"
export const CORPO_EMAIL_PADRAO = `Oi, tudo bem?

Aqui é o {remetente}, da ENYLA. A gente recebe pedidos de impressão do Brasil todo e produz com gráficas parceiras. Cada parceira recebe só o pedido do que ela faz.

Se vocês pegam serviço de terceiro, cadastrem o que vocês fazem aqui, leva uns 5 minutos: {link}

Quando entrar pedido do que vocês fazem, a gente chama vocês.

{remetente}`

/** Texto e assunto do código para o canal e a etapa. E-mail sem padrão próprio na etapa usa o texto do WhatsApp. */
export function textoPadrao(etapa: EtapaTexto, canal: CanalTexto = "whatsapp"): { corpo: string; assunto?: string } {
  if (canal === "email") return { corpo: etapa === "primeira" ? CORPO_EMAIL_PADRAO : TEXTOS_PADRAO[etapa], assunto: etapa === "primeira" ? ASSUNTO_EMAIL_PADRAO : ASSUNTO_EMAIL }
  return { corpo: TEXTOS_PADRAO[etapa] }
}

export const LIMITE_ROTULO = 20
export const LIMITE_ASSUNTO = 150
export const LIMITE_CORPO = 1000

export const ehCanalTexto = (v: unknown): v is CanalTexto => (CANAIS_TEXTO as readonly unknown[]).includes(v)
export const ehEtapaTexto = (v: unknown): v is EtapaTexto => (ETAPAS_TEXTO as readonly unknown[]).includes(v)

/**
 * Preenche as variáveis. `{nome}` só entra quando `nome` vem preenchido (o servidor passa o resultado de `nomeParaChamar`, que
 * só reconhece nome de gente). Sem nome, tira ", {nome}" junto com a vírgula: "Oi, {nome}, tudo bem?" vira "Oi, tudo bem?".
 */
export function montarTexto(corpo: string, v: { nome?: string; remetente?: string; link?: string }): string {
  const nome = (v.nome ?? "").trim()
  let t = corpo
  t = nome
    ? t.replace(/\{nome\}/g, nome)
    : t.replace(/\s*,\s*\{nome\}/g, "").replace(/\{nome\}\s*,?\s*/g, "")
  return t
    .replace(/\{remetente\}/g, (v.remetente ?? "").trim() || REMETENTE_PADRAO)
    .replace(/\{link\}/g, v.link ?? URL_CADASTRO_PARCEIROS)
    .replace(/[ \t]{2,}/g, " ").trim()
}

/** Versões ativas da etapa no canal, da mais antiga para a mais nova (ordem estável para o sorteio). */
export const ativosDaEtapa = (textos: readonly TextoProspector[], etapa: EtapaTexto, canal: CanalTexto = "whatsapp"): TextoProspector[] =>
  textos.filter(t => t.etapa === etapa && t.canal === canal && t.ativo).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id))

/** Sorteio com peso igual entre as versões ativas da etapa no canal do envio. Nenhuma ativa: null (quem chama usa o texto do código). `aleatorio` é [0, 1). */
export function sortearTexto(textos: readonly TextoProspector[], etapa: EtapaTexto, canal: CanalTexto = "whatsapp", aleatorio: () => number = Math.random): TextoProspector | null {
  const ativos = ativosDaEtapa(textos, etapa, canal)
  if (!ativos.length) return null
  const i = Math.min(ativos.length - 1, Math.max(0, Math.floor(aleatorio() * ativos.length)))
  return ativos[i]
}

export type EscolhaTexto = {
  /** Corpo ainda com as variáveis. */
  corpo: string
  /** Só e-mail. */
  assunto?: string
  /** Id da versão da biblioteca; ausente quando valeu o texto do código. */
  textoId?: string
}

/** Versão sorteada da biblioteca (só do canal do envio) ou, sem nenhuma ativa, o texto do código. */
export function escolherTexto(textos: readonly TextoProspector[], etapa: EtapaTexto, canal: CanalTexto = "whatsapp", aleatorio: () => number = Math.random): EscolhaTexto {
  const t = sortearTexto(textos, etapa, canal, aleatorio)
  if (t) return { corpo: t.corpo, ...(canal === "email" ? { assunto: t.assunto || ASSUNTO_EMAIL_PADRAO } : {}), textoId: t.id }
  return textoPadrao(etapa, canal)
}

/** Texto padrão da primeira mensagem, já preenchido. */
export const textoPrimeiroContato = (nome = "", remetente = REMETENTE_PADRAO) => montarTexto(TEXTOS_PADRAO.primeira, { nome, remetente })

/** Lê um item da coleção sem confiar no formato; null se não for um texto válido. */
export function textoDe(x: unknown): TextoProspector | null {
  if (!x || typeof x !== "object") return null
  const t = x as Partial<TextoProspector>
  if (typeof t.id !== "string" || !t.id || !ehEtapaTexto(t.etapa) || typeof t.corpo !== "string" || !t.corpo.trim()) return null
  const canal: CanalTexto = ehCanalTexto(t.canal) ? t.canal : "whatsapp"
  return { id: t.id, canal, etapa: t.etapa, ...(canal === "email" && typeof t.assunto === "string" && t.assunto.trim() ? { assunto: t.assunto.trim() } : {}), rotulo: String(t.rotulo ?? ""), corpo: t.corpo, ativo: t.ativo === true, criadoEm: String(t.criadoEm ?? "") }
}

export type PedidoTexto = { canal?: unknown; assunto?: unknown; etapa?: unknown; rotulo?: unknown; corpo?: unknown }

/** Valida e monta uma versão NOVA (nunca altera outra). Nasce desligada: só entra no sorteio depois de ativar. */
export function novaVersao(p: PedidoTexto, id: string, agora: Date): { ok: true; texto: TextoProspector } | { ok: false; erro: string } {
  if (!ehEtapaTexto(p.etapa)) return { ok: false, erro: `etapa: ${ETAPAS_TEXTO.join(", ")}.` }
  const canal = p.canal === undefined || p.canal === null || p.canal === "" ? "whatsapp" : p.canal
  if (!ehCanalTexto(canal)) return { ok: false, erro: `canal: ${CANAIS_TEXTO.join(", ")}.` }
  const assunto = typeof p.assunto === "string" ? p.assunto.trim() : ""
  if (canal === "email" && (!assunto || assunto.length > LIMITE_ASSUNTO)) return { ok: false, erro: `assunto é obrigatório no e-mail (até ${LIMITE_ASSUNTO} caracteres).` }
  const rotulo = typeof p.rotulo === "string" ? p.rotulo.trim() : ""
  if (!rotulo || rotulo.length > LIMITE_ROTULO) return { ok: false, erro: `rotulo é obrigatório (até ${LIMITE_ROTULO} caracteres), ex.: A, B, C.` }
  const corpo = typeof p.corpo === "string" ? p.corpo.trim() : ""
  if (!corpo || corpo.length > LIMITE_CORPO) return { ok: false, erro: `corpo é obrigatório (até ${LIMITE_CORPO} caracteres).` }
  return { ok: true, texto: { id, canal, etapa: p.etapa, ...(canal === "email" ? { assunto } : {}), rotulo, corpo, ativo: false, criadoEm: agora.toISOString() } }
}

// ── Contagem por versão ──────────────────────────────────────────────────────
export type ContagemVersao = { id: string; canal: CanalTexto; assunto?: string; etapa: EtapaTexto; rotulo: string; corpo: string; ativo: boolean; criadoEm: string; enviados: number; responderam: number; responderamSim: number; cadastros: number }

type ItemHistorico = { etapa?: string; resposta?: string; cadastroId?: string; envio?: { passo?: string; status?: string; textoId?: string } }

/** Resposta do prospecto classificada só para o teste A/B: "sim" quando o texto curto é uma afirmação clara; "nao" para recusa; senão "outra". */
export function classificarResposta(texto: string | null | undefined): "sim" | "nao" | "outra" {
  const t = (texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()
  if (!t || t.length > 60) return "outra"
  if (/^(nao|n|nao obrigad[oa]|nao fazemos|nao fazemos nao|nao pegamos|nao pegamos nao|nao trabalhamos)\b/.test(t)) return "nao"
  if (/^(sim|s|pegamos|fazemos|fazemos sim|pegamos sim|pegamos sim senhor|claro|com certeza|trabalhamos|trabalhamos sim|isso|isso mesmo|uhum|aham|positivo|temos sim|fazemos sim senhor)\b/.test(t)) return "sim"
  return "outra"
}

/**
 * Por versão: enviados (contatos que receberam a versão no primeiro contato), responderam, responderam sim e cadastros em /parceiros.
 * Cada contato conta uma vez por versão. Só conta envio que saiu (enviado ou reservado). Versões sem envio aparecem com zeros.
 * `prospectos`: só o histórico de cada um (sem dado de contato).
 */
export function contarPorVersao(textos: readonly TextoProspector[], prospectos: readonly { historico_etapas?: unknown }[]): ContagemVersao[] {
  const soma = new Map<string, { enviados: number; responderam: number; responderamSim: number; cadastros: number }>()
  for (const p of prospectos) {
    const h = (Array.isArray(p.historico_etapas) ? p.historico_etapas : []).filter((x): x is ItemHistorico => !!x && typeof x === "object")
    const ids = new Set<string>()
    for (const x of h) {
      const e = x.envio
      if (e && e.passo === "primeiro_contato" && (e.status === "enviado" || e.status === "reservado") && typeof e.textoId === "string" && e.textoId) ids.add(e.textoId)
    }
    if (!ids.size) continue
    const respondeu = h.some(x => x.etapa === "respondeu")
    const sim = h.some(x => x.etapa === "respondeu" && x.resposta === "sim")
    const cadastrou = h.some(x => x.etapa === "cadastrou" || !!x.cadastroId)
    for (const id of ids) {
      const s = soma.get(id) ?? { enviados: 0, responderam: 0, responderamSim: 0, cadastros: 0 }
      s.enviados++
      if (respondeu) s.responderam++
      if (sim) s.responderamSim++
      if (cadastrou) s.cadastros++
      soma.set(id, s)
    }
  }
  const zero = { enviados: 0, responderam: 0, responderamSim: 0, cadastros: 0 }
  return [...textos].sort((a, b) => a.etapa.localeCompare(b.etapa) || a.canal.localeCompare(b.canal) || a.criadoEm.localeCompare(b.criadoEm))
    .map(t => ({ id: t.id, canal: t.canal, ...(t.assunto ? { assunto: t.assunto } : {}), etapa: t.etapa, rotulo: t.rotulo, corpo: t.corpo, ativo: t.ativo, criadoEm: t.criadoEm, ...(soma.get(t.id) ?? zero) }))
}
