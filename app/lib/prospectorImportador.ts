// Importador do Prospector de Parceiros: parte pura (filtro, leitura do CSV da Receita, montagem da linha e regra de gravação).
// Nada aqui chama rede nem envia mensagem. A nota vem de notaDoProspect (app/lib/prospector.ts); não é reimplementada.
import { CNAES_PROSPECTO, codigoCnae, notaDoProspect, servicosDosCnaes } from "./prospector"

export const FONTE_IMPORTADOR = "Receita Federal, dados abertos de CNPJ (Estabelecimentos) + BrasilAPI (razão social e porte)"
export const MOTIVO_IMPORTADO = "importado dos dados abertos de CNPJ"

export type Candidato = {
  cnpj: string
  nomeFantasia: string | null
  situacao: string
  abertura: string | null
  cnaePrincipal: string
  cnaesSecundarios: string[]
  cep: string | null
  uf: string
  endereco: string | null
  email: string | null
  telefone: string | null
}

/** Uma linha do CSV da Receita (separador ";", campos entre aspas, "" dentro do campo). */
export function campos(linha: string): string[] {
  const out: string[] = []
  let atual = ""
  let aspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (aspas) {
      if (c === '"') { if (linha[i + 1] === '"') { atual += '"'; i++ } else aspas = false } else atual += c
    } else if (c === '"') aspas = true
    else if (c === ";") { out.push(atual); atual = "" } else atual += c
  }
  out.push(atual)
  return out
}

const vazio = (v: string | undefined) => { const t = (v ?? "").trim(); return t ? t : null }

function dataIso(v: string | undefined): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec((v ?? "").trim())
  return m && m[1] !== "0000" && m[2] !== "00" && m[3] !== "00" ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** Layout oficial de Estabelecimentos: 0-2 CNPJ, 4 fantasia, 5 situação, 10 início, 11-12 CNAE, 13-17 endereço, 18 CEP, 19 UF, 21-22 telefone, 27 e-mail. */
export function candidatoDaLinha(linha: string): Candidato | null {
  // Descarte barato antes de tratar o CSV: só SP e situação 02 interessam.
  if (!linha.includes('"SP"') || !linha.includes('"02"')) return null
  const c = campos(linha)
  if (c.length < 28) return null
  const uf = c[19].trim().toUpperCase()
  if (uf !== "SP" || c[5].trim() !== "02") return null
  const principal = codigoCnae(c[11])
  const secundarios = c[12].split(",").map(codigoCnae).filter(Boolean)
  if (![principal, ...secundarios].some(id => id in CNAES_PROSPECTO)) return null
  const cnpj = `${c[0]}${c[1]}${c[2]}`.replace(/\D/g, "")
  if (cnpj.length !== 14) return null
  const rua = [c[13], c[14]].map(s => s.trim()).filter(Boolean).join(" ")
  const endereco = [rua && c[15].trim() ? `${rua}, ${c[15].trim()}` : rua, vazio(c[16]), vazio(c[17])].filter(Boolean).join(" - ") || null
  const tel = `${c[21].trim()}${c[22].trim()}`.replace(/\D/g, "")
  return {
    cnpj, nomeFantasia: vazio(c[4]), situacao: "ATIVA", abertura: dataIso(c[10]),
    cnaePrincipal: principal, cnaesSecundarios: secundarios,
    cep: vazio(c[18]?.replace(/\D/g, "")), uf, endereco, email: vazio(c[27])?.toLowerCase() ?? null, telefone: tel || null,
  }
}

/** Cadastro da BrasilAPI (/api/cnpj/v1/{cnpj}). Só os campos que usamos. */
export type CadastroBrasilApi = {
  razao_social?: string | null; nome_fantasia?: string | null; descricao_situacao_cadastral?: string | null
  data_inicio_atividade?: string | null; porte?: string | null; codigo_porte?: number | null
  municipio?: string | null; uf?: string | null; cep?: string | null
  descricao_tipo_de_logradouro?: string | null; logradouro?: string | null; numero?: string | null; bairro?: string | null
  email?: string | null; ddd_telefone_1?: string | null
}

