// Fila de mensagens sugeridas (agente nível 1): o sistema prepara, você revisa e manda.
//   Follow-up: lead esfriando (você falou por último há 3+ dias, ainda não perdido). Vai melhor com vídeo de produção.
//   Produção: pedido entrou em produção / ficou pronto e o cliente ainda não foi avisado.
//   Cobrança: saldo com cobrança vencida.
// O texto aqui é só o ponto de partida; "Escrever com IA" reescreve no seu tom lendo o guia de atendimento e a conversa.

import { KanbanCard, LancamentoFinanceiro } from "../types"
import { Pedido, montarPedidos, recebiveis, nomeChave, pedidoEntregue } from "./negocio"
import { posicaoNoFunil, estaFechada, DIAS_PERDIDO, ConversaFunil } from "./funilWhatsapp"
import { clienteDaConversa, Vinculos } from "./vinculoWhatsapp"

export type TipoFila = "followup" | "producao" | "pronto" | "cobranca"
export type AvisoPedido = "producao" | "pronto"

export type ItemFila = {
  id: string
  tipo: TipoFila
  titulo: string            // quem
  motivo: string            // por que agora
  texto: string             // sugestão inicial
  jid?: string              // conversa (follow-up, ou a conversa ligada ao cliente)
  cliente?: string          // cliente do cadastro (envio pelo telefone do cadastro quando não há conversa)
  pedidoKey?: string        // avisos de produção: marca o pedido como avisado
  sugereMidia?: boolean     // vídeo/foto de produção combina com esta mensagem
  ordem: number
}

export type ConversaFila = ConversaFunil & { jid: string; nome: string; fechada_em?: string | null }

// Etapas do quadro: 2 a 7 = em produção, 8 = expedição (pronto)
const EM_PRODUCAO = (col: number) => col >= 2 && col <= 7
const PRONTO = (col: number) => col === 8
// Avisos só para pedidos fechados recentemente (não acorda pedido antigo esquecido no quadro)
const DIAS_AVISO = 45

export const JANELA = { inicio: 9, fim: 20 }
export const dentroDaJanela = (agora = new Date()) => {
  const h = Number(agora.toLocaleTimeString("pt-BR", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).slice(0, 2))
  return h >= JANELA.inicio && h < JANELA.fim
}

const primeiroNome = (nome: string) => {
  const n = nome.trim().split(/\s+/)[0] ?? ""
  return /^[\p{L}]{2,}$/u.test(n) ? n[0].toUpperCase() + n.slice(1).toLowerCase() : ""
}
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const dias = (iso: string | null | undefined, hoje: Date) => iso ? Math.floor((hoje.getTime() - new Date(iso).getTime()) / 86_400_000) : 0

