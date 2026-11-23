"use client"

// Caixa em 3D com a arte prévia em todas as faces (orçamento e proposta). Gira sozinha; arrastar com o dedo ou o
// mouse vira a caixa (e ela para de girar até você soltar).

import React, { useEffect, useRef, useState } from "react"
import { AVISO_PREVIA, type DimsCaixa, type FacesArte } from "../lib/artePrevia"

const dataUrl = (svg: string) => `url('data:image/svg+xml;base64,${typeof window === "undefined" ? "" : btoa(unescape(encodeURIComponent(svg)))}')`

// O giro automático é animação de CSS (leve: dá para ter várias na lista); arrastar assume o controle e, ao soltar,
// volta a girar sozinha depois de 2,5 s
const CSS = `@keyframes caixa3d-gira{from{transform:rotateX(-16deg) rotateY(-32deg)}to{transform:rotateX(-16deg) rotateY(328deg)}}
.caixa3d-gira{animation:caixa3d-gira var(--volta,10s) linear infinite}
@media (prefers-reduced-motion: reduce){.caixa3d-gira{animation:none;transform:rotateX(-16deg) rotateY(-32deg)}}`

export function Caixa3DArte({ faces, dims, tamanho = 260, aviso = true, interativo = true, volta = 10 }: {
  faces: FacesArte; dims: DimsCaixa; tamanho?: number; aviso?: boolean; interativo?: boolean; volta?: number
}) {
  // Escala: a maior medida vira ~70% da área
  const k = tamanho * 0.7 / Math.max(dims.largura, dims.altura, dims.profundidade)
  const L = dims.largura * k, P = dims.profundidade * k, A = dims.altura * k
  const [manual, setManual] = useState<{ x: number; y: number } | null>(null)
  const arrastando = useRef<{ x: number; y: number; ax: number; ay: number } | null>(null)
  const volta_ = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => { setUrls(Object.fromEntries(Object.entries(faces).map(([f, s]) => [f, dataUrl(s)]))) }, [faces])
  useEffect(() => () => { if (volta_.current) clearTimeout(volta_.current) }, [])
  const face = (f: keyof FacesArte, w: number, h: number, transform: string) => (
    <div key={f} style={{ position: "absolute", width: w, height: h, left: -w / 2, top: -h / 2, transform, backgroundImage: urls[f], backgroundSize: "100% 100%",
      backfaceVisibility: "hidden", boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.08)" }} />
  )
  return (
    <div className="flex flex-col items-center select-none">
      <style>{CSS}</style>
      <div style={{ width: tamanho, height: tamanho, perspective: tamanho * 4, touchAction: interativo ? "none" : undefined, cursor: interativo ? "grab" : undefined }}
        className="flex items-center justify-center"
        onPointerDown={interativo ? e => {
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
          if (volta_.current) clearTimeout(volta_.current)
          // Começa de onde a animação estava (aproximado pelo tempo)
          const y = manual?.y ?? (-32 + ((performance.now() / 1000) % volta) / volta * 360)
          arrastando.current = { x: e.clientX, y: e.clientY, ax: manual?.x ?? -16, ay: y }
          setManual({ x: manual?.x ?? -16, y })
        } : undefined}
        onPointerMove={interativo ? e => { const a = arrastando.current; if (a) setManual({ x: Math.max(-70, Math.min(70, a.ax - (e.clientY - a.y) * 0.5)), y: a.ay + (e.clientX - a.x) * 0.6 }) } : undefined}
        onPointerUp={interativo ? () => { arrastando.current = null; volta_.current = setTimeout(() => setManual(null), 2500) } : undefined}
        role="img" aria-label={interativo ? "Caixa em 3D com a arte prévia (arraste para girar)" : "Caixa em 3D com a arte prévia"}>
        <div className={manual ? undefined : "caixa3d-gira"}
          style={{ position: "relative", width: 0, height: 0, transformStyle: "preserve-3d", ["--volta" as string]: `${volta}s`,
            ...(manual ? { transform: `rotateX(${manual.x}deg) rotateY(${manual.y}deg)` } : {}) }}>
          {face("frente", L, A, `translateZ(${P / 2}px)`)}
          {face("verso", L, A, `rotateY(180deg) translateZ(${P / 2}px)`)}
          {face("lateral_dir", P, A, `rotateY(90deg) translateZ(${L / 2}px)`)}
          {face("lateral_esq", P, A, `rotateY(-90deg) translateZ(${L / 2}px)`)}
          {face("tampa", L, P, `rotateX(90deg) translateZ(${A / 2}px)`)}
          {face("fundo", L, P, `rotateX(-90deg) translateZ(${A / 2}px)`)}
        </div>
      </div>
      {aviso && <p className="text-[11px] text-[#6b6876] bg-white border border-[#e2e0e8] rounded-full px-3 py-1 mt-1 text-center">{AVISO_PREVIA}</p>}
    </div>
  )
}
