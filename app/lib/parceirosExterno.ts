// Leitura de parceiros na porta externa (?o=parceiros e ?o=detalhe&area=parceiros), só CCO e CMO. SÓ LÊ: não grava,
// não envia nada, não migra. Sem e-mail, telefone, documento ou endereço completos: e-mail mascarado e telefone com
// os 4 últimos dígitos.
import { supabase } from "./supabase"
import { lerCampos } from "./configAtomica"
import { ETAPAS_FUNIL } from "./prospector"
import type { CadastroParceiro } from "./parceiros"

export const LIMITE_CADASTROS = 100
export const LIMITE_RESPOSTAS = 50
export const AJUDA_PARCEIROS = "SÓ CCO e CMO (as outras recebem 403). Mesmo conteúdo em ?o=parceiros e em ?o=detalhe&area=parceiros. Só leitura. cadastros: quem se cadastrou em /parceiros (mais novos primeiro, até 100: id, nome, empresa, data, origem 'prospector'|'direto', status, etapaProspector, email mascarado, telefone com 4 últimos dígitos; nunca documento nem endereço). respostas: prospectos na etapa 'respondeu' e, se a tabela prospectos_emails_recebidos existir, as últimas 50 respostas (prospecto_id, nome, data, assunto, 300 primeiros caracteres). funil: contagem por etapa"

export const mascararEmail = (e: unknown): string | null => {
  const s = String(e ?? "").trim()
  const i = s.lastIndexOf("@")
  if (i < 1) return null
  return `${s.slice(0, Math.min(2, i))}***${s.slice(i)}`
}
export const mascararTelefone = (t: unknown): string | null => {
  const d = String(t ?? "").replace(/\D/g, "")
  return d.length >= 4 ? `***${d.slice(-4)}` : null
}

const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "")
const ms = (s?: string) => (s ? new Date(s).getTime() : 0) || 0

type Prospecto = { id?: string; cnpj: string; razao_social?: string | null; nome_fantasia?: string | null; etapa: string; historico_etapas?: { etapa?: string; em?: string }[] | null }

export function montarCadastros(lista: CadastroParceiro[], prospectos: Pick<Prospecto, "cnpj" | "etapa">[]) {
  const porCnpj = new Map(prospectos.map(p => [p.cnpj, p.etapa]))
  return [...lista].sort((a, b) => ms(b.em) - ms(a.em)).slice(0, LIMITE_CADASTROS).map(c => {
    const doc = c.tipoDocumento === "cnpj" ? soDigitos(c.documento) : ""
    const etapa = doc ? porCnpj.get(doc) : undefined
    return {
      id: c.id, nome: c.nomeFantasia, empresa: c.razaoSocial ?? null, data: c.em,
      origem: c.origem === "prospector" || etapa ? "prospector" : "direto", status: c.status,
      ...(etapa ? { etapaProspector: etapa } : {}),
      email: mascararEmail(c.email), telefone: mascararTelefone(c.whatsapp),
    }
  })
}

export async function leituraParceiros(): Promise<{ corpo: Record<string, unknown>; status: number }> {
  const cfg = await lerCampos<{ cadastrosParceiros?: CadastroParceiro[] }>(["cadastrosParceiros"])
  const lista = Array.isArray(cfg.cadastrosParceiros) ? cfg.cadastrosParceiros : []
  const avisos: string[] = []

  const docs = [...new Set(lista.filter(c => c.tipoDocumento === "cnpj").map(c => soDigitos(c.documento)).filter(d => d.length === 14))]
  let prospectos: Prospecto[] = []
  if (docs.length) {
    const r = await supabase.from("prospectos_parceiros").select("cnpj, etapa").in("cnpj", docs)
    if (r.error) avisos.push("Tabela do prospector indisponível: origem e etapa não puderam ser conferidas.")
    else prospectos = (r.data ?? []) as Prospecto[]
  }

  const etapas = [...ETAPAS_FUNIL, "respondeu"] as const
  const funil: Record<string, number> = Object.fromEntries(etapas.map(e => [e, 0]))
  const contagens = await Promise.all(etapas.map(async e => {
    const r = await supabase.from("prospectos_parceiros").select("id", { count: "exact", head: true }).eq("etapa", e).eq("opt_out", false)
    return r.error ? null : r.count ?? 0
  }))
  etapas.forEach((e, i) => { if (contagens[i] === null) avisos.push("Contagem do funil indisponível."); else funil[e] = contagens[i] as number })

  const resp = await supabase.from("prospectos_parceiros").select("id, cnpj, razao_social, nome_fantasia, etapa, historico_etapas")
    .eq("etapa", "respondeu").eq("opt_out", false).limit(LIMITE_CADASTROS)
  const porEtapa = ((resp.error ? [] : resp.data ?? []) as Prospecto[]).map(p => ({
    prospecto_id: p.id ?? null, nome: (p.nome_fantasia || p.razao_social || "Sem nome").trim(),
    data: [...(p.historico_etapas ?? [])].reverse().find(h => h?.etapa === "respondeu")?.em ?? null,
  }))

  // Tabela do #132: se não existir (ou falhar), segue só pela etapa, sem erro
  let mensagens: { prospecto_id: unknown; nome: string | null; data: string | null; assunto: string | null; corpo: string }[] = []
  try {
    const r = await supabase.from("prospectos_emails_recebidos").select("*").limit(200)
    if (!r.error) {
      const nomes = new Map(porEtapa.map(p => [String(p.prospecto_id), p.nome]))
      mensagens = ((r.data ?? []) as Record<string, unknown>[]).map(m => {
        const data = [m.recebido_em, m.em, m.data, m.criado_em, m.created_at].find(v => typeof v === "string") as string | undefined
        const corpo = [m.corpo, m.texto, m.body].find(v => typeof v === "string") as string | undefined
        return { prospecto_id: m.prospecto_id ?? null, nome: nomes.get(String(m.prospecto_id)) ?? (typeof m.nome === "string" ? m.nome : null), data: data ?? null, assunto: typeof m.assunto === "string" ? m.assunto : null, corpo: (corpo ?? "").slice(0, 300) }
      }).sort((a, b) => ms(b.data ?? undefined) - ms(a.data ?? undefined)).slice(0, LIMITE_RESPOSTAS)
    }
  } catch { /* tabela ausente */ }

  return {
    status: 200,
    corpo: {
      cadastros: montarCadastros(lista, prospectos), totalCadastros: lista.length,
      respostas: { porEtapa, ...(mensagens.length ? { mensagens } : {}) },
      funil, ...(avisos.length ? { avisos } : {}),
    },
  }
}
