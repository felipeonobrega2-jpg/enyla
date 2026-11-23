"use client"

// Prédio ENYLA → Térreo: a gráfica virtual. Uma estação para cada etapa real do quadro de pedidos (arte → expedição);
// os pedidos de verdade aparecem como caixinhas na esteira de cada estação, a máquina com pedido trabalha (rolos
// giram, prensa bate, luz do UV acende) e o atrasado fica vermelho. Clique na estação para ver os pedidos dela.
// Pixel art no mesmo estilo da sala dos agentes. Só desenho: lê o quadro, nenhuma chamada de IA.

import React, { useMemo, useState } from "react"
import type { KanbanCard } from "../../types"
import { COLUNAS_KANBAN } from "../../types"

const T = "#2a2238"
const O = ({ x, y, w, h, c }: { x: number; y: number; w: number; h: number; c: string }) => (
  <g><rect x={x - 1} y={y - 1} width={w + 2} height={h + 2} fill={T} /><rect x={x} y={y} width={w} height={h} fill={c} /></g>
)
const R = ({ x, y, w, h, c, o }: { x: number; y: number; w: number; h: number; c: string; o?: number }) => <rect x={x} y={y} width={w} height={h} fill={c} opacity={o} />

// Estações: coluna do quadro → máquina desenhada
export const ESTACOES: { coluna: number; nome: string; curto: string }[] = [
  { coluna: 2, nome: "Arte / Dieline", curto: "Arte" },
  { coluna: 3, nome: "Aprovação", curto: "Aprovação" },
  { coluna: 4, nome: "Fila de impressão", curto: "Fila" },
  { coluna: 5, nome: "Impressão", curto: "Impressão" },
  { coluna: 6, nome: "Verniz", curto: "Verniz" },
  { coluna: 7, nome: "Acabamento", curto: "Acabamento" },
  { coluna: 8, nome: "Expedição", curto: "Expedição" },
]
const W = 392, H = 180, PASSO = 54, X0 = 11, ESTEIRA = 158

export const atrasado = (c: Pick<KanbanCard, "dataEntregaPrevista">, hoje = new Date().toLocaleDateString("sv-SE")) =>
  !!c.dataEntregaPrevista && c.dataEntregaPrevista.slice(0, 10) < hoje

