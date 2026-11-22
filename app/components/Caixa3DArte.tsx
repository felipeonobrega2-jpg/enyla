"use client"

// Caixa em 3D com a arte prévia em todas as faces (orçamento e proposta). Gira sozinha; arrastar com o dedo ou o
// mouse vira a caixa (e ela para de girar até você soltar).

import React, { useEffect, useRef, useState } from "react"
import { AVISO_PREVIA, type DimsCaixa, type FacesArte } from "../lib/artePrevia"

const dataUrl = (svg: string) => `url('data:image/svg+xml;base64,${typeof window === "undefined" ? "" : btoa(unescape(encodeURIComponent(svg)))}')`

export function Caixa3DArte({ faces, dims, tamanho = 260, aviso = true }: { faces: FacesArte; dims: DimsCaixa; tamanho?: number; aviso?: boolean }) {
  // Escala: a maior medida vira ~70% da área
  const k = tamanho * 0.7 / Math.max(dims.largura, dims.altura, dims.profundidade)
  const L = dims.largura * k, P = dims.profundidade * k, A = dims.altura * k
  const [ang, setAng] = useState({ x: -16, y: -32 })
  const arrastando = useRef<{ x: number; y: number; ax: number; ay: number } | null>(null)
  const [parada, setParada] = useState(false)
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => { setUrls(Object.fromEntries(Object.entries(faces).map(([f, s]) => [f, dataUrl(s)]))) }, [faces])
  useEffect(() => {
    if (parada) return
    let id = 0, antes = performance.now()
    const passo = (agora: number) => { setAng(a => ({ ...a, y: a.y + (agora - antes) * 0.03 })); antes = agora; id = requestAnimationFrame(passo) }
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) id = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(id)
  }, [parada])
  const face = (f: keyof FacesArte, w: number, h: number, transform: string) => (
    <div key={f} style={{ position: "absolute", width: w, height: h, left: -w / 2, top: -h / 2, transform, backgroundImage: urls[f], backgroundSize: "100% 100%",
      backfaceVisibility: "hidden", boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.08)" }} />
  )
  return (
    <div className="flex flex-col items-center select-none">
      <div style={{ width: tamanho, height: tamanho, perspective: tamanho * 4, touchAction: "none", cursor: arrastando.current ? "grabbing" : "grab" }}
        className="flex items-center justify-center"
        onPointerDown={e => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); arrastando.current = { x: e.clientX, y: e.clientY, ax: ang.x, ay: ang.y }; setParada(true) }}
        onPointerMove={e => { const a = arrastando.current; if (a) setAng({ x: Math.max(-70, Math.min(70, a.ax - (e.clientY - a.y) * 0.5)), y: a.ay + (e.clientX - a.x) * 0.6 }) }}
        onPointerUp={() => { arrastando.current = null; setTimeout(() => setParada(false), 2500) }}
        role="img" aria-label="Caixa em 3D com a arte prévia (arraste para girar)">
        <div style={{ position: "relative", width: 0, height: 0, transformStyle: "preserve-3d", transform: `rotateX(${ang.x}deg) rotateY(${ang.y}deg)` }}>
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
