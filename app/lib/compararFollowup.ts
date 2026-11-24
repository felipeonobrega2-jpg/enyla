// Comparação do follow-up entre Opus e Sonnet (parte pura do script scripts/comparar-followup.mts).
// Nada aqui lê banco nem chama a IA. O relatório nunca leva dado pessoal: só id anônimo e texto anonimizado.

import { PRECO_IA } from "./gastos"
import { tokensAprox, idAnonimo, somarUsoModelo, type UsoModelo } from "./compararClassificador"

export { idAnonimo, tokensAprox, somarUsoModelo, type UsoModelo }

export const MODELOS_FOLLOWUP = ["claude-opus-5-5", "claude-sonnet-5-5"] as const
export const MODELO_BASE = MODELOS_FOLLOWUP[0]
export const NIVEIS = [1, 2, 3] as const
export const POR_NIVEL = 60
export const JANELA_DIAS = 30
export const AMOSTRA_PARES = 15

// ── Seleção ──
export type RegistroLido = { em: string; jid: string; nome: string | null; perfil: string | null; enviou: boolean; texto: string | null; motivo: string | null; passo?: string | null }

// "F1", "F2", "F3" → nível; senão null
export const nivelDoPasso = (passo: string | null | undefined): 1 | 2 | 3 | null => {
  const m = /^F([123])$/.exec(passo ?? "")
  return m ? Number(m[1]) as 1 | 2 | 3 : null
}

// A IA rodou naquele registro? Não rodou: lembrete de pedido digital (texto fixo) nem "você está na conversa" (segura antes).
export function iaRodou(r: RegistroLido): boolean {
  if (!nivelDoPasso(r.passo)) return false
  return !/lembrete do|você está nessa conversa|você assumiu/i.test(r.motivo ?? "")
}

// Até "porNivel" registros por nível, os mais recentes, no máximo um por conversa e nível, dentro da janela
export function selecionarRegistros(registros: RegistroLido[], agora: number, porNivel = POR_NIVEL, dias = JANELA_DIAS): (RegistroLido & { nivel: 1 | 2 | 3 })[] {
  const desde = agora - dias * 86_400_000
  const vistos = new Set<string>()
  const out: (RegistroLido & { nivel: 1 | 2 | 3 })[] = []
  const contagem: Record<number, number> = { 1: 0, 2: 0, 3: 0 }
  for (const r of [...registros].sort((a, b) => b.em.localeCompare(a.em))) {
    const nivel = nivelDoPasso(r.passo)
    if (!nivel || !iaRodou(r) || new Date(r.em).getTime() < desde || new Date(r.em).getTime() > agora) continue
    const chave = `${r.jid}|${nivel}`
    if (vistos.has(chave) || contagem[nivel] >= porNivel) continue
    vistos.add(chave); contagem[nivel]++
    out.push({ ...r, nivel })
  }
  return out
}

// A conversa como estava no momento do follow-up: só o que veio até o horário do registro (as "limite" últimas)
export function mensagensAte<T extends { ts: string }>(ms: T[], em: string, limite = 50): T[] {
  const fim = new Date(em).getTime()
  return ms.filter(m => new Date(m.ts).getTime() <= fim).slice(-limite)
}

// ── Fatos do texto ──
export type Fatos = { numeros: string[]; valores: string[]; prazos: string[]; links: string[]; passos: string[] }

const LINK = /(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi
const tiraPonto = (s: string) => s.replace(/[.,;:!?]+$/, "")

// "1.500" → "1500", "2,5" → "2.5", "5 mil" → "5000"
function numeroNormal(bruto: string, mil: boolean): string {
  let n = bruto
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(n)) n = n.replace(/\./g, "")
  n = n.replace(",", ".")
  if (mil) n = String(parseFloat(n) * 1000)
  return n
}

