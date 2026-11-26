// Biblioteca de textos do Prospector: leitura, criação de versão e liga/desliga (coleção prospectorTextos em dados_sistema)
// e a leitura de contagem por versão da porta. NUNCA envia nada.
import { lerCampos, mudarConfig } from "./configAtomica"
import { supabase } from "./supabase"
import { COLECAO_TEXTOS, contarPorVersao, validarNovoTexto, type ProspectoParaContagem, type TextoProspector } from "./prospectorTextos"

export const AJUDA_TEXTOS_PROSPECTOR = "SÓ CCO e CMO (as outras recebem 403). GET ?o=detalhe&area=prospector_textos: por versão de texto do Prospector (etapa primeira | resposta_sim, rotulo, ativo): enviados, responderam, responderamSim e cadastros em /parceiros. POST {acao:'guardar_texto_prospector', etapa, rotulo, corpo} cria uma versão nova (nunca sobrescreve; corpo aceita {nome} e {link}); POST {acao:'ativar_texto_prospector', id, ativo:true|false} liga ou desliga uma versão. Com mais de uma versão ativa na etapa, o envio sorteia com peso igual; sem nenhuma, usa o texto do código"

const novoId = () => `txt-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const bom = (t: unknown): t is TextoProspector => !!t && typeof t === "object" && typeof (t as TextoProspector).id === "string" && typeof (t as TextoProspector).corpo === "string"

/** Lê a biblioteca. Qualquer falha devolve vazio: o envio segue com o texto do código. */
export async function lerTextosProspector(): Promise<TextoProspector[]> {
  try {
    const cfg = await lerCampos<{ prospectorTextos?: unknown }>([COLECAO_TEXTOS])
    return Array.isArray(cfg.prospectorTextos) ? cfg.prospectorTextos.filter(bom) : []
  } catch { return [] }
}

export type RespostaTexto = { status: number; corpo: Record<string, unknown> }

export async function guardarTexto(b: Record<string, unknown>, agora: Date = new Date()): Promise<RespostaTexto> {
  const v = validarNovoTexto(b)
  if (!v.ok) return { status: 400, corpo: { erro: v.erro } }
  const texto: TextoProspector = { id: novoId(), ...v.texto, ativo: true, criadaEm: agora.toISOString() }
  try {
    await mudarConfig<{ prospectorTextos?: TextoProspector[] }>(d => ({ prospectorTextos: [texto, ...(Array.isArray(d.prospectorTextos) ? d.prospectorTextos : [])] }))
  } catch { return { status: 500, corpo: { erro: "Não consegui gravar o texto." } } }
  return { status: 200, corpo: { ok: true, resultado: `Versão ${texto.rotulo} (${texto.etapa}) criada e ativa.`, texto } }
}

export async function ativarTexto(b: Record<string, unknown>): Promise<RespostaTexto> {
  const id = typeof b.id === "string" ? b.id.trim() : ""
  if (!id) return { status: 400, corpo: { erro: "id obrigatório" } }
  if (typeof b.ativo !== "boolean") return { status: 400, corpo: { erro: "ativo: true | false" } }
  let achado: TextoProspector | null = null
  try {
    await mudarConfig<{ prospectorTextos?: TextoProspector[] }>(d => {
      const lista = Array.isArray(d.prospectorTextos) ? d.prospectorTextos : []
      const t = lista.find(x => x.id === id)
      if (!t) return null
      achado = { ...t, ativo: b.ativo as boolean }
      return { prospectorTextos: lista.map(x => (x.id === id ? achado! : x)) }
    })
  } catch { return { status: 500, corpo: { erro: "Não consegui gravar." } } }
  if (!achado) return { status: 404, corpo: { erro: "Versão não encontrada." } }
  const a = achado as TextoProspector
  return { status: 200, corpo: { ok: true, resultado: `Versão ${a.rotulo} (${a.etapa}) ${a.ativo ? "ligada" : "desligada"}.`, texto: a } }
}

/** GET ?o=detalhe&area=prospector_textos */
export async function leituraTextos(): Promise<RespostaTexto> {
  const textos = await lerTextosProspector()
  const prospectos: ProspectoParaContagem[] = []
  const vistos = new Set<unknown>()
  for (const t of textos) {
    const r = await supabase.from("prospectos_parceiros").select("id, etapa, historico_etapas").contains("historico_etapas", [{ envio: { textoId: t.id } }]).limit(5000)
    if (r.error) return { status: 500, corpo: { erro: "Não consegui ler os prospectos." } }
    for (const p of (r.data ?? []) as (ProspectoParaContagem & { id: unknown })[]) if (!vistos.has(p.id)) { vistos.add(p.id); prospectos.push(p) }
  }
  return { status: 200, corpo: { versoes: contarPorVersao(textos, prospectos) } }
}
