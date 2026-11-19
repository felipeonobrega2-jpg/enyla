// Cobrador de promessas: você disse ao lead que ia mandar o orçamento ("vou preparar o orçamento e te mando") e ele
// não saiu. O lead fica quieto ("ok, agradeço"), ninguém aparece como "esperando resposta" e ele fecha em outro lugar
// (Anderson, 19/11: 2.000 caixas, 26 h sem o orçamento prometido). Puro: acha a promessa e diz se foi cumprida.

export type MsgPromessa = { id: string; from_me: boolean; ts: string; corpo: string | null; tipo: string }
export type Promessa = { msgId: string; em: string; texto: string; horas: number }

const PROMETEU = /\b(vou|vamos|irei|j[áa] (vou|estou)|estou|t[ôo])\s+(te\s+)?(preparar|montar|fazer|calcular|levantar|cotar|fechar|finalizar|preparando|montando|fazendo|calculando|cotando|fechando|finalizando)\b[^.?!\n]{0,60}\b(or[çc]amento|proposta|cota[çc][ãa]o|valores?|pre[çc]os?)\b|\b(or[çc]amento|proposta|cota[çc][ãa]o|valores?)\b[^.?!\n]{0,50}\b(te\s+)?(mando|envio|passo|encaminho)\b|\bte\s+(mando|envio|passo|encaminho)\b[^.?!\n]{0,40}\b(or[çc]amento|proposta|cota[çc][ãa]o|valores?|pre[çc]os?)\b/i
// Cumpriu: mandou valor, link de proposta/pedido, ou arquivo (PDF/imagem do orçamento)
const CUMPRIU = /R\$\s*\d|\d+[.,]\d{2}\s*(cada|\/\s*un|por unidade|a unidade)|\/(aprovar|c|d|pedido|pix)\/|\bor[çc]amento\b[^\n]{0,40}\b(segue|anexo|em anexo|aqui)\b|\b(segue|anexo)\b[^\n]{0,40}\bor[çc]amento\b/i

// A bola está com o cliente ("quando conseguir medir, me manda…", "envia para mim"): não é promessa nossa
const DEPENDE_DELE = /\b(me (manda|envia|passa)|manda pra mim|envia (pra|para) mim|quando (voc[êe]|vc|conseguir|puder|tiver)|assim que (voc[êe]|vc)|se (voc[êe]|vc) (tiver|puder|conseguir|me))\b/i
export const ehPromessa = (t: string | null | undefined) => !!t && PROMETEU.test(t) && !DEPENDE_DELE.test(t)
export const cumpre = (m: MsgPromessa) => m.from_me && (CUMPRIU.test(m.corpo ?? "") || /document|image/i.test(m.tipo))

// A promessa em aberto da conversa (a mais recente nossa que promete e depois da qual nada nosso cumpriu)
export function promessaAberta(msgs: MsgPromessa[], agora = Date.now()): Promessa | null {
  const ord = [...msgs].sort((a, b) => a.ts.localeCompare(b.ts))
  for (let i = ord.length - 1; i >= 0; i--) {
    const m = ord[i]
    if (cumpre(m)) return null
    if (m.from_me && ehPromessa(m.corpo)) {
      return { msgId: m.id, em: m.ts, texto: (m.corpo ?? "").slice(0, 140), horas: Math.floor((agora - new Date(m.ts).getTime()) / 3_600_000) }
    }
  }
  return null
}

// Cobrança: a 1ª com 2 h, depois a cada 4 h, até 3 dias (depois disso a conversa já esfriou e vai para o follow-up)
export const HORAS_PRIMEIRA = 2
export const HORAS_REPETIR = 4
export const HORAS_DESISTIR = 72
export function deveCobrar(p: Promessa, ultimaCobranca: string | undefined, agora = Date.now()) {
  if (p.horas < HORAS_PRIMEIRA || p.horas > HORAS_DESISTIR) return false
  return !ultimaCobranca || agora - new Date(ultimaCobranca).getTime() >= HORAS_REPETIR * 3_600_000
}
