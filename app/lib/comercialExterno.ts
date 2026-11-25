// Leitura comercial da porta externa (?o=detalhe&area=comercial), paginada. SÓ LÊ: não grava, não envia nada.
// A lista completa é montada na hora do GET (não vem da foto, que grava o comercial cortado em 7.000 caracteres) e só
// então fatiada. Cada item sai inteiro: o corte é sempre ENTRE itens, nunca no meio de um, e o JSON é sempre válido.
export const TETO_PAGINA = 7000

type Lista = "responder" | "orcar" | "resolver" | "travados"
export type ItemComercial = Record<string, unknown> & { lista: Lista; jid: string | null }
type HojeComercial = { responder?: unknown; orcar?: unknown; resolver?: unknown; meta?: { resumo?: unknown; travados?: unknown } | null }

const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x as Record<string, unknown>[] : [])

/** Todos os itens do comercial numa lista só, cada um marcado com a lista de origem (o mesmo lead pode estar em mais de uma). */
export function itensComercial(h: HojeComercial): ItemComercial[] {
  const de = (lista: Lista, xs: unknown) => arr(xs).map(x => ({ ...x, lista, jid: typeof x.jid === "string" ? x.jid : null }))
  return [...de("responder", h.responder), ...de("orcar", h.orcar), ...de("resolver", h.resolver), ...de("travados", h.meta?.travados)]
}

/** Divide em páginas de até `teto` caracteres (JSON dos itens). Um item maior que o teto fica sozinho, inteiro. */
export function paginar(itens: ItemComercial[], teto = TETO_PAGINA): ItemComercial[][] {
  const paginas: ItemComercial[][] = []
  let atual: ItemComercial[] = [], tam = 2
  for (const it of itens) {
    const n = JSON.stringify(it).length + 1
    if (atual.length && tam + n > teto) { paginas.push(atual); atual = []; tam = 2 }
    atual.push(it); tam += n
  }
  if (atual.length) paginas.push(atual)
  return paginas
}

export const AJUDA_COMERCIAL = "?o=detalhe&area=comercial é paginado (só leitura): &pagina=N (começa em 1, padrão 1; fora de 1..totalPaginas volta 400) devolve itens (cada item inteiro, nunca cortado; lista = responder | orcar | resolver | travados), pagina, totalPaginas e totalItens, com até ~7.000 caracteres por página. &jid= devolve só aquele lead, completo, em itens (todas as listas em que ele aparece); jid que não está no comercial volta 404; com jid a pagina é ignorada. resumo da meta vem em toda resposta"

export function lerComercial(h: HojeComercial, q: { pagina: string | null; jid: string | null }, teto = TETO_PAGINA): { status: number; corpo: Record<string, unknown> } {
  const todos = itensComercial(h)
  const resumo = h.meta?.resumo ?? null
  if (q.jid) {
    const itens = todos.filter(i => i.jid === q.jid)
    if (!itens.length) return { status: 404, corpo: { erro: `jid não está na lista comercial: ${q.jid}` } }
    return { status: 200, corpo: { area: "comercial", jid: q.jid, totalItens: itens.length, itens, resumo } }
  }
  const paginas = paginar(todos, teto)
  const totalPaginas = Math.max(paginas.length, 1)
  const bruto = q.pagina ?? "1"
  const pagina = /^\d+$/.test(bruto.trim()) ? Number(bruto) : NaN
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > totalPaginas)
    return { status: 400, corpo: { erro: `pagina inválida: ${bruto}. Use um número de 1 a ${totalPaginas} (totalItens: ${todos.length}).`, totalPaginas, totalItens: todos.length } }
  return { status: 200, corpo: { area: "comercial", pagina, totalPaginas, totalItens: todos.length, itens: paginas[pagina - 1] ?? [], resumo } }
}
