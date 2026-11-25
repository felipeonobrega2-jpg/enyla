// Vídeos do Felipe → conhecimento vivo. Parte pura (sem banco, sem rede): minutagem, parser das marcações [REGRA] e
// [CORTE] e a divisão por área. Tudo atrás de AppConfig.videosConhecimento.ativo (padrão false). A parte de servidor
// está em videosConhecimentoServidor.ts.

import type { IdDiretor } from "./diretoria"

export type Segmento = { inicio: number; fim: number; texto: string }
export type Area = "comercial" | "marketing" | "producao" | "financeiro"
export type Regra = { area: Area; texto: string }
export type TipoCorte = "preco" | "producao" | "cliente" | "objecao"
export type Corte = { inicio: number; fim: number; tipo: TipoCorte; texto: string }

export const AREAS: Area[] = ["comercial", "marketing", "producao", "financeiro"]
// Área do vídeo → diretor dono do conhecimento (mesmo lugar do guardar_conhecimento: conhecimentoDiretoria)
export const DIRETOR_DA_AREA: Record<Area, IdDiretor> = { comercial: "cco", marketing: "cmo", producao: "coo", financeiro: "cfo" }
export const CORTE_MIN_S = 15
export const CORTE_MAX_S = 45
export const MAX_CORTES_POR_SEMANA = 3
export const MAX_REGRAS = 40

const sem = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()

export function minutagem(s: number): string {
  const t = Math.max(0, Math.round(s))
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), ss = t % 60
  const p = (n: number) => String(n).padStart(2, "0")
  return h ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`
}
// "12:30" ou "1:02:03" → segundos (null se não for minutagem)
export function lerMinutagem(t: string): number | null {
  const m = t.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/)
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null
}

// Resposta verbose_json da Groq → segmentos com início/fim em segundos
export function segmentosDaGroq(r: { segments?: { start?: number; end?: number; text?: string }[] }): Segmento[] {
  return (r.segments ?? []).filter(s => typeof s.start === "number" && typeof s.end === "number" && s.text?.trim())
    .map(s => ({ inicio: s.start as number, fim: s.end as number, texto: (s.text as string).trim() }))
}
// Texto com minutagem por linha: é o que o agente lê para marcar início e fim
export const textoComMinutagem = (segs: Segmento[]) => segs.map(s => `[${minutagem(s.inicio)}] ${s.texto}`).join("\n")

const TIPOS: Record<string, TipoCorte> = { preco: "preco", producao: "producao", cliente: "cliente", historia: "cliente", objecao: "objecao" }

// Linhas da IA: "[REGRA comercial] texto" e "[CORTE 12:30-12:58 preco] o que ele diz". Linha fora do formato é ignorada.
// Corte só vale com 15 a 45 s (início < fim); fora disso é descartado, nunca "ajustado".
export function lerMarcacoes(saida: string): { regras: Regra[]; cortes: Corte[]; descartados: number } {
  const regras: Regra[] = [], cortes: Corte[] = []
  let descartados = 0
  for (const linha of saida.split("\n")) {
    const r = linha.match(/^\s*[-•*]?\s*\[REGRA\s+([^\]\s]+)\]\s*(.+)$/i)
    if (r) {
      const area = AREAS.find(a => a === sem(r[1]))
      const texto = r[2].trim().slice(0, 400)
      if (area && texto) regras.push({ area, texto }); else descartados++
      continue
    }
    const c = linha.match(/^\s*[-•*]?\s*\[CORTE\s+(\S+?)\s*(?:-|–|—|a)\s*(\S+?)(?:\s+([^\]\s]+))?\]\s*(.*)$/i)
    if (c) {
      const ini = lerMinutagem(c[1]), fim = lerMinutagem(c[2])
      const tipo = TIPOS[sem(c[3] ?? "")]
      const dur = ini != null && fim != null ? fim - ini : 0
      if (ini != null && fim != null && tipo && dur >= CORTE_MIN_S && dur <= CORTE_MAX_S) cortes.push({ inicio: ini, fim, tipo, texto: c[4].trim().slice(0, 300) })
      else descartados++
    }
  }
  return { regras: regras.slice(0, MAX_REGRAS), cortes, descartados }
}

export const promptResumo = (dataBR: string) => `Você lê a transcrição (com minutagem) de um vídeo do Felipe, dono da ENYLA Embalagens, falando de como a empresa trabalha.
Devolva SÓ linhas neste formato, nada além disso:
[REGRA <area>] regra ou decisão curta, no imperativo ou afirmativa, sem enrolação (uma frase)
[CORTE <início>-<fim> <tipo>] o que ele diz nesse trecho
- area: comercial, marketing, producao ou financeiro.
- Só o que o Felipe realmente disse. Não invente preço, prazo nem regra. Sem regra clara, não escreva linha.
- CORTE: trecho de 15 a 45 segundos (fim − início) em que ele dá preço de referência (tipo preco), mostra a produção (producao), conta história de cliente (cliente) ou responde objeção (objecao). Minutagem como mm:ss. No máximo 6 cortes.
- Data do vídeo: ${dataBR}.`

export type ChamarIA = (system: string, usuario: string) => Promise<string>

// Resume a transcrição em regras por área e cortes. A IA entra por `chamarIA` (nos testes, uma função falsa).
export async function resumirTranscricao(segs: Segmento[], dataBR: string, chamarIA: ChamarIA) {
  const saida = await chamarIA(promptResumo(dataBR), textoComMinutagem(segs).slice(0, 120_000))
  return lerMarcacoes(saida)
}

export const porArea = (regras: Regra[]): Record<Area, string[]> => {
  const o: Record<Area, string[]> = { comercial: [], marketing: [], producao: [], financeiro: [] }
  for (const r of regras) o[r.area].push(r.texto)
  return o
}
// Texto guardado no conhecimento vivo, com a origem "vídeo de DD/MM" e o link
export const textoDaLicao = (regra: string, dataBR: string, link: string | null) => `${regra} (origem: vídeo de ${dataBR}${link ? `, ${link}` : ""})`
export const confirmacao = (regras: number, cortes: number) =>
  `Vídeo recebido, ${regras} ${regras === 1 ? "regra guardada" : "regras guardadas"}${cortes ? ` e ${cortes} ${cortes === 1 ? "corte marcado" : "cortes marcados"} para a Lívia` : ""}.`
