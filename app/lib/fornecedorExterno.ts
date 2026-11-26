// Porta externa, canal de fornecedor: ação ordenar_fornecedor (POST) e leitura ?o=fornecedor_conversa (GET).
// A mensagem entra na MESMA fila do Aprovo do Felipe da ordenar_funcionario (AcaoConversa tipo "mensagem", agora com
// fornecedorId) e só sai pelo WhatsApp do painel depois do "Aprovo e envio" (responderAcao → enviarAoFornecedor).
// Este arquivo só envia dentro de enviarAoFornecedor, chamado pelo Aprovo. Nunca apaga nada. Só roda no servidor.
import type { Fornecedor } from "@/app/config"
import { lerCampos } from "./configAtomica"
import { supabase } from "./supabase"
import { evo } from "./evolution"
import { gravarLote, type WaMessage } from "./whatsappDados"
import { normalizarTelefone } from "./contatos"
import { chaveTelefone } from "./vinculoWhatsapp"
import { nivelDoDestinatario } from "./nivelCliente"
import { ehProspecto } from "./prospectorTrava"
import { lerConversa, gravarConversa, gravarMensagemFornecedor, listarMensagensFornecedor, type MsgConversa } from "./diretoriaServidor"
import { MAX_PENDENTES } from "./ordemComercial"
import type { IdDiretor } from "./diretoria"

