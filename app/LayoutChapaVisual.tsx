"use client"

import { useState, useRef } from "react"
import { LayoutChapa } from "./types"
import { calcularLayoutChapa } from "./calculos"
import { FORMATOS_PAPEL } from "./dados"

type DielineInfo = {
  largura: number; altura: number
  abaColagem: number; abaSuperior: number; abaInferior: number
}
type FormInfo = { frente: number; lateral: number; alturaBox: number }

type Props = {
  layout: LayoutChapa
  dieline: DielineInfo
  formData: FormInfo
  customPecas: number | null
  onCustomPecas: (n: number | null) => void
}

type Piece = {
  id: number
  x: number      // mm from sheet left (top-left of piece)
  y: number      // mm from sheet top
  rotated: boolean
}

const CANVAS_W = 780
const CANVAS_H = 520
const PAD = 28

function makePieces(layout: LayoutChapa): Piece[] {
  const { colunas, linhas, larguraDieline, alturaDieline, rotacionada } = layout
  const out: Piece[] = []
  let id = 0
  for (let row = 0; row < linhas; row++)
    for (let col = 0; col < colunas; col++)
      out.push({ id: id++, x: col * larguraDieline, y: row * alturaDieline, rotated: rotacionada })
  return out
}

function findFmtId(layout: LayoutChapa) {
  return FORMATOS_PAPEL.find(
    f => f.larguraChapa === layout.larguraChapa && f.alturaChapa === layout.alturaChapa
  )?.id ?? FORMATOS_PAPEL[0].id
}

