// "Ensinar a IA": o que você ensina a cada IA do sistema (e as correções que ela pega sozinha quando você
// muda o que ela escreveu). Entra no prompt de cada uma, então ela melhora a cada uso. Puro: o servidor grava.
// O agente do WhatsApp (conhecimentoAgente) e o banco (licoesBanco) já têm o próprio aprendizado.

export type AreaIA = "assistente" | "design" | "mensagens" | "marketing"
export type LicaoIA = { id: string; texto: string; em: string; origem?: "voce" | "correcao" }
export type LicoesIA = Partial<Record<AreaIA, LicaoIA[]>>

export const AREAS_IA: Record<AreaIA, { nome: string; explica: string; exemplo: string }> = {
  assistente: {
    nome: "Assistente Forma",
    explica: "A Forma lê isto antes de responder. Corrija também pela conversa (\"não é assim, é…\") que ela propõe guardar.",
    exemplo: "Ex.: Quando eu perguntar \"quanto vendi\", conte só pedidos fechados, sem o digital",
  },
  design: {
    nome: "Forma design",
    explica: "A consultora de embalagem lê isto antes de propor caixa, medida e material.",
    exemplo: "Ex.: Para perfume de 50 ml, use cartão 300g e folga de 3 mm no frasco",
  },
  mensagens: {
    nome: "Mensagens",
    explica: "A IA lê isto ao escrever no seu lugar. Quando você muda o texto dela antes de enviar, ela guarda a correção.",
    exemplo: "Ex.: Nunca escrever \"prezado\"; trato todo mundo pelo primeiro nome",
  },
  marketing: {
    nome: "Marketing",
    explica: "O analista lê isto antes de escrever a leitura do relatório.",
    exemplo: "Ex.: Campanha nova precisa de 5 dias antes de julgar; não sugira pausar antes disso",
  },
}

export const ehArea = (a: unknown): a is AreaIA => typeof a === "string" && a in AREAS_IA

const MAX_VOCE = 80          // o que você escreveu fica (até este tanto)
const MAX_CORRECOES = 15     // correções automáticas: só as mais recentes
const MAX_TEXTO = 600

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()

export function adicionarLicao(lista: LicaoIA[] | undefined, texto: string, origem: "voce" | "correcao", agora = new Date(), id = crypto.randomUUID()): LicaoIA[] {
  const t = texto.trim().slice(0, MAX_TEXTO)
  const atual = lista ?? []
  if (!t || atual.some(l => norm(l.texto) === norm(t))) return atual
  const nova = [...atual, { id, texto: t, em: agora.toISOString(), origem }]
  const voce = nova.filter(l => l.origem !== "correcao").slice(-MAX_VOCE)
  const correcoes = nova.filter(l => l.origem === "correcao").slice(-MAX_CORRECOES)
  const ficam = new Set([...voce, ...correcoes].map(l => l.id))
  return nova.filter(l => ficam.has(l.id))
}

export function editarLicao(lista: LicaoIA[] | undefined, id: string, texto: string): LicaoIA[] {
  const t = texto.trim().slice(0, MAX_TEXTO)
  // Editou uma correção automática: vira lição sua (fica para sempre)
  return (lista ?? []).map(l => l.id === id && t ? { ...l, texto: t, origem: "voce" as const } : l)
}

export const tirarLicao = (lista: LicaoIA[] | undefined, id: string) => (lista ?? []).filter(l => l.id !== id)

// Você mudou o texto que a IA escreveu antes de enviar: a diferença vira exemplo. Mudança mínima (espaço, pontuação) não conta.
export function correcaoDeMensagem(ia: string, voce: string): string | null {
  const a = ia.trim(), b = voce.trim()
  const sem = (s: string) => norm(s).replace(/[^\p{L}\p{N} ]/gu, "")
  if (!a || !b || sem(a) === sem(b)) return null
  const corta = (s: string) => (s.length > 260 ? `${s.slice(0, 260)}…` : s).replace(/\n+/g, " / ")
  return `A IA escreveu: «${corta(a)}» · você mandou: «${corta(b)}»`
}

// Bloco do prompt. As suas lições valem sobre o resto das instruções; as correções são exemplos do seu jeito.
export function licoesNoPrompt(lista: LicaoIA[] | undefined): string {
  const voce = (lista ?? []).filter(l => l.origem !== "correcao")
  const corr = (lista ?? []).filter(l => l.origem === "correcao")
  if (!voce.length && !corr.length) return ""
  return `

## O QUE O FELIPE TE ENSINOU (vale sobre as outras instruções quando conflitar)
${voce.map(l => `- ${l.texto}`).join("\n")}${corr.length ? `

Correções recentes dele no que você escreveu (aprenda o jeito, não copie):
${corr.map(l => `- ${l.texto}`).join("\n")}` : ""}`
}
