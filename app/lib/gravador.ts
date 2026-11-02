"use client"

// Gravador de voz do navegador (notebook e página do celular): grava, mede o volume para as barrinhas e devolve o áudio.
// Formato: o que o navegador souber gravar (webm/opus no Chrome, mp4 no Safari/iPhone); o Evolution converte para voz.

import { useCallback, useEffect, useRef, useState } from "react"

export type EstadoGravador = "parado" | "pedindo" | "gravando" | "pronto" | "erro"

const TIPOS = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"]
export const LIMITE_SEGUNDOS = 10 * 60

export function useGravador() {
  const [estado, setEstado] = useState<EstadoGravador>("parado")
  const [segundos, setSegundos] = useState(0)
  const [niveis, setNiveis] = useState<number[]>([])
  const [audio, setAudio] = useState<{ blob: Blob; url: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const ctx = useRef<AudioContext | null>(null)
  const pedacos = useRef<Blob[]>([])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const raf = useRef<number | null>(null)
  const aoParar = useRef<((b: Blob) => void) | null>(null)
  const descartar = useRef(false)

  const soltar = useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    if (raf.current) cancelAnimationFrame(raf.current)
    stream.current?.getTracks().forEach(t => t.stop())
    ctx.current?.close().catch(() => {})
    timer.current = null; raf.current = null; stream.current = null; ctx.current = null
  }, [])
  useEffect(() => () => { soltar(); if (audio) URL.revokeObjectURL(audio.url) }, [soltar, audio])

  // deviceId: microfone escolhido (ex.: o do iPhone pela Continuidade da Apple); sem ele, o padrão do sistema
  const iniciar = useCallback(async (deviceId?: string) => {
    setErro(null); setAudio(null); setSegundos(0); setNiveis([])
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) { setEstado("erro"); setErro("Este navegador não grava áudio."); return }
    setEstado("pedindo")
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) } })
    } catch {
      setEstado("erro")
      setErro(deviceId ? "Esse microfone não respondeu. Se for o iPhone: deixe-o perto do Mac, com Wi-Fi e Bluetooth ligados." : "Sem acesso ao microfone. Libere no cadeado ao lado do endereço do site.")
      return
    }
    const mime = TIPOS.find(t => MediaRecorder.isTypeSupported?.(t))
    const r = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined)
    pedacos.current = []; descartar.current = false
    r.ondataavailable = e => { if (e.data.size) pedacos.current.push(e.data) }
    r.onstop = () => {
      soltar()
      if (descartar.current) { setEstado("parado"); return }
      const blob = new Blob(pedacos.current, { type: r.mimeType || mime || "audio/webm" })
      setAudio({ blob, url: URL.createObjectURL(blob) }); setEstado("pronto")
      aoParar.current?.(blob); aoParar.current = null
    }
    rec.current = r
    r.start(250)
    setEstado("gravando")
    const t0 = Date.now()
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000)
      setSegundos(s)
      if (s >= LIMITE_SEGUNDOS && r.state !== "inactive") r.stop()
    }, 250)
    // Volume para as barrinhas
    try {
      ctx.current = new AudioContext()
      const an = ctx.current.createAnalyser(); an.fftSize = 256
      ctx.current.createMediaStreamSource(stream.current).connect(an)
      const buf = new Uint8Array(an.frequencyBinCount)
      let ultimo = 0
      const medir = (t: number) => {
        an.getByteTimeDomainData(buf)
        let pico = 0
        for (const v of buf) pico = Math.max(pico, Math.abs(v - 128))
        if (t - ultimo > 90) { ultimo = t; setNiveis(n => [...n.slice(-39), Math.min(1, pico / 70)]) }
        raf.current = requestAnimationFrame(medir)
      }
      raf.current = requestAnimationFrame(medir)
    } catch { /* sem barrinhas, grava igual */ }
  }, [soltar])

  // Para e devolve o áudio (para enviar direto sem ouvir antes)
  const parar = useCallback(() => new Promise<Blob | null>(res => {
    const r = rec.current
    if (!r || r.state === "inactive") { res(audio?.blob ?? null); return }
    aoParar.current = res
    r.stop()
  }), [audio])

  const cancelar = useCallback(() => {
    descartar.current = true
    if (rec.current && rec.current.state !== "inactive") rec.current.stop(); else soltar()
    if (audio) URL.revokeObjectURL(audio.url)
    setAudio(null); setEstado("parado"); setSegundos(0); setNiveis([])
  }, [audio, soltar])

  return { estado, segundos, niveis, audio, erro, iniciar, parar, cancelar }
}

export const tempo = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
export const extensaoAudio = (tipo: string) => tipo.includes("mp4") ? "m4a" : tipo.includes("ogg") ? "ogg" : "webm"

// Microfones disponíveis. Os nomes só aparecem depois da primeira permissão de microfone no site.
// O iPhone aparece aqui pela Continuidade da Apple (Mac + iPhone com o mesmo Apple ID, Wi-Fi e Bluetooth).
export type Microfone = { id: string; nome: string; iphone: boolean }
export function useMicrofones(atualizar: unknown) {
  const [lista, setLista] = useState<Microfone[]>([])
  useEffect(() => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined
    if (!md?.enumerateDevices) return
    const ler = () => md.enumerateDevices().then(ds => setLista(ds
      .filter(d => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications")
      .map(d => ({ id: d.deviceId, nome: d.label || "Microfone", iphone: /iphone/i.test(d.label) })))).catch(() => {})
    ler()
    md.addEventListener?.("devicechange", ler)
    return () => md.removeEventListener?.("devicechange", ler)
  }, [atualizar])
  return lista
}
