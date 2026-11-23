"use client"
// Voz na conversa com os diretores (navegador): tocar a fala do diretor (Gemini pelo servidor, em partes, para começar
// logo; sem chave ou no limite, a voz do navegador) e ouvir o Felipe pelo microfone (Groq pelo servidor; sem chave,
// o reconhecimento do navegador). O microfone para sozinho depois de um silêncio.
import type { IdDiretor } from "../../lib/diretoria"
import { partesDaFala, textoParaFala, VOZES, vozDoNavegador } from "../../lib/vozDiretores"

export type Aviso = "navegador" | "limite" | null
const cache = new Map<string, Blob>()
let tocando: { parar: () => void } | null = null

export function pararFala() { tocando?.parar(); tocando = null }

// Busca uma parte da fala no servidor. null = usar a voz do navegador (com o motivo)
async function buscar(diretor: IdDiretor, texto: string, chave: string): Promise<Blob | { motivo: Aviso }> {
  const c = cache.get(chave)
  if (c) return c
  const r = await fetch("/api/diretoria/voz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ diretor, texto }) }).catch(() => null)
  if (!r?.ok || !r.headers.get("content-type")?.includes("audio")) {
    const x = r ? await r.json().catch(() => null) as { limite?: boolean } | null : null
    return { motivo: x?.limite ? "limite" : "navegador" }
  }
  const b = await r.blob()
  if (cache.size > 80) cache.delete(cache.keys().next().value!)
  cache.set(chave, b)
  return b
}

function vozesProntas(): Promise<SpeechSynthesisVoice[]> {
  const s = window.speechSynthesis
  const v = s.getVoices()
  if (v.length) return Promise.resolve(v)
  return new Promise(res => { const t = setTimeout(() => res(s.getVoices()), 1200); s.addEventListener("voiceschanged", () => { clearTimeout(t); res(s.getVoices()) }, { once: true }) })
}

// Fala em andamento: o volume (0..1, para o quadro de quem fala acender) e a frase que está sendo dita (legenda)
export type AoVivo = { onNivel?: (n: number) => void; onLegenda?: (t: string) => void }

// Frase que está sendo dita agora, pela fração já tocada do áudio (as frases pesam pelo tamanho)
function fraseNoPonto(texto: string, fracao: number): string {
  const frases = texto.match(/[^.!?…]+[.!?…]*\s*/g)?.map(f => f.trim()).filter(Boolean) ?? [texto]
  const total = frases.reduce((a, f) => a + f.length, 0)
  let acc = 0
  for (const f of frases) { acc += f.length; if (acc / total >= fracao) return f }
  return frases.at(-1) ?? texto
}

// O contexto de áudio nasce num clique (entrar na reunião); se não estiver rodando, o áudio toca sem medidor
// (ligar um áudio a um contexto parado deixaria o diretor mudo)
let ctxAudio: AudioContext | null = null
export function prepararAudio() {
  try { ctxAudio ??= new AudioContext(); if (ctxAudio.state === "suspended") ctxAudio.resume().catch(() => {}) } catch { /* sem Web Audio */ }
}
function medidor(audio: HTMLAudioElement): AnalyserNode | null {
  try {
    if (!ctxAudio || ctxAudio.state !== "running") return null
    const an = ctxAudio.createAnalyser(); an.fftSize = 512
    const src = ctxAudio.createMediaElementSource(audio)
    src.connect(an); an.connect(ctxAudio.destination)
    return an
  } catch { return null }
}

async function falarNoNavegador(diretor: IdDiretor, texto: string, cancelado: () => boolean, vivo: AoVivo = {}): Promise<void> {
  if (!("speechSynthesis" in window)) return
  const s = window.speechSynthesis
  const voz = vozDoNavegador(await vozesProntas(), diretor)
  for (const parte of partesDaFala(texto, 200, 220)) {   // frases curtas: o Chrome corta falas longas
    if (cancelado()) return
    vivo.onLegenda?.(parte)
    // A voz do navegador não dá o volume: o quadro pulsa a cada palavra
    const pulso = setInterval(() => vivo.onNivel?.(0.25 + Math.random() * 0.5), 140)
    await new Promise<void>(res => {
      const u = new SpeechSynthesisUtterance(parte)
      u.lang = voz?.lang ?? "pt-BR"; if (voz) u.voice = voz
      u.pitch = VOZES[diretor].tom; u.rate = VOZES[diretor].ritmo
      u.onend = () => res(); u.onerror = () => res()
      s.speak(u)
    })
    clearInterval(pulso); vivo.onNivel?.(0)
  }
}

// Fala a mensagem inteira; resolve quando termina (ou é interrompida)
export async function falar(diretor: IdDiretor, id: string, textoOriginal: string, op: { onAviso?: (a: Aviso) => void } & AoVivo = {}): Promise<void> {
  pararFala()
  const texto = textoParaFala(textoOriginal)
  if (!texto) return
  let cancelado = false
  const audio = new Audio()
  const minha = { parar: () => { cancelado = true; audio.pause(); audio.src = ""; if ("speechSynthesis" in window) window.speechSynthesis.cancel() } }
  tocando = minha
  const partes = partesDaFala(texto)
  // Medidor de volume só quando alguém está olhando (a chamada); um por elemento de áudio
  const an = op.onNivel ? medidor(audio) : null
  const buf = an ? new Float32Array(an.fftSize) : null
  let proxima: Promise<Blob | { motivo: Aviso }> = buscar(diretor, partes[0], `${diretor}:${id}:0`)
  for (let k = 0; k < partes.length; k++) {
    const atual = await proxima
    if (cancelado) return
    if (k + 1 < partes.length) proxima = buscar(diretor, partes[k + 1], `${diretor}:${id}:${k + 1}`)   // já pede a próxima enquanto toca
    if (!(atual instanceof Blob)) {
      op.onAviso?.(atual.motivo)
      await falarNoNavegador(diretor, partes.slice(k).join(" "), () => cancelado, op)
      break
    }
    op.onAviso?.(null)
    const url = URL.createObjectURL(atual)
    const parte = partes[k]
    let raf = 0
    const acompanhar = () => {
      if (an) {
        an.getFloatTimeDomainData(buf!)
        let soma = 0; for (const x of buf!) soma += x * x
        op.onNivel?.(Math.min(1, Math.sqrt(soma / buf!.length) * 6))
      }
      if (audio.duration > 0) op.onLegenda?.(fraseNoPonto(parte, audio.currentTime / audio.duration))
      raf = requestAnimationFrame(acompanhar)
    }
    await new Promise<void>(res => {
      audio.src = url; audio.onended = () => res(); audio.onerror = () => res(); audio.onpause = () => { if (cancelado) res() }
      audio.play().then(() => { if (op.onNivel || op.onLegenda) raf = requestAnimationFrame(acompanhar) }).catch(() => res())
    })
    cancelAnimationFrame(raf)
    URL.revokeObjectURL(url)
  }
  op.onNivel?.(0); op.onLegenda?.("")
  if (tocando === minha) tocando = null
}

// ── Microfone ──────────────────────────────────────────────────────────────────────
// Whisper inventa frase em áudio sem fala; isso não vira mensagem
const ALUCINACOES = /^(legendas? (pela|por)|obrigad[oa] por assistir|inscreva-se|tchau\.?$|\.+$)/i
export type Escuta = { parar: () => void; cancelar: () => void }

// Começa a ouvir. onNivel: 0..1 para o medidor; termina sozinho após ~1,6 s de silêncio depois de falar (ou 90 s)
export async function ouvir(op: { onNivel?: (n: number) => void; onTexto: (t: string) => void; onErro: (e: string) => void; onEntendendo?: () => void; onFim?: () => void; semPressa?: boolean }): Promise<Escuta | null> {
  let stream: MediaStream
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }) }
  catch { op.onErro("Sem acesso ao microfone. Libere o microfone para o site no navegador."); op.onFim?.(); return null }
  const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(t => MediaRecorder.isTypeSupported(t)) ?? ""
  const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined)
  const pedacos: Blob[] = []
  let cancelado = false
  const ctx = new AudioContext()
  const an = ctx.createAnalyser(); an.fftSize = 1024
  ctx.createMediaStreamSource(stream).connect(an)
  const buf = new Float32Array(an.fftSize)
  let falou = false, silencioDesde = 0, raf = 0
  const inicio = Date.now()
  const medir = () => {
    an.getFloatTimeDomainData(buf)
    let soma = 0; for (const x of buf) soma += x * x
    const nivel = Math.min(1, Math.sqrt(soma / buf.length) * 8)
    op.onNivel?.(nivel)
    const agora = Date.now()
    if (nivel > 0.12) { falou = true; silencioDesde = 0 } else if (falou && !silencioDesde) silencioDesde = agora
    if ((falou && silencioDesde && agora - silencioDesde > 1600) || agora - inicio > 90_000 || (!op.semPressa && !falou && agora - inicio > 12_000)) { fechar(); return }
    raf = requestAnimationFrame(medir)
  }
  const fechar = () => { cancelAnimationFrame(raf); if (rec.state !== "inactive") rec.stop() }
  rec.ondataavailable = e => { if (e.data.size) pedacos.push(e.data) }
  rec.onstop = async () => {
    stream.getTracks().forEach(t => t.stop()); ctx.close().catch(() => {}); op.onNivel?.(0)
    if (cancelado || !falou) { op.onFim?.(); return }
    op.onEntendendo?.()
    const blob = new Blob(pedacos, { type: rec.mimeType || "audio/webm" })
    const form = new FormData(); form.set("audio", blob, `fala.${blob.type.includes("mp4") ? "m4a" : "webm"}`)
    const r = await fetch("/api/diretoria/ouvir", { method: "POST", body: form }).catch(() => null)
    const x = r ? await r.json().catch(() => null) as { texto?: string; erro?: string; semChave?: boolean } | null : null
    const t = (x?.texto ?? "").trim()
    if (r?.ok && t && !ALUCINACOES.test(t)) op.onTexto(t)
    else if (!r?.ok) op.onErro(x?.semChave ? "Para falar com os diretores, configure a chave do Groq em Configurações." : "Não deu para entender o áudio agora.")
    op.onFim?.()
  }
  rec.start(250)
  raf = requestAnimationFrame(medir)
  return { parar: fechar, cancelar: () => { cancelado = true; fechar() } }
}