export type LinhaProspecto = {
  cnpj: string; razao_social: string; nome_fantasia: string | null; cnae_principal: string; cnaes_secundarios: string[]
  servicos: string[]; situacao: string; abertura: string | null; porte: string | null; municipio: string | null; uf: string
  cep: string | null; endereco: string | null; email: string | null; telefone: string | null
  fonte: string; coletado_em: string; nota: number
}

/** `parcial`: a BrasilAPI falhou (não é 404). Grava só com o que veio do arquivo da Receita, com a razão social vazia para completar depois. */
export function montarProspecto(c: Candidato, cad: CadastroBrasilApi, agora: Date, parcial = false): LinhaProspecto | null {
  const razao = (cad.razao_social ?? "").trim()
  if (!razao && !parcial) return null
  const situacao = (cad.descricao_situacao_cadastral ?? "").trim().toUpperCase() || c.situacao
  const uf = (cad.uf ?? c.uf).trim().toUpperCase()
  const porte = cad.codigo_porte != null ? String(cad.codigo_porte).padStart(2, "0") : vazio(cad.porte ?? undefined)
  const abertura = (cad.data_inicio_atividade ?? "").slice(0, 10) || c.abertura
  const servicos = servicosDosCnaes(c.cnaePrincipal, c.cnaesSecundarios)
  const municipio = vazio(cad.municipio ?? undefined)
  const rua = [cad.descricao_tipo_de_logradouro, cad.logradouro].map(s => (s ?? "").trim()).filter(Boolean).join(" ")
  const enderecoCad = [rua && cad.numero?.trim() ? `${rua}, ${cad.numero.trim()}` : rua, vazio(cad.bairro ?? undefined)].filter(Boolean).join(" - ")
  const nota = notaDoProspect({ uf, municipio, servicos, abertura, porte, situacao, hoje: agora.toISOString().slice(0, 10) }).nota
  return {
    cnpj: c.cnpj, razao_social: razao, nome_fantasia: vazio(cad.nome_fantasia ?? undefined) ?? c.nomeFantasia,
    cnae_principal: c.cnaePrincipal, cnaes_secundarios: c.cnaesSecundarios, servicos, situacao, abertura: abertura || null, porte, municipio, uf,
    cep: vazio(cad.cep?.replace(/\D/g, "")) ?? c.cep, endereco: enderecoCad || c.endereco,
    email: vazio(cad.email ?? undefined)?.toLowerCase() ?? c.email, telefone: vazio(cad.ddd_telefone_1?.replace(/\D/g, "")) ?? c.telefone,
    fonte: FONTE_IMPORTADOR, coletado_em: agora.toISOString(), nota,
  }
}

export type Existente = { id: number; etapa: string; opt_out: boolean }
export type Gravacao =
  | { tipo: "inserir"; linha: LinhaProspecto & { etapa: "encontrado"; historico_etapas: { etapa: "encontrado"; em: string; motivo: string }[] } }
  | { tipo: "atualizar"; id: number; campos: LinhaProspecto }
  | { tipo: "ignorar"; motivo: "descartado" | "opt-out" | "não ativa" }

/** Idempotente por CNPJ. Descartado e opt-out não são tocados. Quem já avançou só ganha dados cadastrais e nota: etapa e histórico ficam. */
export function decidirGravacao(existente: Existente | null, linha: LinhaProspecto, agora: Date): Gravacao {
  if (existente?.opt_out) return { tipo: "ignorar", motivo: "opt-out" }
  if (existente?.etapa === "descartado") return { tipo: "ignorar", motivo: "descartado" }
  if (existente) return { tipo: "atualizar", id: existente.id, campos: linha }
  if (linha.nota <= 0) return { tipo: "ignorar", motivo: "não ativa" }
  return { tipo: "inserir", linha: { ...linha, etapa: "encontrado", historico_etapas: [{ etapa: "encontrado", em: agora.toISOString(), motivo: MOTIVO_IMPORTADO }] } }
}
