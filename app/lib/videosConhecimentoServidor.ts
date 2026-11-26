// Vídeos do Felipe → conhecimento vivo (servidor). Só roda com AppConfig.videosConhecimento.ativo === true (padrão: desligado).
// Não manda nada a cliente, não publica, não apaga, não mexe em cobrança: só lê o vídeo do Felipe, guarda a transcrição,
// grava regras no conhecimento vivo (conhecimentoDiretoria) e marca cortes para a curadoria (?o=videos).
// Custo: Groq whisper-large-v3-turbo, US$ 0,04 por hora de áudio (mínimo cobrado: 10 s por pedido). Ver docs/videos-conhecimento.md.

import { lerCampos, mudarConfig } from "./configAtomica"
import { supabase } from "./supabase"
import { obterMidia } from "./midiaWhatsapp"
import { clienteClaude, MODELO, FALLBACK } from "./claude"
import type { LicaoDiretor, IdDiretor } from "./diretoria"
import { DIRETOR_DA_AREA, segmentosDaGroq, resumirTranscricao, textoDaLicao, confirmacao, type Segmento, type Regra, type Corte, type ChamarIA } from "./videosConhecimento"

const LIMITE_ARQUIVO = 24 * 1024 * 1024    // plano gratuito da Groq: 25 MB por arquivo
const LIMITE_URL = 100 * 1024 * 1024       // plano dev: 100 MB; acima disso o vídeo não é aceito
const BUCKET = "whatsapp-midia"

type Cfg = { videosConhecimento?: { ativo?: boolean }; groqKey?: string | null; apiKey?: string }
export const videosAtivo = (cfg: Cfg) => cfg.videosConhecimento?.ativo === true
const dataBR = (d = new Date()) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })

// verbose_json: segmentos com início e fim. Até ~24 MB vai o arquivo; acima, a Groq baixa pelo parâmetro `url`.
// (O vídeo mp4 vai direto: a Groq aceita mp4 e extrai o áudio; não há ffmpeg no servidor.)
export async function transcreverComMinutagem(m: { bytes: Buffer; tipo: string }, msgId: string, chave: string): Promise<{ segmentos: Segmento[]; duracao: number }> {
  if (m.bytes.length > LIMITE_URL) throw new Error("Vídeo acima de 100 MB: mande um mais curto.")
  const form = new FormData()
  form.set("model", "whisper-large-v3-turbo"); form.set("language", "pt"); form.set("response_format", "verbose_json")
  form.set("timestamp_granularities[]", "segment")
  if (m.bytes.length <= LIMITE_ARQUIVO) form.set("file", new Blob([new Uint8Array(m.bytes)], { type: m.tipo }), m.tipo.includes("video") || m.tipo.includes("mp4") ? "video.mp4" : "audio.m4a")
  else {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(`midia/${msgId}`, 3600)
    if (!data?.signedUrl) throw new Error("Não consegui o link do vídeo para a transcrição.")
    form.set("url", data.signedUrl)
  }
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${chave}` }, body: form })
  if (!r.ok) throw new Error(`Groq ${r.status}`)
  const j = await r.json() as { duration?: number; segments?: { start?: number; end?: number; text?: string }[] }
  const segmentos = segmentosDaGroq(j)
  return { segmentos, duracao: j.duration ?? segmentos[segmentos.length - 1]?.fim ?? 0 }
}

async function iaDoSistema(apiKey: string): Promise<ChamarIA> {
  const cli = clienteClaude(apiKey, "videos")
  return async (system, usuario) => {
    const r = await cli.beta.messages.create({ model: MODELO, max_tokens: 3000, system, messages: [{ role: "user", content: usuario }], ...FALLBACK } as never) as { content: { type: string; text?: string }[] }
    return r.content.filter(b => b.type === "text").map(b => b.text ?? "").join("\n")
  }
}

async function gravarNoConhecimento(regras: Regra[], data: string, link: string) {
  const em = new Date().toISOString()
  const novas = new Map<IdDiretor, LicaoDiretor[]>()
  regras.forEach((r, i) => {
    const d = DIRETOR_DA_AREA[r.area]
    novas.set(d, [...(novas.get(d) ?? []), { id: `${d}-video-${Date.now().toString(36)}-${i}`, texto: textoDaLicao(r.texto, data, link), em }])
  })
  await mudarConfig((d: { conhecimentoDiretoria?: Partial<Record<IdDiretor, LicaoDiretor[]>> }) => {
    const base = { ...(d.conhecimentoDiretoria ?? {}) }
    for (const [dir, ls] of novas) base[dir] = [...ls, ...(base[dir] ?? [])].slice(0, 300)
    return { conhecimentoDiretoria: base }
  })
}

// Processa um vídeo do Felipe e devolve o texto de confirmação para o chat dele (ou null se a chave está desligada).
export async function processarVideoDoFelipe(msgId: string): Promise<string | null> {
  const cfg = await lerCampos<Cfg>(["videosConhecimento", "groqKey", "apiKey"])
  if (!videosAtivo(cfg)) return null
  if (!cfg.groqKey) return "Recebi o vídeo, mas falta a chave do Groq em Configurações."
  if (!cfg.apiKey) return "Recebi o vídeo, mas a chave da IA não está configurada."
  const m = await obterMidia(msgId)
  if (!m) return "Recebi o vídeo, mas não consegui baixar a mídia."
  const link = `${BUCKET}/midia/${msgId}`
  const data = dataBR()
  const { segmentos, duracao } = await transcreverComMinutagem(m, msgId, cfg.groqKey)
  if (!segmentos.length) return "Recebi o vídeo, mas não reconheci fala nele."
  // Fonte primeiro: a transcrição inteira fica guardada mesmo se o resumo falhar
  const transcricao = segmentos.map(s => s.texto).join(" ")
  const { error } = await supabase.from("videos_felipe").upsert({ msg_id: msgId, fonte: "video", link, duracao_s: duracao, transcricao, segmentos }, { onConflict: "msg_id" })
  if (error) return `Transcrevi o vídeo, mas não consegui guardar (${error.message.slice(0, 120)}). Falta rodar a migração videos_felipe?`
  const { regras, cortes } = await resumirTranscricao(segmentos, data, await iaDoSistema(cfg.apiKey))
  if (regras.length) await gravarNoConhecimento(regras, data, link)
  await supabase.from("videos_felipe").update({ regras, cortes }).eq("msg_id", msgId)
  return confirmacao(regras.length, cortes.length)
}

// ?o=videos (CMO e CTO): cortes marcados para a curadoria. Nada é publicado; a Lívia prepara até 3 por semana e o Felipe aprova antes.
export async function leituraVideos() {
  const cfg = await lerCampos<Cfg>(["videosConhecimento"])
  const { data } = await supabase.from("videos_felipe").select("msg_id, link, gravado_em, duracao_s, regras, cortes").order("gravado_em", { ascending: false }).limit(30)
  return {
    ativo: videosAtivo(cfg),
    regra: "Nada é publicado. A CMO prepara no máximo 3 cortes por semana e o Felipe aprova antes de qualquer publicação.",
    videos: (data ?? []).map(v => ({ id: v.msg_id, em: v.gravado_em, link: v.link, duracaoSegundos: v.duracao_s, regrasGuardadas: (v.regras as Regra[] ?? []).length, cortes: (v.cortes as Corte[] ?? []) })),
  }
}