export function extrairFatos(texto: string): Fatos {
  const links = [...new Set((texto.match(LINK) ?? []).map(l => tiraPonto(l.toLowerCase())))].sort()
  const semLinks = texto.replace(LINK, " ")
  const valores = new Set<string>()
  for (const m of semLinks.matchAll(/R\$\s*(\d[\d.]*(?:,\d+)?)/gi)) valores.add(numeroNormal(m[1], false).replace(/\.0+$/, ""))
  const prazos = new Set<string>()
  for (const m of semLinks.matchAll(/(\d+)\s*(dias?\s*úteis|dias?\s*uteis|dias?|semanas?|horas?|h\b|meses|mês)/gi)) {
    const u = m[2].toLowerCase().replace(/\s+/g, " ").replace("uteis", "úteis")
    const unidade = /dia/.test(u) ? (/úteis/.test(u) ? "dias úteis" : "dias") : /semana/.test(u) ? "semanas" : /hora|^h$/.test(u) ? "horas" : "meses"
    prazos.add(`${m[1]} ${unidade}`)
  }
  const numeros = new Set<string>()
  for (const m of semLinks.matchAll(/(\d+(?:[.,]\d+)*)(\s*mil\b)?/gi)) {
    const n = numeroNormal(m[1], !!m[2]).replace(/\.0+$/, "")
    if (/^\d+(\.\d+)?$/.test(n)) numeros.add(n)
  }
  const passos: string[] = []
  if (/\?/.test(texto)) passos.push("pergunta")
  if (/or[çc]amento/i.test(texto)) passos.push("orçamento")
  if (links.length) passos.push("link")
  if (/v[ií]deo/i.test(texto)) passos.push("vídeo")
  if (/instagram/i.test(texto)) passos.push("instagram")
  return { numeros: [...numeros].sort(), valores: [...valores].sort(), prazos: [...prazos].sort(), links, passos }
}

// ── Comparação por par ──
export type Saida = { resposta: string; alerta: string; pode_enviar_sozinho: boolean; perfil: string }

export const CRITERIOS = ["resposta_vazia", "alerta", "pode_enviar_sozinho", "perfil", "numeros", "valores", "prazos", "links", "proximo_passo"] as const
export type Criterio = typeof CRITERIOS[number]
export const TITULO: Record<Criterio, string> = {
  resposta_vazia: "Resposta vazia ou não", alerta: "Alerta", pode_enviar_sozinho: "Pode enviar sozinho", perfil: "Perfil do lead",
  numeros: "Mesmos números/quantidades", valores: "Mesmos valores (R$)", prazos: "Mesmos prazos", links: "Mesmos links", proximo_passo: "Mesmo próximo passo",
}

const igual = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
const menos = (a: string[], b: string[]) => a.filter(x => !b.includes(x))

export type Par = { id: string; nivel: number; por: Record<string, Saida | null>; entrada: string }   // entrada = tudo o que a IA leu (para a checagem factual)

export type ResultadoPar = {
  concorda: Record<Criterio, boolean>
  // informação presente numa e ausente na outra (números, valores, prazos, links, passos)
  soNoOpus: string[]
  soNoSonnet: string[]
}

export function compararSaidas(opus: Saida, sonnet: Saida): ResultadoPar {
  const a = extrairFatos(opus.resposta), b = extrairFatos(sonnet.resposta)
  const concorda: Record<Criterio, boolean> = {
    resposta_vazia: !opus.resposta.trim() === !sonnet.resposta.trim(),
    alerta: opus.alerta === sonnet.alerta,
    pode_enviar_sozinho: opus.pode_enviar_sozinho === sonnet.pode_enviar_sozinho,
    perfil: opus.perfil === sonnet.perfil,
    numeros: igual(a.numeros, b.numeros), valores: igual(a.valores, b.valores), prazos: igual(a.prazos, b.prazos),
    links: igual(a.links, b.links), proximo_passo: igual(a.passos, b.passos),
  }
  const rot = (tipo: string, xs: string[]) => xs.map(x => `${tipo}: ${x}`)
  const chaves = ["numeros", "valores", "prazos", "links", "passos"] as const
  const nomes = { numeros: "número", valores: "valor", prazos: "prazo", links: "link", passos: "passo" }
  return {
    concorda,
    soNoOpus: chaves.flatMap(k => rot(nomes[k], menos(a[k], b[k]))),
    soNoSonnet: chaves.flatMap(k => rot(nomes[k], menos(b[k], a[k]))),
  }
}

// Erro factual: número, valor ou prazo na saída que não aparece na conversa nem no pedido (o que a IA leu).
// Só vale para o que a IA escreveu; ordinais "1", "2" soltos e números pequenos de formatação passam.
export function semFundamento(resposta: string, entrada: string): string[] {
  const f = extrairFatos(resposta), lido = extrairFatos(entrada)
  const out: string[] = []
  for (const v of f.valores) if (!lido.valores.includes(v) && !lido.numeros.includes(v)) out.push(`valor R$ ${v}`)
  for (const p of f.prazos) if (!lido.prazos.includes(p)) {
    const n = p.split(" ")[0]
    if (!lido.numeros.includes(n)) out.push(`prazo ${p}`)
  }
  for (const n of f.numeros) if (!lido.numeros.includes(n) && !lido.valores.includes(n) && !f.valores.includes(n) && Number(n) > 9) out.push(`número ${n}`)
  return [...new Set(out)]
}

