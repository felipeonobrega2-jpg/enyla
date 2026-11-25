// Classificador único do destinatário de uma mensagem da diretoria: A, B, C (cliente pela curva), "lead" ou "indefinido".
// Regra do Felipe (25/11/2026): "cliente" é só quem já comprou (nível A, B ou C). Só mensagem a cliente precisa do Aprovo;
// mensagem a lead não precisa. Na dúvida (cadastro sem compra, compra antiga ou só digital, ligação fraca, erro de leitura)
// o nível é "indefinido" e conta como cliente: fila do Aprovo. Só LÊ; sem telefone, e-mail ou endereço na saída.
import { supabase } from "./supabase"
import { lerCampos } from "./configAtomica"
import { clienteDaConversa, ligacaoForte, chaveTelefone, type Vinculos } from "./vinculoWhatsapp"
import { nomeChave, montarPedidos } from "./negocio"
import { ritmoDosClientes } from "./ritmo"
import { COL_FECHADO, COL_ENTREGUE, type KanbanCard, type LancamentoFinanceiro } from "../types"

export type Nivel = "A" | "B" | "C" | "lead" | "indefinido"
export type NivelDoDestinatario = { nivel: Nivel; jaCliente: boolean; motivo: string }

export const DIGITAL_COMPROU = new Set(["sinal_pago", "arte", "producao", "enviado"])

export type CardLido = { numero: string | null; nomeCliente: string | null; coluna: number; createdAt: string | null }
export type PedidoDig = { id: string; jid: string; em: string; status: string; teste?: boolean }
export type ConvNivel = { jid: string; nome: string | null; telefone?: string | null }
export type CadastroLido = { nome: string | null; telefone: string | null }

const ms = (s?: string | null) => (s ? new Date(s).getTime() : 0) || 0

// A lógica do "já cliente" que o ?o=perto sempre usou (movida para cá sem mudar o comportamento):
// card fechado ligado à conversa com ligacaoForte, ou pedido digital comprado e que não é teste
export function jaClienteDaConversa(c: ConvNivel, a: { cards: CardLido[]; pedidosDigitais: PedidoDig[]; vinculos?: Vinculos }): { jaCliente: boolean; ultimoPedido: string | null } {
  const nomes = [...new Set(a.cards.map(k => k.nomeCliente).filter(Boolean))] as string[]
  const compras = a.cards.filter(k => k.coluna >= COL_FECHADO && k.coluna <= COL_ENTREGUE)
  const achados: { numero: string | null; em: number }[] = []
  const cli = clienteDaConversa(c, nomes, a.vinculos)
  if (cli && ligacaoForte(c, cli)) for (const k of compras) if (nomeChave(k.nomeCliente ?? "") === nomeChave(cli.nome)) achados.push({ numero: k.numero, em: ms(k.createdAt) })
  for (const p of a.pedidosDigitais) if (p.jid === c.jid && DIGITAL_COMPROU.has(p.status) && !p.teste) achados.push({ numero: p.id, em: ms(p.em) })
  const ultimo = achados.sort((x, y) => y.em - x.em)[0]
  return { jaCliente: achados.length > 0, ultimoPedido: ultimo?.numero ?? null }
}

export type FontesNivel = {
  cards: CardLido[]; pedidosDigitais: PedidoDig[]; vinculos?: Vinculos
  curvas: Map<string, "A" | "B" | "C" | null>   // por nomeChave do cliente
  cadastro: CadastroLido[]
  leituraOk: boolean                             // false: alguma fonte falhou
}

const digitos = (s?: string | null) => (s ?? "").replace(/\D/g, "")
const chaveTel = (s?: string | null) => { const d = digitos(s); return d.length >= 10 ? chaveTelefone(d.length <= 11 ? "55" + d : d) : null }

