// Porta externa, ação mensagem_fornecedor (só a chave do COO): texto exato a um fornecedor em operação.
// Destino: SÓ o telefone do cadastro AppConfig.fornecedores (ativo). A ordem informa o fornecedor (id) e o texto; telefone, jid
// ou número na ordem são recusados. Não serve a prospectos_parceiros (isso é do Prospector) nem a cliente: telefone que bate
// com cliente (cadastro Cliente, pedido Digital, conversa já cliente ou leitura que falhou) é recusado e nada sai.
// Travas: janela das 8h às 20h (Brasília) e duplicado (mesmo fornecedor e texto em 10 min). Não mexe em cobrança, não apaga.
// Histórico: AppConfig.mensagensFornecedor (chave JSON aditiva, só acrescenta): quem, texto, hora e se saiu.
import { randomUUID } from "crypto"
import type { Fornecedor } from "@/app/config"
import { mudarConfig } from "./configAtomica"
import { supabase } from "./supabase"
import { evo } from "./evolution"
import { nivelDoDestinatario } from "./nivelCliente"
import { celularWhatsapp, chaveTelefone, relogioSp, HORA_INICIO, HORA_FIM } from "./prospectorEnvio"
import { brasilia } from "./lancarDespesaExterno"

export const JANELA_DUPLICADO_MS = 10 * 60_000
export const MAX_TEXTO = 2000
export type RegistroFornecedor = { id: string; por: string; fornecedorId: string; fornecedor: string; texto: string; em: string; emIso: string; status: "reservado" | "enviado" | "falhou" }
export type Resultado = { ok: true; resultado: string; registro: RegistroFornecedor } | { ok: false; status: 400 | 403 | 404 | 409 | 502 | 503; erro: string }

const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase()
export const dentroDaJanela = (agora: Date) => { const { hora } = relogioSp(agora); return hora >= HORA_INICIO && hora < HORA_FIM }

/** Telefone é de cliente? Na dúvida ou erro de leitura, sim (fail closed). */
export async function telefoneDeCliente(numero: string, pedidosDigitais: { jid?: string }[]): Promise<boolean> {
  const chave = chaveTelefone(numero)
  try {
    const { data, error } = await supabase.from("Cliente").select("telefone")
    if (error) return true
    if ((data ?? []).some((c: { telefone?: string | null }) => c.telefone && chaveTelefone(c.telefone) === chave)) return true
    if (pedidosDigitais.some(p => p.jid && chaveTelefone(p.jid.split("@")[0]) === chave)) return true
    const n = await nivelDoDestinatario(`${numero}@s.whatsapp.net`)
    return n.nivel !== "lead" || n.jaCliente
  } catch { return true }
}

export async function mensagemFornecedorExterno(diretor: string, b: Record<string, unknown>, agora: Date = new Date()): Promise<Resultado> {
  if (diretor !== "coo") return { ok: false, status: 403, erro: "mensagem_fornecedor é só para a chave do COO." }
  for (const k of ["telefone", "jid", "numero", "number", "cliente"]) if (b[k] != null) return { ok: false, status: 400, erro: `${k}: não aceito. A ordem informa só o fornecedor (id) e o texto; o número vem do cadastro de fornecedores.` }
  const id = typeof b.fornecedor === "string" ? b.fornecedor.trim() : ""
  if (!id) return { ok: false, status: 400, erro: "fornecedor: obrigatório (id do cadastro de fornecedores)." }
  const texto = typeof b.texto === "string" ? b.texto.trim() : ""
  if (!texto) return { ok: false, status: 400, erro: "texto: obrigatório." }
  if (texto.length > MAX_TEXTO) return { ok: false, status: 400, erro: `texto: no máximo ${MAX_TEXTO} caracteres.` }
  if (!dentroDaJanela(agora)) return { ok: false, status: 409, erro: `Fora da janela das ${HORA_INICIO}h às ${HORA_FIM}h (Brasília). Nada foi enviado.` }

  let reg: RegistroFornecedor | null = null
  let erro: Resultado | null = null
  let numero: string | null = null
  let pedidos: { jid?: string }[] = []
  // 1ª passada (só lê): fornecedor e número válidos
  await mudarConfig<{ fornecedores?: Fornecedor[]; pedidosDigitais?: { jid?: string }[] }>(cfg => {
    const f = (cfg.fornecedores ?? []).find(x => x.id === id)
    if (!f) erro = { ok: false, status: 404, erro: `Fornecedor ${id} não encontrado no cadastro.` }
    else if (!f.ativo) erro = { ok: false, status: 409, erro: `Fornecedor ${id} está inativo. Nada foi enviado.` }
    else if (!(numero = celularWhatsapp(f.telefone))) erro = { ok: false, status: 400, erro: `Fornecedor ${id} sem celular de WhatsApp válido no cadastro. Nada foi enviado.` }
    pedidos = cfg.pedidosDigitais ?? []
    return null
  })
  if (erro) return erro
  if (await telefoneDeCliente(numero!, pedidos)) return { ok: false, status: 403, erro: "Esse telefone é de cliente (ou não deu para confirmar que não é). Esta porta nunca manda a cliente. Nada foi enviado." }

  // Reserva atômica (trava de duplicado) e registro antes de enviar
  await mudarConfig<{ fornecedores?: Fornecedor[]; mensagensFornecedor?: RegistroFornecedor[] }>(cfg => {
    reg = null; erro = null
    const f = (cfg.fornecedores ?? []).find(x => x.id === id)
    if (!f || !f.ativo || celularWhatsapp(f.telefone) !== numero) { erro = { ok: false, status: 409, erro: "O cadastro do fornecedor mudou durante o envio. Nada foi enviado." }; return null }
    const hist = cfg.mensagensFornecedor ?? []
    if (hist.some(r => r.fornecedorId === id && r.status !== "falhou" && norm(r.texto) === norm(texto) && agora.getTime() - new Date(r.emIso).getTime() < JANELA_DUPLICADO_MS))
      { erro = { ok: false, status: 409, erro: "Mesmo texto já enviado a esse fornecedor nos últimos 10 minutos. Nada foi enviado." }; return null }
    reg = { id: randomUUID(), por: diretor, fornecedorId: id, fornecedor: f.nome, texto, em: brasilia(agora), emIso: agora.toISOString(), status: "reservado" }
    return { mensagensFornecedor: [...hist, reg] }
  })
  if (erro) return erro
  if (!reg) return { ok: false, status: 503, erro: "Não consegui registrar o envio. Nada foi enviado." }
  const r0 = reg as RegistroFornecedor

  const env = await evo<{ key?: { id?: string } }>("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: numero, text: texto }) })
  const saiu = env.ok && !!env.corpo?.key?.id
  const status = saiu ? "enviado" as const : "falhou" as const
  await mudarConfig<{ mensagensFornecedor?: RegistroFornecedor[] }>(cfg => ({ mensagensFornecedor: (cfg.mensagensFornecedor ?? []).map(r => r.id === r0.id ? { ...r, status } : r) })).catch(() => null)
  const registro = { ...r0, status }
  if (!saiu) return { ok: false, status: 502, erro: `O WhatsApp não enviou (${env.status}). Fica registrado como falha; pode tentar de novo.` }
  return { ok: true, resultado: `Mensagem enviada a ${r0.fornecedor} (${id}) às ${r0.em}.`, registro }
}