type Corpo = { status: number; corpo: Record<string, unknown> }
const novoId = () => `fo-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const PEDIDO = /^[A-Za-z]{2,5}-\d{1,6}$/

async function achar(id: string): Promise<Fornecedor | null> {
  const { fornecedores } = await lerCampos<{ fornecedores?: Fornecedor[] }>(["fornecedores"])
  return (fornecedores ?? []).find(f => f.id === id) ?? null
}

// O número é de cliente ou de lead? Na dúvida (erro de leitura), recusa.
export async function numeroEhDeClienteOuLead(telefone: string): Promise<string | null> {
  const numero = normalizarTelefone(telefone)
  const chave = chaveTelefone(numero)
  if (!numero || !chave) return "telefone do fornecedor inválido"
  try {
    const { data: cad, error: e1 } = await supabase.from("Cliente").select("nome, telefone")
    if (e1) throw new Error(e1.message)
    if ((cad ?? []).some(c => chaveTelefone(normalizarTelefone(c.telefone)) === chave)) return "o número é de um cliente do cadastro"
    if (await ehProspecto(`${numero}@s.whatsapp.net`)) return "o número é de um prospecto (lead)"
    const { data: convs, error: e2 } = await supabase.from("whatsapp_conversas").select("jid, telefone, status_lead, etiquetas").order("ultima_at", { ascending: false }).limit(2000)
    if (e2) throw new Error(e2.message)
    for (const c of (convs ?? []).filter(c => chaveTelefone(normalizarTelefone(c.telefone ?? String(c.jid).split("@")[0])) === chave)) {
      if (c.status_lead || (Array.isArray(c.etiquetas) && c.etiquetas.length)) return "o número é de um lead do WhatsApp"
      const n = await nivelDoDestinatario(c.jid)
      if (n.nivel !== "lead") return `o número é de um cliente (nível ${n.nivel})`
    }
    return null
  } catch {
    return "não consegui conferir se o número é de cliente ou lead (recusado por segurança)"
  }
}

export async function ordenarFornecedor(diretor: IdDiretor, b: Record<string, unknown>): Promise<Corpo> {
  const erro = (status: number, e: string): Corpo => ({ status, corpo: { erro: e } })
  const id = typeof b.fornecedor === "string" ? b.fornecedor.trim() : ""
  if (!id) return erro(400, "fornecedor: obrigatório (id do cadastro de fornecedores).")
  const pedido = typeof b.pedido === "string" ? b.pedido.trim().toUpperCase() : ""
  if (!PEDIDO.test(pedido)) return erro(400, "pedido: obrigatório, no formato DIG-0159.")
  const texto = typeof b.texto === "string" ? b.texto.trim().slice(0, 4000) : ""
  if (!texto) return erro(400, "texto: obrigatório.")
  const brutos = b.anexos === undefined ? [] : b.anexos
  if (!Array.isArray(brutos) || brutos.some(a => typeof a !== "string" || !a.trim() || a.length > 300) || brutos.length > 10) return erro(400, "anexos: lista de até 10 referências (texto de até 300 caracteres) a arquivos que já estão no sistema.")
  const anexos = (brutos as string[]).map(a => a.trim())

  const f = await achar(id)
  if (!f) return erro(404, `Fornecedor ${id} não está no cadastro de fornecedores.`)
  if (!f.ativo) return erro(409, `Fornecedor ${f.nome} está inativo no cadastro.`)
  if (!normalizarTelefone(f.telefone)) return erro(400, `Fornecedor ${f.nome} está sem telefone válido no cadastro.`)
  const motivo = await numeroEhDeClienteOuLead(f.telefone!)
  if (motivo) return erro(422, `Recusado: ${motivo}. Mensagem de fornecedor só vai para quem está no cadastro de fornecedores.`)

  const todas = await lerConversa(diretor)
  const esperando = todas.flatMap(m => m.acoes ?? []).filter(a => a.tipo === "mensagem" && a.status === "aguardando").length
  if (esperando >= MAX_PENDENTES) return erro(429, `Já há ${MAX_PENDENTES} mensagens esperando o Aprovo. Espere o Felipe decidir.`)

  const completo = anexos.length ? `${texto}\n\nReferências: ${anexos.join(" | ")}` : texto
  const acaoId = novoId()
  const agora = new Date().toISOString()
  const msg: MsgConversa = {
    id: novoId(), de: "diretor", texto: `Mensagem ao fornecedor ${f.nome} (${pedido}) esperando o Aprovo do Felipe.`, em: agora, nuvem: true,
    acoes: [{ id: acaoId, tipo: "mensagem", funcionario: "fornecedor", cliente: f.nome, texto: completo, status: "aguardando", fornecedorId: f.id, pedido }],
  }
  await gravarMensagemFornecedor({ id: acaoId, fornecedorId: f.id, fornecedorNome: f.nome, pedido, texto: completo, anexos, diretor, criadaEm: agora, status: "aguardando" })
  await gravarConversa(diretor, [...todas, msg])
  return { status: 200, corpo: { ok: true, resultado: `Mensagem ao fornecedor ${f.nome} (${pedido}) na fila do Aprovo do Felipe. Nada foi enviado.`, destino: "fila_aprovo", id: acaoId } }
}

// Chamado só pelo Aprovo (responderAcao). Confere de novo o número antes de enviar.
export async function enviarAoFornecedor(fornecedorId: string, texto: string): Promise<{ ok: true; jid: string } | { ok: false; erro: string; status: number }> {
  const f = await achar(fornecedorId)
  const numero = normalizarTelefone(f?.telefone)
  if (!f || !numero) return { ok: false, erro: "Fornecedor sem telefone válido no cadastro.", status: 404 }
  const motivo = await numeroEhDeClienteOuLead(f.telefone!)
  if (motivo) return { ok: false, erro: `Não enviou: ${motivo}.`, status: 422 }
  const r = await evo<WaMessage>("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: numero, text: texto.trim() }) })
  if (!r.ok || !r.corpo?.key?.id) return { ok: false, erro: `Não enviou (${r.status}). Confira a conexão do WhatsApp.`, status: 502 }
  await gravarLote([{ ...r.corpo, key: { ...r.corpo.key, fromMe: true } }])
  return { ok: true, jid: r.corpo.key.remoteJid }
}

// GET ?o=fornecedor_conversa&fornecedor=ID: o que foi mandado (com o horário de envio) e as últimas mensagens do WhatsApp
export async function leituraFornecedorConversa(id: string): Promise<Corpo> {
  if (!id.trim()) return { status: 400, corpo: { erro: "Mande ?o=fornecedor_conversa&fornecedor=<id do cadastro>." } }
  const f = await achar(id.trim())
  if (!f) return { status: 404, corpo: { erro: `Fornecedor ${id} não está no cadastro de fornecedores.` } }
  const enviadas = await listarMensagensFornecedor(f.id)
  const numero = normalizarTelefone(f.telefone)
  const chave = chaveTelefone(numero)
  let mensagens: { de: "fornecedor" | "enyla"; em: string; texto: string | null }[] = []
  if (chave) {
    const { data: convs } = await supabase.from("whatsapp_conversas").select("jid, telefone").order("ultima_at", { ascending: false }).limit(2000)
    const jids = (convs ?? []).filter(c => chaveTelefone(normalizarTelefone(c.telefone ?? String(c.jid).split("@")[0])) === chave).map(c => c.jid as string)
    if (jids.length) {
      const { data } = await supabase.from("whatsapp_mensagens").select("from_me, corpo, ts").in("jid", jids).order("ts", { ascending: false }).limit(30)
      mensagens = (data ?? []).map(m => ({ de: m.from_me ? "enyla" as const : "fornecedor" as const, em: m.ts as string, texto: m.corpo as string | null })).reverse()
    }
  }
  return { status: 200, corpo: { fornecedor: { id: f.id, nome: f.nome }, enviadasPelaDiretoria: enviadas, mensagens } }
}
