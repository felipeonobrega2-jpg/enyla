// Biblioteca de textos do Prospector em dados_sistema (coleção prospectorTextos). Sem DELETE: só insert e update do campo ativo.
// Nunca envia mensagem. Sem dado de prospecto em log.
import { randomBytes } from "node:crypto"
import { supabase } from "./supabase"
import { CANAIS_TEXTO, COLECAO_TEXTOS, ETAPAS_TEXTO, contarPorVersao, novaVersao, textoDe, type ContagemVersao, type PedidoTexto, type TextoProspector } from "./prospectorTextos"

/** Lê a biblioteca. Falha de leitura devolve lista vazia: o envio cai no texto do código e nada muda. */
export async function lerTextosProspector(): Promise<TextoProspector[]> {
  try {
    const { data, error } = await supabase.from("dados_sistema").select("dados").eq("colecao", COLECAO_TEXTOS).limit(1000)
    if (error) return []
    return (data ?? []).map(r => textoDe((r as { dados?: unknown }).dados)).filter((t): t is TextoProspector => !!t)
  } catch { return [] }
}

export type ResultadoTexto = { ok: true; texto: TextoProspector } | { ok: false; status: 400 | 404 | 409 | 500; erro: string }

/** Cria uma versão nova (desligada). Nunca sobrescreve outra: o id é novo. */
export async function guardarTextoProspector(p: PedidoTexto, agora: Date = new Date()): Promise<ResultadoTexto> {
  const r = novaVersao(p, `txt_${randomBytes(6).toString("hex")}`, agora)
  if (!r.ok) return { ok: false, status: 400, erro: r.erro }
  const { error } = await supabase.from("dados_sistema").insert({ colecao: COLECAO_TEXTOS, id: r.texto.id, dados: r.texto, v: 1, atualizado_em: agora.toISOString() })
  if (error) return { ok: false, status: 500, erro: "Não consegui guardar o texto." }
  return { ok: true, texto: r.texto }
}

/** Liga ou desliga uma versão pelo id, com trava de versão (outra gravação no meio: 409, tente de novo). */
export async function ativarTextoProspector(id: unknown, ativo: unknown, agora: Date = new Date()): Promise<ResultadoTexto> {
  if (typeof id !== "string" || !id.trim()) return { ok: false, status: 400, erro: "mande o id da versão." }
  if (typeof ativo !== "boolean") return { ok: false, status: 400, erro: "ativo: true ou false." }
  const { data, error } = await supabase.from("dados_sistema").select("dados, v").eq("colecao", COLECAO_TEXTOS).eq("id", id.trim()).maybeSingle()
  if (error) return { ok: false, status: 500, erro: "Não consegui ler o texto." }
  const atual = data ? textoDe((data as { dados?: unknown }).dados) : null
  if (!atual) return { ok: false, status: 404, erro: "Versão não encontrada." }
  const texto = { ...atual, ativo }
  const v = Number((data as { v?: number }).v ?? 0)
  const { data: gravado, error: erroGravar } = await supabase.from("dados_sistema").update({ dados: texto, v: v + 1, atualizado_em: agora.toISOString() })
    .eq("colecao", COLECAO_TEXTOS).eq("id", atual.id).eq("v", v).select("id")
  if (erroGravar) return { ok: false, status: 500, erro: "Não consegui gravar." }
  if (!Array.isArray(gravado) || !gravado.length) return { ok: false, status: 409, erro: "Outra gravação mexeu nesta versão; tente de novo." }
  return { ok: true, texto }
}

/** Leitura da área prospector_textos: cada versão com enviados, responderam, responderam sim e cadastros em /parceiros. */
export async function leituraTextosProspector(): Promise<{ corpo: Record<string, unknown>; status: number }> {
  const textos = await lerTextosProspector()
  // Só o histórico, em páginas: o PostgREST corta em 1000 linhas por chamada. Só linhas que têm envio com versão gravada.
  const historicos: { historico_etapas: unknown }[] = []
  const PAGINA = 1000
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase.from("prospectos_parceiros").select("historico_etapas").contains("historico_etapas", [{ envio: { passo: "primeiro_contato" } }])
      .order("id", { ascending: true }).range(de, de + PAGINA - 1)
    if (error) return { corpo: { erro: "Não consegui ler os prospectos." }, status: 500 }
    const pagina = (data ?? []) as { historico_etapas: unknown }[]
    historicos.push(...pagina)
    if (pagina.length < PAGINA) break
  }
  const versoes: ContagemVersao[] = contarPorVersao(textos, historicos)
  return { corpo: { versoes, semVersaoAtiva: ETAPAS_TEXTO.flatMap(e => CANAIS_TEXTO.filter(c => !textos.some(t => t.etapa === e && t.canal === c && t.ativo)).map(c => `${e}/${c}`)) }, status: 200 }
}

export const AJUDA_TEXTOS_PROSPECTOR = "SÓ CCO e CMO (as outras recebem 403). ?o=detalhe&area=prospector_textos: por versão do texto do Prospector (canal whatsapp | email, etapa primeira | resposta_sim | resposta_nao, rotulo, assunto (só e-mail), corpo, ativo): enviados, responderam, responderamSim e cadastros em /parceiros; semVersaoAtiva lista etapa/canal que usam o texto padrão do código. POST {acao:'guardar_texto_prospector', canal ('whatsapp' por padrão | 'email'), etapa, rotulo, assunto (obrigatório no e-mail), corpo} cria uma versão NOVA, desligada (variáveis {nome}, {remetente}, {link}); editar = guardar de novo, nada é sobrescrito. POST {acao:'ativar_texto_prospector', id, ativo:true|false} liga ou desliga. Com mais de uma versão ativa na etapa, o envio sorteia com peso igual entre as do canal do envio entre as do canal do envio; com nenhuma, usa o texto padrão"
