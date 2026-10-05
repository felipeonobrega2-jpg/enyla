"use client"

import { useState, useRef, useEffect } from "react"
import { LayoutChapa, TipoCaixa } from "./types"
import { parseDXF } from "./lib/dxf"
import type { DXFPaths, DXFResult } from "./lib/dxf"
import { calcularLayoutChapa } from "./calculos"
import { FORMATOS_PAPEL } from "./dados"

// ── Types ─────────────────────────────────────────────────────────────────────

type DielineInfo = {
  largura: number; altura: number
  abaColagem: number; abaSuperior: number; abaInferior: number
  tipoCaixa?: TipoCaixa
}
type FormInfo = { frente: number; lateral: number; alturaBox: number }

export type DXFGeo = {
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  paths: DXFPaths
}

// Produto extra na chapa (chapa compartilhada)
type Product = {
  id: number
  label: string
  largura: number  // mm
  altura: number   // mm
  dxfGeo?: DXFGeo
}

type Piece = {
  id: number
  x: number         // mm from sheet left
  y: number         // mm from sheet top
  rotated: boolean
  flipped: boolean  // vertical mirror (inverte abas superior/inferior)
  productId: number // 0 = produto principal
}

type Props = {
  layout: LayoutChapa
  dieline: DielineInfo
  formData: FormInfo
  customPecas: number | null
  onCustomPecas: (n: number | null) => void
  dielineGeo?: DXFGeo | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_W = 780
const CANVAS_H = 520
const PAD = 28

const PROD_COLORS = ["#8456e8", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"]
function prodColor(id: number) { return PROD_COLORS[id % PROD_COLORS.length] }

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePieces(layout: LayoutChapa, productId = 0, idStart = 0): Piece[] {
  const { colunas, linhas, larguraDieline, alturaDieline, rotacionada } = layout
  const out: Piece[] = []
  let id = idStart
  for (let row = 0; row < linhas; row++)
    for (let col = 0; col < colunas; col++)
      out.push({ id: id++, x: col * larguraDieline, y: row * alturaDieline, rotated: rotacionada, flipped: false, productId })
  return out
}

function findFmtId(layout: LayoutChapa) {
  return FORMATOS_PAPEL.find(
    f => f.larguraChapa === layout.larguraChapa && f.alturaChapa === layout.alturaChapa
  )?.id ?? FORMATOS_PAPEL[0].id
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LayoutChapaVisual({
  layout: initLayout, dieline, formData, customPecas, onCustomPecas, dielineGeo,
}: Props) {
  const dielineW = dieline.largura
  const dielineH = dieline.altura

  const [fmtId, setFmtId]   = useState(() => findFmtId(initLayout))
  const [layout, setLayout] = useState(initLayout)
  const [pieces, setPieces] = useState<Piece[]>(() => makePieces(initLayout))
  const [selected, setSelected] = useState<number | null>(null)
  const [inputVal, setInputVal] = useState(customPecas !== null ? String(customPecas) : "")
  const [nextId, setNextId] = useState(() => makePieces(initLayout).length)

  // Multi-produto (chapa compartilhada)
  const [products, setProducts] = useState<Product[]>([
    { id: 0, label: "Principal", largura: dielineW, altura: dielineH },
  ])
  const [nextProdId, setNextProdId] = useState(1)
  const [addPanel, setAddPanel]     = useState(false)
  const [newProd, setNewProd]       = useState({ label: "", largura: "", altura: "", qty: "1" })
  const [newProdDxf, setNewProdDxf] = useState<DXFResult | null>(null)
  const [dxfLoading, setDxfLoading] = useState(false)
  const [clipboard, setClipboard] = useState<{ productId: number; rotated: boolean; flipped: boolean } | null>(null)

  const dxfInputRef   = useRef<HTMLInputElement>(null)
  const dragRef       = useRef<{ id: number; ox: number; oy: number; startX: number; startY: number } | null>(null)
  const svgRef        = useRef<SVGSVGElement>(null)
  const keyHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null)

  const { larguraChapa: cW, alturaChapa: cH } = layout
  const scale = Math.min((CANVAS_W - PAD * 2) / cW, (CANVAS_H - PAD * 2) / cH)
  const svgW  = cW * scale + PAD * 2
  const svgH  = cH * scale + PAD * 2 + 34

  // ── Product dimension helpers ──────────────────────────────────────────────

  function getProd(p: Piece): Product {
    return products.find(pr => pr.id === p.productId) ?? products[0]
  }
  function pWmm(p: Piece) { const pr = getProd(p); return p.rotated ? pr.altura : pr.largura }
  function pHmm(p: Piece) { const pr = getProd(p); return p.rotated ? pr.largura : pr.altura }

  // ── SVG coordinate helper ──────────────────────────────────────────────────

  function toSheet(e: React.PointerEvent) {
    const svgEl = svgRef.current!
    const pt = svgEl.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(svgEl.getScreenCTM()!.inverse())
    return { x: (p.x - PAD) / scale, y: (p.y - PAD) / scale }
  }

  // ── Toolbar actions ────────────────────────────────────────────────────────

  function applyCustomPecas(nl: LayoutChapa, n: number | null) {
    const all = makePieces(nl)
    setPieces(n !== null && n > 0 && n <= nl.pecasPorChapa ? all.slice(0, n) : all)
    setNextId(all.length)
  }

  function handleInput(raw: string) {
    setInputVal(raw)
    if (raw === "") { onCustomPecas(null); setPieces(makePieces(layout)); return }
    const n = parseInt(raw, 10)
    if (isNaN(n) || n <= 0) return
    onCustomPecas(n)
    if (n <= layout.pecasPorChapa) setPieces(makePieces(layout).slice(0, n))
  }

  function changeFormat(id: string) {
    const fmt = FORMATOS_PAPEL.find(f => f.id === id)!
    const nl  = calcularLayoutChapa({ largura: dieline.largura, altura: dieline.altura }, fmt)

    // Gera novas peças principais com IDs acima dos extras existentes (evita colisão de IDs)
    const principals = makePieces(nl, 0, nextId)
    const displayed  = customPecas !== null && customPecas > 0 && customPecas <= nl.pecasPorChapa
      ? principals.slice(0, customPecas)
      : principals

    setFmtId(id)
    setLayout(nl)
    setSelected(null)
    setPieces(prev => {
      // Mantém extras, apenas restringe posição ao novo tamanho de chapa
      const extras = prev.filter(p => p.productId !== 0).map(p => {
        const pr = products.find(pr => pr.id === p.productId) ?? products[0]
        const w = p.rotated ? pr.altura : pr.largura
        const h = p.rotated ? pr.largura : pr.altura
        return { ...p, x: Math.max(0, Math.min(nl.larguraChapa - w, p.x)), y: Math.max(0, Math.min(nl.alturaChapa - h, p.y)) }
      })
      return [...displayed, ...extras]
    })
    setNextId(nextId + nl.pecasPorChapa)
  }

  // Resetar = layout original do produto principal
  function reset() {
    setInputVal(""); onCustomPecas(null)
    const inicial = makePieces(layout)
    setPieces(inicial); setNextId(inicial.length)
    setSelected(null)
    setProducts([{ id: 0, label: "Principal", largura: dielineW, altura: dielineH }])
    setNextProdId(1)
    setAddPanel(false)
    setNewProdDxf(null)
  }

  // Zerar = remove tudo da chapa
  function zerarChapa() {
    setPieces([]); setSelected(null)
  }

  // Só 1 = mantém apenas a primeira peça
  function soUm() {
    setPieces(prev => prev.length > 0 ? [{ ...prev[0] }] : [])
    setSelected(null)
  }

  // Girar tudo = inverte orientação de todas as peças
  function girarTudo() {
    setPieces(prev => prev.map(p => {
      const pr = getProd(p)
      const nr = !p.rotated
      const afterW = nr ? pr.altura : pr.largura
      const afterH = nr ? pr.largura : pr.altura
      return {
        ...p, rotated: nr,
        x: Math.min(p.x, Math.max(0, cW - afterW)),
        y: Math.min(p.y, Math.max(0, cH - afterH)),
      }
    }))
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  function onPieceDown(e: React.PointerEvent<SVGGElement>, id: number) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const pt = toSheet(e)
    const p  = pieces.find(p => p.id === id)!
    dragRef.current = { id, ox: pt.x - p.x, oy: pt.y - p.y, startX: p.x, startY: p.y }
    setSelected(id)
    setPieces(prev => {
      const piece = prev.find(p => p.id === id)!
      return [...prev.filter(p => p.id !== id), piece]
    })
  }

  function onSvgMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    const pt  = toSheet(e)
    const rawX = pt.x - d.ox
    const rawY = pt.y - d.oy
    const dx   = rawX - d.startX
    const dy   = rawY - d.startY
    const lockH = e.shiftKey && Math.abs(dx) >= Math.abs(dy)
    const lockV = e.shiftKey && Math.abs(dy) >  Math.abs(dx)
    setPieces(prev => prev.map(p => {
      if (p.id !== d.id) return p
      const nx = lockV ? d.startX : Math.max(0, Math.min(cW - pWmm(p), rawX))
      const ny = lockH ? d.startY : Math.max(0, Math.min(cH - pHmm(p), rawY))
      return { ...p, x: nx, y: ny }
    }))
  }

  function onSvgUp() { dragRef.current = null }

  function rotatePiece(id: number) {
    setPieces(prev => prev.map(p => {
      if (p.id !== id) return p
      const pr = getProd(p)
      const nr = !p.rotated
      const newW = nr ? pr.altura : pr.largura
      const newH = nr ? pr.largura : pr.altura
      return { ...p, rotated: nr, x: Math.min(p.x, Math.max(0, cW - newW)), y: Math.min(p.y, Math.max(0, cH - newH)) }
    }))
  }

  function flipPiece(id: number) {
    setPieces(prev => prev.map(p => p.id === id ? { ...p, flipped: !p.flipped } : p))
  }

  function removePiece(id: number) {
    setPieces(prev => prev.filter(p => p.id !== id))
    setSelected(null)
  }

  // ── Lê DXF do produto extra ───────────────────────────────────────────────

  function handleDxfFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setDxfLoading(true)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const raw    = ev.target?.result as string
        const result = parseDXF(raw)
        if (!result) throw new Error("DXF inválido")
        setNewProdDxf(result)
        setNewProd(p => ({
          ...p,
          largura: (result.largura / 10).toFixed(1),
          altura:  (result.altura  / 10).toFixed(1),
          label:   p.label || file.name.replace(/\.[^.]+$/, ""),
        }))
      } catch {
        alert("Não foi possível ler o DXF. Verifique o arquivo.")
      } finally {
        setDxfLoading(false)
        if (dxfInputRef.current) dxfInputRef.current.value = ""
      }
    }
    reader.readAsText(file)
  }

  // ── Adicionar produto à chapa compartilhada ────────────────────────────────

  function handleAddProduct() {
    const L   = parseFloat(newProd.largura.replace(",", ".")) * 10
    const H   = parseFloat(newProd.altura.replace(",", ".")) * 10
    const qty = Math.max(1, parseInt(newProd.qty, 10) || 1)
    if (!L || !H || isNaN(L) || isNaN(H)) return

    const dxfGeo: DXFGeo | undefined = newProdDxf
      ? { bounds: newProdDxf.bounds, paths: newProdDxf.paths }
      : undefined

    const prod: Product = {
      id: nextProdId,
      label: newProd.label.trim() || `Produto ${nextProdId + 1}`,
      largura: L,
      altura: H,
      dxfGeo,
    }
    setProducts(prev => [...prev, prod])
    setNewProdDxf(null)

    // Colocar peças do novo produto no topo esquerdo, um ao lado do outro
    let idCounter = nextId
    const extras: Piece[] = []
    for (let i = 0; i < qty; i++) {
      const xPos = Math.min(i * L, cW - L)
      extras.push({ id: idCounter++, x: Math.max(0, xPos), y: 0, rotated: false, flipped: false, productId: nextProdId })
    }
    setPieces(prev => [...prev, ...extras])
    setNextId(idCounter)
    setNextProdId(n => n + 1)
    setNewProd({ label: "", largura: "", altura: "", qty: "1" })
    setAddPanel(false)
  }

  // ── Ctrl+C / Ctrl+V ───────────────────────────────────────────────────────

  // Keep handler ref current without re-registering the listener on every render
  useEffect(() => {
    keyHandlerRef.current = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key === "c") {
        const p = pieces.find(p => p.id === selected)
        if (p) setClipboard({ productId: p.productId, rotated: p.rotated, flipped: p.flipped })
        return
      }

      if (mod && e.key === "v" && clipboard) {
        const pr    = products.find(pr => pr.id === clipboard.productId) ?? products[0]
        const w     = clipboard.rotated ? pr.altura : pr.largura
        const h     = clipboard.rotated ? pr.largura : pr.altura
        const orig  = pieces.find(p => p.id === selected)
        const baseX = orig ? orig.x + 10 : 0
        const baseY = orig ? orig.y + 10 : 0

        setNextId(curId => {
          setPieces(prev => [
            ...prev,
            {
              id: curId,
              x: Math.max(0, Math.min(cW - w, baseX)),
              y: Math.max(0, Math.min(cH - h, baseY)),
              rotated: clipboard.rotated,
              flipped: clipboard.flipped,
              productId: clipboard.productId,
            },
          ])
          setSelected(curId)
          return curId + 1
        })
      }
    }
  })

  // Register once
  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyHandlerRef.current?.(e)
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  // ── Derived ────────────────────────────────────────────────────────────────

  const selPiece = pieces.find(p => p.id === selected) ?? null
  const hasMultiProduct = products.length > 1

  // Área usada por produto (para resumo)
  const prodStats = products.map(prod => {
    const count = pieces.filter(p => p.productId === prod.id).length
    const area  = count * prod.largura * prod.altura
    const pct   = Math.round(area / (cW * cH) * 100)
    return { ...prod, count, pct }
  })
  const totalPct = prodStats.reduce((s, p) => s + p.pct, 0)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Toolbar principal ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">

        {/* Formato selector */}
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
                <span className={`ml-1.5 text-[10px] ${fmtId === f.id ? "text-slate-300" : "text-slate-400"}`}>{pecas}p</span>
              </button>
            )
          })}
        </div>

        {/* ─ Ações de chapa ─ */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={reset} title="Restaura layout original"
            className="text-[11.5px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors font-medium">
            ↺ Resetar
          </button>
          <button onClick={zerarChapa} title="Remove todas as peças da chapa"
            className="text-[11.5px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors font-medium">
            Zerar chapa
          </button>
          <button onClick={soUm} title="Mantém apenas 1 peça"
            className="text-[11.5px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors font-medium">
            Só 1
          </button>
          <button onClick={girarTudo} title="Rotaciona todas as peças 90°"
            className="text-[11.5px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors font-medium">
            ↻ Girar tudo
          </button>
          <button onClick={() => setAddPanel(v => !v)}
            className={`text-[11.5px] px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${
              addPanel
                ? "border-[#8456e8]/30 bg-[#8456e8]/5 text-[#8456e8]"
                : "border-slate-200 text-slate-500 hover:bg-violet-50 hover:text-[#8456e8] hover:border-violet-200"
            }`}>
            + Produto
          </button>
        </div>

        {/* Peças por chapa */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <label className="text-xs text-slate-500 font-medium whitespace-nowrap">Peças/chapa:</label>
          <input
            type="number" min={1} max={layout.pecasPorChapa}
            value={inputVal}
            onChange={e => handleInput(e.target.value)}
            placeholder={String(layout.pecasPorChapa)}
            className={`w-14 border rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:border-transparent transition
              ${customPecas !== null && customPecas > layout.pecasPorChapa
                ? "border-rose-300 focus:ring-rose-400 bg-rose-50 text-rose-700"
                : "border-slate-200 focus:ring-violet-500"
              }`}
          />
          {customPecas !== null && customPecas > layout.pecasPorChapa ? (
            <span className="text-[10.5px] text-rose-600 font-medium whitespace-nowrap">máx. {layout.pecasPorChapa}</span>
          ) : customPecas !== null && customPecas > 0 ? (
            <span className="text-[10.5px] text-emerald-600 font-medium whitespace-nowrap">✓ {customPecas}/{layout.pecasPorChapa}</span>
          ) : (
            <span className="text-[10.5px] text-slate-400 hidden sm:block whitespace-nowrap">máx. {layout.pecasPorChapa}</span>
          )}
        </div>
      </div>

      {/* ── Painel: adicionar produto (chapa compartilhada) ───────────── */}
      {addPanel && (
        <div className="mb-3 p-3 rounded-xl border border-[#8456e8]/20 bg-[#8456e8]/[0.03]">
          <p className="text-[11.5px] font-semibold text-[#5e5c68] mb-2.5">Adicionar produto à chapa</p>

          {/* DXF upload — opcional, preenche dimensões automaticamente */}
          <div className="flex items-center gap-2 mb-3">
            <input
              ref={dxfInputRef}
              type="file"
              accept=".dxf"
              onChange={handleDxfFile}
              className="hidden"
              id="dxf-extra-input"
            />
            <label htmlFor="dxf-extra-input"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                newProdDxf
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300"
              }`}>
              {dxfLoading ? "Lendo…" : newProdDxf ? `✓ DXF: ${(newProdDxf.largura/10).toFixed(1)} × ${(newProdDxf.altura/10).toFixed(1)} cm` : "↑ Importar DXF (Pacdora)"}
            </label>
            {newProdDxf && (
              <button onClick={() => { setNewProdDxf(null); setNewProd(p => ({ ...p, largura: "", altura: "" })) }}
                className="text-[11px] text-slate-400 hover:text-rose-500 transition-colors">
                × limpar
              </button>
            )}
            <span className="text-[10px] text-slate-400">ou preencha manualmente →</span>
          </div>

          {/* Preview SVG do DXF carregado */}
          {newProdDxf && (() => {
            const { bounds, paths } = newProdDxf
            const gW = bounds.maxX - bounds.minX
            const gH = bounds.maxY - bounds.minY
            const previewW = 80; const previewH = 60
            const sg = Math.min(previewW / gW, previewH / gH)
            const color = prodColor(nextProdId)
            return (
              <div className="mb-3 flex items-center gap-3">
                <svg width={previewW} height={previewH}
                  viewBox={`0 0 ${previewW} ${previewH}`}
                  className="rounded border border-slate-200 bg-white">
                  <g transform={`translate(${(previewW - gW*sg)/2 - bounds.minX*sg}, ${(previewH + gH*sg)/2 + bounds.minY*sg}) scale(${sg}, ${-sg})`}>
                    {paths.misc  && <path d={paths.misc}  fill="none" stroke="#22c55e" strokeWidth={0.5} vectorEffect="non-scaling-stroke" strokeOpacity={0.4} />}
                    {paths.folds && <path d={paths.folds} fill="none" stroke="#dc2626" strokeWidth={0.4} vectorEffect="non-scaling-stroke" strokeDasharray="3 1.5" />}
                    {paths.cuts  && <path d={paths.cuts}  fill="none" stroke={color}   strokeWidth={0.7} vectorEffect="non-scaling-stroke" />}
                  </g>
                </svg>
                <p className="text-[11px] text-slate-500">
                  Dieline carregado.<br />
                  <span className="font-semibold text-slate-700">{(newProdDxf.largura/10).toFixed(1)} × {(newProdDxf.altura/10).toFixed(1)} cm</span>
                </p>
              </div>
            )
          })()}

          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-400 font-medium">Nome</label>
              <input value={newProd.label} onChange={e => setNewProd(p => ({ ...p, label: e.target.value }))}
                placeholder={`Produto ${nextProdId + 1}`}
                className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-400 font-medium">Largura (cm)</label>
              <input value={newProd.largura} onChange={e => setNewProd(p => ({ ...p, largura: e.target.value }))}
                placeholder="ex: 16"
                className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-400 font-medium">Altura (cm)</label>
              <input value={newProd.altura} onChange={e => setNewProd(p => ({ ...p, altura: e.target.value }))}
                placeholder="ex: 12"
                className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-400 font-medium">Qtd. peças</label>
              <input type="number" min={1} value={newProd.qty} onChange={e => setNewProd(p => ({ ...p, qty: e.target.value }))}
                className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent" />
            </div>
            <button onClick={handleAddProduct}
              className="px-3.5 py-1.5 bg-[#8456e8] text-white text-xs font-semibold rounded-lg hover:bg-[#7343d9] transition-colors">
              Adicionar
            </button>
            <button onClick={() => { setAddPanel(false); setNewProdDxf(null) }}
              className="px-2.5 py-1.5 text-slate-400 text-xs hover:text-slate-600 transition-colors">
              Cancelar
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
            Arraste as peças para o melhor encaixe. O % de área ocupada é usado para rateio do custo da chapa.
          </p>
        </div>
      )}

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
          {/* Chapa background */}
          <rect x={PAD} y={PAD} width={cW * scale} height={cH * scale}
            fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} rx={2} />

          {/* Peças — selecionada sempre por cima */}
          {[...pieces.filter(p => p.id !== selected), ...pieces.filter(p => p.id === selected)].map(p => {
            const pr    = getProd(p)
            const color = prodColor(p.productId)
            return (
              <PieceSVG
                key={p.id}
                id={p.id}
                px={PAD + p.x * scale}
                py={PAD + p.y * scale}
                dW={pWmm(p) * scale}
                dH={pHmm(p) * scale}
                origW={getProd(p).largura * scale}
                origH={getProd(p).altura  * scale}
                scale={scale}
                dieline={dieline}
                formData={formData}
                rotated={p.rotated}
                flipped={p.flipped}
                isSelected={p.id === selected}
                tipoCaixa={dieline.tipoCaixa ?? "simples"}
                dielineGeo={p.productId === 0 ? dielineGeo : getProd(p).dxfGeo}
                isExtra={p.productId !== 0}
                productColor={color}
                productLabel={p.productId !== 0 ? pr.label : undefined}
                onPointerDown={e => onPieceDown(e, p.id)}
                onRotate={e => { e.stopPropagation(); rotatePiece(p.id) }}
                onFlip={e => { e.stopPropagation(); flipPiece(p.id) }}
              />
            )
          })}

          {/* Footer */}
          <text x={PAD + (cW * scale) / 2} y={PAD + cH * scale + 20}
            textAnchor="middle" fontSize={11} fill="#475569" fontWeight={600}>
            {`${(cW / 10).toFixed(0)} × ${(cH / 10).toFixed(0)} cm  ·  ${pieces.length} peça${pieces.length !== 1 ? "s" : ""}`}
          </text>
        </svg>
      </div>

      {/* ── Ações da peça selecionada ─────────────────────────────────── */}
      {selPiece && (
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <span className="text-[11px] text-slate-400 font-medium">Peça selecionada:</span>
          <button onClick={() => rotatePiece(selPiece.id)}
            className="text-xs px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors font-medium text-slate-700">
            ↻ Girar 90°
          </button>
          <button
            onClick={() => flipPiece(selPiece.id)}
            className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors font-medium ${
              selPiece.flipped
                ? "bg-violet-100 text-[#8456e8] border border-[#8456e8]/30"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
            title="Inverter espelho esquerda-direita">
            ↔ Inverter
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
      )}

      {/* ── Rodapé: legenda ou resumo de chapa compartilhada ─────────── */}
      {hasMultiProduct ? (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-[10.5px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">Chapa compartilhada</p>
          <div className="flex flex-col gap-1">
            {prodStats.map(ps => (
              <div key={ps.id} className="flex items-center gap-2 text-[11.5px] text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: prodColor(ps.id) }} />
                <span className="font-medium" style={{ color: prodColor(ps.id) }}>{ps.label}</span>
                <span className="text-slate-400">·</span>
                <span>{ps.count} peça{ps.count !== 1 ? "s" : ""}</span>
                <span className="text-slate-400">·</span>
                <span className="font-semibold">{ps.pct}% da chapa</span>
                <span className="text-slate-300 text-[10px] ml-auto">→ rateie {ps.pct}% do custo</span>
              </div>
            ))}
          </div>
          {totalPct < 95 && (
            <p className="text-[10px] text-amber-600 mt-1.5 font-medium">
              {100 - totalPct}% da chapa livre — considere adicionar mais peças de algum produto.
            </p>
          )}
          <p className="text-[10px] text-slate-400 mt-1.5">
            Para orçamentos: calcule cada produto com seu % de ocupação aplicado ao custo total da chapa.
          </p>
        </div>
      ) : (
        !selPiece && (
          <div className="flex gap-5 mt-2.5 pt-2 border-t border-slate-50 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-5 h-px bg-violet-700 block" /> corte</span>
            <span className="flex items-center gap-1.5"><span className="w-5 border-t border-dashed border-red-500 block" /> vinco</span>
          </div>
        )
      )}
    </div>
  )
}

// ─── Individual piece renderer ─────────────────────────────────────────────────

type PieceSVGProps = {
  id: number
  px: number; py: number
  dW: number; dH: number
  origW: number; origH: number
  scale: number
  dieline: DielineInfo
  formData: FormInfo
  rotated: boolean
  flipped: boolean
  isSelected: boolean
  tipoCaixa: TipoCaixa
  dielineGeo?: DXFGeo | null
  isExtra: boolean
  productColor: string
  productLabel?: string
  onPointerDown: (e: React.PointerEvent<SVGGElement>) => void
  onRotate: (e: React.MouseEvent) => void
  onFlip: (e: React.MouseEvent) => void
}

function PieceSVG({
  id, px, py, dW, dH, origW, origH, scale: s,
  dieline, formData, rotated, flipped, isSelected, tipoCaixa, dielineGeo,
  isExtra, productColor, productLabel,
  onPointerDown, onRotate, onFlip,
}: PieceSVGProps) {
  const { abaColagem: ac, abaSuperior: sup } = dieline
  const { frente: fr, lateral: lat, alturaBox: alt } = formData

  const CUT  = productColor
  const FOLD = "#dc2626"

  const X1 = ac * s
  const X2 = (ac + fr) * s
  const X3 = (ac + fr + lat) * s
  const X4 = (ac + 2 * fr + lat) * s

  const Y1   = sup * s
  const Y2   = (sup + alt) * s
  const supH = Y1
  const infH = origH - Y2
  const tw   = X4 - X3
  const lw   = X3 - X2

  const sw    = Math.max(0.7, s * 0.065)
  const fw    = Math.max(0.5, s * 0.050)
  const fDash = `${s * 2.5} ${s * 1.2}`

  const bodyFill = isSelected ? `${productColor}22` : "#f8fafc"
  const sideFill = isSelected ? `${productColor}18` : "#f1f5f9"
  const flapFill = isSelected ? `${productColor}30` : "#e8f0fe"
  const glueFill = "#dde3ec"

  const gt = Math.min(X1 * 0.15, 3 * s)
  const pathGlue = [
    `M ${gt},${Y1}`,
    `L 0,${Y1 + (Y2 - Y1) * 0.12}`,
    `L 0,${Y2 - (Y2 - Y1) * 0.12}`,
    `L ${gt},${Y2}`,
    `L ${X1},${Y2} L ${X1},${Y1} Z`,
  ].join(" ")

  const pathTuckTop = [
    `M ${X3},${Y1}`,
    `L ${X3},${Y1 - supH * 0.55}`,
    `C ${X3},${Y1 - supH * 0.98} ${X3 + tw * 0.15},${Y1 - supH} ${X3 + tw / 2},${Y1 - supH}`,
    `C ${X4 - tw * 0.15},${Y1 - supH} ${X4},${Y1 - supH * 0.98} ${X4},${Y1 - supH * 0.55}`,
    `L ${X4},${Y1} Z`,
  ].join(" ")

  const aviaoWing  = supH * 0.18
  const pathAviaoTop = [
    `M ${X3},${Y1}`,
    `L ${X3},${Y1 - supH + aviaoWing}`,
    `L ${X3 + aviaoWing * 1.2},${Y1 - supH}`,
    `L ${X4 - aviaoWing * 1.2},${Y1 - supH}`,
    `L ${X4},${Y1 - supH + aviaoWing}`,
    `L ${X4},${Y1} Z`,
  ].join(" ")

  const dustTopH = supH * 0.52
  const dustBotH = infH * 0.52
  const da = Math.min(lw * 0.20, dustTopH * 0.28)

  const pathDustTopL = `M ${X2},${Y1} L ${X2 + da},${Y1 - dustTopH} L ${X3 - da},${Y1 - dustTopH} L ${X3},${Y1} Z`
  const pathDustTopR = `M ${X4},${Y1} L ${X4 + da},${Y1 - dustTopH} L ${origW - da},${Y1 - dustTopH} L ${origW},${Y1} Z`
  const pathDustBotL = `M ${X2},${Y2} L ${X2 + da},${Y2 + dustBotH} L ${X3 - da},${Y2 + dustBotH} L ${X3},${Y2} Z`
  const pathDustBotR = `M ${X4},${Y2} L ${X4 + da},${Y2 + dustBotH} L ${origW - da},${Y2 + dustBotH} L ${origW},${Y2} Z`

  const backTopH = supH * 0.88
  const backBotH = infH * 0.88

  const bi = Math.min(tw * 0.10, 5 * s)
  const pathTuckBot = [
    `M ${X3 + bi},${Y2}`,
    `L ${X3 + bi},${Y2 + infH * 0.60}`,
    `C ${X3 + bi},${Y2 + infH * 0.96} ${X3 + tw * 0.2},${Y2 + infH} ${X3 + tw / 2},${Y2 + infH}`,
    `C ${X4 - tw * 0.2},${Y2 + infH} ${X4 - bi},${Y2 + infH * 0.96} ${X4 - bi},${Y2 + infH * 0.60}`,
    `L ${X4 - bi},${Y2} Z`,
  ].join(" ")

  const innerTransform = rotated
    ? `translate(${px + dW},${py}) rotate(90)`
    : `translate(${px},${py})`

  const clipId = `clip-${id}`
  const btnR   = Math.max(8, Math.min(dW, dH) * 0.095)
  const btnFS  = Math.max(9, btnR * 1.1)
  const cx     = px + dW / 2
  const cy     = py + dH / 2

  const isAviao  = tipoCaixa === "aviao"
  const isAuto   = tipoCaixa === "fundo-automatico"
  const isAmeric = tipoCaixa === "americano"

  // ── DXF real geometry ──────────────────────────────────────────────────────
  const geoContent = dielineGeo ? (() => {
    const { bounds, paths } = dielineGeo
    const gW = bounds.maxX - bounds.minX
    const sg = origW / gW
    const geoTransform = `translate(${-bounds.minX * sg}, ${bounds.maxY * sg}) scale(${sg}, ${-sg})`
    return (
      <g transform={geoTransform}>
        <rect x={bounds.minX} y={bounds.minY} width={gW} height={bounds.maxY - bounds.minY}
          fill={isSelected ? `${productColor}18` : "#f8fafc"} />
        {paths.misc && <path d={paths.misc} fill="none" stroke="#22c55e" strokeWidth={0.6}
          vectorEffect="non-scaling-stroke" strokeOpacity={0.45} />}
        {paths.folds && <path d={paths.folds} fill="none" stroke="#dc2626" strokeWidth={0.55}
          vectorEffect="non-scaling-stroke" strokeDasharray="4 2" />}
        {paths.cuts && <path d={paths.cuts} fill="none" stroke={productColor} strokeWidth={0.75}
          vectorEffect="non-scaling-stroke" />}
      </g>
    )
  })() : null

  // ── Produto extra (simples) ────────────────────────────────────────────────
  const extraContent = (
    <g>
      <rect x={0} y={0} width={origW} height={origH}
        fill={isSelected ? `${productColor}20` : `${productColor}08`}
        stroke={productColor} strokeWidth={sw} rx={2 * s} />
      {productLabel && (
        <text x={origW / 2} y={origH / 2}
          textAnchor="middle" dominantBaseline="central"
          fontSize={Math.max(8, Math.min(origW, origH) * 0.12)}
          fill={productColor} fontWeight={600} opacity={0.8}
          style={{ userSelect: "none" }}>
          {productLabel}
        </text>
      )}
    </g>
  )

  return (
    <g onPointerDown={onPointerDown} style={{ cursor: "grab" }}>
      {isSelected && (
        <rect x={px - 2} y={py - 2} width={dW + 4} height={dH + 4}
          fill="none" stroke={productColor} strokeWidth={2} rx={3}
          strokeDasharray="6 3" />
      )}

      <defs>
        <clipPath id={clipId}>
          <rect x={px} y={py} width={dW} height={dH} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <g transform={innerTransform}>
          {/* Flip ao longo do eixo vertical (espelho esquerda-direita) */}
          <g transform={flipped ? `translate(${origW},0) scale(-1,1)` : undefined}>

          {dielineGeo ? geoContent : isExtra ? extraContent : (
            <>
              <path d={pathGlue} fill={glueFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />
              <rect x={X1} y={Y1} width={X2 - X1} height={Y2 - Y1} fill={bodyFill} stroke={CUT} strokeWidth={sw} />
              <rect x={X2} y={Y1} width={X3 - X2} height={Y2 - Y1} fill={sideFill} stroke={CUT} strokeWidth={sw} />
              <rect x={X3} y={Y1} width={X4 - X3} height={Y2 - Y1} fill={bodyFill} stroke={CUT} strokeWidth={sw} />
              <rect x={X4} y={Y1} width={origW - X4} height={Y2 - Y1} fill={sideFill} stroke={CUT} strokeWidth={sw} />
              <rect x={X1} y={Y1 - backTopH} width={X2 - X1} height={backTopH} fill={flapFill} stroke={CUT} strokeWidth={sw} />
              <path d={pathDustTopL} fill={flapFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />
              {isAviao
                ? <path d={pathAviaoTop} fill={flapFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />
                : <path d={pathTuckTop}  fill={flapFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />}
              <path d={pathDustTopR} fill={flapFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />
              {!isAuto && !isAmeric && (
                <>
                  <rect x={X1} y={Y2} width={X2 - X1} height={backBotH} fill={flapFill} stroke={CUT} strokeWidth={sw} />
                  <path d={pathDustBotL} fill={flapFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />
                  <path d={pathTuckBot}  fill={flapFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />
                  <path d={pathDustBotR} fill={flapFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />
                </>
              )}
              {isAuto && (
                <>
                  <rect x={X1} y={Y2} width={X2 - X1} height={backBotH} fill={flapFill} stroke={CUT} strokeWidth={sw} />
                  <rect x={X3} y={Y2} width={X4 - X3} height={infH * 0.92} fill={flapFill} stroke={CUT} strokeWidth={sw} />
                  <path d={`M ${X2},${Y2} L ${X3},${Y2 + infH * 0.46} L ${X2},${Y2 + infH * 0.92} Z`} fill={flapFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />
                  <path d={`M ${X4},${Y2} L ${X3},${Y2 + infH * 0.46} L ${X4},${Y2 + infH * 0.92} Z`} fill={flapFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />
                  <path d={`M ${origW},${Y2} L ${X4},${Y2 + infH * 0.46} L ${origW},${Y2 + infH * 0.92} Z`} fill={flapFill} stroke={CUT} strokeWidth={sw} strokeLinejoin="round" />
                  <line x1={X2} y1={Y2} x2={X3} y2={Y2 + infH * 0.46} stroke={FOLD} strokeWidth={fw} strokeDasharray={fDash} />
                  <line x1={X3} y1={Y2} x2={X2} y2={Y2 + infH * 0.92} stroke={FOLD} strokeWidth={fw} strokeDasharray={fDash} />
                  <line x1={X4} y1={Y2} x2={X3} y2={Y2 + infH * 0.46} stroke={FOLD} strokeWidth={fw} strokeDasharray={fDash} />
                  <line x1={X3} y1={Y2} x2={X4} y2={Y2 + infH * 0.92} stroke={FOLD} strokeWidth={fw} strokeDasharray={fDash} />
                </>
              )}
              {isAmeric && (
                <>
                  <rect x={X1} y={Y2} width={X2 - X1} height={infH * 0.90} fill={flapFill} stroke={CUT} strokeWidth={sw} />
                  <rect x={X2} y={Y2} width={X3 - X2} height={infH * 0.90} fill="#e0f2fe" stroke={CUT} strokeWidth={sw} />
                  <rect x={X3} y={Y2} width={X4 - X3} height={infH * 0.90} fill={flapFill} stroke={CUT} strokeWidth={sw} />
                  <rect x={X3 + tw * 0.3} y={Y2 + infH * 0.90} width={tw * 0.4} height={infH * 0.08} fill={flapFill} stroke={CUT} strokeWidth={sw} rx={1 * s} />
                  <rect x={X4} y={Y2} width={origW - X4} height={infH * 0.90} fill="#e0f2fe" stroke={CUT} strokeWidth={sw} />
                  <line x1={X1} y1={Y2 + infH * 0.48} x2={origW} y2={Y2 + infH * 0.48} stroke={FOLD} strokeWidth={fw} strokeDasharray={fDash} />
                </>
              )}
              {[X1, X2, X3, X4].map((x, i) => (
                <line key={i} x1={x} y1={0} x2={x} y2={origH} stroke={FOLD} strokeWidth={fw} strokeDasharray={fDash} />
              ))}
              <line x1={0} y1={Y1} x2={origW} y2={Y1} stroke={FOLD} strokeWidth={fw} strokeDasharray={fDash} />
              <line x1={0} y1={Y2} x2={origW} y2={Y2} stroke={FOLD} strokeWidth={fw} strokeDasharray={fDash} />
            </>
          )}

          </g>
        </g>
      </g>

      {/* Botão girar */}
      <g onClick={onRotate} style={{ cursor: "pointer" }}>
        <circle cx={cx - btnR * 1.6} cy={cy} r={btnR}
          fill="rgba(255,255,255,0.90)"
          stroke={isSelected ? productColor : "#64748b"}
          strokeWidth={isSelected ? 1.5 : 0.8}
        />
        <text x={cx - btnR * 1.6} y={cy}
          textAnchor="middle" dominantBaseline="central"
          fontSize={btnFS} fill={isSelected ? productColor : "#334155"}
          style={{ userSelect: "none" }}>
          ↻
        </text>
      </g>

      {/* Botão inverter (flip vertical) */}
      <g onClick={onFlip} style={{ cursor: "pointer" }}>
        <circle cx={cx + btnR * 1.6} cy={cy} r={btnR}
          fill="rgba(255,255,255,0.90)"
          stroke={flipped ? productColor : (isSelected ? productColor : "#64748b")}
          strokeWidth={flipped || isSelected ? 1.5 : 0.8}
        />
        <text x={cx + btnR * 1.6} y={cy}
          textAnchor="middle" dominantBaseline="central"
          fontSize={btnFS} fill={flipped ? productColor : (isSelected ? productColor : "#334155")}
          style={{ userSelect: "none" }}>
          ↔
        </text>
      </g>

    </g>
  )
}
