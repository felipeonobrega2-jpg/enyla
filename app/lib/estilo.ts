// Como o Felipe escreve de verdade (medido nas mensagens dele, digitadas no celular, para os leads do anúncio).
// Entra no prompt do agente e vale sobre a lista de emojis do guia. Puro: o servidor busca as mensagens.

export type EstiloFelipe = {
  em: string; n: number
  mediaChars: number; pctEmoji: number; pctExclamacao: number
  emojis: string[]; aberturas: string[]; exemplos: string[]
  // O que o agente já mandou e o lead respondeu (a IA aprimora em cima do que funciona)
  taxaAgente?: number; nAgente?: number; funcionou?: string[]
}

const EMOJI = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu
const pct = (a: number, b: number) => b ? Math.round(a / b * 100) : 0

// Mensagem que serve de exemplo: conversa de venda, sem número de documento, telefone, link ou palavrão
const ruim = /\d{5,}|https?:|www\.|cacete|porra|caralho|\bpix\b|cnpj|cpf|parceir|indic|fornecedor|grana|importa|desconto|através de mim|comiss|\bcarinha\b|\bkg\b|R\$/i
// Saudação pronta, vitrine e resposta automática não contam (são modelo, não o seu jeito)
const MODELO = /aqui é o luiz felipe|instagram\.com|fora do hor[aá]rio|^\*?dados/i
// Começo de frase que diz algo do tom (não artigo, pronome nem link)
const NAO_ABERTURA = new Set(["o", "a", "os", "as", "e", "de", "da", "do", "que", "eu", "vou", "me", "te", "se", "no", "na", "um", "uma", "pra", "para", "é", "tá", "já", "mas", "isso", "esse", "essa", "aí", "ai", "tem", "com", "em", "por", "foi"])

// Mensagem com cara de atendimento automático: nunca vira exemplo (e a IA é orientada a não escrever assim)
const ROBO = /como posso (te |lhe )?ajudar|fico (à|a) disposi|estou (aqui )?(à|a) disposi|qualquer d[uú]vida,? estou|agradecemos o (seu )?contato|seja bem[- ]vind|prezad[oa]|atenciosamente|sistema|autom[aá]tic|\bIA\b|rob[oô]/i
const limpoParaExemplo = (t: string) => t.length >= 12 && t.length <= 160 && !ruim.test(t) && !ROBO.test(t) && !MODELO.test(t)

export function medirEstilo(textos: string[], agora = new Date(), paraExemplos?: string[], doAgente: { texto: string; respondeu: boolean }[] = []): EstiloFelipe | null {
  const ms = textos.map(t => (t ?? "").trim()).filter(t => t && !MODELO.test(t))
  if (ms.length < 30) return null
  const contEmo: Record<string, number> = {}, contAb: Record<string, number> = {}
  let comEmo = 0, comExcl = 0, chars = 0
  for (const t of ms) {
    const e = t.match(EMOJI) ?? []
    if (e.length) comEmo++
    for (const x of e) contEmo[x] = (contEmo[x] ?? 0) + 1
    if (t.includes("!")) comExcl++
    chars += t.length
    const ab = (t.split(/[\s,!.?]+/)[0] ?? "").toLowerCase()
    if (/^[a-zà-ÿ]{2,}$/.test(ab) && !NAO_ABERTURA.has(ab)) contAb[ab] = (contAb[ab] ?? 0) + 1
  }
  const fonte = (paraExemplos ?? ms).map(t => (t ?? "").trim()).filter(t => t && !MODELO.test(t))
  const exemplos = [...new Set(fonte.filter(t => t.length >= 12 && t.length <= 140 && !ruim.test(t)))].slice(-14)
  return {
    em: agora.toISOString(), n: ms.length,
    mediaChars: Math.round(chars / ms.length), pctEmoji: pct(comEmo, ms.length), pctExclamacao: pct(comExcl, ms.length),
    emojis: Object.entries(contEmo).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k),
    aberturas: Object.entries(contAb).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k),
    exemplos,
    ...(doAgente.length >= 20 ? {
      nAgente: doAgente.length,
      taxaAgente: pct(doAgente.filter(x => x.respondeu).length, doAgente.length),
      funcionou: [...new Set(doAgente.filter(x => x.respondeu).map(x => x.texto.trim()).filter(limpoParaExemplo))].slice(-10),
    } : {}),
  }
}

export function textoEstilo(e: EstiloFelipe): string {
  return `Como eu escrevo de verdade (medido em ${e.n} mensagens minhas para leads; isto vale sobre a lista de emojis do guia):
- Tamanho médio: ${e.mediaChars} caracteres por mensagem. Curto e direto.
- Ponto de exclamação em só ${e.pctExclamacao}% das mensagens. Não abra com "Perfeito!", "Show!", "Fechou!": escreva sem exclamação ("Show", "Fechou", "Blz").
- Emoji em ${e.pctEmoji}% das mensagens (fora a saudação pronta)${e.emojis.length ? `; os que eu uso: ${e.emojis.slice(0, 4).join(" ")}` : ""}. Não use 🙌, ✨ nem emoji de efeito.
- Costumo começar com: ${e.aberturas.map(a => `"${a}"`).join(", ")}.
- Exemplos reais meus (o tom, não o conteúdo):
${e.exemplos.map(x => `  · ${x.replace(/\n/g, " / ")}`).join("\n")}${e.funcionou?.length ? `
- Mensagens que você (agente) já mandou e o lead RESPONDEU (${e.taxaAgente}% das ${e.nAgente} últimas tiveram resposta). Pode seguir esse caminho e melhorar em cima, variando as palavras:
${e.funcionou.map(x => `  · ${x.replace(/\n/g, " / ")}`).join("\n")}` : ""}
- Nunca soe como atendimento automático: nada de "Como posso te ajudar?", "Fico à disposição", "Seja bem-vindo", "Agradecemos o contato". Escreva como gente, do celular.`
}

// Trava de emoji na resposta da IA: 👋 só na primeira mensagem nossa; 😂/😁 só se o lead está rindo; os outros que
// você usa de verdade (medidos, ex.: 🫡 👊) passam; 🙌 ✨ e emoji de efeito nunca. No máximo um por mensagem.
const RISO = /k{3,}|rs\b|haha|😂|🤣|😁|😅/i
const NUNCA = /^(🙌|✨|🚀|💫|🌟|⭐|💯|🔥|🎉|🥰|😍|💜|❤)/u
const base = (e: string) => e.replace(/[\u{1F3FB}-\u{1F3FF}️]/gu, "")
export function limparEmojis(texto: string, ctx: { primeira: boolean; leadRindo: boolean; seus?: string[] }): string {
  let usado = false
  const seus = new Set((ctx.seus ?? []).map(base).filter(e => !NUNCA.test(e) && !e.startsWith("👋") && !["😂", "😁", "🤣"].includes(e)))
  const limpo = texto.replace(EMOJI, e => {
    const ok = !usado && ((e.startsWith("👋") && ctx.primeira) || ((e === "😂" || e === "😁") && ctx.leadRindo) || (!NUNCA.test(e) && seus.has(base(e))))
    if (ok) { usado = true; return e }
    return ""
  })
  // Espaço que sobrou antes de pontuação ou no fim da linha
  return limpo.replace(/[ \t]+([.,!?])/g, "$1").replace(/[ \t]+$/gm, "").replace(/ {2,}/g, " ").trim()
}
export const leadEstaRindo = (ultimasDoLead: (string | null)[]) => ultimasDoLead.some(t => !!t && RISO.test(t))
