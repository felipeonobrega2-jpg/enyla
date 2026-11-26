// Biblioteca de textos do Prospector (teste A/B): regras puras. Nada aqui lê banco nem envia mensagem.
// Cada texto é uma versão imutável: editar cria outra versão, a anterior fica. O servidor está em prospectorTextosServidor.ts.
import { envioDe, saiu } from "./prospectorEnvio"

export type EtapaTexto = "primeira" | "resposta_sim"
export const ETAPAS_TEXTO: readonly EtapaTexto[] = ["primeira", "resposta_sim"]
export const COLECAO_TEXTOS = "prospectorTextos"
export const LIMITE_CORPO = 2000
export const LIMITE_ROTULO = 20

export type TextoProspector = { id: string; etapa: EtapaTexto; rotulo: string; corpo: string; ativo: boolean; criadaEm: string }

export const ehEtapaTexto = (v: unknown): v is EtapaTexto => v === "primeira" || v === "resposta_sim"

/** Versões ativas da etapa, na ordem estável do id (o sorteio não depende da ordem em que o banco devolveu). */
export const versoesAtivas = (textos: readonly TextoProspector[], etapa: EtapaTexto): TextoProspector[] =>
  textos.filter(t => t.etapa === etapa && t.ativo === true && typeof t.corpo === "string" && t.corpo.trim()).sort((a, b) => a.id.localeCompare(b.id))

/** Sorteio com peso igual entre as versões ativas da etapa. `sorte` devolve [0,1). Sem versão ativa: null (quem chama usa o texto do código). */
export function sortearTexto(textos: readonly TextoProspector[], etapa: EtapaTexto, sorte: () => number = Math.random): TextoProspector | null {
  const v = versoesAtivas(textos, etapa)
  if (!v.length) return null
  return v[Math.min(v.length - 1, Math.floor(sorte() * v.length))]
}

/** Troca {nome} e {link}. Variável sem valor some (não deixa chave solta na mensagem). */
export function preencherTexto(corpo: string, vars: { nome?: string | null; link?: string | null }): string {
  return corpo.replace(/\{nome\}/g, vars.nome?.trim() ?? "").replace(/\{link\}/g, vars.link ?? "").replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").trim()
}

export type NovoTexto = { etapa: EtapaTexto; rotulo: string; corpo: string }
/** Valida o corpo do POST guardar_texto_prospector. Devolve o texto limpo ou o motivo da recusa. */
export function validarNovoTexto(b: Record<string, unknown>): { ok: true; texto: NovoTexto } | { ok: false; erro: string } {
  if (!ehEtapaTexto(b.etapa)) return { ok: false, erro: "etapa: primeira | resposta_sim" }
  const rotulo = typeof b.rotulo === "string" ? b.rotulo.trim() : ""
  if (!rotulo || rotulo.length > LIMITE_ROTULO) return { ok: false, erro: `rotulo obrigatório (até ${LIMITE_ROTULO} caracteres), ex.: A, B, C` }
  const corpo = typeof b.corpo === "string" ? b.corpo.trim() : ""
  if (!corpo || corpo.length > LIMITE_CORPO) return { ok: false, erro: `corpo obrigatório (até ${LIMITE_CORPO} caracteres), com {nome} e {link} se quiser` }
  return { ok: true, texto: { etapa: b.etapa, rotulo, corpo } }
}

const normaliza = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()
/** "Sim" claro: resposta curta e afirmativa. Frase longa é conversa, não conta. */
export function ehSim(texto: string | null | undefined): boolean {
  const t = normaliza(texto ?? "")
  if (!t || t.length > 40) return false
  return /^(sim|s|claro|com certeza|fazemos|faco|fazemos sim|faco sim|trabalhamos|trabalhamos sim|pode ser|temos|temos sim|sim fazemos|sim faco)( .*)?$/.test(t) && !/\bnao\b/.test(t)
}

export type ProspectoParaContagem = { etapa: string; historico_etapas: unknown }
export type ContagemVersao = { id: string; etapa: EtapaTexto; rotulo: string; ativo: boolean; criadaEm: string; enviados: number; responderam: number; responderamSim: number; cadastros: number }

/**
 * Por versão: quantos prospectos receberam (envio que saiu com o id da versão), quantos desses responderam, responderam sim
 * e se cadastraram em /parceiros. Cada prospecto conta uma vez por versão. Resposta e cadastro vêm do histórico do funil
 * (a linha `respondeu` com `sim: true` e a etapa `cadastrou`), então valem mesmo depois de a etapa mudar.
 */
export function contarPorVersao(textos: readonly TextoProspector[], prospectos: readonly ProspectoParaContagem[]): ContagemVersao[] {
  const c = new Map<string, ContagemVersao>(textos.map(t => [t.id, { id: t.id, etapa: t.etapa, rotulo: t.rotulo, ativo: t.ativo, criadaEm: t.criadaEm, enviados: 0, responderam: 0, responderamSim: 0, cadastros: 0 }]))
  for (const p of prospectos) {
    const h = (Array.isArray(p.historico_etapas) ? p.historico_etapas : []).filter((x): x is { etapa?: string; sim?: boolean } => !!x && typeof x === "object")
    const ids = new Set<string>()
    for (const x of h) { const e = envioDe(x); if (e?.textoId && saiu(e)) ids.add(e.textoId) }
    if (!ids.size) continue
    const respondeu = h.some(x => x.etapa === "respondeu")
    const sim = h.some(x => x.etapa === "respondeu" && x.sim === true)
    const cadastrou = p.etapa === "cadastrou" || h.some(x => x.etapa === "cadastrou")
    for (const id of ids) {
      const v = c.get(id)
      if (!v) continue
      v.enviados++
      if (respondeu) v.responderam++
      if (sim) v.responderamSim++
      if (cadastrou) v.cadastros++
    }
  }
  return [...c.values()].sort((a, b) => a.etapa.localeCompare(b.etapa) || a.criadaEm.localeCompare(b.criadaEm))
}
