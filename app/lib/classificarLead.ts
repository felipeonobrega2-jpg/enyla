// Classificação do lead, separada da resposta: roda em toda conversa com mensagem nova do lead (inclusive quando você
// está atendendo, o agente está desligado ou fora do horário). MQL só com prova: a IA cita o que o cliente disse e o
// código confere (menos de 1.000 nunca é MQL; 5.000+ é ICP). Puro: o servidor lê a conversa e grava.

import { PerfilLead, ETIQUETA_PERFIL, ETIQUETAS_AGENTE } from "./agenteLeads"

export type Classificacao = {
  perfil: PerfilLead
  quantidade_total: number | null
  recorrente: boolean
  evidencia: string        // trecho literal do cliente que prova o volume (ou o produto, na oportunidade)
  motivo: string
  fornecedor: boolean
}

export const ESQUEMA_CLASSIFICAR = {
  type: "object", additionalProperties: false,
  required: ["perfil", "quantidade_total", "recorrente", "evidencia", "motivo", "fornecedor"],
  properties: {
    perfil: { type: "string", enum: ["icp", "medio", "oportunidade", "pequeno", "indefinido", "nao_lead"] },
    quantidade_total: { type: ["number", "null"], description: "Total de caixas que o CLIENTE disse, somando os itens (13 fragrâncias com 1.000 de cada = 13000). null se ele não disse." },
    recorrente: { type: "boolean", description: "O cliente disse que compra todo mês/sempre (recorrência)." },
    evidencia: { type: "string", description: "Trecho literal do que o CLIENTE escreveu que prova o volume (ou o produto em volume, na oportunidade). Vazio se não há." },
    motivo: { type: "string", description: "Uma frase: por que esse perfil." },
    fornecedor: { type: "boolean", description: "É fornecedor/prestador oferecendo algo para a gráfica." },
  },
} as const

// Números citados num texto, sem separador de milhar ("1.000" → 1000, "13" → 13, "5 mil" → 5000)
export function numerosDo(texto: string): number[] {
  const t = texto.toLowerCase()
  const out: number[] = []
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)*)\s*(mil|k)?\b/g)) {
    const bruto = m[1]
    const n = /^\d{1,3}(\.\d{3})+$/.test(bruto) ? Number(bruto.replace(/\./g, "")) : Number(bruto.replace(",", "."))
    if (Number.isFinite(n)) out.push(m[2] ? Math.round(n * 1000) : n)
  }
  return out
}

const QUALIFICADOS: string[] = [ETIQUETAS_AGENTE.mql, ETIQUETA_PERFIL.icp!, ETIQUETA_PERFIL.medio!, ETIQUETA_PERFIL.oportunidade!]
export const temEtiquetaDeMql = (et: string[] | null | undefined) => (et ?? []).some(e => QUALIFICADOS.includes(e))

// O código não confia sozinho na IA: confere a prova e o número
export function validarClassificacao(c: Classificacao, textosDoCliente: string[]): Classificacao {
  const doCliente = new Set(textosDoCliente.flatMap(numerosDo))
  const provaNumeros = numerosDo(c.evidencia)
  // A prova tem que ter saído do cliente (algum número dela aparece no que ele escreveu)
  const provaDoCliente = !!c.evidencia.trim() && (provaNumeros.length === 0 || provaNumeros.some(n => doCliente.has(n)))
  const q = c.quantidade_total != null && c.quantidade_total > 0 ? Math.round(c.quantidade_total) : null
  const rebaixa = (motivo: string): Classificacao => ({ ...c, perfil: "indefinido", motivo: `${motivo} (${c.motivo})` })

  if (c.perfil === "icp" || c.perfil === "medio") {
    if (!provaDoCliente || q == null) return rebaixa("sem o cliente dizer o volume")
    if (q < 1000) return { ...c, quantidade_total: q, perfil: "pequeno" }
    return { ...c, quantidade_total: q, perfil: q >= 5000 || c.recorrente ? "icp" : "medio" }
  }
  if (c.perfil === "oportunidade") return provaDoCliente ? { ...c, quantidade_total: q } : rebaixa("sem prova do produto em volume")
  if (c.perfil === "pequeno") {
    if (q != null && q >= 1000 && provaDoCliente) return { ...c, quantidade_total: q, perfil: q >= 5000 || c.recorrente ? "icp" : "medio" }
    if (q == null || !provaDoCliente) return rebaixa("sem o cliente dizer o volume")
    return { ...c, quantidade_total: q }
  }
  return { ...c, quantidade_total: q }
}

