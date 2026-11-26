// Porta externa, ação ordenar_fornecedor: o diretor repassa um ajuste de arte ou briefing a um FORNECEDOR do cadastro.
// Não passa pela busca do Pós-venda (que só olha cliente): o número vem do cadastro de fornecedores (AppConfig.fornecedores)
// ou da conversa de WhatsApp ligada a ele. A mensagem NUNCA sai daqui: entra na fila do Aprovo do Felipe (AcaoConversa
// "mensagem" com fornecedorId) e só sai em responderAcao, depois do Aprovo. Recusa número de cliente ou de lead.
// Não mexe em cobrança nem em pagamento e não apaga nada. Só roda no servidor.
import type { Fornecedor } from "@/app/config"
import { supabase } from "./supabase"
import { lerCampos, mudarConfig } from "./configAtomica"
import { lerConversa, type AcaoConversa } from "./diretoriaServidor"
import { chaveTelefone, type Vinculos } from "./vinculoWhatsapp"
import { normalizarTelefone, telefoneDaConversa } from "./contatos"
import { nomeChave } from "./negocio"
import type { IdDiretor } from "./diretoria"

export const MAX_PENDENTES_FORNECEDOR = 20
export const MAX_ANEXOS = 5
const MAX_HISTORICO = 500
const ETIQUETAS_DE_LEAD = ["MQL", "ICP", "Lead médio", "Lead pequeno", "Oportunidade", "Descartado"]

export type Anexo = { nome: string; url: string; mime?: string }
export type MensagemFornecedor = Extract<AcaoConversa, { tipo: "mensagem" }>
export type RegistroCanal = { id: string; diretor: string; fornecedorId: string; fornecedor: string; pedido: string; texto: string; anexos: Anexo[]; criadoEm: string; enviadoEm?: string }

type ConversaWa = { jid: string; nome: string | null; telefone: string | null; etiquetas: string[] | null; status_lead: string | null }
export type Destino = { ok: true; jid: string; numero: string } | { ok: false; status: 404 | 409; erro: string }

const ehLeadMarcado = (c: ConversaWa) => !!c.status_lead || (c.etiquetas ?? []).some(e => ETIQUETAS_DE_LEAD.includes(e))
const digitos = (s?: string | null) => (s ?? "").replace(/\D/g, "")

export async function lerFornecedor(id: string): Promise<Fornecedor | null> {
  const { fornecedores } = await lerCampos<{ fornecedores?: Fornecedor[] }>(["fornecedores"])
  return (fornecedores ?? []).find(f => f.id === id) ?? null
}

// Número do fornecedor: telefone do cadastro, senão a conversa ligada a ele no painel (vínculo manual, etiqueta
// "Fornecedora" com o mesmo nome). Recusa se o número é de cliente ou de lead.
export async function resolverDestino(f: Fornecedor): Promise<Destino> {
  const { vinculosWhatsapp } = await lerCampos<{ vinculosWhatsapp?: Vinculos }>(["vinculosWhatsapp"])
  const vinculos = vinculosWhatsapp ?? {}
  const { data } = await supabase.from("whatsapp_conversas").select("jid, nome, telefone, etiquetas, status_lead").order("ultima_at", { ascending: false }).limit(2000)
  const conversas = ((data ?? []) as ConversaWa[]).filter(c => !String(c.jid).endsWith("@g.us"))
  const nome = nomeChave(f.nome), contato = f.contato ? nomeChave(f.contato) : ""
  const ligada = (c: ConversaWa) => vinculos[c.jid] === f.nome || ((c.etiquetas ?? []).includes("Fornecedora") && !!c.nome && [nome, contato].includes(nomeChave(c.nome)) )

  let conv: ConversaWa | undefined
  let numero = normalizarTelefone(f.telefone)
  if (numero) {
    const k = chaveTelefone(numero)
    conv = k ? conversas.find(c => chaveTelefone(telefoneDaConversa(c)) === k) : undefined
  } else {
    conv = conversas.find(ligada)
    numero = conv ? telefoneDaConversa(conv) : null
  }
  if (!numero && !conv) return { ok: false, status: 404, erro: `Sem WhatsApp do fornecedor ${f.nome}: o cadastro não tem telefone e não há conversa ligada a ele no painel. Nada foi escrito.` }

  // Nunca para cliente nem lead
  const k = chaveTelefone(numero ?? conv?.telefone ?? conv?.jid.split("@")[0])
  const { data: cad } = await supabase.from("Cliente").select("nome, telefone")
  if (k && (cad ?? []).some(c => chaveTelefone(c.telefone) === k)) return { ok: false, status: 409, erro: `O número de ${f.nome} é de um cliente do cadastro. Fornecedor não recebe por número de cliente. Nada foi escrito.` }
  if (conv) {
    const ligadoAoutro = conv.jid in vinculos && !!vinculos[conv.jid] && vinculos[conv.jid] !== f.nome
    if (ligadoAoutro) return { ok: false, status: 409, erro: `A conversa de WhatsApp de ${f.nome} está ligada a um cliente. Nada foi escrito.` }
    if (ehLeadMarcado(conv) && !ligada(conv)) return { ok: false, status: 409, erro: `O número de ${f.nome} é de um lead (conversa com etiqueta ou status de lead). Fornecedor não recebe por número de lead. Nada foi escrito.` }
  }
  return { ok: true, jid: conv?.jid ?? `${numero}@s.whatsapp.net`, numero: numero ?? digitos(conv?.telefone) }
}

