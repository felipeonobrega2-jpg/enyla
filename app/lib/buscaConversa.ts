// Busca de conversas do WhatsApp que perdoa a grafia: sem acento, sem diferença entre letra dobrada e simples
// ("Alisson" acha "Allison Pessoa") e pelo telefone. Puro.
// Feita em 25/11/2026: o Felipe buscava "alisson" e não achava o contato salvo como "Allison Pessoa - Similares".

/** Chave de comparação: minúsculas, sem acento, sem letras repetidas em sequência. */
export function chaveBusca(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/(.)\1+/g, "$1")
}

const digitos = (s: string) => s.replace(/\D/g, "")

/** A conversa casa com o termo pelo nome, pela última mensagem ou pelo telefone (4+ dígitos). */
export function casaBusca(c: { nome: string; ultima_msg?: string | null; telefone?: string | null; jid?: string }, termo: string): boolean {
  const t = termo.trim()
  if (!t) return true
  const k = chaveBusca(t)
  if (chaveBusca(c.nome).includes(k) || chaveBusca(c.ultima_msg ?? "").includes(k)) return true
  const d = digitos(t)
  return d.length >= 4 && d.length === t.replace(/[\s()+-]/g, "").length && (digitos(c.telefone ?? "").includes(d) || digitos(c.jid ?? "").includes(d))
}

const CLASSES: Record<string, string> = { a: "[aáàâã]", e: "[eéèê]", i: "[iíì]", o: "[oóòôõ]", u: "[uúùü]", c: "[cç]", n: "[nñ]" }

/** Expressão regular (Postgres ~*) que casa o nome no banco do mesmo jeito que chaveBusca. Null se o termo for curto. */
export function regexBusca(termo: string): string | null {
  const k = chaveBusca(termo.trim()).replace(/[^a-z0-9 ]/g, "")
  if (k.replace(/ /g, "").length < 3) return null
  return [...k].map(ch => ch === " " ? "\\s+" : `${CLASSES[ch] ?? ch}+`).join("")
}
