"use client"

// Prédio ENYLA: a empresa virtual. Fachada com os andares (as janelas acendem onde tem trabalho acontecendo) e o
// elevador, que sobe e desce até o andar escolhido. Térreo: a gráfica virtual. 1º: a sala dos agentes. Os de cima
// (Financeiro, Marketing, Diretoria com COO/CFO/CTO) chegam nas próximas etapas e por enquanto estão em obras.

import React, { useEffect, useState } from "react"
import dynamic from "next/dynamic"

// 3D só no computador com WebGL (carrega o three.js só quando vai usar)
const Predio3D = dynamic(() => import("./Predio3D"), { ssr: false, loading: () => <div className="w-full h-full grid place-items-center text-[13px] text-[#898892]">Montando o prédio…</div> })
function podeTer3D(): boolean {
  if (typeof window === "undefined" || window.innerWidth < 1024) return false
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")) } catch { return false }
}
import { ArrowUp, ArrowDown, HardHat } from "lucide-react"

const T = "#2a2238"
export type Andar = { id: string; rotulo: string; nome: string; resumo: string; ativo: boolean; obras?: string; conteudo?: React.ReactNode }

const AW = 132, ANDAR_H = 30, TOPO = 26   // fachada: largura e altura de cada andar (unidades do SVG)

function Fachada({ andares, sel, onSel, noite }: { andares: Andar[]; sel: string; onSel: (id: string) => void; noite: boolean }) {
  const n = andares.length, H = TOPO + n * ANDAR_H + 22
  const idx = andares.findIndex(a => a.id === sel)
  const yAndar = (i: number) => TOPO + i * ANDAR_H
  return (
    <svg viewBox={`0 0 ${AW} ${H}`} className="w-full h-auto block" shapeRendering="crispEdges" role="img" aria-label="Prédio da ENYLA">
      <defs><linearGradient id="ceu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={noite ? "#1b1d3f" : "#9fd6ff"} /><stop offset="1" stopColor={noite ? "#3b2f5f" : "#e9f6ff"} /></linearGradient></defs>
      <rect x={0} y={0} width={AW} height={H} fill="url(#ceu)" />
      {noite ? [12, 40, 100, 118, 70].map((x, i) => <rect key={i} x={x} y={6 + (i % 3) * 5} width={1.5} height={1.5} fill="#fff" opacity={0.8} />)
        : <g><rect x={100} y={6} width={10} height={10} fill="#ffe27a" /><rect x={14} y={10} width={18} height={4} fill="#fff" opacity={0.8} /><rect x={18} y={7} width={10} height={4} fill="#fff" opacity={0.8} /></g>}
      {/* telhado com letreiro */}
      <rect x={13} y={TOPO - 12} width={AW - 26} height={12} fill={T} />
      <rect x={14} y={TOPO - 11} width={AW - 28} height={10} fill="#8456e8" />
      <text x={AW / 2} y={TOPO - 3.5} textAnchor="middle" fontSize={7} fontFamily="monospace" fontWeight="bold" fill="#fff">ENYLA</text>
      {andares.map((a, i) => {
        const y = yAndar(i), terreo = i === n - 1, marcado = a.id === sel
        return (
          <g key={a.id} onClick={() => onSel(a.id)} style={{ cursor: "pointer" }} role="button" aria-label={`${a.rotulo}: ${a.nome}`}>
            <rect x={9} y={y} width={AW - 18} height={ANDAR_H} fill={T} />
            <rect x={10} y={y + 1} width={AW - 20} height={ANDAR_H - 1} fill={marcado ? "#efe8ff" : a.obras ? "#cfc8bd" : "#e7e1f2"} />
            {/* janelas: acesas quando tem trabalho */}
            {(terreo ? [0, 3] : [0, 1, 2, 3]).map(j => (
              <g key={j}>
                <rect x={15 + j * 20} y={y + 7} width={14} height={14} fill={T} />
                <rect x={16 + j * 20} y={y + 8} width={12} height={12} fill={a.obras ? "#9b9488" : a.ativo ? (noite ? "#ffd96b" : "#fff4c2") : noite ? "#2a2f55" : "#a8dcff"} />
                {!a.obras && <rect x={21.5 + j * 20} y={y + 8} width={1} height={12} fill={T} opacity={0.6} />}
              </g>
            ))}
            {/* andar em obras: andaime */}
            {a.obras && <g opacity={0.9}>
              <rect x={10} y={y + 3} width={AW - 20} height={1.5} fill="#c57800" />
              {[14, 44, 74].map(x => <rect key={x} x={x} y={y + 1} width={1.5} height={ANDAR_H - 1} fill="#c57800" />)}
              <rect x={10} y={y + ANDAR_H - 5} width={AW - 20} height={1.5} fill="#c57800" />
            </g>}
            {/* rótulo do andar */}
            <rect x={14} y={y + 22.5} width={a.rotulo.length * 3.6 + 4} height={6} fill={T} opacity={0.75} />
            <text x={16} y={y + 27.2} fontSize={4.6} fontFamily="monospace" fill="#fff">{a.rotulo}</text>
            {terreo && <g>
              <rect x={86} y={y + 1} width={0} height={0} />
            </g>}
          </g>
        )
      })}
      {/* poço do elevador e a cabine */}
      <rect x={AW - 33} y={TOPO} width={14} height={n * ANDAR_H} fill="#3b3550" />
      <rect x={AW - 32} y={TOPO} width={12} height={n * ANDAR_H} fill="#4b4560" />
      <g style={{ transform: `translateY(${yAndar(Math.max(0, idx))}px)`, transition: "transform 900ms cubic-bezier(.45,0,.2,1)" }}>
        <rect x={AW - 32} y={4} width={12} height={22} fill={T} />
        <rect x={AW - 31} y={5} width={10} height={20} fill="#c9c6d2" />
        <rect x={AW - 26.5} y={5} width={1} height={20} fill={T} opacity={0.5} />
        <rect x={AW - 29} y={8} width={6} height={1.5} fill="#8456e8" />
      </g>
      {/* calçada e porta de entrada */}
      <rect x={0} y={TOPO + n * ANDAR_H} width={AW} height={22} fill={noite ? "#3a3550" : "#b9b2c9"} />
      <rect x={4} y={TOPO + n * ANDAR_H} width={AW - 8} height={3} fill="#8a8398" />
      <rect x={44} y={TOPO + (n - 1) * ANDAR_H + 9} width={22} height={ANDAR_H - 9} fill={T} />
      <rect x={45} y={TOPO + (n - 1) * ANDAR_H + 10} width={20} height={ANDAR_H - 10} fill="#7a6a9a" />
    </svg>
  )
}

