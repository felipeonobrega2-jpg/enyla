// Contatos importantes no servidor: monta a lista (MQL, ICP, oportunidade, clientes) e descobre os telefones
// que o WhatsApp esconde nas conversas novas (@lid): pelo cadastro de clientes e perguntando à Evolution.

import { supabase } from "./supabase"
import { evo } from "./evolution"
import { clienteDaConversa, ligacaoForte, Vinculos } from "./vinculoWhatsapp"
import { nomeChave } from "./negocio"
import { ContatoImportante, ETIQUETAS_IMPORTANTES, telefoneDaConversa, telefoneNaResposta, normalizarTelefone } from "./contatos"

type Conv = { jid: string; nome: string | null; telefone: string | null; status_lead: string | null; etiquetas: string[] | null; ultima_at: string | null }

export async function contatosImportantes(): Promise<ContatoImportante[]> {
  const [{ data: convs }, { data: cards }, { data: cfg }] = await Promise.all([
    supabase.from("whatsapp_conversas").select("jid, nome, telefone, status_lead, etiquetas, ultima_at").not("jid", "like", "%@g.us"),
    supabase.from("KanbanCard").select("nomeCliente"),
    supabase.from("AppConfig").select("data").eq("id", 1).single(),
  ])
  const vinculos = ((cfg?.data ?? {}) as { vinculosWhatsapp?: Vinculos }).vinculosWhatsapp
  const nomes = [...new Set((cards ?? []).map(c => c.nomeCliente).filter(Boolean))] as string[]
  const out: ContatoImportante[] = []
  for (const c of (convs ?? []) as Conv[]) {
    const etiquetas = c.etiquetas ?? []
    const motivos: string[] = []
    if (c.status_lead === "mql") motivos.push("MQL")
    for (const e of etiquetas) if (ETIQUETAS_IMPORTANTES.includes(e) && !motivos.includes(e)) motivos.push(e)
    const cli = clienteDaConversa(c, nomes, vinculos)
    if (cli && ligacaoForte(c, cli)) motivos.push(`Cliente: ${cli.nome}`)
    if (!motivos.length) continue
    out.push({ jid: c.jid, nome: c.nome || cli?.nome || c.jid.split("@")[0], telefone: telefoneDaConversa(c), motivos, etiquetas, ultima: c.ultima_at })
  }
  return out.sort((a, b) => (b.ultima ?? "").localeCompare(a.ultima ?? ""))
}

// Pergunta à Evolution pelo contato e pelo perfil; devolve o telefone se alguma resposta trouxer
async function telefonePelaEvolution(jid: string): Promise<string | null> {
  const contato = await evo<unknown>("/chat/findContacts/{i}", { method: "POST", body: JSON.stringify({ where: { remoteJid: jid } }) })
  const t1 = telefoneNaResposta(contato.corpo)
  if (t1) return t1
  const perfil = await evo<unknown>("/chat/fetchProfile/{i}", { method: "POST", body: JSON.stringify({ number: jid }) })
  return telefoneNaResposta(perfil.corpo)
}

// Completa o telefone dos importantes que ainda não têm: cadastro de clientes (ligação segura) e Evolution
export async function descobrirTelefones(limite = 40): Promise<{ achados: number; faltam: number; pelaEvolution: number; peloCadastro: number }> {
  const lista = (await contatosImportantes()).filter(c => !c.telefone)
  const { data: clientes } = await supabase.from("Cliente").select("nome, telefone")
  const telCliente = new Map((clientes ?? []).filter(c => c.telefone).map(c => [nomeChave(c.nome), normalizarTelefone(c.telefone)]))
  let peloCadastro = 0, pelaEvolution = 0
  const fila = lista.slice(0, limite)
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (fila.length) {
      const c = fila.shift()!
      const doCliente = c.motivos.find(m => m.startsWith("Cliente: "))?.slice(9)
      let tel = doCliente ? telCliente.get(nomeChave(doCliente)) ?? null : null
      if (tel) peloCadastro++
      else { tel = await telefonePelaEvolution(c.jid).catch(() => null); if (tel) pelaEvolution++ }
      if (tel) await supabase.from("whatsapp_conversas").update({ telefone: tel }).eq("jid", c.jid).is("telefone", null)
    }
  }))
  const achados = peloCadastro + pelaEvolution
  return { achados, faltam: lista.length - achados, pelaEvolution, peloCadastro }
}

// Um contato só (o agente chama quando surge um MQL novo)
export async function garantirTelefone(jid: string) {
  const { data: c } = await supabase.from("whatsapp_conversas").select("jid, telefone").eq("jid", jid).maybeSingle()
  if (!c || telefoneDaConversa(c)) return
  const tel = await telefonePelaEvolution(jid).catch(() => null)
  if (tel) await supabase.from("whatsapp_conversas").update({ telefone: tel }).eq("jid", jid).is("telefone", null)
}
