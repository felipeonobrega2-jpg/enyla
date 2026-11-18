// Ninguém sem resposta: quem escreveu por último e está esperando a gente. Puro (o servidor busca as conversas).
// Não conta "ok", "obrigado", 👍 (fim de conversa), quem disse que volta depois (a IA marca "com ele"/"sem pressa") nem fornecedor.

export type ConvEspera = {
  jid: string; nome: string | null; etiquetas: string[] | null; status_lead: string | null; ultima_msg: string | null
  ultima_recebida_at: string | null; ultima_enviada_at: string | null; proxima_acao?: string | null
}
export type Esperando = { jid: string; nome: string; minutos: number; mensagem: string; peso: number; rotulo: string }

const PALAVRA_FECHO = "ok(ay)?|okk+|blz|beleza|show|top|obrigad[oa]|obg|valeu|vlw|tmj|certo|perfeito|combinado|fechado|t[áa] bom|tudo bem|👍|🙏|👌|❤️|😊|kk+|rs+|ah t[áa]|entendi|ótimo|otimo|maravilha|gostei|legal|bacana|tranquilo|de nada"
const FECHO = new RegExp(`^\\s*((${PALAVRA_FECHO})[\\s!.,]*)+$`, "i")
// Resposta automática da empresa do próprio lead, mensagem técnica e "eu te mando": não é a nossa vez
const AUTOMATICA = /seja (muito )?bem[- ]?vind|(é|e) um prazer ter voc|agradecemos (o seu |seu )?contato|em breve (retornaremos|responderemos|daremos)|fora do (nosso )?hor[aá]rio|mensagem autom[aá]tica|^\[(protocolMessage|reactionMessage|ephemeralMessage|senderKeyDistributionMessage)\]$/i
const ELE_VAI = /\b(vou (providenciar|mandar|enviar|ver|medir|falar|conversar|pensar|passar|te (mandar|enviar|passar|falar))|(te|lhe) (mando|envio|passo|falo|retorno|respondo)|mando( (sim|já|ja|amanh[ãa]|depois|aí|ai))?|j[áa] (te )?mando|vou dar uma olhada|obrigad[oa] pela (aten[çc][ãa]o|ajuda|paci[êe]ncia)|assim que (eu )?(tiver|puder|chegar)|depois (eu )?(te )?(mando|falo|passo))\b/i
const momento = (pa?: string | null) => { try { return (JSON.parse(pa ?? "") as { r?: { momento?: string } }).r?.momento ?? null } catch { return null } }

export function quemEspera(convs: ConvEspera[], agora = Date.now(), minimoMin = 20, maximoDias = 3): Esperando[] {
  const out: Esperando[] = []
  for (const c of convs) {
    if (c.jid.includes("@g.us") || !c.ultima_recebida_at) continue
    if (c.ultima_enviada_at && c.ultima_enviada_at >= c.ultima_recebida_at) continue
    const min = Math.floor((agora - new Date(c.ultima_recebida_at).getTime()) / 60_000)
    if (min < minimoMin || min > maximoDias * 1440) continue
    const et = c.etiquetas ?? []
    if (et.some(e => /fornecedor|descartado|sem resposta/i.test(e))) continue
    const msg = (c.ultima_msg ?? "").trim()
    if (FECHO.test(msg) || AUTOMATICA.test(msg) || ELE_VAI.test(msg)) continue
    const mo = momento(c.proxima_acao)
    if (mo === "com_ele" || mo === "sem_pressa" || mo === "nao_atende") continue
    const bom = c.status_lead === "mql" || et.some(e => /^(ICP|Oportunidade|Lead médio|MQL)$/.test(e))
    const digital = et.includes("Digital")
    const pergunta = /\?|catálog|catalog|quanto|valor|preço|preco|orçament|orcament|aguardo/i.test(msg)
    const peso = (bom ? 3 : 0) + (digital ? 2 : 0) + (pergunta ? 1 : 0) + Math.min(3, Math.floor(min / 120))
    out.push({ jid: c.jid, nome: c.nome ?? c.jid.split("@")[0], minutos: min, mensagem: msg.slice(0, 80), peso, rotulo: bom ? "bom negócio" : digital ? "digital" : "lead" })
  }
  return out.sort((a, b) => b.peso - a.peso || b.minutos - a.minutos)
}

export const tempoEspera = (min: number) => min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)} h` : `${Math.floor(min / 1440)} ${Math.floor(min / 1440) === 1 ? "dia" : "dias"}`
