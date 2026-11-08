// Teste A/B da primeira mensagem (abertura) para quem chega só com a mensagem pronta do anúncio.
// A = a saudação do filtro (a de sempre); B = a desafiante. Cada lead cai sempre na mesma (pelo número), o sistema
// mede quantos responderam e quantos disseram o volume em 24 h e, com amostra suficiente e diferença clara, fica com
// a melhor sozinho. Só regras puras.

export type Variante = "A" | "B"
export type TesteAbertura = {
  ligado: boolean
  b: string                      // texto da desafiante
  inicio: string                 // só contam leads que chegaram depois (trocar o texto recomeça)
  vencedora?: Variante           // decidido: todo lead novo recebe esta
  decididoEm?: string
  motivo?: string
}
export type Placar = { leads: number; responderam: number; volume: number; mql: number }
export type MedicaoAbertura = { em: string; A: Placar; B: Placar }

export const ABERTURA_B_PADRAO = "Oi, tudo bem? Aqui é o Luiz Felipe, da Jerograf / ENYLA 👋 Quantas caixinhas você precisa, mais ou menos? Umas 500, 1.000, 5.000 ou mais?"
export const MINIMO_POR_VARIANTE = 60      // leads em cada uma antes de decidir
export const DIFERENCA_MINIMA = 0.08       // 8 pontos a mais de "disse o volume"
export const MAXIMO_POR_VARIANTE = 200     // sem diferença até aqui: empate, fica a de sempre

// Cada lead cai sempre na mesma variante (o número decide: metade e metade)
export function varianteDoLead(jid: string, t: TesteAbertura | null | undefined): Variante {
  if (!t?.ligado) return "A"
  if (t.vencedora) return t.vencedora
  let h = 0
  for (const ch of jid.split("@")[0]) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 2 ? "B" : "A"
}

export function aberturaPara(jid: string, a: string, t: TesteAbertura | null | undefined): { texto: string; variante: Variante } {
  const v = varianteDoLead(jid, t)
  return v === "B" && t?.b?.trim() ? { texto: t.b.trim(), variante: "B" } : { texto: a, variante: "A" }
}

// Qual variante foi esta mensagem (as duas começam igual: compara o texto inteiro, sem emoji, pontuação e caixa)
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "")
export function qualVariante(texto: string | null | undefined, a: string, b: string): Variante | null {
  const t = norm(texto ?? "")
  if (!t) return null
  if (b && t === norm(b)) return "B"
  if (a && t === norm(a)) return "A"
  return null
}

// O que o lead respondeu nas 24 h depois da abertura: resposta de verdade (mais que "ok") e se disse o volume
const VOLUME = /\b\d[\d.,]{2,}\b|\b\d+\s*mil\b|\bmil\b|\bcem\b|\bquinhent/i
export function respostaDoLead(depois: { corpo: string | null; tipo: string | null }[]) {
  const reais = depois.filter(m => (m.corpo ?? "").trim().length > 2 || !/^(text|conversation)$/i.test(m.tipo ?? ""))
  return { respondeu: reais.length > 0, volume: reais.some(m => VOLUME.test(m.corpo ?? "")) }
}

export const vazio = (): Placar => ({ leads: 0, responderam: 0, volume: 0, mql: 0 })
const taxa = (n: number, d: number) => (d ? n / d : 0)

// Decide quando dá: as duas com amostra mínima e uma dizendo o volume 8 pontos a mais, sem perder em MQL.
// Sem diferença até o máximo: empate, fica a de sempre (A).
export function decidir(m: MedicaoAbertura): { vencedora: Variante; motivo: string } | null {
  const { A, B } = m
  if (A.leads < MINIMO_POR_VARIANTE || B.leads < MINIMO_POR_VARIANTE) return null
  const va = taxa(A.volume, A.leads), vb = taxa(B.volume, B.leads)
  const ma = taxa(A.mql, A.leads), mb = taxa(B.mql, B.leads)
  const pct = (x: number) => `${Math.round(x * 100)}%`
  if (vb - va >= DIFERENCA_MINIMA && mb >= ma - 0.03) return { vencedora: "B", motivo: `B: ${pct(vb)} disseram o volume contra ${pct(va)} da A (${B.leads} e ${A.leads} leads).` }
  if (va - vb >= DIFERENCA_MINIMA && ma >= mb - 0.03) return { vencedora: "A", motivo: `A: ${pct(va)} disseram o volume contra ${pct(vb)} da B (${A.leads} e ${B.leads} leads).` }
  if (A.leads >= MAXIMO_POR_VARIANTE && B.leads >= MAXIMO_POR_VARIANTE) return { vencedora: "A", motivo: `Empate (${pct(va)} e ${pct(vb)} disseram o volume): fica a de sempre.` }
  return null
}
