// Leitura do funil e o gancho do cadastro. Não envia mensagem e não altera o cadastro do parceiro.
import { supabase } from "./supabase"
import { chaveTelefone } from "./prospectorEnvio"
import {
  aoCadastrarComCnpj, etapaConhecida, transicionar, notaDoProspect, registrarCadastroRecebido as registrarNoHistorico, ETAPAS_FUNIL,
  type EstadoFunil, type EtapaFunil, type MudancaEtapa,
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
      .order("nota", { ascending: false, nullsFirst: false })
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

function cnpjDe(documento: string, tipo: "cnpj" | "cpf"): string | null {
  if (tipo !== "cnpj") return null
  const cnpj = (documento ?? "").replace(/\D/g, "")
  return cnpj.length === 14 ? cnpj : null
}

// Lê o prospecto, calcula o próximo estado e grava com trava otimista: o update só vale se a etapa
// ainda é a que foi lida. Se mudou no meio, não grava (quem mudou ganha). Falha quieta.
async function mudarProspecto(cnpj: string, proximo: (estado: EstadoFunil, em: string) => EstadoFunil | null): Promise<boolean> {
  try {
    const { data, error } = await supabase.from(TABELA).select("id, etapa, opt_out, historico_etapas").eq("cnpj", cnpj).maybeSingle()
    if (error || !data || !etapaConhecida(data.etapa)) return false
    const em = new Date().toISOString()
    const novo = proximo({
      etapa: data.etapa as EtapaFunil,
      optOut: data.opt_out === true,
      historico: historicoValido(data.historico_etapas),
    }, em)
    if (!novo) return false
    const { data: gravado, error: erroGravar } = await supabase.from(TABELA).update({
      etapa: novo.etapa,
      historico_etapas: novo.historico,
      atualizado_em: em,
    }).eq("id", data.id).eq("etapa", data.etapa).eq("opt_out", false).select("id")
    return !erroGravar && Array.isArray(gravado) && gravado.length > 0
  } catch { return false /* tabela ainda não criada, ou a leitura falhou */ }
}

// Cadastro público em /parceiros com o mesmo CNPJ: só registra no histórico o id do cadastro.
// A etapa não muda aqui. Ela vai para "cadastrou" quando o Felipe aprova (marcarProspectCadastrou).
// O cadastro já está salvo e não pode depender desta tabela.
export async function registrarCadastroRecebido(documento: string, tipo: "cnpj" | "cpf", cadastroId: string): Promise<boolean> {
  const cnpj = cnpjDe(documento, tipo)
  if (!cnpj) return false
  return mudarProspecto(cnpj, (estado, em) => registrarNoHistorico(estado, em, cadastroId))
}

// O Felipe aprovou o cadastro do parceiro (tela Fornecedores): a etapa vai para "cadastrou" quando a regra deixa.
// Trava otimista: só grava se a etapa ainda é a lida no select. Falha quieta; a aprovação não depende disto.
export async function marcarProspectCadastrou(documento: string, tipo: "cnpj" | "cpf", cadastroId?: string): Promise<boolean> {
  const cnpj = cnpjDe(documento, tipo)
  if (!cnpj) return false
  return mudarProspecto(cnpj, (estado, em) => aoCadastrarComCnpj(estado, em, cadastroId))
}

// Cadastro em /parceiros com o mesmo CNPJ ou o mesmo telefone (WhatsApp) de um prospecto: a conversão entra no funil
// na hora ("cadastrou"), sem esperar a aprovação do Felipe. Só anda para frente; opt-out e descartado não mudam.
// Falha quieta: o cadastro já está salvo e não depende desta tabela.
export async function marcarProspectCadastrouNoRecebimento(c: { documento: string; tipoDocumento: "cnpj" | "cpf"; whatsapp?: string | null; id: string }): Promise<boolean> {
  try {
    const cnpj = cnpjDe(c.documento, c.tipoDocumento)
    const chave = chaveTelefone(c.whatsapp)
    let alvo: { id: number; etapa: string; opt_out: boolean; historico_etapas: unknown; atualizado_em?: string } | null = null
    let por = "CNPJ"
    if (cnpj) {
      const { data } = await supabase.from(TABELA).select("id, etapa, opt_out, historico_etapas").eq("cnpj", cnpj).maybeSingle()
      alvo = data as typeof alvo
    }
    if (!alvo && chave.length >= 10) {
      por = "telefone"
      for (let p = 0; p < 20 && !alvo; p++) {
        const { data, error } = await supabase.from(TABELA).select("id, telefone, etapa, opt_out, historico_etapas").range(p * 1000, (p + 1) * 1000 - 1)
        if (error || !data) break
        alvo = (data as { telefone?: string | null; id: number; etapa: string; opt_out: boolean; historico_etapas: unknown }[]).find(r => chaveTelefone(r.telefone) === chave) ?? null
        if (data.length < 1000) break
      }
    }
    if (!alvo || !etapaConhecida(alvo.etapa)) return false
    const em = new Date().toISOString()
    const novo = transicionar({ etapa: alvo.etapa as EtapaFunil, optOut: alvo.opt_out === true, historico: historicoValido(alvo.historico_etapas) }, "cadastrou", em, `cadastro recebido em /parceiros (mesmo ${por})`)
    if (!novo) return false
    novo.historico[novo.historico.length - 1] = { ...novo.historico[novo.historico.length - 1], cadastroId: c.id }
    const { data: gravado, error } = await supabase.from(TABELA).update({ etapa: novo.etapa, historico_etapas: novo.historico, atualizado_em: em })
      .eq("id", alvo.id).eq("etapa", alvo.etapa).eq("opt_out", false).select("id")
    return !error && Array.isArray(gravado) && gravado.length > 0
  } catch { return false }
}