export function classificarNivel(c: ConvNivel, f: FontesNivel): NivelDoDestinatario {
  if (!f.leituraOk) return { nivel: "indefinido", jaCliente: false, motivo: "não consegui ler todas as fontes: tratado como cliente por segurança" }
  const nomes = [...new Set(f.cards.map(k => k.nomeCliente).filter(Boolean))] as string[]
  const cli = clienteDaConversa(c, nomes, f.vinculos)
  const forte = !!cli && ligacaoForte(c, cli)
  const { jaCliente } = jaClienteDaConversa(c, f)
  const curva = forte ? f.curvas.get(nomeChave(cli!.nome)) ?? null : null
  if (curva) return { nivel: curva, jaCliente: true, motivo: `cliente ${curva}` }
  if (jaCliente) return { nivel: "indefinido", jaCliente: true, motivo: "já comprou, mas sem curva (compra antiga ou só digital)" }
  const kTel = chaveTel(c.telefone) ?? chaveTel(c.jid.split("@")[0])
  const noCadastro = f.cadastro.some(x => (kTel && chaveTel(x.telefone) === kTel) || (nomeChave(x.nome) && nomeChave(x.nome) === nomeChave(c.nome)))
  if (noCadastro) return { nivel: "indefinido", jaCliente: false, motivo: "tem cadastro de cliente, sem compra confirmada" }
  if (cli && !forte && f.cards.some(k => k.coluna >= COL_FECHADO && k.coluna <= COL_ENTREGUE && nomeChave(k.nomeCliente ?? "") === nomeChave(cli.nome)))
    return { nivel: "indefinido", jaCliente: false, motivo: "ligação fraca (só pelo nome) com cliente que comprou" }
  return { nivel: "lead", jaCliente: false, motivo: "sem cadastro e sem compra" }
}

async function todas<T>(tabela: string, sel: string): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabase.from(tabela).select(sel).range(i, i + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as unknown as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

// Lê tudo de uma vez (o ?o=perto classifica 100 itens com uma só leitura). Qualquer erro vira leituraOk:false.
export async function carregarFontesNivel(): Promise<FontesNivel> {
  try {
    const [{ unpackTerceirizado }, kanbanBruto, lancamentos, cadastro, cfg] = await Promise.all([
      import("./kanbanUnpack"),
      todas<KanbanCard>("KanbanCard", "*"),
      todas<LancamentoFinanceiro>("LancamentoFinanceiro", "*"),
      todas<CadastroLido>("Cliente", "nome, telefone"),
      lerCampos<{ vinculosWhatsapp?: Vinculos; pedidosDigitais?: PedidoDig[] }>(["vinculosWhatsapp", "pedidosDigitais"]),
    ])
    const kanban = kanbanBruto.map(unpackTerceirizado)
    const curvas = new Map(ritmoDosClientes(montarPedidos(kanban, lancamentos), kanban).map(r => [r.chave, r.curva] as const))
    return { cards: kanban as unknown as CardLido[], pedidosDigitais: cfg.pedidosDigitais ?? [], vinculos: cfg.vinculosWhatsapp, curvas, cadastro, leituraOk: true }
  } catch {
    return { cards: [], pedidosDigitais: [], curvas: new Map(), cadastro: [], leituraOk: false }
  }
}

export async function nivelDoDestinatario(jid: string, fontes?: FontesNivel): Promise<NivelDoDestinatario> {
  try {
    const f = fontes ?? await carregarFontesNivel()
    if (!f.leituraOk) return classificarNivel({ jid, nome: null }, f)
    const { data, error } = await supabase.from("whatsapp_conversas").select("jid, nome, telefone").eq("jid", jid).maybeSingle()
    if (error) throw new Error(error.message)
    return classificarNivel({ jid, nome: (data?.nome as string | null) ?? null, telefone: (data?.telefone as string | null) ?? null }, f)
  } catch {
    return { nivel: "indefinido", jaCliente: false, motivo: "erro de leitura: tratado como cliente por segurança" }
  }
}
