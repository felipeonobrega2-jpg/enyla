// Ninguém sem resposta: quem escreveu por último e está esperando a gente. Puro (o servidor busca as conversas).
// Não conta "ok", "obrigado", 👍 (fim de conversa), quem disse que volta depois (a IA marca "com ele"/"sem pressa") nem fornecedor.

export type ConvEspera = {
  jid: string; nome: string | null; etiquetas: string[] | null; status_lead: string | null; ultima_msg: string | null
  ultima_recebida_at: string | null; ultima_enviada_at: string | null; proxima_acao?: string | null
  fechada_em?: string | null   // você fechou ("não precisa de resposta"); reabre sozinha quando o cliente escreve de novo
}
export type Esperando = { jid: string; nome: string; minutos: number; mensagem: string; peso: number; rotulo: string }

const PALAVRA_FECHO = "ok(ay)?|okk+|blz|beleza|show|top|obrigad[oa]|agrade[çc]o|agradecid[oa]|obg|valeu|vlw|tmj|certo|perfeito|combinado|fechado|t[áa] bom|tudo bem|👍|🙏|👌|❤️|😊|kk+|rs+|ah t[áa]|entendi|ótimo|otimo|maravilha|gostei|legal|bacana|tranquilo|de nada"
const FECHO = new RegExp(`^\\s*((${PALAVRA_FECHO})[\\s!.,]*)+$`, "i")
// Resposta automática da empresa do próprio lead, mensagem técnica e "eu te mando": não é a nossa vez
const AUTOMATICA = /seja (muito )?bem[- ]?vind|(é|e) um prazer ter voc|agradecemos (o seu |seu )?contato|em breve (retornaremos|responderemos|daremos)|fora do (nosso )?hor[aá]rio|mensagem autom[aá]tica|^\[(protocolMessage|reactionMessage|ephemeralMessage|senderKeyDistributionMessage)\]$/i
const ELE_VAI = /\b(vou (providenciar|mandar|enviar|ver|medir|falar|conversar|pensar|passar|te (mandar|enviar|passar|falar))|(te|lhe) (mando|envio|passo|falo|retorno|respondo)|mando( (sim|já|ja|amanh[ãa]|depois|aí|ai))?|j[áa] (te )?mando|vou dar uma olhada|obrigad[oa] pela (aten[çc][ãa]o|ajuda|paci[êe]ncia)|assim que (eu )?(tiver|puder|chegar)|depois (eu )?(te )?(mando|falo|passo))\b/i
const momento = (pa?: string | null) => { try { return (JSON.parse(pa ?? "") as { r?: { momento?: string } }).r?.momento ?? null } catch { return null } }

export function rankQualificacao(et: string[] | null | undefined, status?: string | null): number {
  const e = et ?? []
  if (e.includes("ICP")) return 5
  if (e.includes("Oportunidade")) return 4
  const rebaixado = e.includes("Lead pequeno") || e.includes("Digital")   // classificação atual vale mais que o status antigo
  if ((status === "mql" && !rebaixado) || e.includes("MQL") || e.includes("Lead médio")) return 3
  if (e.includes("Digital")) return 2
  if (e.includes("Lead pequeno")) return 1
  return 0
}

export function quemEspera(convs: ConvEspera[], agora = Date.now(), minimoMin = 20, maximoDias = 7): Esperando[] {
  const out: Esperando[] = []
  for (const c of convs) {
    if (c.jid.includes("@g.us") || !c.ultima_recebida_at) continue
    if (c.ultima_enviada_at && c.ultima_enviada_at >= c.ultima_recebida_at) continue
    if (c.fechada_em && c.fechada_em >= c.ultima_recebida_at) continue
    const min = Math.floor((agora - new Date(c.ultima_recebida_at).getTime()) / 60_000)
    if (min < minimoMin || min > maximoDias * 1440) continue
    const et = c.etiquetas ?? []
    if (et.some(e => /fornecedor|descartado|sem resposta/i.test(e))) continue
    const msg = (c.ultima_msg ?? "").trim()
    if (FECHO.test(msg) || AUTOMATICA.test(msg) || ELE_VAI.test(msg)) continue
    const mo = momento(c.proxima_acao)
    if (mo === "com_ele" || mo === "sem_pressa" || mo === "nao_atende") continue
    const bom = rankQualificacao(et, c.status_lead) >= 3
    const digital = et.includes("Digital")
    // Ordem pela qualificação (ICP > Oportunidade > MQL/médio > digital > o resto); no mesmo nível, quem espera há mais tempo
    const peso = rankQualificacao(et, c.status_lead)
    out.push({ jid: c.jid, nome: c.nome ?? c.jid.split("@")[0], minutos: min, mensagem: msg.slice(0, 80), peso, rotulo: bom ? "bom negócio" : digital ? "digital" : "lead" })
  }
  return out.sort((a, b) => b.peso - a.peso || b.minutos - a.minutos)
}

export const tempoEspera = (min: number) => min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)} h` : `${Math.floor(min / 1440)} ${Math.floor(min / 1440) === 1 ? "dia" : "dias"}`

// A IA fecha sozinha só o óbvio: o cliente encerrou ("ok", "obrigado", 👍) depois de uma resposta nossa que não era
// pergunta, há 30+ min; ou não é lead (Descartado) e já respondemos. Fornecedor nunca. Quem disse que volta NÃO fecha
// (o follow-up depende disso), nem quem tem orçamento aberto (kanban_card_id). Reabre sozinha se o cliente escrever.
export type ConvFechar = ConvEspera & { kanban_card_id?: string | null; penultimaNossa?: string | null }
export function podeFecharSozinha(c: ConvFechar, agora = Date.now()): string | null {
  if (c.jid.includes("@g.us") || c.kanban_card_id) return null
  if (c.fechada_em && c.ultima_recebida_at && c.fechada_em >= c.ultima_recebida_at) return null
  const et = c.etiquetas ?? []
  const respondemos = !!c.ultima_enviada_at
  if (et.includes("Fornecedora")) return null   // fornecedor é conversa de trabalho: fica como você deixou
  if (respondemos && et.includes("Descartado") && c.ultima_enviada_at! >= (c.ultima_recebida_at ?? "")) return "não é lead e já foi respondido"
  if (!c.ultima_recebida_at || (c.ultima_enviada_at && c.ultima_enviada_at > c.ultima_recebida_at)) return null
  if (agora - new Date(c.ultima_recebida_at).getTime() < 30 * 60_000) return null
  if (!FECHO.test((c.ultima_msg ?? "").trim())) return null
  if (!respondemos || /\?\s*$/.test((c.penultimaNossa ?? "").trim())) return null
  return "o cliente encerrou a conversa"
}
