"use client"

// Rotas de produção → "Como o motor pensou": a conta em português de gráfica e o desenho do que roda de verdade
// (a folha comprada cortada, e o pedaço que entra na máquina com a faixa da pinça e as caixas).

import React from "react"
import { Lightbulb } from "lucide-react"
import type { Rota, Maquina } from "../lib/producao"
import { explicarRota, desenharPassada, gradeDoCorte } from "../lib/explicaRota"

const ROXO = "#8456e8", AMBAR = "#c57800"

export function CaminhoDaFolha({ rota, alternativas, manual, perdaPct, esp, maquina, folha, blank }: {
  rota: Rota; alternativas: Rota[]; manual: boolean; perdaPct: number; esp: number
  maquina: Pick<Maquina, "pinca" | "margem" | "largura" | "altura"> | null
  folha: { largura: number; altura: number } | null          // mm
  blank: { largura: number; altura: number }
}) {
  const papel = rota.itens.filter(i => i.etapa === "papel").reduce((s, i) => s + i.valor, 0)
  const ex = explicarRota(rota, { perdaPct, alternativas, manual, precoPor100: rota.folhasPapel > 0 ? papel / rota.folhasPapel * 100 : undefined })
  const p0 = rota.passadas[0]
  const desenho = p0 && maquina ? desenharPassada(p0.largura, p0.altura, p0.cavidades, blank, maquina, esp) : null
  return (
    <div className="rounded-xl p-3.5 mb-4" style={{ background: "rgba(132,86,232,0.05)" }}>
      <p className="text-[11px] font-semibold flex items-center gap-1.5 mb-1.5" style={{ color: ROXO }}><Lightbulb className="w-3.5 h-3.5" /> Como o motor pensou</p>
      <p className="text-[12.5px] leading-relaxed text-[#3c3a45]">
        {ex.passos.map((s, i) => <React.Fragment key={i}>{i > 0 && <span className="text-[#aeadb5]"> → </span>}<span className={i === 2 ? "font-semibold text-[#191625]" : undefined}>{s}</span></React.Fragment>)}
      </p>
      {ex.porque && <p className="text-[12px] text-[#5e5c68] mt-1.5 italic">{ex.porque}</p>}
      {folha && desenho && (
        <div className="flex items-end gap-3 mt-3 overflow-x-auto">
          <Figura titulo={`Folha ${rota.formatoNome}`} sub={rota.divisao === 1 ? "inteira" : `cortada em ${rota.divisao}`}>
            <FolhaCortada folha={folha} divisao={rota.divisao} />
          </Figura>
          <span className="text-[#aeadb5] text-[18px] pb-8">→</span>
          <Figura titulo={`Entra na ${rota.impressorNome}`} sub={`${(Math.round(p0.largura) / 10).toLocaleString("pt-BR")}×${(Math.round(p0.altura) / 10).toLocaleString("pt-BR")} cm · ${p0.cavidades} ${p0.cavidades === 1 ? "caixa" : "caixas"}${desenho.encaixadasAMais ? ` (${desenho.encaixadasAMais} encaixada${desenho.encaixadasAMais > 1 ? "s" : ""})` : ""}`}>
            <Pedaco d={desenho} />
          </Figura>
          {desenho.pinca && <p className="text-[10.5px] text-[#898892] pb-8 flex items-center gap-1.5 shrink-0">
            <span className="inline-block w-3 h-2 rounded-sm" style={{ background: `${AMBAR}55` }} /> pinça ({(maquina!.pinca / 10).toLocaleString("pt-BR")} cm)
          </p>}
        </div>
      )}
    </div>
  )
}

function Figura({ titulo, sub, children }: { titulo: string; sub: string; children: React.ReactNode }) {
  return <div className="shrink-0">{children}<p className="text-[10.5px] font-semibold text-[#5e5c68] mt-1">{titulo}</p><p className="text-[10.5px] text-[#898892] ds-num">{sub}</p></div>
}

const ALTURA = 120
function FolhaCortada({ folha, divisao }: { folha: { largura: number; altura: number }; divisao: number }) {
  const k = ALTURA / folha.altura, W = folha.largura * k, H = ALTURA
  const { cols, rows } = gradeDoCorte(divisao)
  return (
    <svg width={W + 2} height={H + 2} viewBox={`-1 -1 ${W + 2} ${H + 2}`} role="img" aria-label={`Folha cortada em ${divisao}`}>
      <rect x={0} y={0} width={W} height={H} rx={2} fill="#fff" stroke="#c9c7d1" />
      <rect x={0} y={0} width={W / cols} height={H / rows} fill={`${ROXO}22`} stroke={ROXO} strokeWidth={1.2} />
      {Array.from({ length: cols - 1 }, (_, i) => <line key={`c${i}`} x1={(i + 1) * W / cols} y1={0} x2={(i + 1) * W / cols} y2={H} stroke="#9b99a5" strokeDasharray="3 2" />)}
      {Array.from({ length: rows - 1 }, (_, i) => <line key={`r${i}`} x1={0} y1={(i + 1) * H / rows} x2={W} y2={(i + 1) * H / rows} stroke="#9b99a5" strokeDasharray="3 2" />)}
    </svg>
  )
}

function Pedaco({ d }: { d: ReturnType<typeof desenharPassada> }) {
  const k = ALTURA / Math.max(d.h, d.w * 0.6), W = d.w * k, H = d.h * k
  return (
    <svg width={W + 2} height={H + 2} viewBox={`-1 -1 ${W + 2} ${H + 2}`} role="img" aria-label="Pedaço que entra na máquina">
      <rect x={0} y={0} width={W} height={H} rx={2} fill="#fff" stroke="#c9c7d1" />
      {d.pinca && <rect x={d.pinca.x * k} y={d.pinca.y * k} width={d.pinca.w * k} height={d.pinca.h * k} fill={`${AMBAR}55`} />}
      {d.caixas.map((c, i) => <rect key={i} x={c.x * k} y={c.y * k} width={c.w * k} height={c.h * k} rx={1.5} fill={`${ROXO}26`} stroke={ROXO} strokeWidth={1} />)}
    </svg>
  )
}