// Vale chamar a IA? Só quando o cliente falou de volume/produto (número, "mil", caixas, frasco...)
export const SINAL_DE_VOLUME = /\d|\bmil\b|unidade|caixa|caixinha|frasco|ess[eê]ncia|v[aá]lvula|envase|\blote|por m[eê]s|todo m[eê]s|mensal|recorr|fragr[aâ]ncia|tiragem/i
export const temSinalDeVolume = (textos: (string | null | undefined)[]) => textos.some(t => !!t && SINAL_DE_VOLUME.test(t))

// Etiquetas e etapa pelo perfil. status: "mql"/"descartado" muda, null tira do MQL, undefined não mexe.
// As suas etiquetas ficam; F1/F2/F3/Sem resposta (follow-up) só saem quando vira MQL (aí é você).
export function etiquetasDaClassificacao(atuais: string[], status: string | null, perfil: PerfilLead, opts: { digital: boolean; fornecedor?: boolean }): { etiquetas: string[]; status: string | null | undefined } {
  const sem = (lista: string[], tirar: string[]) => lista.filter(e => !tirar.includes(e))
  const PERFIS = Object.values(ETIQUETA_PERFIL) as string[]
  const saiDoMql = status === "mql" ? null : undefined
  if (perfil === "icp" || perfil === "medio" || perfil === "oportunidade") {
    const fora = [...QUALIFICADOS, ...PERFIS, ETIQUETAS_AGENTE.descartado, ETIQUETAS_AGENTE.digital, "F1", "F2", "F3", ETIQUETAS_AGENTE.semResposta]
    return { etiquetas: [...sem(atuais, fora), ETIQUETAS_AGENTE.mql, ETIQUETA_PERFIL[perfil]!], status: "mql" }
  }
  if (perfil === "pequeno") {
    const base = sem(atuais, [...QUALIFICADOS, ...PERFIS])
    const extra = opts.digital ? [ETIQUETAS_AGENTE.digital] : []
    return { etiquetas: [...new Set([...base, ...extra, ETIQUETA_PERFIL.pequeno!])], status: saiDoMql }
  }
  if (perfil === "nao_lead") {
    const base = sem(atuais, QUALIFICADOS)
    return { etiquetas: opts.fornecedor && !base.includes("Fornecedora") ? [...base, "Fornecedora"] : base, status: saiDoMql }
  }
  // Indefinido: MQL sem prova sai; o resto fica
  if (temEtiquetaDeMql(atuais)) return { etiquetas: sem(atuais, [...QUALIFICADOS, ETIQUETA_PERFIL.icp!, ETIQUETA_PERFIL.medio!, ETIQUETA_PERFIL.oportunidade!]), status: saiDoMql }
  return { etiquetas: atuais, status: undefined }
}

export const mesmasEtiquetas = (a: string[], b: string[]) => a.length === b.length && a.every(e => b.includes(e))

// Texto da conversa para a IA (o mais recente por último)
export function conversaParaIA(ms: { from_me: boolean; corpo: string | null; tipo: string; ts: string }[]): string {
  return ms.map(m => {
    const dia = new Date(m.ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    const corpo = m.corpo ? m.corpo.replace(/\s+/g, " ").slice(0, 600) : /image/i.test(m.tipo) ? "[foto]" : /audio/i.test(m.tipo) ? "[áudio sem transcrição]" : /document/i.test(m.tipo) ? "[arquivo]" : null
    return corpo ? `${dia} ${m.from_me ? "FELIPE" : "CLIENTE"}: ${corpo}` : null
  }).filter(Boolean).join("\n")
}