export function PredioView({ andares, inicial }: { andares: Andar[]; inicial?: string }) {
  const [sel, setSel] = useState(inicial ?? andares[andares.length - 1]?.id)
  const [noite, setNoite] = useState(false)
  useEffect(() => { const h = new Date().getHours(); setNoite(h < 6 || h >= 19) }, [])
  useEffect(() => { try { const s = sessionStorage.getItem("predio:andar"); if (s && andares.some(a => a.id === s)) setSel(s) } catch { /* sem storage */ } }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const ir = (id: string) => { setSel(id); try { sessionStorage.setItem("predio:andar", id) } catch { /* sem storage */ } }
  const i = andares.findIndex(a => a.id === sel), a = andares[i] ?? andares[andares.length - 1]
  const [tres, setTres] = useState(false)
  useEffect(() => { setTres(podeTer3D()) }, [])
  const cabecalho = (
    <div className="flex items-center gap-2 mb-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#898892]">{a.rotulo}</p>
      <p className="text-[16px] font-semibold text-[#191625]">{a.nome}</p>
      <span className="flex-1" />
      <button onClick={() => i > 0 && ir(andares[i - 1].id)} disabled={i <= 0} aria-label="Subir um andar" className="w-8 h-8 rounded-lg grid place-items-center text-[#5e5c68] hover:bg-[rgba(116,116,128,0.1)] disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
      <button onClick={() => i < andares.length - 1 && ir(andares[i + 1].id)} disabled={i >= andares.length - 1} aria-label="Descer um andar" className="w-8 h-8 rounded-lg grid place-items-center text-[#5e5c68] hover:bg-[rgba(116,116,128,0.1)] disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
    </div>
  )
  const conteudo = a.obras ? (
    <div className="rounded-xl border border-dashed border-[#c57800]/40 bg-[#c57800]/[0.04] p-6 flex items-start gap-3">
      <HardHat className="w-6 h-6 text-[#c57800] shrink-0" />
      <div>
        <p className="text-[14px] font-semibold text-[#191625]">Andar em obras</p>
        <p className="text-[12.5px] text-[#5e5c68] mt-1 leading-relaxed">{a.obras}</p>
      </div>
    </div>
  ) : a.conteudo
  if (tres) return (
    <div className="space-y-4">
      <div className="relative w-full h-[min(68vh,640px)] rounded-2xl overflow-hidden border border-[rgba(60,60,67,0.10)]">
        <Predio3D andares={andares} sel={a.id} onSel={ir} />
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11.5px] text-white/90 bg-black/35 backdrop-blur px-3 py-1 rounded-full pointer-events-none">
          Clique num andar para ir até ele · arraste para girar · role para aproximar
        </p>
      </div>
      <div key={a.id} className="min-w-0 ds-entrada">{cabecalho}{conteudo}</div>
    </div>
  )
  return (
    <div className="grid gap-4 lg:grid-cols-[230px_1fr] items-start">
      <div className="lg:sticky lg:top-4 flex lg:block gap-3 items-start">
        <div className="w-[118px] lg:w-auto lg:max-w-[230px] lg:mx-auto shrink-0 rounded-2xl overflow-hidden border border-[rgba(60,60,67,0.10)] bg-white">
          <Fachada andares={andares} sel={a.id} onSel={ir} noite={noite} />
        </div>
        {/* painel do elevador */}
        <div className="flex-1 min-w-0 lg:max-w-[230px] lg:mx-auto lg:mt-2 grid grid-cols-1 gap-0.5 lg:gap-1">
          {andares.map(x => (
            <button key={x.id} onClick={() => ir(x.id)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors ${x.id === a.id ? "bg-[#8456e8] text-white" : "hover:bg-[rgba(116,116,128,0.08)] text-[#3c3a45]"}`}>
              <span className={`w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${x.id === a.id ? "bg-white/20" : "bg-[rgba(116,116,128,0.1)]"}`}>{x.rotulo === "Térreo" ? "T" : x.rotulo === "Cobertura" ? "C" : x.rotulo.replace(/\D/g, "")}</span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold truncate">{x.nome}</span>
                <span className={`block text-[11px] truncate ${x.id === a.id ? "text-white/75" : "text-[#898892]"}`}>{x.obras ? "em obras" : x.resumo}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div key={a.id} className="min-w-0 ds-entrada">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#898892]">{a.rotulo}</p>
          <p className="text-[16px] font-semibold text-[#191625]">{a.nome}</p>
          <span className="flex-1" />
          <button onClick={() => i > 0 && ir(andares[i - 1].id)} disabled={i <= 0} aria-label="Subir um andar" className="w-8 h-8 rounded-lg grid place-items-center text-[#5e5c68] hover:bg-[rgba(116,116,128,0.1)] disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
          <button onClick={() => i < andares.length - 1 && ir(andares[i + 1].id)} disabled={i >= andares.length - 1} aria-label="Descer um andar" className="w-8 h-8 rounded-lg grid place-items-center text-[#5e5c68] hover:bg-[rgba(116,116,128,0.1)] disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
        </div>
        {a.obras ? (
          <div className="rounded-xl border border-dashed border-[#c57800]/40 bg-[#c57800]/[0.04] p-6 flex items-start gap-3">
            <HardHat className="w-6 h-6 text-[#c57800] shrink-0" />
            <div>
              <p className="text-[14px] font-semibold text-[#191625]">Andar em obras</p>
              <p className="text-[12.5px] text-[#5e5c68] mt-1 leading-relaxed">{a.obras}</p>
            </div>
          </div>
        ) : a.conteudo}
      </div>
    </div>
  )
}