// Anexos são só referências a arquivos que já estão no sistema (armazenamento do Supabase do próprio projeto)
function lerAnexos(x: unknown): { ok: true; anexos: Anexo[] } | { ok: false; erro: string } {
  if (x == null) return { ok: true, anexos: [] }
  if (!Array.isArray(x)) return { ok: false, erro: "anexos: lista de { nome, url } de arquivos que já estão no sistema." }
  if (x.length > MAX_ANEXOS) return { ok: false, erro: `anexos: no máximo ${MAX_ANEXOS}.` }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : ""
  const out: Anexo[] = []
  for (const a of x as Record<string, unknown>[]) {
    const url = typeof a?.url === "string" ? a.url.trim() : ""
    let host = ""
    try { const u = new URL(url); host = u.protocol === "https:" ? u.host : "" } catch { /* url inválida */ }
    if (!host || !base || host !== base) return { ok: false, erro: "anexos: só arquivos que já estão no sistema (link do armazenamento da Enyla). Link de fora não vale." }
    const nome = (typeof a.nome === "string" && a.nome.trim() ? a.nome.trim() : url.split("/").pop() ?? "arquivo").slice(0, 120)
    out.push({ nome, url, ...(typeof a.mime === "string" && a.mime ? { mime: a.mime.slice(0, 80) } : {}) })
  }
  return { ok: true, anexos: out }
}

export type ResultadoOrdem = { ok: true; resultado: string; destino: "fila_aprovo"; id: string; acao: MensagemFornecedor } | { ok: false; status: number; erro: string }

export async function ordenarFornecedor(diretor: IdDiretor, b: Record<string, unknown>, novoId: () => string): Promise<ResultadoOrdem> {
  const id = typeof b.fornecedor === "string" ? b.fornecedor.trim() : ""
  if (!id) return { ok: false, status: 400, erro: "fornecedor: obrigatório (id do cadastro de fornecedores)." }
  const pedido = typeof b.pedido === "string" ? b.pedido.trim().slice(0, 40) : ""
  if (!pedido) return { ok: false, status: 400, erro: "pedido: obrigatório (ex.: DIG-0159)." }
  const texto = typeof b.texto === "string" ? b.texto.trim().slice(0, 4000) : ""
  if (!texto) return { ok: false, status: 400, erro: "texto: obrigatório." }
  const an = lerAnexos(b.anexos)
  if (!an.ok) return { ok: false, status: 400, erro: an.erro }
  const f = await lerFornecedor(id)
  if (!f) return { ok: false, status: 404, erro: `Fornecedor ${id} não está no cadastro de fornecedores. Só se manda para quem está no cadastro.` }
  if (!f.ativo) return { ok: false, status: 409, erro: `Fornecedor ${f.nome} está inativo no cadastro.` }
  const d = await resolverDestino(f)
  if (!d.ok) return { ok: false, status: d.status, erro: d.erro }
  const pendentes = (await lerConversa(diretor)).flatMap(m => m.acoes ?? []).filter(a => a.tipo === "mensagem" && a.status === "aguardando").length
  if (pendentes >= MAX_PENDENTES_FORNECEDOR) return { ok: false, status: 429, erro: `Já são ${pendentes} mensagens esperando o Aprovo do Felipe (máximo ${MAX_PENDENTES_FORNECEDOR} por diretor).` }
  const agora = new Date().toISOString()
  const completo = `Pedido ${pedido}: ${texto}`
  const acao: MensagemFornecedor = {
    id: novoId(), tipo: "mensagem", funcionario: "Fornecedor", cliente: f.nome, jid: d.jid, texto: completo, status: "aguardando",
    fornecedorId: f.id, pedido, ...(an.anexos.length ? { anexos: an.anexos } : {}),
  }
  const registro: RegistroCanal = { id: acao.id, diretor, fornecedorId: f.id, fornecedor: f.nome, pedido, texto: completo, anexos: an.anexos, criadoEm: agora }
  await mudarConfig<{ canalFornecedor?: RegistroCanal[] }>(cfg => ({ canalFornecedor: [...(cfg.canalFornecedor ?? []), registro].slice(-MAX_HISTORICO) }))
  return { ok: true, destino: "fila_aprovo", id: acao.id, acao, resultado: `Mensagem para ${f.nome} (pedido ${pedido}) está esperando o Aprovo do Felipe. Nada foi enviado: "${completo}"` }
}

