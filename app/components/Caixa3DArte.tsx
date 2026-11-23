"use client"

// Caixa em 3D com a arte prévia em todas as faces (orçamento, lista e proposta), com cara de produto de verdade:
// luz que acompanha o giro (a face virada para a luz fica clara, as outras escurecem), brilho que passa pelo metal
// (hot stamping reluz; preto fosco continua fosco, pela mistura "overlay"), sombra no chão, palco e entrada.
// O giro automático é animação de CSS (leve: dá para ter várias na lista); arrastar assume o controle.

import React, { useEffect, useRef, useState } from "react"
import { AVISO_PREVIA, type DimsCaixa, type FacesArte } from "../lib/artePrevia"

const dataUrl = (svg: string) => `url('data:image/svg+xml;base64,${typeof window === "undefined" ? "" : btoa(unescape(encodeURIComponent(svg)))}')`

// Luz vinda da frente-esquerda, um pouco acima. Ângulo da face = ângulo dela na caixa + giro da caixa.
const LUZ = -38, MEIO = LUZ / 2   // MEIO: entre a luz e quem olha (onde o reflexo aparece)
const rad = (g: number) => g * Math.PI / 180
export const sombraDaFace = (angulo: number) => +((1 - Math.max(0, Math.cos(rad(angulo - LUZ)))) * 0.62).toFixed(3)
export const brilhoDaFace = (angulo: number) => +Math.pow(Math.max(0, Math.cos(rad(angulo - MEIO))), 18).toFixed(3)
const LATERAIS: { face: "frente" | "lateral_dir" | "verso" | "lateral_esq"; base: number }[] = [
  { face: "frente", base: 0 }, { face: "lateral_dir", base: 90 }, { face: "verso", base: 180 }, { face: "lateral_esq", base: 270 },
]
const GIRO_INICIAL = -32

// Quadros-chave sincronizados com o giro: a sombra e o brilho de cada face mudam com o ângulo dela
function cssDaLuz(): string {
  const passos = 36
  let css = ""
  for (const { face, base } of LATERAIS) {
    let s = "", b = ""
    for (let i = 0; i <= passos; i++) {
      const pct = (i / passos * 100).toFixed(2), ang = base + GIRO_INICIAL + i / passos * 360
      s += `${pct}%{opacity:${sombraDaFace(ang)}}`
      b += `${pct}%{opacity:${brilhoDaFace(ang)}}`
    }
    css += `@keyframes c3s-${face}{${s}}@keyframes c3b-${face}{${b}}`
    css += `.c3-gira .c3s-${face}{animation:c3s-${face} var(--volta,10s) linear infinite}.c3-gira .c3b-${face}{animation:c3b-${face} var(--volta,10s) linear infinite}`
  }
  return css
}
const CSS = `@keyframes caixa3d-gira{from{transform:rotateX(-16deg) rotateY(${GIRO_INICIAL}deg)}to{transform:rotateX(-16deg) rotateY(${GIRO_INICIAL + 360}deg)}}
.caixa3d-gira{animation:caixa3d-gira var(--volta,10s) linear infinite}
@keyframes caixa3d-entra{from{opacity:0;transform:translateY(14px) scale(.86)}to{opacity:1;transform:none}}
.caixa3d-entra{animation:caixa3d-entra .9s cubic-bezier(.2,.9,.25,1) both}
@keyframes caixa3d-sombra{0%,100%{transform:scaleX(1)}25%,75%{transform:scaleX(1.16)}50%{transform:scaleX(1)}}
.c3-gira .caixa3d-chao{animation:caixa3d-sombra calc(var(--volta,10s) / 2) ease-in-out infinite}
${cssDaLuz()}
@media (prefers-reduced-motion: reduce){.caixa3d-gira,.c3-gira *{animation:none!important}.caixa3d-gira{transform:rotateX(-16deg) rotateY(${GIRO_INICIAL}deg)}.caixa3d-entra{animation:none}}`

