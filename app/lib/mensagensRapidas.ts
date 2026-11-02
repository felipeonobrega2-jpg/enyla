// Mensagens rápidas: variáveis no texto, preenchidas com os dados da conversa/cliente ao inserir.
//   {{nome}}            primeiro nome do contato (ou do cliente ligado)
//   {{nome_completo}}   nome do cliente ligado (ou do contato)
//   {{pagina_cliente}}  link da página do cliente (pedidos, Pix, repetir)
//   {{proposta}}        link de aprovação do orçamento aberto do cliente

export type Rapida = { id: string; atalho: string; quando_usar: string; corpo: string | null; ativa: boolean; ordem: number }

export const VARIAVEIS = [
  { chave: "nome", descricao: "primeiro nome" },
  { chave: "nome_completo", descricao: "nome completo" },
  { chave: "pagina_cliente", descricao: "link da página do cliente" },
  { chave: "proposta", descricao: "link da proposta aberta" },
]

export function filtrar(lista: Rapida[], digitado: string): Rapida[] {
  const q = digitado.replace(/^\//, "").toLowerCase()
  return lista.filter(r => r.ativa && (r.atalho.slice(1).toLowerCase().startsWith(q) || (r.corpo ?? "").toLowerCase().includes(q) || r.quando_usar.toLowerCase().includes(q))).slice(0, 8)
}

// Preenche as variáveis; as de link vêm de funções (buscadas só se o texto usar)
export async function preencher(corpo: string, ctx: { contato: string; cliente?: string | null; links: { pagina?: () => Promise<string | null>; proposta?: () => Promise<string | null> } }) {
  const completo = ctx.cliente ?? ctx.contato
  const primeiro = (ctx.cliente ?? ctx.contato).trim().split(/\s+/)[0] ?? ""
  let t = corpo.replace(/\{\{\s*nome\s*\}\}/g, primeiro).replace(/\{\{\s*nome_completo\s*\}\}/g, completo)
  if (/\{\{\s*pagina_cliente\s*\}\}/.test(t)) t = t.replace(/\{\{\s*pagina_cliente\s*\}\}/g, (await ctx.links.pagina?.()) ?? "")
  if (/\{\{\s*proposta\s*\}\}/.test(t)) t = t.replace(/\{\{\s*proposta\s*\}\}/g, (await ctx.links.proposta?.()) ?? "")
  return t
}
