// Reativação: bons negócios (MQL, ICP, lead médio, oportunidade) cuja conversa parou. A IA escreve uma retomada
// curta como você; sai com um clique seu ou, ligado, sozinha — poucas por dia, espaçadas, em horário comercial.
// Quando o contato responde, ele volta para MQL e você recebe o aviso no WhatsApp: daí em diante é você.
// Aqui só as regras puras; o servidor (reativacaoServidor) busca, prepara e envia.

export const ETIQUETA_REATIVACAO = "Reativação"
export const DIAS_PARADO = 10              // sem mensagem de nenhum dos lados há 10 dias
export const DIAS_MAXIMO = 150             // conversa de até ~5 meses (depois disso esfriou de vez)
export const DIAS_ENTRE_TENTATIVAS = 45    // o mesmo contato não recebe outra retomada antes disso
export const POR_DIA_PADRAO = 4
export const MINUTOS_ENTRE_ENVIOS = [50, 110] as const   // sozinha: uma de cada vez, com intervalo variando

export type ConvReativacao = {
  jid: string
  status_lead: string | null
  etiquetas: string[] | null
  ultima_recebida_at: string | null
  ultima_enviada_at: string | null
}

export const DIAS_PARADO_CLIENTE = 30      // cliente que já comprou: retoma (recompra) depois de 30 dias sem conversa
export const QTD_MINIMA_ORCAMENTO = 1000   // orçamento perdido só entra se era de 1.000+ (menos que isso é lead pequeno)

// O que o Kanban diz desse contato (cliente ligado com segurança à conversa)
export type HistoricoCliente = {
  comprou: boolean           // tem pedido fechado/entregue
  emAndamento: boolean       // pedido em produção agora (fechado → expedição)
  maiorOrcamento: number     // maior quantidade orçada
}

// Ordem da fila: quem está mais perto do dinheiro primeiro
export const MOTIVOS = ["ICP", "Cliente que já comprou", "Orçamento perdido 5 mil+", "Oportunidade", "Orçamento perdido", "Lead médio", "MQL"] as const
export type MotivoReativacao = typeof MOTIVOS[number]

const FORA = ["Descartado", "Lead pequeno", "Fornecedora"]

// Por que vale retomar (e a prioridade); null se não entra na fila
export function motivoReativacao(c: ConvReativacao, agora = Date.now(), cli?: HistoricoCliente | null): { motivo: MotivoReativacao; prioridade: number; paradoDias: number } | null {
  if (c.jid.endsWith("@g.us")) return null
  const et = c.etiquetas ?? []
  if (et.some(e => FORA.includes(e)) || c.status_lead === "descartado" || c.status_lead === "pedido" || cli?.emAndamento) return null
  const ultima = [c.ultima_recebida_at, c.ultima_enviada_at].filter(Boolean).sort().pop()
  if (!ultima) return null
  const paradoDias = Math.floor((agora - new Date(ultima).getTime()) / 86_400_000)
  if (paradoDias > DIAS_MAXIMO) return null
  const motivo: MotivoReativacao | null =
    et.includes("ICP") ? "ICP"
    : cli?.comprou ? (paradoDias >= DIAS_PARADO_CLIENTE ? "Cliente que já comprou" : null)
    : cli && cli.maiorOrcamento >= 5000 ? "Orçamento perdido 5 mil+"
    : et.includes("Oportunidade") ? "Oportunidade"
    : cli && cli.maiorOrcamento >= QTD_MINIMA_ORCAMENTO ? "Orçamento perdido"
    : et.includes("Lead médio") ? "Lead médio"
    : c.status_lead === "mql" ? "MQL"
    : null
  if (!motivo || paradoDias < DIAS_PARADO) return null
  return { motivo, prioridade: MOTIVOS.indexOf(motivo), paradoDias }
}

// O que a IA precisa saber para escrever a retomada certa
export function instrucaoDoMotivo(m: string) {
  if (m === "Cliente que já comprou") return "É cliente que já comprou com o Felipe (veja os pedidos dele). Retome como quem cuida do cliente: pergunte como foram as vendas e se ele vai precisar repor ou fazer um lote novo."
  if (m.startsWith("Orçamento perdido")) return "Ele recebeu orçamento e não fechou. Retome perguntando, sem pressão, se o projeto ainda está de pé ou se quer que você atualize o orçamento; se ele disse por que não fechou, leve isso em conta."
  return "É lead bom (volume ou outros produtos do ramo) e a conversa parou. Retome o que ele queria."
}

// Já tentou retomar esse contato há pouco (ou você pulou)?
export const tentouHaPouco = (em: string | undefined, agora = Date.now()) =>
  !!em && agora - new Date(em).getTime() < DIAS_ENTRE_TENTATIVAS * 86_400_000

// Sozinha só de segunda a sexta, 9h–12h e 14h–18h de São Paulo (como quem manda mensagem no expediente)
export function horarioDeReativacao(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "numeric", hour12: false })
    .formatToParts(d).map(x => [x.type, x.value]))
  const h = Number(p.hour) % 24
  return !["Sat", "Sun"].includes(p.weekday) && ((h >= 9 && h < 12) || (h >= 14 && h < 18))
}

// Pode sair a retomada? Devolve o motivo quando não pode.
export function travaDaReativacao(r: { resposta: string; alerta: string; motivo_alerta?: string }, precosDoFiltro: string[], valores: (t: string) => string[]): string | null {
  if (!r.resposta.trim()) return `a IA achou que não vale retomar${r.motivo_alerta ? `: ${r.motivo_alerta}` : ""}`
  if (["desconto", "reclamacao"].includes(r.alerta)) return `precisa de você (${r.alerta})`
  if (r.resposta.length > 500) return "mensagem longa demais para uma retomada"
  const permitidos = new Set(precosDoFiltro)
  const fora = valores(r.resposta).filter(v => !permitidos.has(v))
  if (fora.length) return `citou valor que não está no filtro (R$ ${fora.join(", ")})`
  return null
}

// Aviso no seu WhatsApp quando o contato responde a retomada
export function textoAvisoReativacao(a: { nome: string | null; telefone: string | null; motivo: string; mensagem: string | null }) {
  return [
    `🔁 *Respondeu à retomada* · ${a.motivo}`,
    a.nome ? `*${a.nome}*` : null,
    a.mensagem ? `"${a.mensagem.replace(/\s+/g, " ").slice(0, 200)}"` : null,
    "É com você.",
    a.telefone ? `wa.me/${a.telefone}` : null,
  ].filter(Boolean).join("\n")
}
