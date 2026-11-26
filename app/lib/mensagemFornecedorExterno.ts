// Porta externa, ação mensagem_fornecedor (só a chave do COO): texto exato a um fornecedor em operação.
// Destino só do cadastro AppConfig.fornecedores (ativo, celular válido); nunca prospectos_parceiros e nunca cliente.
// Janela 8h–20h (Brasília), trava de duplicado (mesmo texto, mesmo fornecedor, 10 min) e histórico que só acrescenta
// em AppConfig.mensagensFornecedor (chave JSON aditiva). Não mexe em cobrança e não apaga nada.
import type { Fornecedor } from "@/app/config"
import { lerCampos, mudarConfig } from "./configAtomica"
import { celularWhatsapp } from "./prospectorEnvio"
import { supabase } from "./supabase"
import { evo } from "./evolution"
import { gravarLote, type WaMessage } from "./whatsappDados"

export const JANELA_INICIO = 8
export const JANELA_FIM = 20
export const TRAVA_MIN = 10
export type RegistroFornecedor = { id: string; fornecedorId: string; por: string; texto: string; em: string; status: "reservado" | "enviado" | "falhou" }
export type Resultado = { ok: true; resultado: string; registro: RegistroFornecedor } | { ok: false; status: 400 | 403 | 404 | 409 | 502; erro: string }

const PROIBIDOS = ["telefone", "jid", "numero", "number", "cliente"]
export const horaBrasilia = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(d))
export const dentroDaJanela = (d: Date) => { const h = horaBrasilia(d); return h >= JANELA_INICIO && h < JANELA_FIM }
const chave = (t: string) => { const d = t.replace(/\D/g, ""); return (d.startsWith("55") && d.length >= 12 ? d.slice(2) : d).slice(-10) }   // DDD + 8 finais (ignora o 9)

// true = o número é (ou pode ser) de cliente; falha de leitura também recusa
async function ehDeCliente(numero: string): Promise<boolean> {
  try {
    const k = chave(numero)
    const { data: cad, error } = await supabase.from("Cliente").select("telefone")
    if (error) return true
    if ((cad ?? []).some(c => c.telefone && chave(String(c.telefone)) === k)) return true
    const { pedidosDigitais } = await lerCampos<{ pedidosDigitais?: { jid?: string; telefone?: string }[] }>(["pedidosDigitais"])
    return (pedidosDigitais ?? []).some(p => [p.jid?.split("@")[0], p.telefone].some(t => t && chave(t) === k))
  } catch { return true }
}

export async function mensagemFornecedorExterno(diretor: string, b: Record<string, unknown>, agora = new Date()): Promise<Resultado> {
  if (diretor !== "coo") return { ok: false, status: 403, erro: "mensagem_fornecedor é só para a chave do COO." }
  if (PROIBIDOS.some(k => k in b)) return { ok: false, status: 400, erro: "Informe só { fornecedor, texto }. O número vem do cadastro de fornecedores." }
  const fid = typeof b.fornecedor === "string" ? b.fornecedor.trim() : ""
  const texto = typeof b.texto === "string" ? b.texto.trim() : ""
  if (!fid) return { ok: false, status: 400, erro: "fornecedor: id do cadastro de fornecedores." }
  if (!texto) return { ok: false, status: 400, erro: "texto: obrigatório." }
  if (texto.length > 4000) return { ok: false, status: 400, erro: "texto: no máximo 4000 caracteres." }
  const { fornecedores } = await lerCampos<{ fornecedores?: Fornecedor[] }>(["fornecedores"])
  const f = (fornecedores ?? []).find(x => x.id === fid)
  if (!f || !f.ativo) return { ok: false, status: 404, erro: `Fornecedor ${fid} não encontrado ou inativo no cadastro.` }
  const numero = celularWhatsapp(f.telefone)
  if (!numero) return { ok: false, status: 400, erro: `${f.nome} não tem celular de WhatsApp válido no cadastro.` }
  if (await ehDeCliente(numero)) return { ok: false, status: 403, erro: "Esse número é de cliente. Nada foi enviado." }
  if (!dentroDaJanela(agora)) return { ok: false, status: 409, erro: `Fora da janela de envio (${JANELA_INICIO}h às ${JANELA_FIM}h, Brasília). Nada foi enviado.` }

  // Reserva atômica antes de enviar: fecha a porta para o duplicado
  const reg: RegistroFornecedor = { id: `${agora.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`, fornecedorId: fid, por: diretor, texto, em: agora.toISOString(), status: "reservado" }
  let duplicado = false
  await mudarConfig<{ mensagensFornecedor?: RegistroFornecedor[] }>(cfg => {
    const h = cfg.mensagensFornecedor ?? []
    duplicado = h.some(x => x.fornecedorId === fid && x.texto === texto && x.status !== "falhou" && agora.getTime() - new Date(x.em).getTime() < TRAVA_MIN * 60_000)
    return duplicado ? null : { mensagensFornecedor: [...h, reg] }
  })
  if (duplicado) return { ok: false, status: 409, erro: `Esse mesmo texto já foi enviado a ${f.nome} nos últimos ${TRAVA_MIN} minutos. Nada foi reenviado.` }

  const fechar = (status: "enviado" | "falhou") => mudarConfig<{ mensagensFornecedor?: RegistroFornecedor[] }>(cfg => ({ mensagensFornecedor: (cfg.mensagensFornecedor ?? []).map(x => x.id === reg.id ? { ...x, status } : x) }))
  const jid = `${numero}@s.whatsapp.net`
  const r = await evo<WaMessage>("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: numero, text: texto }) }).catch(() => null)
  if (!r?.ok || !r.corpo?.key?.id) { await fechar("falhou"); return { ok: false, status: 502, erro: "Não enviou. Confira a conexão do WhatsApp." } }
  await fechar("enviado")
  await gravarLote([{ ...r.corpo, key: { ...r.corpo.key, remoteJid: jid, fromMe: true } }]).catch(() => null)
  return { ok: true, resultado: `Mensagem enviada a ${f.nome}.`, registro: { ...reg, status: "enviado" } }
}
