// Professional dieline SVG generator
// All internal dimensions in mm; input in cm

export type DielineParams = {
  largura: number       // cm — W (frente)
  altura: number        // cm — H (alturaBox)
  profundidade: number  // cm — D (lateral)
  abaColagem: number    // cm — G
  tipo?: string
  nome?: string
}

export function gerarDielineSVG(p: DielineParams): string {
  const W  = p.largura      * 10
  const H  = p.altura       * 10
  const D  = p.profundidade * 10
  const G  = p.abaColagem   * 10
  const nome = p.nome ?? "Embalagem"
  const tipo = p.tipo ?? "straight-tuck-end"
  const isRTE = tipo === "reverse-tuck-end"

  // Tuck heights (same formula used by calculos.ts)
  const FT = Math.round(D * 0.9) + 3   // aba superior
  const FB = Math.round(D * 0.6) + 3   // aba inferior

  // Panel x-coordinates (left edge of each column)
  const xGlue  = 0
  const xBack  = G
  const xSideL = G + W
  const xFront = G + W + D
  const xSideR = G + 2 * W + D
  const totalW = G + 2 * W + 2 * D

  // Panel y-coordinates
  const yTop  = 0          // top of dieline
  const yBody = FT          // body starts
  const yBod2 = FT + H      // body ends
  const totalH = FT + H + FB

  // SVG canvas with space for annotations
  const ANN_L  = 40    // left annotation space (mm)
  const ANN_B  = 22    // bottom annotation space (mm)
  const ANN_R  = 6
  const ANN_T  = 6
  const svgW   = ANN_L + totalW + ANN_R
  const svgH   = ANN_T + totalH + ANN_B

  // Drawing origin offset
  const ox = ANN_L
  const oy = ANN_T

  const x = (v: number) => ox + v
  const y = (v: number) => oy + v

  // Colors
  const CUT       = "#5009c4"
  const FOLD      = "#dc2626"
  const ANN       = "#64748b"
  const LABEL_CLR = "#334155"
  const CW   = 0.45
  const FW   = 0.35
  const FDASH = "2.5 1.4"

  // Panel fills — professional printing blue scheme
  const fillBack  = "#e8f0fe"
  const fillSide  = "#e0f2fe"
  const fillFront = "#ede9fe"
  const fillFlap  = "#fef9c3"
  const fillGlue  = "#f1f5f9"

  // ── Geometry helpers ─────────────────────────────────────────────────

  function tuckArch(lx: number, rx: number, baseY: number, h: number, dir: -1 | 1): string {
    // dir = -1 → arch goes UP, dir = +1 → arch goes DOWN
    const tw = rx - lx
    const tipY = baseY + dir * h
    return [
      `M ${x(lx)},${y(baseY)}`,
      `L ${x(lx)},${y(baseY + dir * h * 0.55)}`,
      `C ${x(lx)},${y(baseY + dir * h * 0.98)}`,
      `  ${x(lx + tw * 0.15)},${y(tipY)}`,
      `  ${x(lx + tw / 2)},${y(tipY)}`,
      `C ${x(rx - tw * 0.15)},${y(tipY)}`,
      `  ${x(rx)},${y(baseY + dir * h * 0.98)}`,
      `  ${x(rx)},${y(baseY + dir * h * 0.55)}`,
      `L ${x(rx)},${y(baseY)} Z`,
    ].join(" ")
  }

  function tuckInset(lx: number, rx: number, baseY: number, h: number, dir: -1 | 1): string {
    // Inset (locking notch) variant for bottom tuck
    const tw = rx - lx
    const bi = Math.min(tw * 0.10, 5)
    const tipY = baseY + dir * h
    return [
      `M ${x(lx + bi)},${y(baseY)}`,
      `L ${x(lx + bi)},${y(baseY + dir * h * 0.60)}`,
      `C ${x(lx + bi)},${y(baseY + dir * h * 0.96)}`,
      `  ${x(lx + tw * 0.2)},${y(tipY)}`,
      `  ${x(lx + tw / 2)},${y(tipY)}`,
      `C ${x(rx - tw * 0.2)},${y(tipY)}`,
      `  ${x(rx - bi)},${y(baseY + dir * h * 0.96)}`,
      `  ${x(rx - bi)},${y(baseY + dir * h * 0.60)}`,
      `L ${x(rx - bi)},${y(baseY)} Z`,
    ].join(" ")
  }

  function dustFlap(lx: number, rx: number, baseY: number, h: number, dir: -1 | 1, w: number): string {
    const da = Math.min(w * 0.20, Math.abs(h) * 0.32)
    const tipY = baseY + dir * h
    return [
      `M ${x(lx)},${y(baseY)}`,
      `L ${x(lx + da)},${y(tipY)}`,
      `L ${x(rx - da)},${y(tipY)}`,
      `L ${x(rx)},${y(baseY)} Z`,
    ].join(" ")
  }

  function rectFlap(lx: number, rx: number, baseY: number, h: number, dir: -1 | 1, factor = 0.88): string {
    const tipY = baseY + dir * Math.abs(h) * factor
    const tl = (dir === -1) ? tipY : baseY
    const bl = (dir === -1) ? baseY : tipY
    return `M ${x(lx)},${y(tl)} L ${x(rx)},${y(tl)} L ${x(rx)},${y(bl)} L ${x(lx)},${y(bl)} Z`
  }

  function gluePath(): string {
    const gt = Math.min(G * 0.15, 3)
    return [
      `M ${x(gt)},${y(yBody)}`,
      `L ${x(0)},${y(yBody + H * 0.12)}`,
      `L ${x(0)},${y(yBod2 - H * 0.12)}`,
      `L ${x(gt)},${y(yBod2)}`,
      `L ${x(G)},${y(yBod2)} L ${x(G)},${y(yBody)} Z`,
    ].join(" ")
  }

  // ── Dimension annotation helpers ─────────────────────────────────────

  function dimHoriz(x1: number, x2: number, baseY: number, label: string, offset = 8): string {
    const ly = y(baseY) + offset
    const mx = (x(x1) + x(x2)) / 2
    return `
      <line x1="${x(x1)}" y1="${y(baseY)}" x2="${x(x1)}" y2="${ly + 1}" stroke="${ANN}" stroke-width="0.25" stroke-dasharray="1 0.5"/>
      <line x1="${x(x2)}" y1="${y(baseY)}" x2="${x(x2)}" y2="${ly + 1}" stroke="${ANN}" stroke-width="0.25" stroke-dasharray="1 0.5"/>
      <line x1="${x(x1) + 0.5}" y1="${ly}" x2="${x(x2) - 0.5}" y2="${ly}" stroke="${ANN}" stroke-width="0.3"
            marker-start="url(#arr-rev)" marker-end="url(#arr)"/>
      <text x="${mx}" y="${ly + 4}" text-anchor="middle" font-size="4" fill="${ANN}" font-family="Arial,sans-serif">${label}</text>
    `
  }

  function dimVert(x1: number, y1: number, y2: number, label: string, side: "left" | "right" = "left"): string {
    const offset = side === "left" ? -8 : 8
    const lx = x(x1) + offset
    const my = (y(y1) + y(y2)) / 2
    return `
      <line x1="${x(x1)}" y1="${y(y1)}" x2="${lx - (side === "left" ? -1 : 1)}" y2="${y(y1)}" stroke="${ANN}" stroke-width="0.25" stroke-dasharray="1 0.5"/>
      <line x1="${x(x1)}" y1="${y(y2)}" x2="${lx - (side === "left" ? -1 : 1)}" y2="${y(y2)}" stroke="${ANN}" stroke-width="0.25" stroke-dasharray="1 0.5"/>
      <line x1="${lx}" y1="${y(y1) + 0.5}" x2="${lx}" y2="${y(y2) - 0.5}" stroke="${ANN}" stroke-width="0.3"
            marker-start="url(#arr-rev)" marker-end="url(#arr)"/>
      <text x="${lx - 4.5}" y="${my}" text-anchor="middle" dominant-baseline="central" font-size="4" fill="${ANN}"
            font-family="Arial,sans-serif" transform="rotate(-90,${lx - 4.5},${my})">${label}</text>
    `
  }

  function panelLabel(cx: number, cy: number, main: string, sub = ""): string {
    return `
      <text x="${x(cx)}" y="${y(cy) - (sub ? 1.5 : 0)}" text-anchor="middle" dominant-baseline="central"
            font-size="4.2" font-weight="700" fill="${LABEL_CLR}" font-family="Arial,sans-serif"
            letter-spacing="0.3">${main}</text>
      ${sub ? `<text x="${x(cx)}" y="${y(cy) + 3.5}" text-anchor="middle" dominant-baseline="central"
            font-size="3" fill="${ANN}" font-family="Arial,sans-serif">${sub}</text>` : ""}
    `
  }

  // ── Build SVG ────────────────────────────────────────────────────────

  // Determine which panel gets the arch tuck (top and bottom)
  // STE: front gets arch TOP, front gets inset BOTTOM (same direction → "straight")
  // RTE: back gets arch TOP, front gets inset BOTTOM (opposite → "reverse")

  const topArch   = isRTE ? rectFlap(xBack, xSideL, yBody, FT, -1) + " " + tuckArch(xFront, xSideR, yBody, FT, -1) :
                            tuckArch(xFront, xSideR, yBody, FT, -1) + " " + rectFlap(xBack, xSideL, yBody, FT, -1)

  const topArchFillFront  = isRTE ? "" : tuckArch(xFront, xSideR, yBody, FT, -1)
  const topRectBack       = rectFlap(xBack, xSideL, yBody, FT, -1)
  const topDustL          = dustFlap(xSideL, xFront, yBody, FT * 0.52, -1, D)
  const topDustR          = dustFlap(xSideR, xSideR + D, yBody, FT * 0.52, -1, D)

  const topArchBack_RTE   = isRTE ? tuckArch(xBack, xSideL, yBody, FT, -1) : ""

  const botArch       = tuckInset(xFront, xSideR, yBod2, FB, 1)
  const botRect       = isRTE ? tuckArch(xBack, xSideL, yBod2, FB, 1) : rectFlap(xBack, xSideL, yBod2, FB, 1)
  const botDustL      = dustFlap(xSideL, xFront, yBod2, FB * 0.52, 1, D)
  const botDustR      = dustFlap(xSideR, xSideR + D, yBod2, FB * 0.52, 1, D)

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${svgW} ${svgH}"
     width="${svgW * 3.78}px" height="${svgH * 3.78}px">

  <defs>
    <marker id="arr" markerWidth="5" markerHeight="5" refX="4.5" refY="2" orient="auto">
      <path d="M 0,0.5 L 4.5,2 L 0,3.5" fill="none" stroke="${ANN}" stroke-width="0.6"/>
    </marker>
    <marker id="arr-rev" markerWidth="5" markerHeight="5" refX="0" refY="2" orient="auto-start-reverse">
      <path d="M 0,0.5 L 4.5,2 L 0,3.5" fill="none" stroke="${ANN}" stroke-width="0.6"/>
    </marker>
  </defs>

  <!-- Background -->
  <rect width="${svgW}" height="${svgH}" fill="white"/>

  <!-- ── FILLS ─────────────────────────────────────────────────────── -->

  <!-- Glue flap -->
  <path d="${gluePath()}" fill="${fillGlue}"/>

  <!-- Body panels -->
  <rect x="${x(xBack)}"  y="${y(yBody)}" width="${W}" height="${H}" fill="${fillBack}"/>
  <rect x="${x(xSideL)}" y="${y(yBody)}" width="${D}" height="${H}" fill="${fillSide}"/>
  <rect x="${x(xFront)}" y="${y(yBody)}" width="${W}" height="${H}" fill="${fillFront}"/>
  <rect x="${x(xSideR)}" y="${y(yBody)}" width="${D}" height="${H}" fill="${fillSide}"/>

  <!-- Top flaps -->
  <path d="${topRectBack}"     fill="${fillFlap}"/>
  <path d="${topDustL}"        fill="${fillFlap}"/>
  <path d="${isRTE ? tuckArch(xBack, xSideL, yBody, FT, -1) : tuckArch(xFront, xSideR, yBody, FT, -1)}"
        fill="${fillFlap}"/>
  <path d="${topDustR}"        fill="${fillFlap}"/>

  <!-- Bottom flaps -->
  <path d="${botRect}"         fill="${fillFlap}"/>
  <path d="${botDustL}"        fill="${fillFlap}"/>
  <path d="${botArch}"         fill="${fillFlap}"/>
  <path d="${botDustR}"        fill="${fillFlap}"/>

  <!-- ── CUT LINES ─────────────────────────────────────────────────── -->

  <!-- Glue flap outline (cut) -->
  <path d="${gluePath()}" fill="none" stroke="${CUT}" stroke-width="${CW}" stroke-linejoin="round"/>

  <!-- Body panels (cut) -->
  <rect x="${x(xBack)}"  y="${y(yBody)}" width="${W}" height="${H}" fill="none" stroke="${CUT}" stroke-width="${CW}"/>
  <rect x="${x(xSideL)}" y="${y(yBody)}" width="${D}" height="${H}" fill="none" stroke="${CUT}" stroke-width="${CW}"/>
  <rect x="${x(xFront)}" y="${y(yBody)}" width="${W}" height="${H}" fill="none" stroke="${CUT}" stroke-width="${CW}"/>
  <rect x="${x(xSideR)}" y="${y(yBody)}" width="${D}" height="${H}" fill="none" stroke="${CUT}" stroke-width="${CW}"/>

  <!-- Top flap cuts -->
  <path d="${topRectBack}" fill="none" stroke="${CUT}" stroke-width="${CW}" stroke-linejoin="round"/>
  <path d="${topDustL}"    fill="none" stroke="${CUT}" stroke-width="${CW}" stroke-linejoin="round"/>
  <path d="${isRTE ? tuckArch(xBack, xSideL, yBody, FT, -1) : tuckArch(xFront, xSideR, yBody, FT, -1)}"
        fill="none" stroke="${CUT}" stroke-width="${CW}" stroke-linejoin="round"/>
  <path d="${topDustR}"    fill="none" stroke="${CUT}" stroke-width="${CW}" stroke-linejoin="round"/>

  <!-- Bottom flap cuts -->
  <path d="${botRect}"    fill="none" stroke="${CUT}" stroke-width="${CW}" stroke-linejoin="round"/>
  <path d="${botDustL}"   fill="none" stroke="${CUT}" stroke-width="${CW}" stroke-linejoin="round"/>
  <path d="${botArch}"    fill="none" stroke="${CUT}" stroke-width="${CW}" stroke-linejoin="round"/>
  <path d="${botDustR}"   fill="none" stroke="${CUT}" stroke-width="${CW}" stroke-linejoin="round"/>

  <!-- ── FOLD LINES (vincos) ───────────────────────────────────────── -->

  <!-- Vertical folds -->
  ${[xBack, xSideL, xFront, xSideR].map(xv =>
    `<line x1="${x(xv)}" y1="${y(yTop)}" x2="${x(xv)}" y2="${y(totalH)}"
           stroke="${FOLD}" stroke-width="${FW}" stroke-dasharray="${FDASH}"/>`
  ).join("\n  ")}

  <!-- Horizontal folds (body) -->
  <line x1="${x(0)}" y1="${y(yBody)}" x2="${x(totalW)}" y2="${y(yBody)}"
        stroke="${FOLD}" stroke-width="${FW}" stroke-dasharray="${FDASH}"/>
  <line x1="${x(0)}" y1="${y(yBod2)}" x2="${x(totalW)}" y2="${y(yBod2)}"
        stroke="${FOLD}" stroke-width="${FW}" stroke-dasharray="${FDASH}"/>

  <!-- ── PANEL LABELS ──────────────────────────────────────────────── -->

  ${panelLabel(xBack  + W/2, yBody + H/2, "FUNDO",     `${p.largura}×${p.altura} cm`)}
  ${panelLabel(xSideL + D/2, yBody + H/2, "LATERAL",   `${p.profundidade}×${p.altura} cm`)}
  ${panelLabel(xFront + W/2, yBody + H/2, "FRENTE",    `${p.largura}×${p.altura} cm`)}
  ${panelLabel(xSideR + D/2, yBody + H/2, "LATERAL",   `${p.profundidade}×${p.altura} cm`)}
  ${panelLabel(xGlue  + G/2, yBody + H/2, "ABA",       "cola")}

  <!-- Flap labels -->
  <text x="${x(xFront + W/2)}" y="${y(FT * 0.45)}"
        text-anchor="middle" dominant-baseline="central"
        font-size="3.2" fill="${ANN}" font-family="Arial,sans-serif">
    ${isRTE ? "Tampa (reversa)" : "Tampa (tuck)"}
  </text>
  <text x="${x(xBack + W/2)}" y="${y(FT * 0.45)}"
        text-anchor="middle" dominant-baseline="central"
        font-size="3.2" fill="${ANN}" font-family="Arial,sans-serif">
    ${isRTE ? "Tampa (tuck)" : "Tampa (aba)"}
  </text>
  <text x="${x(xFront + W/2)}" y="${y(yBod2 + FB * 0.55)}"
        text-anchor="middle" dominant-baseline="central"
        font-size="3.2" fill="${ANN}" font-family="Arial,sans-serif">
    Fundo (tuck)
  </text>
  <text x="${x(xBack + W/2)}" y="${y(yBod2 + FB * 0.55)}"
        text-anchor="middle" dominant-baseline="central"
        font-size="3.2" fill="${ANN}" font-family="Arial,sans-serif">
    ${isRTE ? "Fundo (tuck)" : "Fundo (aba)"}
  </text>

  <!-- ── DIMENSION ANNOTATIONS ─────────────────────────────────────── -->

  <!-- Horizontal: panel widths -->
  ${dimHoriz(xGlue,  xBack,  totalH, `${p.abaColagem} cm`)}
  ${dimHoriz(xBack,  xSideL, totalH, `${p.largura} cm`)}
  ${dimHoriz(xSideL, xFront, totalH, `${p.profundidade} cm`)}
  ${dimHoriz(xFront, xSideR, totalH, `${p.largura} cm`)}
  ${dimHoriz(xSideR, totalW, totalH, `${p.profundidade} cm`)}

  <!-- Vertical: heights -->
  ${dimVert(xGlue, yTop,   yBody,  `${(FT/10).toFixed(1)} cm`)}
  ${dimVert(xGlue, yBody,  yBod2,  `${p.altura} cm`)}
  ${dimVert(xGlue, yBod2,  totalH, `${(FB/10).toFixed(1)} cm`)}

  <!-- ── TITLE BLOCK ────────────────────────────────────────────────── -->

  <rect x="${svgW - 55}" y="${svgH - 12}" width="54" height="11" fill="#f8fafc" stroke="#e2e8f0" stroke-width="0.3" rx="1"/>
  <text x="${svgW - 28}" y="${svgH - 7.5}" text-anchor="middle" dominant-baseline="central"
        font-size="3.8" font-weight="700" fill="#5009c4" font-family="Arial,sans-serif">${nome}</text>
  <text x="${svgW - 28}" y="${svgH - 4}" text-anchor="middle" dominant-baseline="central"
        font-size="3" fill="${ANN}" font-family="Arial,sans-serif">
    ${tipo} · ${p.largura}×${p.altura}×${p.profundidade} cm · Faca: ${((totalW)/10).toFixed(1)}×${((totalH)/10).toFixed(1)} cm
  </text>

  <!-- ── LEGEND ─────────────────────────────────────────────────────── -->

  <g transform="translate(${ox}, ${svgH - 11})">
    <line x1="0" y1="3" x2="8" y2="3" stroke="${CUT}" stroke-width="${CW}"/>
    <text x="10" y="3" dominant-baseline="central" font-size="3.2" fill="${ANN}" font-family="Arial,sans-serif">Corte</text>
    <line x1="22" y1="3" x2="30" y2="3" stroke="${FOLD}" stroke-width="${FW}" stroke-dasharray="${FDASH}"/>
    <text x="32" y="3" dominant-baseline="central" font-size="3.2" fill="${ANN}" font-family="Arial,sans-serif">Vinco/Dobra</text>
  </g>

</svg>`

  return svg.trim()
}
