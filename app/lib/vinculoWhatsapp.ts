// Qual cliente do cadastro é dono de uma conversa do WhatsApp.
// O WhatsApp esconde o telefone nas conversas novas (@lid), então a ligação é:
//   1. gravada (config.vinculosWhatsapp: jid → nome do cliente; "" = não é cliente): escolhida por você, criada ao
//      orçar pela conversa, ou pelo telefone (vinculosPorTelefone, todo dia)
//   2. nome do contato idêntico ao do cliente
//   3. todas as palavras do nome do cliente dentro do nome do contato, se só um cliente servir

import { normalizarTelefone, telefoneDaConversa } from "./contatos"

export type Vinculos = Record<string, string>

const norm = (s?: string | null) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
const palavras = (s?: string | null) => norm(s).split(" ").filter(t => t.length > 2)

export function clienteDaConversa(conv: { jid: string; nome: string | null }, clientes: string[], vinculos: Vinculos = {}): { nome: string; manual: boolean } | null {
  if (conv.jid in vinculos) return vinculos[conv.jid] ? { nome: vinculos[conv.jid], manual: true } : null
  const n = norm(conv.nome)
  if (!n || /^\d+$/.test(n)) return null
  const exato = clientes.filter(c => norm(c) === n)
  if (exato.length === 1) return { nome: exato[0], manual: false }
  const pc = palavras(conv.nome)
  const contidos = clientes.filter(c => { const t = palavras(c); return t.length > 0 && t.every(p => pc.includes(p)) })
  return contidos.length === 1 ? { nome: contidos[0], manual: false } : null
}

// Ligação segura o bastante para o agente tratar como cliente (e não atender sozinho): vínculo manual, nome idêntico,
// ou cliente com nome e sobrenome. Só o primeiro nome batendo ("Maurício" × "Mauricio Daniel") pode ser outra pessoa.
export function ligacaoForte(conv: { nome: string | null }, cli: { nome: string; manual: boolean }) {
  return cli.manual || norm(conv.nome) === norm(cli.nome) || palavras(cli.nome).length >= 2
}

// Mesmo telefone com ou sem o 9 na frente: DDD + 8 últimos dígitos (só Brasil)
export function chaveTelefone(t: string | null | undefined) {
  const n = normalizarTelefone(t)
  if (!n?.startsWith("55") || n.length < 12) return null
  return n.slice(2, 4) + n.slice(-8)
}

// Conversas cujo telefone é o de um cliente do cadastro: vínculos novos (não mexe nas já ligadas nem nas marcadas
// "não é cliente"; telefone repetido em dois clientes não liga ninguém)
export function vinculosPorTelefone(convs: { jid: string; telefone: string | null }[], clientes: { nome: string; telefone: string | null }[], vinculos: Vinculos = {}): Vinculos {
  const dono = new Map<string, string | null>()
  for (const c of clientes) {
    const k = chaveTelefone(c.telefone)
    if (k) dono.set(k, dono.has(k) && dono.get(k) !== c.nome ? null : c.nome)
  }
  const novos: Vinculos = {}
  for (const c of convs) {
    if (c.jid.endsWith("@g.us") || c.jid in vinculos) continue
    const nome = dono.get(chaveTelefone(telefoneDaConversa(c)) ?? "")
    if (nome) novos[c.jid] = nome
  }
  return novos
}
