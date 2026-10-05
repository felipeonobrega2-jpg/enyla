// DXF parser — browser-side, no dependencies
// Extracts bounding box AND renders actual geometry as SVG paths

// ── Types ────────────────────────────────────────────────────────────────────

export type DXFPaths = {
  cuts:  string  // SVG path d — corte (trim)
  folds: string  // SVG path d — vinco (crease/fold)
  misc:  string  // SVG path d — bleed e outros
}

export type DXFResult = {
  largura: number   // mm
  altura:  number   // mm
  source:  "extents" | "scan"
  bounds:  { minX: number; minY: number; maxX: number; maxY: number }
  paths:   DXFPaths
}

// ── Unit conversion ──────────────────────────────────────────────────────────

const UNIT_MM: Record<number, number> = {
  0: 1, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000,
}

// ── Layer classification ─────────────────────────────────────────────────────

function layerType(layer: string): "cut" | "fold" | "misc" {
  const l = layer.toLowerCase()
  if (/cut|trim|corte|faca/.test(l))         return "cut"
  if (/crease|fold|vinco|score|perf/.test(l)) return "fold"
  return "misc"
}

// ── SVG arc approximation ────────────────────────────────────────────────────

function arcPoints(
  cx: number, cy: number, r: number,
  startDeg: number, endDeg: number, segs = 24
): [number, number][] {
  // DXF arcs are CCW; angles in degrees from positive X axis
  let s = startDeg, e = endDeg
  if (e <= s) e += 360
  const pts: [number, number][] = []
  for (let i = 0; i <= segs; i++) {
    const a = (s + (e - s) * (i / segs)) * (Math.PI / 180)
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

function ptsToPath(pts: [number, number][]): string {
  if (pts.length === 0) return ""
  const [hx, hy] = pts[0]
  return `M ${hx},${hy} ` + pts.slice(1).map(([x, y]) => `L ${x},${y}`).join(" ")
}

// ── Bulge arc (LWPOLYLINE segment) ──────────────────────────────────────────

function bulgeSegment(
  x1: number, y1: number, x2: number, y2: number, bulge: number
): string {
  if (Math.abs(bulge) < 1e-9) return `L ${x2},${y2}`
  // bulge = tan(angle/4); angle is the included angle of the arc
  const angle    = 4 * Math.atan(Math.abs(bulge))   // radians
  const d        = Math.hypot(x2 - x1, y2 - y1)
  const r        = (d / 2) / Math.sin(angle / 2)
  // midpoint and perpendicular
  const mx  = (x1 + x2) / 2
  const my  = (y1 + y2) / 2
  const dx  = x2 - x1, dy = y2 - y1
  const dist = Math.sqrt(dx * dx + dy * dy)
  const nx  = -dy / dist, ny = dx / dist    // unit normal
  const sagitta = r - Math.sqrt(r * r - (d / 2) ** 2)
  const sign    = bulge > 0 ? -1 : 1       // DXF: bulge>0 = CCW = left of direction
  const cx  = mx + sign * nx * (r - sagitta)
  const cy  = my + sign * ny * (r - sagitta)
  // compute start/end angles
  const sa = Math.atan2(y1 - cy, x1 - cx) * 180 / Math.PI
  const ea = Math.atan2(y2 - cy, x2 - cx) * 180 / Math.PI
  // resolve direction
  const startAngle = bulge > 0 ? sa : ea
  const endAngle   = bulge > 0 ? ea : sa
  const pts = arcPoints(cx, cy, r, startAngle, endAngle, 16)
  if (bulge < 0) pts.reverse()
  return pts.map(([x, y]) => `L ${x},${y}`).join(" ")
}

// ── Token block parser ───────────────────────────────────────────────────────

type Token = [number, string]

function tokenize(raw: string): Token[] {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const lines = text.split("\n")
  const tokens: Token[] = []
  let i = 0
  while (i < lines.length) {
    const code = lines[i].trim()
    if (code === "") { i++; continue }
    const n = parseInt(code, 10)
    if (!isNaN(n) && i + 1 < lines.length) {
      tokens.push([n, lines[i + 1].trim()])
      i += 2
    } else { i++ }
  }
  return tokens
}

// ── Entity builder ───────────────────────────────────────────────────────────

type EntityRaw = {
  type:   string
  layer:  string
  nums:   Map<number, number[]>
  strs:   Map<number, string>
}

function splitEntities(tokens: Token[]): EntityRaw[] {
  const result: EntityRaw[] = []
  let cur: EntityRaw | null = null

  for (const [code, val] of tokens) {
    if (code === 0) {
      if (cur) result.push(cur)
      cur = { type: val.toUpperCase(), layer: "0", nums: new Map(), strs: new Map() }
    } else if (cur) {
      if (code === 8) { cur.layer = val; continue }
      const n = parseFloat(val)
      if (!isNaN(n)) {
        if (!cur.nums.has(code)) cur.nums.set(code, [])
        cur.nums.get(code)!.push(n)
      } else {
        cur.strs.set(code, val)
      }
    }
  }
  if (cur) result.push(cur)
  return result
}

// ── Geometry extraction ──────────────────────────────────────────────────────

function num(e: EntityRaw, code: number, idx = 0, def = 0) {
  return e.nums.get(code)?.[idx] ?? def
}

function entityToPath(e: EntityRaw, factor: number): string {
  const f = factor  // mm multiplier
  switch (e.type) {
    case "LINE": {
      const x1 = num(e, 10) * f, y1 = num(e, 20) * f
      const x2 = num(e, 11) * f, y2 = num(e, 21) * f
      return `M ${x1},${y1} L ${x2},${y2}`
    }
    case "ARC": {
      const cx = num(e, 10) * f, cy = num(e, 20) * f, r = num(e, 40) * f
      const sa = num(e, 50), ea = num(e, 51)
      return ptsToPath(arcPoints(cx, cy, r, sa, ea))
    }
    case "CIRCLE": {
      const cx = num(e, 10) * f, cy = num(e, 20) * f, r = num(e, 40) * f
      return ptsToPath(arcPoints(cx, cy, r, 0, 360))
    }
    case "LWPOLYLINE": {
      const xs     = e.nums.get(10) ?? []
      const ys     = e.nums.get(20) ?? []
      const bulges = e.nums.get(42) ?? []
      const closed = ((num(e, 70) ?? 0) & 1) === 1
      if (xs.length === 0) return ""
      let d = `M ${xs[0] * f},${ys[0] * f}`
      for (let i = 1; i < xs.length; i++) {
        const b = bulges[i - 1] ?? 0
        d += " " + bulgeSegment(xs[i-1]*f, ys[i-1]*f, xs[i]*f, ys[i]*f, b)
      }
      if (closed && xs.length > 1) {
        const b = bulges[xs.length - 1] ?? 0
        d += " " + bulgeSegment(xs[xs.length-1]*f, ys[xs.length-1]*f, xs[0]*f, ys[0]*f, b)
        d += " Z"
      }
      return d
    }
    case "SPLINE": {
      // approximate with straight lines through fit/control points
      const xs = e.nums.get(10) ?? []
      const ys = e.nums.get(20) ?? []
      if (xs.length === 0) return ""
      let d = `M ${xs[0]*f},${ys[0]*f}`
      for (let i = 1; i < xs.length; i++) d += ` L ${xs[i]*f},${ys[i]*f}`
      return d
    }
    case "POLYLINE": {
      // old-style polyline: vertices follow as VERTEX entities — handled separately
      return ""
    }
    default:
      return ""
  }
}

// ── Section slicer ───────────────────────────────────────────────────────────

function sliceSection(tokens: Token[], sectionName: string): Token[] {
  const out: Token[] = []
  let inside = false
  for (let i = 0; i < tokens.length; i++) {
    const [c, v] = tokens[i]
    if (c === 0 && v === "SECTION") {
      if (i + 1 < tokens.length && tokens[i+1][0] === 2) {
        inside = tokens[i+1][1].toUpperCase() === sectionName
      }
    }
    if (c === 0 && v === "ENDSEC") { if (inside) { inside = false; continue } }
    if (inside) out.push([c, v])
  }
  return out
}

// ── Block resolver ───────────────────────────────────────────────────────────

function parseBlocks(tokens: Token[]): Map<string, EntityRaw[]> {
  const blocks = new Map<string, EntityRaw[]>()
  const blockToks = sliceSection(tokens, "BLOCKS")
  let currentBlock = ""
  let blockEntities: EntityRaw[] = []

  for (let i = 0; i < blockToks.length; i++) {
    const [c, v] = blockToks[i]
    if (c === 0 && v === "BLOCK") {
      // read block name (code 2)
      let name = ""
      for (let j = i+1; j < blockToks.length && blockToks[j][0] !== 0; j++) {
        if (blockToks[j][0] === 2) { name = blockToks[j][1]; break }
      }
      currentBlock = name
      blockEntities = []
    }
    if (c === 0 && v === "ENDBLK") {
      if (currentBlock) blocks.set(currentBlock, blockEntities)
      currentBlock = ""
    }
    if (currentBlock && c !== 0) {
      // collect for block — re-parse via splitEntities later
    }
  }
  // Simpler: just parse entire BLOCKS section as entities and group by block
  const all = splitEntities(blockToks)
  let bname = ""
  for (const e of all) {
    if (e.type === "BLOCK") { bname = e.strs.get(2) ?? e.strs.get(3) ?? ""; continue }
    if (e.type === "ENDBLK") { bname = ""; continue }
    if (bname && !["BLOCK","ENDBLK","SEQEND"].includes(e.type)) {
      if (!blocks.has(bname)) blocks.set(bname, [])
      blocks.get(bname)!.push(e)
    }
  }
  return blocks
}

// ── Main export ──────────────────────────────────────────────────────────────

export function parseDXF(raw: string): DXFResult | null {
  const tokens = tokenize(raw)

  // ── Units ────────────────────────────────────────────────────────────────
  let insUnits = 4
  const headerToks = sliceSection(tokens, "HEADER")
  let lastVar = ""
  let extMinX: number | null = null, extMinY: number | null = null
  let extMaxX: number | null = null, extMaxY: number | null = null

  for (const [c, v] of headerToks) {
    if (c === 9)  { lastVar = v; continue }
    if (lastVar === "$INSUNITS" && c === 70) insUnits = parseInt(v, 10)
    if (lastVar === "$EXTMIN") {
      if (c === 10) extMinX = parseFloat(v)
      if (c === 20) extMinY = parseFloat(v)
    }
    if (lastVar === "$EXTMAX") {
      if (c === 10) extMaxX = parseFloat(v)
      if (c === 20) extMaxY = parseFloat(v)
    }
  }
  const factor = UNIT_MM[insUnits] ?? 1

  // ── Parse geometry from ENTITIES + BLOCKS ────────────────────────────────
  const blockMap   = parseBlocks(tokens)
  const entToks    = sliceSection(tokens, "ENTITIES")
  const entRaw     = splitEntities(entToks)

  // Resolve INSERTs → inline block entities with transform
  const allEntities: EntityRaw[] = []

  for (const e of entRaw) {
    if (e.type === "INSERT") {
      const bname = e.strs.get(2) ?? ""
      const tx = num(e, 10) * factor, ty = num(e, 20) * factor
      const sx = num(e, 41, 0, 1), sy = num(e, 42, 0, 1)
      const rot = num(e, 50) * (Math.PI / 180)
      const cosA = Math.cos(rot), sinA = Math.sin(rot)
      const block = blockMap.get(bname) ?? []
      for (const be of block) {
        // transform all numeric coordinates
        if (["LINE","ARC","CIRCLE","LWPOLYLINE","SPLINE"].includes(be.type)) {
          // Apply INSERT transform to coordinate codes
          const transformed: EntityRaw = {
            type: be.type, layer: be.layer,
            nums: new Map(Array.from(be.nums.entries()).map(([k, vals]) => [k, [...vals]])),
            strs: new Map(be.strs),
          }
          // Transform point pairs (10→x, 20→y), (11→x, 21→y), ...
          for (const xCode of [10, 11, 12, 13]) {
            const yCode = xCode + 10
            const xs = transformed.nums.get(xCode) ?? []
            const ys = transformed.nums.get(yCode) ?? []
            const newXs: number[] = [], newYs: number[] = []
            for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
              const lx = (xs[i] ?? 0) * sx * factor
              const ly = (ys[i] ?? 0) * sy * factor
              newXs.push(lx * cosA - ly * sinA + tx)
              newYs.push(lx * sinA + ly * cosA + ty)
            }
            if (newXs.length) transformed.nums.set(xCode, newXs)
            if (newYs.length) transformed.nums.set(yCode, newYs)
          }
          // radius
          if (transformed.nums.has(40)) {
            transformed.nums.set(40, (transformed.nums.get(40)!).map(r => r * sx * factor))
          }
          allEntities.push(transformed)
        }
      }
    } else if (!["SEQEND","BLOCK","ENDBLK"].includes(e.type)) {
      allEntities.push(e)
    }
  }

  // ── Generate SVG paths by layer type ─────────────────────────────────────
  const pathsByType: Record<"cut" | "fold" | "misc", string[]> = { cut: [], fold: [], misc: [] }
  const xs: number[] = [], ys: number[] = []

  for (const e of allEntities) {
    const path = entityToPath(e, 1)  // coordinates already in mm (factor applied in transforms)
    if (!path) continue
    const lt = layerType(e.layer)
    pathsByType[lt].push(path)

    // collect bounds from coordinate codes
    for (const xc of [10, 11, 12]) {
      for (const x of e.nums.get(xc) ?? []) xs.push(x)
    }
    for (const yc of [20, 21, 22]) {
      for (const y of e.nums.get(yc) ?? []) ys.push(y)
    }
    // extend bounds for circles/arcs
    if (e.type === "CIRCLE" || e.type === "ARC") {
      const cx = num(e, 10), cy = num(e, 20), r = num(e, 40)
      xs.push(cx - r, cx + r); ys.push(cy - r, cy + r)
    }
  }

  // ── Bounds: prefer $EXTMIN/$EXTMAX, fall back to scanned coords ───────────
  let minX: number, minY: number, maxX: number, maxY: number
  let source: "extents" | "scan" = "scan"

  if (extMinX !== null && extMinY !== null && extMaxX !== null && extMaxY !== null) {
    minX = extMinX * factor; minY = extMinY * factor
    maxX = extMaxX * factor; maxY = extMaxY * factor
    const w = maxX - minX, h = maxY - minY
    if (w > 5 && h > 5 && w < 5000 && h < 5000) source = "extents"
  }

  if (source === "scan") {
    if (xs.length < 2 || ys.length < 2) return null
    minX = Math.min(...xs); maxX = Math.max(...xs)
    minY = Math.min(...ys); maxY = Math.max(...ys)
  }

  const w = maxX! - minX!, h = maxY! - minY!
  if (w < 5 || h < 5) return null

  // If no geometry was parsed but we have extents from HEADER (blocks not resolved),
  // generate a placeholder rectangle outline
  const totalPaths = Object.values(pathsByType).flat().length
  if (totalPaths === 0) {
    // fallback: draw bounding rectangle as cut line
    pathsByType.cut.push(
      `M ${minX!},${minY!} L ${maxX!},${minY!} L ${maxX!},${maxY!} L ${minX!},${maxY!} Z`
    )
  }

  return {
    largura: Math.round(w * 100) / 100,
    altura:  Math.round(h * 100) / 100,
    source,
    bounds: { minX: minX!, minY: minY!, maxX: maxX!, maxY: maxY! },
    paths: {
      cuts:  pathsByType.cut.join(" "),
      folds: pathsByType.fold.join(" "),
      misc:  pathsByType.misc.join(" "),
    },
  }
}
