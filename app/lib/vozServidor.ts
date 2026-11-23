// Fala dos diretores pelo Gemini (texto → áudio WAV). A chave fica só no servidor (AppConfig.geminiKey).
// Tenta a API nova (interactions, Gemini TTS atual) e, se ela não responder, a generateContent com o modelo TTS anterior.
// Só roda no servidor.
import { lerCampos } from "./configAtomica"
import type { IdDiretor } from "./diretoria"
import { VOZES } from "./vozDiretores"

const BASE = "https://generativelanguage.googleapis.com/v1beta"
export const chaveGemini = async () => (await lerCampos<{ geminiKey?: string | null }>(["geminiKey"])).geminiKey ?? null

export type Fala = { ok: true; audio: Buffer } | { ok: false; status: number; erro: string; limite?: boolean; semChave?: boolean }

// PCM 16 bits mono → WAV
function wav(pcm: Buffer, taxa = 24000): Buffer {
  const h = Buffer.alloc(44)
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(taxa, 24); h.writeUInt32LE(taxa * 2, 28)
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

// Qual caminho funcionou da última vez (por instância do servidor), para não errar de novo a cada fala
let caminhoBom: "interactions" | "generate" | null = null

async function porInteractions(chave: string, texto: string, voz: string, estilo: string): Promise<Fala> {
  const r = await fetch(`${BASE}/interactions`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
    body: JSON.stringify({
      model: process.env.GEMINI_TTS_MODELO ?? "gemini-3.8-flash-tts",
      input: [{ type: "user_input", content: [{ type: "text", text: texto, annotations: [{ type: "speech_metadata", style: estilo }] }] }],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: voz }] },
    }),
  })
  if (!r.ok) return { ok: false, status: r.status, erro: (await r.text()).slice(0, 300), limite: r.status === 429 }
  const x = await r.json() as { steps?: { type?: string; content?: { type?: string; data?: string; mime_type?: string; mimeType?: string }[] }[] }
  const blocos = (x.steps ?? []).filter(s => s.type === "model_output").flatMap(s => s.content ?? []).filter(c => c.type === "audio" && c.data)
  const b = blocos.at(-1)
  if (!b?.data) return { ok: false, status: 502, erro: "Sem áudio na resposta" }
  const bytes = Buffer.from(b.data, "base64")
  return { ok: true, audio: bytes.subarray(0, 4).toString() === "RIFF" ? bytes : wav(bytes) }
}

async function porGenerate(chave: string, texto: string, voz: string, estilo: string): Promise<Fala> {
  const modelo = process.env.GEMINI_TTS_MODELO_ANTIGO ?? "gemini-2.5-flash-preview-tts"
  const r = await fetch(`${BASE}/models/${modelo}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${estilo}\nFale exatamente este texto:\n${texto}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } } },
    }),
  })
  if (!r.ok) return { ok: false, status: r.status, erro: (await r.text()).slice(0, 300), limite: r.status === 429 }
  const x = await r.json() as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] }
  const parte = x.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData
  if (!parte?.data) return { ok: false, status: 502, erro: "Sem áudio na resposta" }
  const taxa = Number(/rate=(\d+)/.exec(parte.mimeType ?? "")?.[1] ?? 24000)
  return { ok: true, audio: wav(Buffer.from(parte.data, "base64"), taxa) }
}

export async function falar(diretor: IdDiretor, texto: string, chave?: string | null): Promise<Fala> {
  const k = chave ?? await chaveGemini()
  if (!k) return { ok: false, status: 503, erro: "Sem chave do Gemini", semChave: true }
  const v = VOZES[diretor]
  const ordem = caminhoBom === "generate" ? [porGenerate, porInteractions] : [porInteractions, porGenerate]
  let ultimo: Fala = { ok: false, status: 502, erro: "Sem resposta" }
  for (const f of ordem) {
    const r = await f(k, texto, v.gemini, v.estilo).catch(e => ({ ok: false as const, status: 502, erro: String(e).slice(0, 200) }))
    if (r.ok) { caminhoBom = f === porGenerate ? "generate" : "interactions"; return r }
    // Chave recusada vale para os dois caminhos; limite do dia num caminho pode não valer no outro
    if (r.status === 401 || r.status === 403 || /API_KEY_INVALID/.test(r.erro)) return { ...r, erro: "O Google não aceitou a chave do Gemini" }
    ultimo = r
  }
  return ultimo
}
