// Qual cliente do cadastro é dono de uma conversa do WhatsApp.
// O WhatsApp esconde o telefone nas conversas novas (@lid), então a ligação é:
//   1. manual (config.vinculosWhatsapp: jid → nome do cliente; "" = não é cliente)
//   2. nome do contato idêntico ao do cliente
//   3. todas as palavras do nome do cliente dentro do nome do contato, se só um cliente servir

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