export function Caixa3DArte({ faces, dims, tamanho = 260, aviso = true, interativo = true, volta = 10, palco = false }: {
  faces: FacesArte; dims: DimsCaixa; tamanho?: number; aviso?: boolean; interativo?: boolean; volta?: number; palco?: boolean
}) {
  // Escala: a maior medida vira ~62% da área (sobra espaço para a sombra)
  const k = tamanho * 0.62 / Math.max(dims.largura, dims.altura, dims.profundidade)
  const L = dims.largura * k, P = dims.profundidade * k, A = dims.altura * k
  const detalhe = tamanho >= 100   // miniatura da lista: sem brilho (fica leve)
  const [manual, setManual] = useState<{ x: number; y: number } | null>(null)
  const arrastando = useRef<{ x: number; y: number; ax: number; ay: number } | null>(null)
  const volta_ = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => { setUrls(Object.fromEntries(Object.entries(faces).map(([f, s]) => [f, dataUrl(s)]))) }, [faces])
  useEffect(() => () => { if (volta_.current) clearTimeout(volta_.current) }, [])

  const camadas = (f: string, ang: number | null) => detalhe && (
    <>
      {/* sombra da face (luz do ambiente) */}
      <div className={`c3s-${f}`} style={{ position: "absolute", inset: 0, background: "#000", opacity: ang == null ? undefined : sombraDaFace(ang), pointerEvents: "none" }} />
      {/* reflexo: só o metal reluz (overlay quase não muda o preto fosco) */}
      <div className={`c3b-${f}`} style={{ position: "absolute", inset: 0, mixBlendMode: "overlay", pointerEvents: "none", opacity: ang == null ? undefined : brilhoDaFace(ang),
        background: "linear-gradient(112deg, rgba(255,255,255,0) 18%, rgba(255,255,255,.95) 46%, rgba(255,255,255,.35) 54%, rgba(255,255,255,0) 78%)" }} />
    </>
  )
  const face = (f: keyof FacesArte, w: number, h: number, transform: string, ang: number | null, extra?: React.ReactNode) => (
    <div key={f} style={{ position: "absolute", width: w, height: h, left: -w / 2, top: -h / 2, transform, backgroundImage: urls[f], backgroundSize: "100% 100%",
      backfaceVisibility: "hidden", overflow: "hidden", boxShadow: "inset 0 0 0 0.6px rgba(255,255,255,0.10), inset 0 0 6px rgba(0,0,0,0.25)" }}>
      {f === "tampa" || f === "fundo" ? extra : camadas(f, ang)}
    </div>
  )
  const angDe = (base: number) => manual ? base + manual.y : null
  return (
    <div className="flex flex-col items-center select-none">
      <style>{CSS}</style>
      <div className="caixa3d-entra" style={{ width: tamanho, height: tamanho, position: "relative", borderRadius: palco ? 18 : undefined,
        background: palco ? "radial-gradient(120% 90% at 50% 28%, #ffffff 0%, #f1eff6 45%, #dcd8e6 100%)" : undefined }}>
        {/* foco de luz atrás da caixa */}
        {palco && <div style={{ position: "absolute", left: "50%", top: "42%", width: tamanho * 0.9, height: tamanho * 0.9, transform: "translate(-50%,-50%)",
          background: "radial-gradient(circle, rgba(255,255,255,.9) 0%, rgba(255,255,255,0) 62%)", pointerEvents: "none" }} />}
        <div className={manual ? undefined : "c3-gira"} style={{ position: "absolute", inset: 0, ["--volta" as string]: `${volta}s` }}>
          {/* sombra no chão */}
          <div className="caixa3d-chao" style={{ position: "absolute", left: "50%", top: tamanho / 2 + A * 0.5 + tamanho * 0.035, width: Math.max(L, P) * 1.5, height: Math.max(8, tamanho * 0.07),
            marginLeft: -Math.max(L, P) * 0.75, borderRadius: "50%", background: "radial-gradient(ellipse at center, rgba(20,16,30,.42) 0%, rgba(20,16,30,0) 70%)",
            filter: `blur(${Math.max(2, tamanho * 0.018)}px)`, pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 0, perspective: tamanho * 4, touchAction: interativo ? "none" : undefined, cursor: interativo ? "grab" : undefined }}
            className="flex items-center justify-center"
            onPointerDown={interativo ? e => {
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
              if (volta_.current) clearTimeout(volta_.current)
              arrastando.current = { x: e.clientX, y: e.clientY, ax: manual?.x ?? -16, ay: manual?.y ?? GIRO_INICIAL }
              setManual({ x: manual?.x ?? -16, y: manual?.y ?? GIRO_INICIAL })
            } : undefined}
            onPointerMove={interativo ? e => { const a = arrastando.current; if (a) setManual({ x: Math.max(-70, Math.min(70, a.ax - (e.clientY - a.y) * 0.5)), y: a.ay + (e.clientX - a.x) * 0.6 }) } : undefined}
            onPointerUp={interativo ? () => { arrastando.current = null; volta_.current = setTimeout(() => setManual(null), 2500) } : undefined}
            role="img" aria-label={interativo ? "Caixa em 3D com a arte prévia (arraste para girar)" : "Caixa em 3D com a arte prévia"}>
            <div className={manual ? undefined : "caixa3d-gira"}
              style={{ position: "relative", width: 0, height: 0, transformStyle: "preserve-3d", ...(manual ? { transform: `rotateX(${manual.x}deg) rotateY(${manual.y}deg)` } : {}) }}>
              {face("frente", L, A, `translateZ(${P / 2}px)`, angDe(0))}
              {face("verso", L, A, `rotateY(180deg) translateZ(${P / 2}px)`, angDe(180))}
              {face("lateral_dir", P, A, `rotateY(90deg) translateZ(${L / 2}px)`, angDe(90))}
              {face("lateral_esq", P, A, `rotateY(-90deg) translateZ(${L / 2}px)`, angDe(270))}
              {face("tampa", L, P, `rotateX(90deg) translateZ(${A / 2}px)`, null,
                detalhe && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, rgba(255,255,255,.16), rgba(0,0,0,.18))", pointerEvents: "none" }} />)}
              {face("fundo", L, P, `rotateX(-90deg) translateZ(${A / 2}px)`, null, <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.55)" }} />)}
            </div>
          </div>
        </div>
      </div>
      {aviso && <p className="text-[11px] text-[#6b6876] bg-white border border-[#e2e0e8] rounded-full px-3 py-1 mt-2 text-center">{AVISO_PREVIA}</p>}
    </div>
  )
}