export default function LayoutChapaVisual({ layout: initLayout, dieline, formData, customPecas, onCustomPecas }: Props) {
  const [fmtId, setFmtId]       = useState(() => findFmtId(initLayout))
  const [layout, setLayout]     = useState(initLayout)
  const [pieces, setPieces]     = useState<Piece[]>(() => makePieces(initLayout))
  const [selected, setSelected] = useState<number | null>(null)
  const [inputVal, setInputVal] = useState(customPecas !== null ? String(customPecas) : "")
  const dragRef = useRef<{ id: number; ox: number; oy: number } | null>(null)
  const svgRef  = useRef<SVGSVGElement>(null)

  const { larguraChapa: cW, alturaChapa: cH } = layout

  // Dimensões naturais da dieline em mm (invariantes — não dependem da rotação do layout)
  const dielineW = dieline.largura   // mm
  const dielineH = dieline.altura    // mm

  const scale = Math.min((CANVAS_W - PAD * 2) / cW, (CANVAS_H - PAD * 2) / cH)
  const svgW  = cW * scale + PAD * 2
  const svgH  = cH * scale + PAD * 2 + 34

  function toSheet(e: React.PointerEvent) {
    const svgEl = svgRef.current!
    const pt    = svgEl.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(svgEl.getScreenCTM()!.inverse())
    return { x: (p.x - PAD) / scale, y: (p.y - PAD) / scale }
  }

  // Retornam dimensões em mm (não em px)
  function pWmm(p: Piece) { return p.rotated ? dielineH : dielineW }
  function pHmm(p: Piece) { return p.rotated ? dielineW : dielineH }

  function applyCustomPecas(nl: LayoutChapa, n: number | null) {
    const all = makePieces(nl)
    if (n !== null && n > 0 && n <= nl.pecasPorChapa) {
      setPieces(all.slice(0, n))
    } else {
      setPieces(all)
    }
  }

  function handleInput(raw: string) {
    setInputVal(raw)
    if (raw === "") {
      onCustomPecas(null)
      setPieces(makePieces(layout))
      return
    }
    const n = parseInt(raw, 10)
    if (isNaN(n) || n <= 0) return
    onCustomPecas(n)
    if (n <= layout.pecasPorChapa) {
      setPieces(makePieces(layout).slice(0, n))
    }
  }

  function changeFormat(id: string) {
    const fmt = FORMATOS_PAPEL.find(f => f.id === id)!
    const nl  = calcularLayoutChapa({ largura: dieline.largura, altura: dieline.altura }, fmt)
    setFmtId(id); setLayout(nl); applyCustomPecas(nl, customPecas); setSelected(null)
  }

  function reset() {
    setInputVal("")
    onCustomPecas(null)
    setPieces(makePieces(layout))
    setSelected(null)
  }

  function onPieceDown(e: React.PointerEvent<SVGGElement>, id: number) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const pt = toSheet(e)
    const p  = pieces.find(p => p.id === id)!
    dragRef.current = { id, ox: pt.x - p.x, oy: pt.y - p.y }
    setSelected(id)
    // bring selected to front
    setPieces(prev => {
      const piece = prev.find(p => p.id === id)!
      return [...prev.filter(p => p.id !== id), piece]
    })
  }

  function onSvgMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    const pt = toSheet(e)
    setPieces(prev => prev.map(p => {
      if (p.id !== d.id) return p
      return {
        ...p,
        x: Math.max(0, Math.min(cW - pWmm(p), pt.x - d.ox)),
        y: Math.max(0, Math.min(cH - pHmm(p), pt.y - d.oy)),
      }
    }))
  }

  function onSvgUp() { dragRef.current = null }

  function rotatePiece(id: number) {
    setPieces(prev => prev.map(p => {
      if (p.id !== id) return p
      const nr = !p.rotated
      const newW = nr ? dielineH : dielineW  // mm
      const newH = nr ? dielineW : dielineH  // mm
      return {
        ...p,
        rotated: nr,
        x: Math.min(p.x, Math.max(0, cW - newW)),
        y: Math.min(p.y, Math.max(0, cH - newH)),
      }
    }))
  }

  function removePiece(id: number) {
    setPieces(prev => prev.filter(p => p.id !== id))
    setSelected(null)
  }

  const selPiece = pieces.find(p => p.id === selected) ?? null

  return (
    <div>
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="text-xs text-slate-400 font-medium shrink-0">Formato:</span>

        <div className="flex rounded-lg border border-slate-200 overflow-hidden shrink-0">
          {FORMATOS_PAPEL.map(f => {
            const nl    = calcularLayoutChapa({ largura: dieline.largura, altura: dieline.altura }, f)
            const pecas = nl.pecasPorChapa
            return (
              <button key={f.id} type="button" onClick={() => changeFormat(f.id)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-slate-200 last:border-0 ${
                  fmtId === f.id ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"
                }`}>
                {f.nome}
                <span className={`ml-1.5 text-[10px] ${fmtId === f.id ? "text-slate-300" : "text-slate-400"}`}>
                  {pecas}p
                </span>
              </button>
            )
          })}
        </div>

        <button onClick={reset}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
          Resetar
        </button>

        {/* Input: peças por chapa */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <label className="text-xs text-slate-500 font-medium whitespace-nowrap">Peças por chapa:</label>
          <input
            type="number"
            min={1}
            max={layout.pecasPorChapa}
            value={inputVal}
            onChange={e => handleInput(e.target.value)}
            placeholder={String(layout.pecasPorChapa)}
            className={`w-16 border rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:border-transparent transition
              ${customPecas !== null && customPecas > layout.pecasPorChapa
                ? "border-rose-300 focus:ring-rose-400 bg-rose-50 text-rose-700"
                : "border-slate-200 focus:ring-violet-500"
              }`}
          />
          {customPecas !== null && customPecas > layout.pecasPorChapa ? (
            <span className="text-[11px] text-rose-600 font-medium whitespace-nowrap">
              Não cabe — máx. {layout.pecasPorChapa}
            </span>
          ) : customPecas !== null && customPecas > 0 ? (
            <span className="text-[11px] text-emerald-600 font-medium whitespace-nowrap">
              ✓ {customPecas} de {layout.pecasPorChapa}
            </span>
          ) : (
            <span className="text-[11px] text-slate-400 hidden sm:block whitespace-nowrap">
              máx. {layout.pecasPorChapa}
            </span>
          )}
        </div>
      </div>

      {/* ── SVG Canvas ───────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <svg
          ref={svgRef}
          width={svgW} height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="block mx-auto select-none"
          onPointerMove={onSvgMove}
          onPointerUp={onSvgUp}
          onPointerLeave={onSvgUp}
          onClick={() => setSelected(null)}
        >
          {/* Sheet */}
          <rect x={PAD} y={PAD} width={cW * scale} height={cH * scale}
            fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} rx={2} />

          {/* Pieces — selected always last (rendered on top) */}
          {[...pieces.filter(p => p.id !== selected), ...pieces.filter(p => p.id === selected)].map(p => (
            <PieceSVG
              key={p.id}
              id={p.id}
              px={PAD + p.x * scale}
              py={PAD + p.y * scale}
              dW={(p.rotated ? dielineH : dielineW) * scale}
              dH={(p.rotated ? dielineW : dielineH) * scale}
              origW={dielineW * scale}
              origH={dielineH * scale}
              scale={scale}
              dieline={dieline}
              formData={formData}
              rotated={p.rotated}
              isSelected={p.id === selected}
              onPointerDown={e => onPieceDown(e, p.id)}
              onRotate={e => { e.stopPropagation(); rotatePiece(p.id) }}
            />
          ))}

          {/* Footer */}
          <text
            x={PAD + (cW * scale) / 2}
            y={PAD + cH * scale + 20}
            textAnchor="middle" fontSize={11} fill="#475569" fontWeight={600}
          >
            {`${(cW / 10).toFixed(0)} × ${(cH / 10).toFixed(0)} cm  ·  ${pieces.length} peça${pieces.length !== 1 ? "s" : ""}`}
          </text>
        </svg>
      </div>

      {/* ── Selected piece actions ────────────────────────────────────── */}
      {selPiece ? (
        <div className="flex items-center gap-2 mt-2.5">
          <span className="text-[11px] text-slate-400 font-medium">Peça selecionada:</span>
          <button onClick={() => rotatePiece(selPiece.id)}
            className="text-xs px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors font-medium text-slate-700">
            ↻ Girar 90°
          </button>
          <button onClick={() => removePiece(selPiece.id)}
            className="text-xs px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors font-medium">
            × Remover
          </button>
          <button onClick={() => setSelected(null)}
            className="text-xs px-2.5 py-1.5 text-slate-400 hover:text-slate-600 transition-colors">
            Desmarcar
          </button>
        </div>
      ) : (
        <div className="flex gap-5 mt-2.5 pt-2 border-t border-slate-50 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-px bg-violet-700 block" /> corte
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 border-t border-dashed border-red-500 block" /> vinco
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Individual piece renderer ────────────────────────────────────────────────

type PieceSVGProps = {
  id: number
  px: number; py: number
  dW: number; dH: number
  origW: number; origH: number
  scale: number
  dieline: DielineInfo
  formData: FormInfo
  rotated: boolean
  isSelected: boolean
  onPointerDown: (e: React.PointerEvent<SVGGElement>) => void
  onRotate: (e: React.MouseEvent) => void
}

function PieceSVG({
  id, px, py, dW, dH, origW, origH, scale: s,
  dieline, formData, rotated, isSelected,
  onPointerDown, onRotate,
}: PieceSVGProps) {
  const { abaColagem: ac, abaSuperior: sup } = dieline
  const { frente: fr, lateral: lat, alturaBox: alt } = formData

  // ── Panel boundaries (SVG px) ─────────────────────────────────────
  // Layout: [glue | back | left-side | front | right-side]
  const X1 = ac * s                        // glue ↔ back
  const X2 = (ac + fr) * s                 // back ↔ left-side
  const X3 = (ac + fr + lat) * s           // left-side ↔ front
  const X4 = (ac + 2 * fr + lat) * s       // front ↔ right-side

  // ── Zone boundaries ──────────────────────────────────────────────
  const Y1   = sup * s                     // top fold line
  const Y2   = (sup + alt) * s             // bottom fold line
  const supH = Y1                          // top flap zone height
  const infH = origH - Y2                  // bottom flap zone height
  const tw   = X4 - X3                     // front/back panel width
  const lw   = X3 - X2                     // side panel width

  // ── Strokes ───────────────────────────────────────────────────────
  const sw    = Math.max(0.7, s * 0.065)
  const fw    = Math.max(0.5, s * 0.050)
  const fDash = `${s * 2.5} ${s * 1.2}`
  const CUT   = "#5009c4"
  const FOLD  = "#dc2626"

  // ── Fills ─────────────────────────────────────────────────────────
  const bodyFill = isSelected ? "#eae1f7" : "#f8fafc"
  const sideFill = isSelected ? "#eae1f7" : "#f1f5f9"
  const flapFill = isSelected ? "#d3c1f0" : "#e8f0fe"
  const glueFill = "#dde3ec"

  // ── Top tuck flap — bezier arch (front panel) ─────────────────────
  const pathTuckTop = [
    `M ${X3},${Y1}`,
    `L ${X3},${Y1 - supH * 0.55}`,
    `C ${X3},${Y1 - supH * 0.98} ${X3 + tw * 0.15},${Y1 - supH} ${X3 + tw / 2},${Y1 - supH}`,
    `C ${X4 - tw * 0.15},${Y1 - supH} ${X4},${Y1 - supH * 0.98} ${X4},${Y1 - supH * 0.55}`,
    `L ${X4},${Y1} Z`,
  ].join(" ")

  // ── Bottom tuck flap — inset arch (front panel) ───────────────────
  const bi = Math.min(tw * 0.10, 5 * s)    // bottom tuck inset
  const pathTuckBot = [
    `M ${X3 + bi},${Y2}`,
    `L ${X3 + bi},${Y2 + infH * 0.60}`,
    `C ${X3 + bi},${Y2 + infH * 0.96} ${X3 + tw * 0.2},${Y2 + infH} ${X3 + tw / 2},${Y2 + infH}`,
    `C ${X4 - tw * 0.2},${Y2 + infH} ${X4 - bi},${Y2 + infH * 0.96} ${X4 - bi},${Y2 + infH * 0.60}`,
    `L ${X4 - bi},${Y2} Z`,
  ].join(" ")

  // ── Dust flaps — trapezoid (angled corners) ───────────────────────
  const dustTopH = supH * 0.52
  const dustBotH = infH * 0.52
  const da = Math.min(lw * 0.20, dustTopH * 0.28)  // corner angle cut

  const pathDustTopL = `M ${X2},${Y1} L ${X2 + da},${Y1 - dustTopH} L ${X3 - da},${Y1 - dustTopH} L ${X3},${Y1} Z`
  const pathDustTopR = `M ${X4},${Y1} L ${X4 + da},${Y1 - dustTopH} L ${origW - da},${Y1 - dustTopH} L ${origW},${Y1} Z`
  const pathDustBotL = `M ${X2},${Y2} L ${X2 + da},${Y2 + dustBotH} L ${X3 - da},${Y2 + dustBotH} L ${X3},${Y2} Z`
  const pathDustBotR = `M ${X4},${Y2} L ${X4 + da},${Y2 + dustBotH} L ${origW - da},${Y2 + dustBotH} L ${origW},${Y2} Z`

  // ── Back flaps (rectangular, slightly shorter than tuck) ──────────
  const backTopH = supH * 0.88
  const backBotH = infH * 0.88

  // ── Glue flap (tapered trapezoid) ────────────────────────────────
  const gt = Math.min(X1 * 0.15, 3 * s)
  const pathGlue = [
    `M ${gt},${Y1}`,
    `L 0,${Y1 + (Y2 - Y1) * 0.12}`,
    `L 0,${Y2 - (Y2 - Y1) * 0.12}`,
    `L ${gt},${Y2}`,
    `L ${X1},${Y2} L ${X1},${Y1} Z`,
  ].join(" ")

  // ── Rotation transform (90° CW) ──────────────────────────────────
  const innerTransform = rotated
    ? `translate(${px + dW},${py}) rotate(90)`
    : `translate(${px},${py})`

  const clipId = `clip-${id}`
  const btnR   = Math.max(8, Math.min(dW, dH) * 0.095)
  const btnFS  = Math.max(9, btnR * 1.1)
  const cx     = px + dW / 2
  const cy     = py + dH / 2

  return (
    <g onPointerDown={onPointerDown} style={{ cursor: "grab" }}>

      {/* Selection ring */}
      {isSelected && (
        <rect x={px - 2} y={py - 2} width={dW + 4} height={dH + 4}
          fill="none" stroke="#5009c4" strokeWidth={2} rx={3}
          strokeDasharray="6 3" />
      )}

      <defs>
        <clipPath id={clipId}>
          <rect x={px} y={py} width={dW} height={dH} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <g transform={innerTransform}>

          {/* ── GLUE FLAP ─────────────────────────────── */}
          <path d={pathGlue} fill={glueFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />

          {/* ── BODY — 4 main panels ──────────────────── */}
          <rect x={X1} y={Y1} width={X2 - X1} height={Y2 - Y1} fill={bodyFill} stroke={CUT} strokeWidth={sw} />
          <rect x={X2} y={Y1} width={X3 - X2} height={Y2 - Y1} fill={sideFill} stroke={CUT} strokeWidth={sw} />
          <rect x={X3} y={Y1} width={X4 - X3} height={Y2 - Y1} fill={bodyFill} stroke={CUT} strokeWidth={sw} />
          <rect x={X4} y={Y1} width={origW - X4} height={Y2 - Y1} fill={sideFill} stroke={CUT} strokeWidth={sw} />

          {/* ── TOP FLAPS ─────────────────────────────── */}
          {/* Back top (rect) */}
          <rect x={X1} y={Y1 - backTopH} width={X2 - X1} height={backTopH} fill={flapFill} stroke={CUT} strokeWidth={sw} />
          {/* Left side top dust (trapezoid) */}
          <path d={pathDustTopL} fill={flapFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />
          {/* Front tuck top (bezier arch) */}
          <path d={pathTuckTop} fill={flapFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />
          {/* Right side top dust (trapezoid) */}
          <path d={pathDustTopR} fill={flapFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />

          {/* ── BOTTOM FLAPS ──────────────────────────── */}
          {/* Back bottom (rect) */}
          <rect x={X1} y={Y2} width={X2 - X1} height={backBotH} fill={flapFill} stroke={CUT} strokeWidth={sw} />
          {/* Left side bottom dust (trapezoid) */}
          <path d={pathDustBotL} fill={flapFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />
          {/* Front tuck bottom (narrower arch) */}
          <path d={pathTuckBot} fill={flapFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />
          {/* Right side bottom dust (trapezoid) */}
          <path d={pathDustBotR} fill={flapFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />

          {/* ── FOLD LINES — vertical ─────────────────── */}
          {[X1, X2, X3, X4].map((x, i) => (
            <line key={i} x1={x} y1={0} x2={x} y2={origH}
              stroke={FOLD} strokeWidth={fw} strokeDasharray={fDash} />
          ))}

          {/* ── FOLD LINES — horizontal ───────────────── */}
          <line x1={0} y1={Y1} x2={origW} y2={Y1} stroke={FOLD} strokeWidth={fw} strokeDasharray={fDash} />
          <line x1={0} y1={Y2} x2={origW} y2={Y2} stroke={FOLD} strokeWidth={fw} strokeDasharray={fDash} />

        </g>
      </g>

      {/* Rotate button — outside clip, always visible */}
      <g onClick={onRotate} style={{ cursor: "pointer" }}>
        <circle cx={cx} cy={cy} r={btnR}
          fill="rgba(255,255,255,0.90)"
          stroke={isSelected ? "#5009c4" : "#64748b"}
          strokeWidth={isSelected ? 1.5 : 0.8}
        />
        <text x={cx} y={cy}
          textAnchor="middle" dominantBaseline="central"
          fontSize={btnFS} fill={isSelected ? "#5009c4" : "#334155"}
          style={{ userSelect: "none" }}>
          ↻
        </text>
      </g>

    </g>
  )
}