export type Concordancia = {
  comparados: number
  falhas: Record<string, number>                 // por modelo: chamadas que falharam
  concordancia: Record<Criterio, number>
  inventados: Record<string, number>             // por modelo: pares com erro factual
}

export function agregar(pares: Par[], modelos: readonly string[] = MODELOS_FOLLOWUP): Concordancia {
  const concordancia = Object.fromEntries(CRITERIOS.map(c => [c, 0])) as Record<Criterio, number>
  const falhas = Object.fromEntries(modelos.map(m => [m, 0])) as Record<string, number>
  const inventados = Object.fromEntries(modelos.map(m => [m, 0])) as Record<string, number>
  let comparados = 0
  for (const p of pares) {
    for (const m of modelos) if (!p.por[m]) falhas[m]++
    for (const m of modelos) { const s = p.por[m]; if (s && semFundamento(s.resposta, p.entrada).length) inventados[m]++ }
    const o = p.por[modelos[0]], s = p.por[modelos[1]]
    if (!o || !s) continue
    comparados++
    const r = compararSaidas(o, s)
    for (const c of CRITERIOS) if (r.concorda[c]) concordancia[c]++
  }
  return { comparados, falhas, concordancia, inventados }
}

export function divergencias(pares: Par[], modelos: readonly string[] = MODELOS_FOLLOWUP) {
  const out: { id: string; nivel: number; criterios: Criterio[]; soNoOpus: string[]; soNoSonnet: string[] }[] = []
  for (const p of pares) {
    const o = p.por[modelos[0]], s = p.por[modelos[1]]
    if (!o || !s) continue
    const r = compararSaidas(o, s)
    const criterios = CRITERIOS.filter(c => !r.concorda[c])
    if (criterios.length) out.push({ id: p.id, nivel: p.nivel, criterios, soNoOpus: r.soNoOpus, soNoSonnet: r.soNoSonnet })
  }
  return out
}

// ── Anonimização (só para a amostra lado a lado) ──
// "nomes": nomes que a conversa conhece (contato, primeiro nome). Ordem importa: e-mail e links antes do telefone.
export function anonimizar(texto: string, nomes: (string | null | undefined)[] = []): string {
  let t = texto
  t = t.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[E-MAIL]")
  t = t.replace(LINK, "[LINK]")
  t = t.replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[CNPJ]")
  t = t.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
  t = t.replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/g, m => m.replace(/\D/g, "").length >= 8 ? "[TELEFONE]" : m)
  t = t.replace(/\b\d{5}-?\d{3}\b/g, "[CEP]")
  t = t.replace(/\b(?:rua|avenida|av\.?|alameda|travessa|estrada|rodovia|r\.)\s+[^,\n]{2,60}(?:,\s*(?:n[ºo°.]*\s*)?\d+[^\n.]{0,40})?/gi, "[ENDEREÇO]")
  const lista = [...new Set(nomes.flatMap(n => (n ?? "").split(/\s+/)).map(n => n.trim()).filter(n => n.length > 2))]
  for (const n of lista) t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "giu"), "[NOME]")
  return t
}

// ── Estimativa (sem chamar a IA) ──
export const SAIDA_MEDIA_TOKENS = 500   // effort "medium": pensa antes; JSON do esquema ~200-300 + raciocínio

export function estimarCusto(tokensEntrada: number[], modelos: readonly string[] = MODELOS_FOLLOWUP) {
  const entrada = tokensEntrada.reduce((s, t) => s + t, 0)
  const saida = tokensEntrada.length * SAIDA_MEDIA_TOKENS
  return modelos.map(modelo => {
    const p = PRECO_IA[modelo]
    return { modelo, entrada, saida, usd: p ? (entrada * p.entrada + saida * p.saida) / 1_000_000 : null }
  })
}

