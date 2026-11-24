// Leitura do funil e o gancho do cadastro. Não envia mensagem e não altera o cadastro do parceiro.
import { supabase } from "./supabase"
import {
  aoCadastrarComCnpj, etapaConhecida, notaDoProspect, ETAPAS_FUNIL,
  type EtapaFunil, type MudancaEtapa,
} from "./prospector"

const TABELA = "prospectos_parceiros"
const LIMITE_LEITURA = 300
const LIMITE_LISTA = 100

export const AVISO_SEM_TABELA = "A tabela do prospector ainda não existe. Rode supabase/migrations/20261124_prospectos_parceiros.sql no SQL Editor do Supabase."

export type ItemQualificado = {
  cnpj: string
  nome: string
  municipio: string | null
  uf: string | null
  nota: number
  servicos: string[]
}

export type FunilProspector = {
  contagem: Record<(typeof ETAPAS_FUNIL)[number], number>
  qualificados: ItemQualificado[]
  aviso?: string
}

type Linha = {
  cnpj: string
  razao_social: string
  nome_fantasia: string | null
  municipio: string | null
  uf: string | null
  latitude: number | null
  longitude: number | null
  servicos: string[] | null
  situacao: string | null
  abertura: string | null
  porte: string | null
}

function historicoValido(v: unknown): MudancaEtapa[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is MudancaEtapa => {
    if (!x || typeof x !== "object") return false
    const item = x as MudancaEtapa
    return etapaConhecida(item.etapa) && typeof item.em === "string"
  })
}

export async function lerFunil(): Promise<FunilProspector> {
  const [contagens, lista] = await Promise.all([
    Promise.all(ETAPAS_FUNIL.map(async etapa => {
      const { count, error } = await supabase.from(TABELA).select("id", { count: "exact", head: true }).eq("etapa", etapa).eq("opt_out", false)
      if (error) throw new Error(error.message)
      return [etapa, count ?? 0] as const
    })),
    supabase.from(TABELA)
      .select("cnpj, razao_social, nome_fantasia, municipio, uf, latitude, longitude, servicos, situacao, abertura, porte")
      .eq("etapa", "qualificado")
      .eq("opt_out", false)
      .limit(LIMITE_LEITURA),
  ])
  if (lista.error) throw new Error(lista.error.message)
  const qualificados = ((lista.data ?? []) as Linha[]).map(row => {
    const servicos = (row.servicos ?? []).filter(s => typeof s === "string")
    const nota = notaDoProspect({
      uf: row.uf, municipio: row.municipio, latitude: row.latitude, longitude: row.longitude,
      servicos, abertura: row.abertura, porte: row.porte, situacao: row.situacao,
    }).nota
    const nome = (row.nome_fantasia || row.razao_social || "Sem nome").trim() || "Sem nome"
    return { cnpj: row.cnpj, nome, municipio: row.municipio, uf: row.uf, nota, servicos }
  }).sort((a, b) => b.nota - a.nota || a.nome.localeCompare(b.nome, "pt-BR")).slice(0, LIMITE_LISTA)
  return { contagem: Object.fromEntries(contagens) as FunilProspector["contagem"], qualificados }
}

// Mesmo CNPJ no formulário /parceiros: a etapa vai para "cadastrou" quando a regra deixa.
// Falha quieta. O cadastro público já está salvo e não pode depender desta tabela.
export async function marcarProspectCadastrou(documento: string, tipo: "cnpj" | "cpf"): Promise<void> {
  if (tipo !== "cnpj") return
  const cnpj = (documento ?? "").replace(/\D/g, "")
  if (cnpj.length !== 14) return
  try {
    const { data, error } = await supabase.from(TABELA).select("id, etapa, opt_out, historico_etapas").eq("cnpj", cnpj).maybeSingle()
    if (error || !data || !etapaConhecida(data.etapa)) return
    const em = new Date().toISOString()
    const proximo = aoCadastrarComCnpj({
      etapa: data.etapa as EtapaFunil,
      optOut: data.opt_out === true,
      historico: historicoValido(data.historico_etapas),
    }, em)
    if (!proximo) return
    await supabase.from(TABELA).update({
      etapa: proximo.etapa,
      historico_etapas: proximo.historico,
      atualizado_em: em,
    }).eq("id", data.id).eq("opt_out", false).neq("etapa", "descartado")
  } catch { /* tabela ainda não criada, ou a leitura falhou */ }
}
