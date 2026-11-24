// Comparação do classificador de leads entre modelos (parte pura do script scripts/comparar-classificador.mts).
// Nada aqui lê banco nem chama a IA. O relatório nunca leva dado pessoal: só id anônimo, perfis, números e etiquetas.

import { createHash } from "node:crypto"
import { Classificacao, validarClassificacao, etiquetasDaClassificacao, mesmasEtiquetas } from "./classificarLead"
import { PerfilLead } from "./agenteLeads"
import { PRECO_IA, custoUsd, type UsoIA } from "./gastos"

export const MODELOS_COMPARADOS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const
export const MODELO_BASE = MODELOS_COMPARADOS[0]
export const PERFIS: PerfilLead[] = ["icp", "medio", "oportunidade", "pequeno", "indefinido", "nao_lead"]

// Id anônimo da conversa: hash do jid com um sal sorteado a cada execução (telefone tem poucas combinações; sem sal
// daria para adivinhar o número a partir do hash). Dentro de um relatório o mesmo jid dá sempre o mesmo id.
export function idAnonimo(jid: string, sal: string): string {
  return createHash("sha256").update(`${sal}:${jid}`).digest("hex").slice(0, 10)
}

// O que o sistema faria com a classificação: valida (como em produção) e calcula as etiquetas finais.
export type Resumo = { perfil: PerfilLead; quantidade: number | null; mql: boolean; etiquetas: string[] }

export function resumirClassificacao(
  bruto: Classificacao, textosDoCliente: string[], atuais: string[], status: string | null, digital: boolean,
): Resumo {
  const c = validarClassificacao(bruto, textosDoCliente)
  const alvo = etiquetasDaClassificacao(atuais, status, c.perfil, { digital, fornecedor: c.fornecedor })
  return { perfil: c.perfil, quantidade: c.quantidade_total ?? null, mql: alvo.status === "mql", etiquetas: alvo.etiquetas }
}

export const CAMPOS = ["perfil", "quantidade_total", "mql", "etiquetas"] as const
export type Campo = typeof CAMPOS[number]

export function concordaCampo(a: Resumo, b: Resumo, campo: Campo): boolean {
  if (campo === "perfil") return a.perfil === b.perfil
  if (campo === "quantidade_total") return a.quantidade === b.quantidade
  if (campo === "mql") return a.mql === b.mql
  return mesmasEtiquetas(a.etiquetas, b.etiquetas)
}

// Uma conversa: resultado por modelo (null = a IA falhou ou veio sem JSON)
export type Linha = { id: string; por: Record<string, Resumo | null> }

export type Comparacao = {
  modelo: string
  comparadas: number                                // conversas em que Opus e este modelo responderam
  falhas: number                                    // conversas em que este modelo falhou (Opus respondeu)
  concordancia: Record<Campo, number>               // contagem de concordâncias
  confusao: Record<string, Record<string, number>>  // [perfil do Opus][perfil do outro]
}

export function compararComBase(linhas: Linha[], modelo: string, base = MODELO_BASE): Comparacao {
  const confusao: Record<string, Record<string, number>> = {}
  for (const p of PERFIS) { confusao[p] = {}; for (const q of PERFIS) confusao[p][q] = 0 }
  const concordancia = { perfil: 0, quantidade_total: 0, mql: 0, etiquetas: 0 } as Record<Campo, number>
  let comparadas = 0, falhas = 0
  for (const l of linhas) {
    const a = l.por[base], b = l.por[modelo]
    if (!a) continue
    if (!b) { falhas++; continue }
    comparadas++
    for (const c of CAMPOS) if (concordaCampo(a, b, c)) concordancia[c]++
    confusao[a.perfil][b.perfil]++
  }
  return { modelo, comparadas, falhas, concordancia, confusao }
}

// Conversas em que algum modelo discorda do Opus em algum campo (só ids anônimos e valores de classificação)
export function divergencias(linhas: Linha[], modelos: readonly string[], base = MODELO_BASE) {
  const out: { id: string; modelo: string; campos: Campo[]; base: Resumo; outro: Resumo }[] = []
  for (const l of linhas) {
    const a = l.por[base]
    if (!a) continue
    for (const m of modelos) {
      const b = l.por[m]
      if (!b || m === base) continue
      const campos = CAMPOS.filter(c => !concordaCampo(a, b, c))
      if (campos.length) out.push({ id: l.id, modelo: m, campos, base: a, outro: b })
    }
  }
  return out
}

// ── Estimativa (sem chamar a IA) ──
// Aproximação: ~3,5 caracteres por token em português. Só serve para ordem de grandeza.
export const CARACTERES_POR_TOKEN = 3.5
export const SAIDA_MEDIA_TOKENS = 150   // JSON do esquema: ~100-200 tokens
export const tokensAprox = (texto: string) => Math.ceil(texto.length / CARACTERES_POR_TOKEN)