const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(1)}%` : "—"
const usd = (v: number | null) => v == null ? "—" : `US$ ${v.toFixed(2)}`

export function tabelaEstimativa(porNivel: Record<number, number>, tokensEntrada: number[], modelos: readonly string[] = MODELOS_FOLLOWUP): string {
  const est = estimarCusto(tokensEntrada, modelos)
  const total = tokensEntrada.length
  const L = [`Casos selecionados: ${total} (F1: ${porNivel[1] ?? 0}, F2: ${porNivel[2] ?? 0}, F3: ${porNivel[3] ?? 0})`,
    `Tokens de entrada aproximados (total, 1 modelo, sem desconto de cache): ${est[0]?.entrada ?? 0}`, `Saída assumida: ${SAIDA_MEDIA_TOKENS} tokens por chamada`, ""]
  L.push("| Modelo | Entrada | Saída | Custo estimado |", "|---|---|---|---|")
  for (const e of est) L.push(`| ${e.modelo} | ${e.entrada} | ${e.saida} | ${usd(e.usd)} |`)
  L.push(`| **Total (${modelos.length} modelos)** | | | **${usd(est.reduce((s, e) => s + (e.usd ?? 0), 0))}** |`)
  return L.join("\n")
}

// ── Relatório ──
export type ParAmostra = Par & { opus: string; sonnet: string }   // textos já anonimizados

// Amostra espalhada pelos níveis (round-robin), só pares em que os dois responderam
export function escolherAmostra<T extends { nivel: number; por: Record<string, Saida | null> }>(pares: T[], n = AMOSTRA_PARES, modelos: readonly string[] = MODELOS_FOLLOWUP): T[] {
  const ok = pares.filter(p => modelos.every(m => p.por[m]))
  const fila: Record<number, T[]> = { 1: [], 2: [], 3: [] }
  for (const p of ok) (fila[p.nivel] ??= []).push(p)
  const out: T[] = []
  while (out.length < n && NIVEIS.some(k => fila[k]?.length)) for (const k of NIVEIS) { const p = fila[k]?.shift(); if (p && out.length < n) out.push(p) }
  return out
}

const celula = (t: string) => (t.trim() || "(vazia)").replace(/\|/g, "\\|").replace(/\n+/g, " ⏎ ")

export function relatorioMarkdown(p: {
  pares: Par[]; amostra: { id: string; nivel: number; opus: string; sonnet: string }[]; uso: Record<string, UsoModelo>; geradoEm: string; modelos?: readonly string[]
}): string {
  const modelos = p.modelos ?? MODELOS_FOLLOWUP
  const c = agregar(p.pares, modelos)
  const div = divergencias(p.pares, modelos)
  const L: string[] = []
  L.push(`# Comparação do follow-up: Opus × Sonnet`, "")
  L.push(`Gerado em ${p.geradoEm} · ${p.pares.length} casos dos últimos ${JANELA_DIAS} dias (F1, F2 e F3) · referência: ${modelos[0]} · comparado: ${modelos[1]}.`)
  L.push("Sem dado pessoal: conversas só por id anônimo (hash com sal sorteado nesta execução); a amostra troca nome, telefone, e-mail, CNPJ, endereço e links por marcadores.", "")

  L.push("## Concordância por critério", "")
  L.push("| Critério | Concordância |", "|---|---|")
  for (const k of CRITERIOS) L.push(`| ${TITULO[k]} | ${pct(c.concordancia[k], c.comparados)} (${c.concordancia[k]}/${c.comparados}) |`)
  L.push(`| Falhas da IA (${modelos.map(m => `${m}: ${c.falhas[m]}`).join(", ")}) | |`, "")

  L.push("## Checagem de erro factual", "")
  L.push("Número, valor ou prazo na saída que não aparece na conversa nem no pedido.", "")
  L.push("| Modelo | Respostas com erro factual |", "|---|---|")
  for (const m of modelos) L.push(`| ${m} | ${c.inventados[m]} |`)
  L.push("")

  L.push(`## Divergências (${div.length})`, "")
  if (!div.length) L.push("Nenhuma.", "")
  else {
    L.push("| Id | Nível | Critérios | Só no Opus | Só no Sonnet |", "|---|---|---|---|---|")
    for (const d of div) L.push(`| ${d.id} | F${d.nivel} | ${d.criterios.map(k => TITULO[k]).join(", ")} | ${d.soNoOpus.join("; ") || "—"} | ${d.soNoSonnet.join("; ") || "—"} |`)
    L.push("")
  }

  L.push(`## Amostra lado a lado (${p.amostra.length} pares, para ler intenção e tom)`, "")
  if (p.amostra.length) {
    L.push("| Id | Nível | Opus | Sonnet |", "|---|---|---|---|")
    for (const a of p.amostra) L.push(`| ${a.id} | F${a.nivel} | ${celula(a.opus)} | ${celula(a.sonnet)} |`)
    L.push("")
  } else L.push("Sem pares.", "")

  L.push("## Tokens e custo desta execução", "")
  L.push("| Modelo | Chamadas | Tokens de entrada | Tokens de saída | Custo |", "|---|---|---|---|---|")
  for (const m of modelos) {
    const u = p.uso[m] ?? { chamadas: 0, entrada: 0, saida: 0, usd: 0 }
    L.push(`| ${m} | ${u.chamadas} | ${u.entrada} | ${u.saida} | ${usd(u.usd)} |`)
  }
  L.push("")
  return L.join("\n")
}
