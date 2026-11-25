// Leitura "Perto de você" na porta externa (?o=perto), só CCO e CMO. SÓ LÊ: não grava, não envia mensagem, não apaga.
// A lista é a da tela (lib/perto.ts): os marcados com estrela pelo Felipe (estrela: true) e as sugestões da semana
// (estrela: false). Sem telefone, e-mail ou endereço: o contato é só o jid. Mensagem a quem está aqui precisa do Aprovo.
import { supabase } from "./supabase"
import { lerCampos } from "./configAtomica"
import { podeAcionarComercial } from "./ordemComercial"
import { PREFIXO_PERTO, PREFIXO_FORA, lerMarca, sugestoesPerto, rotuloPerfil, type ConversaPerto, type MarcaPerto } from "./perto"
import type { Vinculos } from "./vinculoWhatsapp"
import { jaClienteDaConversa, classificarNivel, carregarFontesNivel, type Nivel, type FontesNivel, type CardLido, type PedidoDig } from "./nivelCliente"
import type { IdDiretor } from "./diretoria"

export const LIMITE_PERTO = 100
export const AJUDA_PERTO = "SÓ CCO e CMO (as outras recebem 403). A lista 'Perto de você' da tela: estrela:true são os que o Felipe marcou (vêm primeiro), estrela:false são as sugestões da semana; nota (a nota que ele pôs, ou null), perfil, esperando ('lead' = o lead espera a nossa resposta; 'nos' = nós esperamos o lead) com ultimaDoLead e ultimaNossa, jaCliente (já comprou: pedido fechado no sistema, offset ou digital) com ultimoPedido, e nivel: 'A', 'B' ou 'C' (cliente pela curva de vendas de 12 meses), 'lead' (sem cadastro e sem compra) ou 'indefinido' (cadastro sem compra, compra antiga ou só digital, ligação fraca ou erro de leitura: conta como cliente). Até 100 itens; total mostra quantos há. REGRA: ordenar_funcionario a nivel 'lead' sai direto pelo agente (se estiver no horário dele); nivel A, B, C ou indefinido espera o Aprovo do Felipe. Confira o nivel aqui antes de acionar Atendente, Follow-up ou Reativação. Só leitura; sem telefone, e-mail ou endereço"

const CAMPOS = "jid, nome, status_lead, etiquetas, ultima_msg, ultima_at, ultima_recebida_at, ultima_enviada_at, fechada_em, kanban_card_id"
export type ItemPerto = {
  jid: string; nome: string | null; estrela: boolean; nota: string | null; perfil: string
  esperando: { quem: "lead" | "nos" | null; ultimaDoLead: string | null; ultimaNossa: string | null }
  jaCliente: boolean; ultimoPedido: string | null; nivel: Nivel
}

const ms = (s?: string | null) => (s ? new Date(s).getTime() : 0) || 0

export function montarPerto(a: {
  marcas: MarcaPerto[]; fora: Set<string>; daLista: ConversaPerto[]; recentes: ConversaPerto[]
  cards: CardLido[]; pedidosDigitais: PedidoDig[]; vinculos?: Vinculos; agora?: number; fontes?: FontesNivel
}): { itens: ItemPerto[]; total: number } {
  const porJid = new Map(a.daLista.map(c => [c.jid, c]))

  const jaCliente = (c: ConversaPerto) => jaClienteDaConversa(c, { cards: a.cards, pedidosDigitais: a.pedidosDigitais, vinculos: a.vinculos })
  const monta = (jid: string, c: ConversaPerto | null, estrela: boolean, nota: string | null): ItemPerto => {
    const conv: ConversaPerto = c ?? { jid, nome: null }
    const rec = ms(conv.ultima_recebida_at), env = ms(conv.ultima_enviada_at)
    return {
      jid, nome: conv.nome ?? null, estrela, nota: nota || null, perfil: rotuloPerfil(conv),
      esperando: { quem: !rec && !env ? null : rec > env ? "lead" : "nos", ultimaDoLead: conv.ultima_recebida_at ?? null, ultimaNossa: conv.ultima_enviada_at ?? null },
      ...jaCliente(conv),
      // Sem as fontes do nível (curvas, cadastro) não dá para afirmar "lead": fica "indefinido" (conta como cliente)
      nivel: a.fontes ? classificarNivel(conv, a.fontes).nivel : "indefinido",
    }
  }

  const naLista = new Set(a.marcas.map(m => m.jid))
  const marcados = a.marcas
    .map(m => ({ m, c: porJid.get(m.jid) ?? null }))
    .sort((x, y) => (y.c?.ultima_at ?? y.m.em).localeCompare(x.c?.ultima_at ?? x.m.em))
    .map(({ m, c }) => monta(m.jid, c, true, m.nota))
  const sugeridos = sugestoesPerto(a.recentes, naLista, a.fora, a.agora).map(c => monta(c.jid, c, false, null))
  const todos = [...marcados, ...sugeridos]
  return { itens: todos.slice(0, LIMITE_PERTO), total: todos.length }
}

export async function lerPertoExterno(diretor: IdDiretor): Promise<{ status: number; corpo: Record<string, unknown> }> {
  if (!podeAcionarComercial(diretor)) return { status: 403, corpo: { erro: "?o=perto é só para as chaves do CCO e da CMO." } }
  const { data: linhas } = await supabase.from("agente_tratadas").select("id, em").or(`id.like.${PREFIXO_PERTO}%,id.like.${PREFIXO_FORA}%`).limit(2000)
  const marcas = (linhas ?? []).map(r => lerMarca(r.id as string, r.em as string)).filter((x): x is MarcaPerto => !!x)
  const fora = new Set((linhas ?? []).filter(r => (r.id as string).startsWith(PREFIXO_FORA)).map(r => (r.id as string).slice(PREFIXO_FORA.length)))
  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const [{ data: daLista }, { data: recentes }, { data: cards }, cfg] = await Promise.all([
    marcas.length ? supabase.from("whatsapp_conversas").select(CAMPOS).in("jid", marcas.map(m => m.jid)) : Promise.resolve({ data: [] as ConversaPerto[] }),
    supabase.from("whatsapp_conversas").select(CAMPOS).gte("ultima_at", desde).or("status_lead.is.null,status_lead.not.in.(pedido,perdido,descartado)").order("ultima_at", { ascending: false }).limit(1500),
    supabase.from("KanbanCard").select("numero, nomeCliente, coluna, createdAt"),
    lerCampos<{ vinculosWhatsapp?: Vinculos; pedidosDigitais?: PedidoDig[] }>(["vinculosWhatsapp", "pedidosDigitais"]),
  ])
  const fontes = await carregarFontesNivel()
  const r = montarPerto({
    marcas, fora, daLista: (daLista ?? []) as ConversaPerto[], recentes: (recentes ?? []) as ConversaPerto[],
    cards: (cards ?? []) as unknown as CardLido[], pedidosDigitais: cfg.pedidosDigitais ?? [], vinculos: cfg.vinculosWhatsapp, fontes,
  })
  return { status: 200, corpo: { total: r.total, limite: LIMITE_PERTO, itens: r.itens } }
}
