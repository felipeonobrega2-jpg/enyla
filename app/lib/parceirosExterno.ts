// ?o=detalhe&area=parceiros: cadastros de /parceiros e respostas do Prospector. SÓ LEITURA.
// Nada de e-mail, telefone, documento ou endereço completos: e-mail mascarado e telefone só com os 4 últimos dígitos.
import { lerCampos } from "./configAtomica"
import { supabase } from "./supabase"

export const MAX_CADASTROS = 100
export const MAX_RESPOSTAS = 50
export const MAX_CORPO = 300
export const ETAPAS_DO_FUNIL = ["encontrado", "qualificado", "abordado", "respondeu", "abriu", "cadastrou"] as const

type Cad = { id?: string; em?: string; status?: string; nomeFantasia?: string; razaoSocial?: string; documento?: string; tipoDocumento?: string; email?: string; whatsapp?: string }
type Prosp = { id?: string | number; cnpj: string; etapa: string; razao_social?: string | null; nome_fantasia?: string | null }

export const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "")

/** ma***@dominio.com — as duas primeiras letras do usuário e o domínio. */
export function mascararEmail(v: unknown): string | null {
  const s = String(v ?? "").trim()
  const i = s.lastIndexOf("@")
  if (i < 1 || i === s.length - 1) return null
  return `${s.slice(0, Math.min(2, i))}***${s.slice(i)}`
}

/** Só os 4 últimos dígitos: ***1234. */
export function mascararTelefone(v: unknown): string | null {
  const d = soDigitos(v)
  return d.length >= 4 ? `***${d.slice(-4)}` : null
}

export function montarCadastros(cadastros: Cad[], prospectos: Prosp[]) {
  const porCnpj = new Map(prospectos.map(p => [soDigitos(p.cnpj), p]))
  return [...cadastros]
    .sort((a, b) => String(b.em ?? "").localeCompare(String(a.em ?? "")))
    .slice(0, MAX_CADASTROS)
    .map(c => {
      const doc = c.tipoDocumento === "cpf" ? "" : soDigitos(c.documento)
      const p = doc.length === 14 ? porCnpj.get(doc) : undefined
      return {
        id: c.id ?? "", nome: c.nomeFantasia ?? "", empresa: c.razaoSocial ?? "", data: c.em ?? "",
        origem: p ? "prospector" : "direto", status: c.status ?? "novo",
        ...(p ? { etapaProspector: p.etapa } : {}),
        email: mascararEmail(c.email), telefone: mascararTelefone(c.whatsapp),
      }
    })
}

export function contarFunil(etapas: string[]) {
  const n = Object.fromEntries(ETAPAS_DO_FUNIL.map(e => [e, 0])) as Record<(typeof ETAPAS_DO_FUNIL)[number], number>
  for (const e of etapas) if (e in n) n[e as keyof typeof n]++
  return n
}

const nomeDe = (p?: Prosp) => (p?.nome_fantasia || p?.razao_social || "").trim()
const dataDe = (r: Record<string, unknown>) => String(r.recebido_em ?? r.em ?? r.criado_em ?? r.created_at ?? "")

export function montarRespostas(prospectos: Prosp[], emails: Record<string, unknown>[] | null) {
  const porId = new Map(prospectos.map(p => [String(p.id), p]))
  return {
    prospectosQueResponderam: prospectos.filter(p => p.etapa === "respondeu").map(p => ({ prospecto_id: p.id ?? null, nome: nomeDe(p) })),
    emailsRecebidos: emails === null ? null : [...emails]
      .sort((a, b) => dataDe(b).localeCompare(dataDe(a)))
      .slice(0, MAX_RESPOSTAS)
      .map(r => ({
        prospecto_id: r.prospecto_id ?? null,
        nome: nomeDe(porId.get(String(r.prospecto_id))) || String(r.nome ?? ""),
        data: dataDe(r), assunto: String(r.assunto ?? ""),
        corpo: String(r.corpo ?? r.texto ?? "").slice(0, MAX_CORPO),
      })),
  }
}

export async function lerParceiros() {
  const { cadastrosParceiros } = await lerCampos<{ cadastrosParceiros?: Cad[] }>(["cadastrosParceiros"])
  let prospectos: Prosp[] = []
  let aviso: string | undefined
  const r = await supabase.from("prospectos_parceiros").select("id, cnpj, etapa, razao_social, nome_fantasia").limit(10000)
  if (r.error) aviso = "Tabela do prospector indisponível: origem e funil incompletos."
  else prospectos = (r.data ?? []) as Prosp[]
  // Tabela do #132: se não existir (ou der erro), as respostas saem só pela etapa
  const e = await supabase.from("prospectos_emails_recebidos").select("*").limit(500)
  const emails = e.error ? null : (e.data ?? []) as Record<string, unknown>[]
  return {
    cadastros: montarCadastros(cadastrosParceiros ?? [], prospectos),
    respostas: montarRespostas(prospectos, emails),
    funil: contarFunil(prospectos.map(p => p.etapa)),
    ...(aviso ? { aviso } : {}),
  }
}

export const AJUDA_PARCEIROS = "SÓ CCO e CMO (as outras recebem 403): cadastros de /parceiros (até 100, mais novos primeiro; id, nome, empresa, data, origem prospector|direto, status, etapaProspector; e-mail mascarado e telefone com 4 dígitos), respostas do Prospector (etapa 'respondeu' e, se existir a tabela, últimas 50 com corpo até 300 caracteres) e funil (encontrado, qualificado, abordado, respondeu, abriu, cadastrou)"