export function estimarCusto(tokensEntrada: number[], modelos: readonly string[] = MODELOS_COMPARADOS) {
  const entrada = tokensEntrada.reduce((s, t) => s + t, 0)
  const saida = tokensEntrada.length * SAIDA_MEDIA_TOKENS
  return modelos.map(modelo => {
    const p = PRECO_IA[modelo]
    return { modelo, entrada, saida, usd: p ? (entrada * p.entrada + saida * p.saida) / 1_000_000 : null }
  })
}

// ── Uso real (rodando) ──
export type UsoModelo = { chamadas: number; entrada: number; saida: number; usd: number }
export function somarUsoModelo(acc: UsoModelo, modelo: string, u: UsoIA): UsoModelo {
  return {
    chamadas: acc.chamadas + 1,
    entrada: acc.entrada + (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    saida: acc.saida + (u.output_tokens ?? 0),
    usd: acc.usd + custoUsd(modelo, u),
  }
}

const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(1)}%` : "—"
const usd = (v: number | null) => v == null ? "—" : `US$ ${v.toFixed(2)}`
const campoTitulo: Record<Campo, string> = { perfil: "Perfil", quantidade_total: "Quantidade total", mql: "Vira MQL", etiquetas: "Etiquetas finais" }

export function relatorioMarkdown(p: {
  linhas: Linha[]; modelos?: readonly string[]; uso: Record<string, UsoModelo>; janelaDias: number; geradoEm: string
}): string {
  const modelos = p.modelos ?? MODELOS_COMPARADOS
  const outros = modelos.filter(m => m !== MODELO_BASE)
  const comps = outros.map(m => compararComBase(p.linhas, m))
  const L: string[] = []
  L.push(`# Comparação do classificador: Opus × Sonnet × Haiku`, "")
  L.push(`Gerado em ${p.geradoEm} · ${p.linhas.length} conversas dos últimos ${p.janelaDias} dias · referência: ${MODELO_BASE}.`)
  L.push("Sem dado pessoal: conversas identificadas só por id anônimo (hash com sal sorteado nesta execução).", "")

  L.push("## Concordância com o Opus por campo", "")
  L.push(`| Campo | ${comps.map(c => c.modelo).join(" | ")} |`, `|---|${comps.map(() => "---").join("|")}|`)
  for (const campo of CAMPOS)
    L.push(`| ${campoTitulo[campo]} | ${comps.map(c => `${pct(c.concordancia[campo], c.comparadas)} (${c.concordancia[campo]}/${c.comparadas})`).join(" | ")} |`)
  L.push(`| Falhas da IA | ${comps.map(c => String(c.falhas)).join(" | ")} |`, "")

  for (const c of comps) {
    L.push(`## Matriz de confusão do perfil: Opus (linhas) × ${c.modelo} (colunas)`, "")
    L.push(`| | ${PERFIS.join(" | ")} |`, `|---|${PERFIS.map(() => "---").join("|")}|`)
    for (const a of PERFIS) L.push(`| **${a}** | ${PERFIS.map(b => String(c.confusao[a][b])).join(" | ")} |`)
    L.push("")
  }

  const div = divergencias(p.linhas, outros)
  L.push(`## Divergências (${div.length})`, "")
  if (!div.length) L.push("Nenhuma.", "")
  else {
    L.push("| Id | Modelo | Campos | Opus (perfil · qtd · MQL) | Outro (perfil · qtd · MQL) |", "|---|---|---|---|---|")
    const f = (r: Resumo) => `${r.perfil} · ${r.quantidade ?? "—"} · ${r.mql ? "sim" : "não"}`
    for (const d of div) L.push(`| ${d.id} | ${d.modelo} | ${d.campos.join(", ")} | ${f(d.base)} | ${f(d.outro)} |`)
    L.push("")
  }

  L.push("## Tokens e custo desta execução", "")
  L.push("| Modelo | Chamadas | Tokens de entrada | Tokens de saída | Custo |", "|---|---|---|---|---|")
  for (const m of modelos) {
    const u = p.uso[m] ?? { chamadas: 0, entrada: 0, saida: 0, usd: 0 }
    L.push(`| ${m} | ${u.chamadas} | ${u.entrada} | ${u.saida} | ${usd(u.usd)} |`)
  }
  L.push("")
  return L.join("\n")
}

export function tabelaEstimativa(conversas: number, tokensEntrada: number[], modelos: readonly string[] = MODELOS_COMPARADOS): string {
  const est = estimarCusto(tokensEntrada, modelos)
  const L = [`Conversas selecionadas: ${conversas}`, `Tokens de entrada aproximados (total, 1 modelo): ${est[0]?.entrada ?? 0}`, `Saída assumida: ${SAIDA_MEDIA_TOKENS} tokens por chamada`, ""]
  L.push("| Modelo | Entrada | Saída | Custo estimado |", "|---|---|---|---|")
  for (const e of est) L.push(`| ${e.modelo} | ${e.entrada} | ${e.saida} | ${usd(e.usd)} |`)
  const total = est.reduce((s, e) => s + (e.usd ?? 0), 0)
  L.push(`| **Total (3 modelos)** | | | **${usd(total)}** |`)
  return L.join("\n")
}
