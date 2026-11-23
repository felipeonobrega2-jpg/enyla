// Voz dos diretores: cada um tem uma voz do Gemini (o jeito de falar segue a personalidade) e, sem a chave do Gemini,
// uma voz do navegador escolhida pelo gênero. Aqui também fica a limpeza do texto para a fala. Puro.
import type { IdDiretor } from "./diretoria"

export type Voz = { gemini: string; estilo: string; genero: "f" | "m"; tom: number; ritmo: number }
const BR = "Português do Brasil, sotaque paulistano natural, como numa reunião de verdade, sem soar como locutor"
export const VOZES: Record<IdDiretor, Voz> = {
  coo: { gemini: "Alnilam", genero: "m", tom: 0.95, ritmo: 1.05, estilo: `${BR}. Diretor de operações: firme, objetivo, ritmo constante, direto ao ponto.` },
  cco: { gemini: "Laomedeia", genero: "f", tom: 1.1, ritmo: 1.1, estilo: `${BR}. Diretora comercial: energia de vendas, animada e confiante, falando sorrindo.` },
  cmo: { gemini: "Aoede", genero: "f", tom: 1.0, ritmo: 1.03, estilo: `${BR}. Diretora de marketing: analítica e criativa, clara, segura, ritmo leve.` },
  cfo: { gemini: "Charon", genero: "m", tom: 0.85, ritmo: 0.95, estilo: `${BR}. Diretor financeiro: calmo, grave, cuidadoso, pausado, pesando cada número.` },
  cto: { gemini: "Iapetus", genero: "m", tom: 1.0, ritmo: 1.0, estilo: `${BR}. Diretor de tecnologia: calmo e sistemático, voz tranquila e clara.` },
}

// Texto para ser falado: sem marcação, listas viram frases, abreviações que a voz lê errado viram palavras
export function textoParaFala(t: string): string {
  return t
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*(?:[-•]|\d+[.)])\s+/gm, "")
    .replace(/\n{2,}/g, ". ").replace(/\n/g, ", ")
    .replace(/\bMQLs?\b/g, m => m.endsWith("s") ? "leads qualificados" : "lead qualificado")
    .replace(/\bCMO\b/g, "C M O").replace(/\bCOO\b/g, "C O O").replace(/\bCFO\b/g, "C F O").replace(/\bCTO\b/g, "C T O").replace(/\bCCO\b/g, "C C O")
    .replace(/\bORC-(\d+)/g, "orçamento $1")
    .replace(/\s*([.,;:!?])(?:\s*[.,;:])+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 3000)
}

// Divide a fala em blocos que terminam em fim de frase. Para o Gemini os blocos são grandes (o limite gratuito conta
// pedidos, então uma resposta normal vai inteira num pedido só); a voz do navegador usa blocos curtos
export function partesDaFala(t: string, primeira = 1400, demais = 1400): string[] {
  const frases = t.match(/[^.!?…]+[.!?…]*\s*/g) ?? [t]
  const out: string[] = []
  let atual = ""
  for (const f of frases) {
    const limite = out.length === 0 ? primeira : demais
    if (atual && (atual + f).length > limite) { out.push(atual.trim()); atual = "" }
    atual += f
  }
  if (atual.trim()) out.push(atual.trim())
  return out
}

// Voz do navegador (sem chave do Gemini, ou no limite do dia): as vozes neurais do Edge ("Online (Natural)") e do Google
// soam bem melhor que as do sistema; o gênero vem do nome da voz.
const FEMININAS = /francisca|thalita|leila|yara|brenda|elza|giovanna|leticia|manuela|luciana|fernanda|joana|maria|vit[oó]ria|camila|raquel|female|feminina/i
const MASCULINAS = /antonio|ant[oô]nio|donato|fabio|f[aá]bio|humberto|julio|j[uú]lio|nicolau|valerio|val[eé]rio|felipe|daniel|ricardo|male|masculina/i
export function vozDoNavegador(vozes: SpeechSynthesisVoice[], diretor: IdDiretor): SpeechSynthesisVoice | null {
  const pt = vozes.filter(v => /^pt[-_]BR/i.test(v.lang))
  const lista = pt.length ? pt : vozes.filter(v => /^pt/i.test(v.lang))
  if (!lista.length) return null
  const qualidade = (v: SpeechSynthesisVoice) => (/natural|neural|online/i.test(v.name) ? 3 : 0) + (/google|premium|enhanced|aprimorad/i.test(v.name) ? 2 : 0)
  const g = VOZES[diretor].genero
  const doGenero = lista.filter(v => (g === "f" ? FEMININAS : MASCULINAS).test(v.name))
  const ordem = (doGenero.length ? doGenero : lista).slice().sort((a, b) => qualidade(b) - qualidade(a) || a.name.localeCompare(b.name))
  // Dois diretores do mesmo gênero ganham vozes diferentes quando há mais de uma
  const mesmos = (Object.keys(VOZES) as IdDiretor[]).filter(d => VOZES[d].genero === g)
  const melhores = ordem.filter(v => qualidade(v) === qualidade(ordem[0]))
  return melhores[mesmos.indexOf(diretor) % melhores.length] ?? ordem[0]
}
