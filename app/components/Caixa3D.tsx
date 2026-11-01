"use client"

// Caixa em 3D para o cliente: começa planificada (como a faca) e se monta; depois gira sozinha
// e responde ao dedo ou ao mouse. Mostra a arte na frente quando houver imagem; senão, a cor do material.

import { useEffect, useRef, useState } from "react"

type Props = {
  largura: number      // cm
  altura: number
  profundidade: number
  material?: string
  verniz?: boolean
  laminacao?: string | null
  arteUrl?: string | null
  tamanho?: number     // lado maior em px
}

function corDoMaterial(material = "") {
  const m = material.toLowerCase()
  if (/kraft/.test(m)) return { face: "#c9a477", lado: "#b8925f", escuro: "#9c7a4c" }
  if (/preto|black/.test(m)) return { face: "#2b2930", lado: "#232128", escuro: "#18171c" }
  return { face: "#fbfaff", lado: "#dedbea", escuro: "#c7c2d8" }
}

export function Caixa3D({ largura, altura, profundidade, material, verniz, laminacao, arteUrl, tamanho = 170 }: Props) {
  const [montada, setMontada] = useState(false)
  const [girando, setGirando] = useState(false)   // depois de montada, a rotação segue o quadro sem transição
  const [rot, setRot] = useState({ x: -14, y: 0 })
  const rotRef = useRef({ x: -14, y: 0 })
  const arrastando = useRef(false)
  const pausado = useRef(true)
  const ultimo = useRef({ x: 0, y: 0 })
  const retomar = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Monta depois de um instante; a rotação começa quando a caixa fecha
  useEffect(() => {
    const t1 = setTimeout(() => setMontada(true), 500)
    const t2 = setTimeout(() => { rotRef.current = { x: -22, y: 28 }; setRot(rotRef.current) }, 1900)
    const t3 = setTimeout(() => { setGirando(true); pausado.current = false }, 1900 + 1300)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  useEffect(() => {
    let raf = 0
    const passo = () => {
      if (!pausado.current && !arrastando.current) {
        rotRef.current = { ...rotRef.current, y: rotRef.current.y + 0.25 }
        setRot(rotRef.current)
      }
      raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [])

  const inicio = (e: React.PointerEvent) => {
    if (!girando) return
    arrastando.current = true
    ultimo.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    if (retomar.current) clearTimeout(retomar.current)
  }
  const mover = (e: React.PointerEvent) => {
    if (!arrastando.current) return
    const dx = e.clientX - ultimo.current.x, dy = e.clientY - ultimo.current.y
    ultimo.current = { x: e.clientX, y: e.clientY }
    rotRef.current = { x: Math.max(-70, Math.min(70, rotRef.current.x - dy * 0.5)), y: rotRef.current.y + dx * 0.5 }
    setRot(rotRef.current)
  }
  const fim = () => {
    arrastando.current = false
    retomar.current = setTimeout(() => { pausado.current = false }, 1500)
  }

  // Escala: lado maior da caixa = tamanho
  const maior = Math.max(largura, altura, profundidade, 0.1)
  const k = tamanho / maior
  const W = Math.max(largura * k, 12), H = Math.max(altura * k, 12), D = Math.max(profundidade * k, 8)
  const cor = corDoMaterial(material)
  const brilho = verniz || /brilh/i.test(laminacao ?? "")
  const luz = brilho ? "linear-gradient(135deg,rgba(255,255,255,0.55),rgba(255,255,255,0) 45%,rgba(255,255,255,0.18) 70%,rgba(255,255,255,0))" : "linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0) 60%)"
  const borda = "1px solid rgba(60,60,67,0.14)"

  // Cada face: posição fechada × planificada (mesma lista de transformações para animar suave)
  const face = (w: number, h: number, fechada: string, aberta: string, fundo: string, extra?: React.CSSProperties) => (
    <div style={{
      position: "absolute", left: -w / 2, top: -h / 2, width: w, height: h, border: borda, boxSizing: "border-box",
      background: fundo, transform: montada ? fechada : aberta, transition: "transform 1.3s cubic-bezier(.45,.05,.2,1)",
      backfaceVisibility: "hidden", ...extra,
    }}>
      <div style={{ position: "absolute", inset: 0, background: luz }} />
    </div>
  )
  const frente = arteUrl ? `center / cover no-repeat url("${arteUrl}"), ${cor.face}` : cor.face

  return (
    <div className="select-none touch-none" style={{ width: "100%", display: "flex", justifyContent: "center", position: "relative", background: "radial-gradient(ellipse at 50% 40%, #f4f2fb 0%, rgba(244,242,251,0) 70%)" }}
      onPointerDown={inicio} onPointerMove={mover} onPointerUp={fim} onPointerCancel={fim}>
      <div style={{ width: W + 2 * D + 60, height: H + 2 * D + 60, perspective: 900, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", cursor: montada ? "grab" : "default" }}>
        {/* Sombra no chão: aparece quando a caixa fecha */}
        <div style={{ position: "absolute", left: "50%", top: `calc(50% + ${H / 2 + 14}px)`, width: W * 1.3, height: 18, marginLeft: -W * 0.65, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(40,30,80,0.22), rgba(40,30,80,0) 70%)", opacity: montada ? 1 : 0, transition: "opacity 1.3s" }} />
        <div style={{
          position: "relative", width: 0, height: 0, transformStyle: "preserve-3d",
          transform: `rotateX(${montada ? rot.x : -8}deg) rotateY(${montada ? rot.y : 0}deg) scale(${montada ? 1 : 0.62})`,
          transition: montada && !girando ? "transform 1.3s cubic-bezier(.45,.05,.2,1)" : undefined,
        }}>
          {face(W, H, `translate3d(0,0,${D / 2}px) rotateY(0deg) rotateX(0deg)`, `translate3d(0,0,0) rotateY(0deg) rotateX(0deg)`, frente)}
          {face(D, H, `translate3d(${W / 2}px,0,0) rotateY(90deg) rotateX(0deg)`, `translate3d(${W / 2 + D / 2}px,0,0) rotateY(0deg) rotateX(0deg)`, cor.lado)}
          {face(D, H, `translate3d(${-W / 2}px,0,0) rotateY(-90deg) rotateX(0deg)`, `translate3d(${-W / 2 - D / 2}px,0,0) rotateY(0deg) rotateX(0deg)`, cor.lado)}
          {face(W, H, `translate3d(0,0,${-D / 2}px) rotateY(180deg) rotateX(0deg)`, `translate3d(${W / 2 + D + W / 2}px,0,0) rotateY(0deg) rotateX(0deg)`, cor.escuro)}
          {face(W, D, `translate3d(0,${-H / 2}px,0) rotateY(0deg) rotateX(90deg)`, `translate3d(0,${-H / 2 - D / 2}px,0) rotateY(0deg) rotateX(0deg)`, cor.face)}
          {face(W, D, `translate3d(0,${H / 2}px,0) rotateY(0deg) rotateX(-90deg)`, `translate3d(0,${H / 2 + D / 2}px,0) rotateY(0deg) rotateX(0deg)`, cor.escuro)}
        </div>
      </div>
    </div>
  )
}