// Só chamada depois do Aprovo (responderAcao). Texto e depois cada anexo; grava o horário de envio no histórico.
export async function enviarAoFornecedor(acao: MensagemFornecedor): Promise<{ ok: true } | { ok: false; erro: string }> {
  const f = acao.fornecedorId ? await lerFornecedor(acao.fornecedorId) : null
  if (!f) return { ok: false, erro: "Fornecedor não está mais no cadastro." }
  const d = await resolverDestino(f)   // confere de novo no momento do envio
  if (!d.ok) return { ok: false, erro: d.erro }
  const { evo } = await import("./evolution")
  const { gravarLote } = await import("./whatsappDados")
  type Env = import("./whatsappDados").WaMessage
  const number = d.numero || d.jid
  const grava = async (c: Env) => { await gravarLote([{ ...c, key: { ...c.key, remoteJid: d.jid, fromMe: true } }]) }
  const t = await evo<Env>("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number, text: acao.texto.trim() }) })
  if (!t.ok || !t.corpo?.key?.id) return { ok: false, erro: `Não enviou (${t.status}). Confira a conexão do WhatsApp.` }
  await grava(t.corpo)
  for (const a of acao.anexos ?? []) {
    const mime = a.mime ?? "application/octet-stream"
    const mediatype = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : "document"
    const m = await evo<Env>("/message/sendMedia/{i}", { method: "POST", body: JSON.stringify({ number, mediatype, mimetype: mime, media: a.url, fileName: mediatype === "document" ? a.nome : undefined }) })
    if (!m.ok || !m.corpo?.key?.id) return { ok: false, erro: `O texto foi, mas o anexo ${a.nome} não (${m.status}).` }
    await grava(m.corpo)
  }
  const em = new Date().toISOString()
  await mudarConfig<{ canalFornecedor?: RegistroCanal[] }>(cfg => ({ canalFornecedor: (cfg.canalFornecedor ?? []).map(r => r.id === acao.id ? { ...r, enviadoEm: em } : r) })).catch(() => null)
  return { ok: true }
}

// GET ?o=fornecedor_conversa&fornecedor=: últimas mensagens do WhatsApp do fornecedor e as ordens dos diretores
export async function lerConversaFornecedor(id: string): Promise<{ status: number; corpo: Record<string, unknown> }> {
  if (!id) return { status: 400, corpo: { erro: "Falta fornecedor (id do cadastro de fornecedores)." } }
  const f = await lerFornecedor(id)
  if (!f) return { status: 404, corpo: { erro: `Fornecedor ${id} não está no cadastro de fornecedores.` } }
  const d = await resolverDestino(f)
  if (!d.ok) return { status: d.status, corpo: { erro: d.erro } }
  const { data } = await supabase.from("whatsapp_mensagens").select("from_me, corpo, tipo, ts").eq("jid", d.jid).order("ts", { ascending: false }).limit(20)
  const { canalFornecedor } = await lerCampos<{ canalFornecedor?: RegistroCanal[] }>(["canalFornecedor"])
  const quando = (ts: unknown) => { const n = Number(ts); return Number.isFinite(n) && n > 0 ? new Date(n < 1e12 ? n * 1000 : n).toISOString() : String(ts ?? "") }
  const mensagens = ((data ?? []) as { from_me: boolean; corpo: string | null; tipo: string; ts: unknown }[]).reverse()
    .map(m => ({ de: m.from_me ? "Enyla" : f.nome, em: quando(m.ts), tipo: m.tipo, texto: m.corpo }))
  const ordens = (canalFornecedor ?? []).filter(r => r.fornecedorId === f.id).slice(-20).map(r => ({ id: r.id, pedido: r.pedido, diretor: r.diretor, criadoEm: r.criadoEm, enviadoEm: r.enviadoEm ?? null }))
  return { status: 200, corpo: { fornecedor: { id: f.id, nome: f.nome }, mensagens, ordens } }
}