function Maquina({ coluna, x, ativa }: { coluna: number; x: number; ativa: boolean }) {
  const anima = (tipo: "rotate" | "translate", valores: string, dur: string) => ativa
    ? <animateTransform attributeName="transform" type={tipo} values={valores} dur={dur} repeatCount="indefinite" /> : null
  switch (coluna) {
    case 2: return (   // designer na mesa com o monitor
      <g>
        <O x={x + 4} y={128} w={38} h={6} c="#8a6a4a" /><R x={x + 7} y={134} w={3} h={14} c="#6b5038" /><R x={x + 36} y={134} w={3} h={14} c="#6b5038" />
        <O x={x + 12} y={110} w={22} h={15} c="#3b3550" /><R x={x + 14} y={112} w={18} h={11} c={ativa ? "#8fd3ff" : "#4b4560"} /><R x={x + 21} y={125} w={4} h={3} c="#3b3550" />
        {ativa && <g><R x={x + 16} y={115} w={8} h={1.5} c="#8456e8" /><R x={x + 16} y={118} w={12} h={1.5} c="#f4d98a" /></g>}
        <O x={x + 18} y={136} w={10} h={12} c="#8456e8" /><O x={x + 19} y={128} w={8} h={7} c="#f1c9a5" />
      </g>)
    case 3: return (   // quadro de aprovação com check
      <g>
        <O x={x + 9} y={104} w={28} h={34} c="#f6f2e8" /><R x={x + 17} y={101} w={12} h={5} c="#9a9aa5" />
        <R x={x + 13} y={111} w={14} h={2} c="#c9c6d2" /><R x={x + 13} y={116} w={18} h={2} c="#c9c6d2" /><R x={x + 13} y={121} w={10} h={2} c="#c9c6d2" />
        <g opacity={ativa ? 1 : 0.25}><R x={x + 24} y={126} w={3} h={3} c="#009351" /><R x={x + 27} y={129} w={3} h={3} c="#009351" /><R x={x + 30} y={123} w={3} h={3} c="#009351" /><R x={x + 33} y={120} w={3} h={3} c="#009351" /></g>
        <R x={x + 21} y={138} w={4} h={10} c="#6b5038" />
      </g>)
    case 4: return (   // pilha de folhas esperando
      <g>
        <O x={x + 6} y={140} w={34} h={8} c="#6b5038" />
        {[0, 1, 2, 3, 4].map(i => <O key={i} x={x + 9 + (i % 2)} y={133 - i * 6} w={28} h={5} c={i % 2 ? "#ffffff" : "#efeaf7"} />)}
      </g>)
    case 5: return (   // impressora offset: corpo, rolos girando, folha saindo
      <g>
        <O x={x + 2} y={108} w={44} h={40} c="#4b5a72" /><R x={x + 2} y={108} w={44} h={6} c="#5f6f8a" />
        {[0, 1, 2].map(i => <g key={i} transform={`translate(${x + 11 + i * 13} 126)`}>
          <circle r={5} fill="#2a2238" /><circle r={4} fill={["#00aeef", "#ec008c", "#fff200"][i]} />
          <g>{anima("rotate", "0;360", `${0.7 + i * 0.15}s`)}<rect x={-0.8} y={-4} width={1.6} height={8} fill="#2a2238" opacity={0.6} /></g>
        </g>)}
        <R x={x + 6} y={138} w={36} h={3} c="#2a2238" o={0.35} />
        {ativa && <g>{anima("translate", "0 0;8 0;0 0", "1.2s")}<R x={x + 40} y={140} w={10} h={2} c="#ffffff" /></g>}
        <R x={x + 36} y={112} w={6} h={3} c={ativa ? "#3fe08a" : "#7a7a85"} />
      </g>)
    case 6: return (   // verniz UV: túnel com luz roxa
      <g>
        <O x={x + 4} y={116} w={40} h={32} c="#5b4b7a" />
        <O x={x + 10} y={122} w={28} h={12} c={ativa ? "#b78cff" : "#3b3550"} />
        {ativa && <rect x={x + 10} y={122} width={28} height={12} fill="#e9dcff"><animate attributeName="opacity" values="0.15;0.7;0.15" dur="1.4s" repeatCount="indefinite" /></rect>}
        <R x={x + 4} y={140} w={40} h={3} c="#2a2238" o={0.35} />
      </g>)
    case 7: return (   // corte e vinco: prensa batendo
      <g>
        <O x={x + 6} y={102} w={34} h={8} c="#5a5a66" /><R x={x + 9} y={110} w={4} h={30} c="#3d3d48" /><R x={x + 33} y={110} w={4} h={30} c="#3d3d48" />
        <g>{anima("translate", "0 0;0 9;0 0", "0.9s")}<O x={x + 12} y={112} w={22} h={8} c="#8a8a96" /></g>
        <O x={x + 8} y={136} w={30} h={12} c="#6b6b78" /><R x={x + 13} y={133} w={20} h={3} c="#ffffff" />
      </g>)
    case 8: return (   // expedição: caixas empilhadas e a van
      <g>
        <O x={x + 2} y={134} w={12} h={10} c="#c99a62" /><O x={x + 5} y={124} w={10} h={9} c="#d9ae78" />
        <O x={x + 18} y={126} w={28} h={16} c="#ffffff" /><R x={x + 37} y={128} w={7} h={6} c="#8fd3ff" /><R x={x + 20} y={131} w={14} h={3} c="#8456e8" />
        <circle cx={x + 24} cy={144} r={3.5} fill={T} /><circle cx={x + 40} cy={144} r={3.5} fill={T} />
        {ativa && <g>{anima("translate", "0 0;0 -1;0 0", "0.5s")}<R x={x + 46} y={136} w={3} h={2} c="#9a9aa5" /></g>}
      </g>)
  }
  return null
}