export function montarFila(args: {
  conversas: ConversaFila[]
  kanban: KanbanCard[]
  lancamentos: LancamentoFinanceiro[]
  vinculos?: Vinculos
  avisos?: Record<string, AvisoPedido>
  dispensados?: Record<string, string>
  hoje?: Date
}): ItemFila[] {
  const { conversas, kanban, lancamentos, vinculos, avisos = {}, dispensados = {} } = args
  const hoje = args.hoje ?? new Date()
  const nomesClientes = [...new Set(kanban.filter(c => !c.isTerceirizado && c.nomeCliente).map(c => c.nomeCliente))]
  const cardsDe = (cliente: string) => kanban.filter(k => nomeChave(k.nomeCliente) === nomeChave(cliente))
  // Conversa mais recente de cada cliente, para mandar o aviso no mesmo chat
  const jidDoCliente = new Map<string, string>()
  for (const c of [...conversas].sort((a, b) => (a.ultima_recebida_at ?? "").localeCompare(b.ultima_recebida_at ?? ""))) {
    const cl = clienteDaConversa(c, nomesClientes, vinculos)
    if (cl) jidDoCliente.set(nomeChave(cl.nome), c.jid)
  }
  const itens: ItemFila[] = []

  // 1. Follow-up dos leads esfriando
  for (const c of conversas) {
    if (estaFechada(c)) continue
    const cl = clienteDaConversa(c, nomesClientes, vinculos)
    const pos = posicaoNoFunil(c, cl ? cardsDe(cl.nome) : [], hoje)
    if (!pos.esfriando || dias(c.ultima_recebida_at, hoje) >= DIAS_PERDIDO) continue
    const id = `fu-${c.jid}-${c.ultima_enviada_at}`
    if (dispensados[id]) continue
    const parado = dias(c.ultima_enviada_at, hoje)
    const nome = primeiroNome(cl?.nome ?? c.nome)
    const segunda = parado >= 7
    const texto = pos.etapa === "orcamento" || pos.etapa === "negociando"
      ? `Opa${nome ? `, ${nome}` : ""}! Tudo bem? Alguma posição sobre o orçamento ou avaliando ainda?`
      : segunda
        ? `Fala${nome ? `, ${nome}` : ""}, tudo bem? 👋 Passei aqui porque lembrei de você. A gente tinha falado sobre a produção das caixinhas, lembra? Ainda faz sentido pra você resolver isso agora ou o momento mudou?`
        : "Conseguiu ver o vídeo? Fiquei curioso para saber se o modelo que mostramos ali é próximo do que você procura. Mas se não for, conseguimos produzir embalagens 100% personalizadas pra você."
    itens.push({
      id, tipo: "followup", jid: c.jid, cliente: cl?.nome,
      titulo: cl?.nome ?? c.nome,
      motivo: `sem resposta há ${parado} dias${pos.etapa === "orcamento" ? " · orçamento enviado" : pos.etapa === "negociando" ? " · negociando" : ""}`,
      texto, sugereMidia: true, ordem: pos.etapa === "negociando" ? 1 : pos.etapa === "orcamento" ? 2 : 4,
    })
  }

  // 2. Avisos de produção (uma vez por etapa por pedido)
  const pedidos = montarPedidos(kanban, lancamentos)
  for (const p of pedidos) {
    if (!p.dataFechamento || pedidoEntregue(p) || dias(p.dataFechamento, hoje) > DIAS_AVISO) continue
    const aviso: AvisoPedido | null = PRONTO(p.coluna) ? "pronto" : EM_PRODUCAO(p.coluna) ? "producao" : null
    if (!aviso || avisos[p.key] === aviso || (aviso === "producao" && avisos[p.key] === "pronto")) continue
    const nome = primeiroNome(p.nomeCliente)
    const texto = aviso === "pronto"
      ? `Oi${nome ? `, ${nome}` : ""}! Tudo bem? Seu pedido ${p.numero} está pronto ✅ Vou te mandar um vídeo pra você ver.${p.aReceber > 0.5 ? ` Para liberar a entrega, fica o saldo de ${brl(p.aReceber)}.` : ""}`
      : `Oi${nome ? `, ${nome}` : ""}! Tudo bem? Seu pedido ${p.numero} já entrou em produção ✅ Assim que ficar pronto te aviso.`
    itens.push({
      id: `av-${p.key}-${aviso}`, tipo: aviso, pedidoKey: p.key, cliente: p.nomeCliente, jid: jidDoCliente.get(nomeChave(p.nomeCliente)),
      titulo: `${p.numero} · ${p.nomeCliente}`,
      motivo: aviso === "pronto" ? "pedido na expedição · avise o cliente" : `entrou em produção (${p.etapa})`,
      texto, sugereMidia: aviso === "pronto", ordem: aviso === "pronto" ? 0 : 3,
    })
  }

  // 3. Cobranças vencidas
  for (const p of recebiveis(pedidos, lancamentos).comSaldo.filter((p: Pedido) => p.vencido > 0.5)) {
    const id = `cob-${p.key}-${Math.round(p.vencido)}`
    if (dispensados[id]) continue
    const nome = primeiroNome(p.nomeCliente)
    itens.push({
      id, tipo: "cobranca", cliente: p.nomeCliente, jid: jidDoCliente.get(nomeChave(p.nomeCliente)),
      titulo: `${p.numero} · ${p.nomeCliente}`, motivo: `cobrança vencida · ${brl(p.vencido)}`,
      texto: `Bom dia${nome ? `, ${nome}` : ""}! Tudo bem? Passando para lembrar do pagamento do pedido ${p.numero}, no valor de ${brl(p.vencido)}. Se já pagou, me manda o comprovante que eu dou baixa aqui 🙏`,
      ordem: 1,
    })
  }

  return itens.sort((a, b) => a.ordem - b.ordem)
}

// Dispensados com mais de 60 dias saem da memória (o id já não volta: a conversa ou o saldo mudou)
export const podarDispensados = (d: Record<string, string> | undefined, hoje = new Date()) =>
  Object.fromEntries(Object.entries(d ?? {}).filter(([, em]) => hoje.getTime() - new Date(em).getTime() < 60 * 86_400_000))