export function GraficaVirtual({ kanban, noite = false }: { kanban: KanbanCard[]; noite?: boolean }) {
  const [sel, setSel] = useState<number | null>(null)
  const hoje = new Date().toLocaleDateString("sv-SE")
  const porColuna = useMemo(() => {
    const m = new Map<number, KanbanCard[]>()
    for (const c of kanban) if (c.coluna >= 2 && c.coluna <= 8) m.set(c.coluna, [...(m.get(c.coluna) ?? []), c])
    return m
  }, [kanban])
  const total = [...porColuna.values()].reduce((t, l) => t + l.length, 0)
  const atrasados = [...porColuna.values()].flat().filter(c => atrasado(c, hoje)).length
  const lista = sel != null ? (porColuna.get(sel) ?? []) : []

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl overflow-hidden" style={{ background: "#2a2238" }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" shapeRendering="crispEdges" role="img" aria-label={`Gráfica virtual: ${total} pedidos em produção`}>
          {/* parede, janelões e piso */}
          <R x={0} y={0} w={W} h={H} c={noite ? "#2b2747" : "#d9d3e8"} />
          {[0, 1, 2, 3, 4, 5].map(i => <g key={i}><O x={14 + i * 64} y={14} w={44} h={30} c={noite ? "#1b2444" : "#a8dcff"} /><R x={35 + i * 64} y={14} w={2} h={30} c={T} />
            {!noite && <R x={18 + i * 64} y={17} w={8} h={3} c="#ffffff" o={0.7} />}</g>)}
          <R x={0} y={54} w={W} h={4} c="#8456e8" />
          <text x={W / 2} y={72} textAnchor="middle" fontSize={8} fontFamily="monospace" fontWeight="bold" fill={noite ? "#c9bff0" : "#5b4b7a"}>ENYLA · GRÁFICA</text>
          <R x={0} y={150} w={W} h={H - 150} c={noite ? "#3a3550" : "#b9b2c9"} />
          {Array.from({ length: 13 }, (_, i) => <R key={i} x={i * 32} y={150} w={1} h={H - 150} c="#000" o={0.08} />)}
          {/* esteira */}
          <O x={4} y={ESTEIRA} w={W - 8} h={7} c="#4a4458" />
          {Array.from({ length: 48 }, (_, i) => <R key={i} x={6 + i * 8} y={ESTEIRA + 2} w={4} h={3} c="#6a6478" />)}
          {ESTACOES.map((e, i) => {
            const x = X0 + i * PASSO, cards = porColuna.get(e.coluna) ?? [], n = cards.length
            const atras = cards.filter(c => atrasado(c, hoje)).length
            const marcado = sel === e.coluna
            return (
              <g key={e.coluna} onClick={() => setSel(s => s === e.coluna ? null : e.coluna)} style={{ cursor: "pointer" }} role="button" aria-label={`${e.nome}: ${n} pedidos`}>
                {marcado && <rect x={x - 2} y={84} width={PASSO - 4} height={92} fill="#8456e8" opacity={0.14} />}
                <Maquina coluna={e.coluna} x={x} ativa={n > 0} />
                {/* placa da estação */}
                <O x={x + 2} y={84} w={44} h={11} c={marcado ? "#8456e8" : "#ffffff"} />
                <text x={x + 22} y={92} textAnchor="middle" fontSize={e.curto.length > 8 ? 5 : 6} fontFamily="monospace" fontWeight="bold" fill={marcado ? "#ffffff" : T}>{e.curto}</text>
                {/* contador */}
                <circle cx={x + 44} cy={98} r={6.5} fill={atras ? "#d33a3c" : n ? "#009351" : "#9a9aa5"} stroke={T} strokeWidth={1} />
                <text x={x + 44} y={100.5} textAnchor="middle" fontSize={6.5} fontFamily="monospace" fontWeight="bold" fill="#fff">{n}</text>
                {/* pedidos na esteira (caixinhas) */}
                {cards.slice(0, 5).map((c, k) => {
                  const atr = atrasado(c, hoje)
                  return <g key={c.id}>
                    <O x={x + 4 + k * 8} y={ESTEIRA - 8} w={6} h={6} c={atr ? "#ff6b6b" : "#d9ae78"} />
                    <R x={x + 4 + k * 8} y={ESTEIRA - 6} w={6} h={1} c="#8a6a4a" o={0.6} />
                  </g>
                })}
                {n > 5 && <text x={x + 46} y={ESTEIRA - 2} textAnchor="end" fontSize={5.5} fontFamily="monospace" fill={T}>+{n - 5}</text>}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[12px] text-[#5e5c68]">
        <span><strong className="text-[#191625]">{total}</strong> {total === 1 ? "pedido" : "pedidos"} na produção</span>
        {atrasados > 0 && <span className="text-[#d33a3c] font-semibold">{atrasados} {atrasados === 1 ? "atrasado" : "atrasados"}</span>}
        <span className="text-[#898892]">toque numa máquina para ver os pedidos</span>
      </div>

      {sel != null && (
        <div className="bg-white rounded-xl border border-[rgba(60,60,67,0.08)] p-3">
          <p className="text-[12.5px] font-semibold text-[#191625] mb-1.5">{COLUNAS_KANBAN[sel]} · {lista.length} {lista.length === 1 ? "pedido" : "pedidos"}</p>
          {lista.length === 0 ? <p className="text-[12px] text-[#898892]">Nenhum pedido nesta etapa agora.</p> : (
            <ul className="divide-y divide-[rgba(60,60,67,0.06)]">
              {lista.map(c => (
                <li key={c.id} className="flex items-center gap-3 py-1.5 text-[12.5px]">
                  <span className="font-semibold text-[#191625] shrink-0">{c.numero}</span>
                  <span className="flex-1 min-w-0 truncate text-[#5e5c68]">{c.nomeCliente}{c.dimensoes ? ` · ${c.dimensoes}` : ""}</span>
                  {c.dataEntregaPrevista && <span className={`shrink-0 ds-num ${atrasado(c, hoje) ? "text-[#d33a3c] font-semibold" : "text-[#898892]"}`}>
                    {atrasado(c, hoje) ? "atrasado · " : "entrega "}{new Date(c.dataEntregaPrevista.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")}
                  </span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
