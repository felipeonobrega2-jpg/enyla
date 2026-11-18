"use client"

// Escritório virtual da ENYLA (visão de cima, pixel art): setores de verdade, cada agente na sua mesa e se movendo
// pelo estado real. Trabalhando: digita. De plantão: fica na mesa e de vez em quando vai à copa (pelo corredor).
// Travado: "!" na mesa. Fora do horário: dorme nos sofás. O vigia faz ronda no corredor.
// Só desenho: lê os mesmos dados do Escritório, nenhuma chamada de IA.

import { useEffect, useMemo, useRef, useState } from "react"
import type { Mesa, IdMesa, EstadoMesa } from "../lib/escritorio"

const T = "#2a2238"   // traço
const O = ({ x, y, w, h, c, k }: { x: number; y: number; w: number; h: number; c: string; k?: string }) => (
  <g className={k}><rect x={x - 1} y={y - 1} width={w + 2} height={h + 2} fill={T} /><rect x={x} y={y} width={w} height={h} fill={c} /></g>
)
const R = ({ x, y, w, h, c, o, k }: { x: number; y: number; w: number; h: number; c: string; o?: number; k?: string }) => (
  <rect x={x} y={y} width={w} height={h} fill={c} opacity={o} className={k} />
)

// ── Planta do prédio ─────────────────────────────────────────────────────────
type IdSala = "recepcao" | "comercial" | "diretoria" | "corredor" | "copa" | "orcamentos" | "treinamento" | "producao"
type Retang = { x: number; y: number; w: number; h: number }
// Tamanho nominal do conteúdo de cada sala (a sala real pode ser maior: o conteúdo fica centralizado)
const NOMINAL: Record<Exclude<IdSala, "corredor">, [number, number]> = {
  recepcao: [92, 92], comercial: [182, 92], diretoria: [98, 92], copa: [92, 86], orcamentos: [104, 86], treinamento: [74, 86], producao: [99, 86],
}
const FACE = 14
type PlantaPredio = { W: number; H: number; salas: Record<IdSala, Retang> }
const LARGA: PlantaPredio = {
  W: 384, H: 216, salas: {
    recepcao: { x: 3, y: 3, w: 92, h: 92 }, comercial: { x: 98, y: 3, w: 182, h: 92 }, diretoria: { x: 283, y: 3, w: 98, h: 92 },
    corredor: { x: 3, y: 98, w: 378, h: 26 },
    copa: { x: 3, y: 127, w: 92, h: 86 }, orcamentos: { x: 98, y: 127, w: 104, h: 86 }, treinamento: { x: 205, y: 127, w: 74, h: 86 }, producao: { x: 282, y: 127, w: 99, h: 86 },
  },
}
const ALTA: PlantaPredio = {
  W: 216, H: 396, salas: {
    recepcao: { x: 3, y: 3, w: 104, h: 92 }, diretoria: { x: 110, y: 3, w: 103, h: 92 },
    comercial: { x: 3, y: 98, w: 210, h: 92 },
    corredor: { x: 3, y: 193, w: 210, h: 22 },
    orcamentos: { x: 3, y: 218, w: 117, h: 86 }, treinamento: { x: 123, y: 218, w: 90, h: 86 },
    copa: { x: 3, y: 307, w: 105, h: 86 }, producao: { x: 111, y: 307, w: 102, h: 86 },
  },
}
// Porta de cada sala para o corredor (x local nominal)
const PORTA: Record<Exclude<IdSala, "corredor">, number> = { recepcao: 72, comercial: 92, diretoria: 14, copa: 76, orcamentos: 90, treinamento: 62, producao: 10 }
const EM_CIMA: Record<Exclude<IdSala, "corredor">, boolean> = { recepcao: true, comercial: true, diretoria: true, copa: false, orcamentos: false, treinamento: false, producao: false }

const origem = (p: PlantaPredio, s: Exclude<IdSala, "corredor">) => {
  const r = p.salas[s], [nw, nh] = NOMINAL[s]
  return { x: r.x + Math.floor((r.w - nw) / 2), y: r.y + Math.floor((r.h - nh) / 2) }
}
const abs = (p: PlantaPredio, s: Exclude<IdSala, "corredor">, x: number, y: number): [number, number] => { const o = origem(p, s); return [o.x + x, o.y + y] }

// Lugares (local nominal de cada sala)
type Ponto = { sala: Exclude<IdSala, "corredor">; x: number; y: number }
const MESA: Record<IdMesa, Ponto> = {
  atendente: { sala: "comercial", x: 28, y: 34 }, coletor: { sala: "comercial", x: 72, y: 34 },
  followup: { sala: "comercial", x: 28, y: 72 }, reativacao: { sala: "comercial", x: 72, y: 72 },
  digital: { sala: "orcamentos", x: 22, y: 36 }, propostas: { sala: "orcamentos", x: 66, y: 36 },
  aprendiz: { sala: "treinamento", x: 30, y: 38 }, vigia: { sala: "recepcao", x: 46, y: 42 },
}
const DESCANSO: Record<IdMesa, Ponto> = {
  atendente: { sala: "copa", x: 60, y: 76 }, coletor: { sala: "copa", x: 74, y: 76 },
  followup: { sala: "recepcao", x: 14, y: 80 }, reativacao: { sala: "recepcao", x: 28, y: 80 },
  digital: { sala: "copa", x: 30, y: 56 }, propostas: { sala: "copa", x: 50, y: 56 },
  aprendiz: { sala: "treinamento", x: 16, y: 72 }, vigia: { sala: "diretoria", x: 18, y: 80 },
}
const PAUSA: Ponto[] = [{ sala: "copa", x: 16, y: 34 }, { sala: "copa", x: 32, y: 36 }, { sala: "copa", x: 66, y: 40 }, { sala: "copa", x: 22, y: 70 }]

const PERS: Record<IdMesa, { roupa: string; cabelo: string; pele: string; estilo: "curto" | "longo" | "coque" | "careca" | "bone" | "cacheado"; calca: string }> = {
  atendente: { roupa: "#8456e8", cabelo: "#3b2418", pele: "#f1c7a3", estilo: "longo", calca: "#2d2a40" },
  coletor: { roupa: "#2f7cf6", cabelo: "#1d1d24", pele: "#c98e64", estilo: "curto", calca: "#3b3a4a" },
  followup: { roupa: "#0f9ba8", cabelo: "#b5651d", pele: "#f5d0b0", estilo: "coque", calca: "#2d2a40" },
  reativacao: { roupa: "#d4497b", cabelo: "#2a1a12", pele: "#8d5a3b", estilo: "cacheado", calca: "#3b3a4a" },
  digital: { roupa: "#e07b1f", cabelo: "#d9b44a", pele: "#f3cfae", estilo: "curto", calca: "#334a6b" },
  propostas: { roupa: "#1f9d55", cabelo: "#5a5a62", pele: "#e0ac85", estilo: "careca", calca: "#2d2a40" },
  vigia: { roupa: "#3c3b52", cabelo: "#1d1d24", pele: "#b67a52", estilo: "bone", calca: "#22202e" },
  aprendiz: { roupa: "#c98a12", cabelo: "#7a3b1c", pele: "#f6d5b8", estilo: "coque", calca: "#334a6b" },
}

// ── Personagens ──────────────────────────────────────────────────────────────
function Cabeca({ p, dorme, travado, y = 0 }: { p: (typeof PERS)[IdMesa]; dorme?: boolean; travado?: boolean; y?: number }) {
  return (
    <g transform={`translate(0 ${y})`} className={dorme ? "sala-cochila" : undefined}>
      {p.estilo === "longo" && <O x={-5} y={-9} w={10} h={10} c={p.cabelo} />}
      {p.estilo === "cacheado" && <O x={-6} y={-10} w={12} h={9} c={p.cabelo} />}
      <O x={-4} y={-8} w={8} h={8} c={p.pele} />
      <R x={-4} y={-1} w={8} h={1} c="#000" o={0.12} />
      {p.estilo !== "careca" && p.estilo !== "bone" && <R x={-4} y={-8} w={8} h={3} c={p.cabelo} />}
      {(p.estilo === "longo" || p.estilo === "cacheado") && <><R x={-4} y={-5} w={1} h={3} c={p.cabelo} /><R x={3} y={-5} w={1} h={3} c={p.cabelo} /></>}
      {p.estilo === "coque" && <O x={-2} y={-11} w={4} h={2} c={p.cabelo} />}
      {p.estilo === "careca" && <><R x={-4} y={-6} w={1} h={2} c={p.cabelo} /><R x={3} y={-6} w={1} h={2} c={p.cabelo} /></>}
      {p.estilo === "bone" && <><O x={-5} y={-10} w={10} h={4} c="#2f7cf6" /><O x={3} y={-7} w={3} h={1} c="#2459c4" /></>}
      {dorme ? <><R x={-3} y={-4} w={2} h={1} c={T} /><R x={1} y={-4} w={2} h={1} c={T} /></>
        : <g className="sala-pisca"><R x={-2} y={-5} w={1} h={2} c={T} /><R x={1} y={-5} w={1} h={2} c={T} /></g>}
      <R x={-4} y={-3} w={1} h={1} c="#ff7a7a" o={0.45} /><R x={3} y={-3} w={1} h={1} c="#ff7a7a" o={0.45} />
      {travado && <R x={-1} y={-2} w={2} h={1} c="#7a2a2a" />}
    </g>
  )
}
// Sentado atrás da mesa (a mesa cobre da cintura pra baixo)
function Sentado({ id, estado }: { id: IdMesa; estado: EstadoMesa }) {
  const p = PERS[id]
  return (
    <g className={estado === "plantao" ? "sala-respira" : undefined}>
      <O x={-7} y={-6} w={2} h={6} c={p.roupa} /><O x={5} y={-6} w={2} h={6} c={p.roupa} />
      <O x={-5} y={-7} w={10} h={8} c={p.roupa} /><R x={-5} y={-7} w={10} h={1} c="#fff" o={0.22} /><R x={-1} y={-7} w={2} h={1} c={p.pele} />
      <Cabeca p={p} y={-8} dorme={estado === "descansando"} travado={estado === "travado"} />
    </g>
  )
}
// Em pé (pausa, ronda, andando)
function EmPe({ id, andando, cafe }: { id: IdMesa; andando: boolean; cafe?: boolean }) {
  const p = PERS[id]
  return (
    <g>
      <R x={-5} y={-1} w={10} h={3} c="#000" o={0.16} />
      <g className={andando ? "sala-passo" : undefined}>
        <O x={-3} y={-4} w={2} h={4} c={p.calca} k={andando ? "sala-perna-a" : undefined} />
        <O x={1} y={-4} w={2} h={4} c={p.calca} k={andando ? "sala-perna-b" : undefined} />
        <O x={-6} y={-11} w={2} h={6} c={p.roupa} /><O x={4} y={-11} w={2} h={6} c={p.roupa} />
        <O x={-4} y={-12} w={8} h={8} c={p.roupa} /><R x={-4} y={-12} w={8} h={1} c="#fff" o={0.22} />
        {id === "vigia" && <R x={-3} y={-10} w={2} h={2} c="#f1c84b" />}
        {cafe && <O x={5} y={-7} w={3} h={3} c="#f4f1ea" />}
        <Cabeca p={p} y={-12} />
      </g>
    </g>
  )
}
function Balao({ estado, cor }: { estado: EstadoMesa; cor: string }) {
  if (estado === "trabalhando") return (
    <g transform="translate(6 -26)"><O x={0} y={0} w={13} h={6} c="#fff" /><R x={2} y={2} w={2} h={2} c={cor} k="sala-ponto-1" /><R x={6} y={2} w={2} h={2} c={cor} k="sala-ponto-2" /><R x={10} y={2} w={2} h={2} c={cor} k="sala-ponto-3" /></g>
  )
  if (estado === "travado") return <g transform="translate(6 -28)" className="sala-alerta"><O x={0} y={0} w={7} h={9} c="#fff" /><R x={3} y={2} w={1} h={4} c="#d33a3c" /><R x={3} y={7} w={1} h={1} c="#d33a3c" /></g>
  if (estado === "descansando") return <g className="sala-zzz" transform="translate(5 -22)"><R x={0} y={0} w={3} h={1} c="#5b5778" /><R x={1} y={1} w={1} h={1} c="#5b5778" /><R x={0} y={2} w={3} h={1} c="#5b5778" /></g>
  return null
}

// ── Móveis (coordenadas locais da sala) ─────────────────────────────────────
function Mesa({ x, y, w = 28, tela, monitor = true }: { x: number; y: number; w?: number; tela?: string; monitor?: boolean }) {
  return (
    <g>
      <R x={x + 1} y={y + 13} w={w - 2} h={2} c="#000" o={0.16} />
      <O x={x} y={y} w={w} h={8} c="#d6a96f" /><R x={x} y={y} w={w} h={1} c="#fff" o={0.3} />
      <O x={x} y={y + 8} w={w} h={5} c="#9c6f42" />
      {monitor && <>
        {tela && <R x={x + w / 2 - 7} y={y - 6} w={14} h={7} c={tela} o={0.3} k="sala-tela" />}
        <O x={x + w / 2 - 5} y={y - 3} w={10} h={4} c="#c9cdd8" /><R x={x + w / 2 - 5} y={y - 3} w={10} h={1} c={tela ?? "#8f95a6"} />
        <R x={x + w / 2 - 1} y={y - 1} w={2} h={1} c="#eef0f4" />
        <R x={x + w / 2 - 7} y={y + 2} w={14} h={2} c="#a9aeba" />
      </>}
      <O x={x + w - 6} y={y + 2} w={3} h={3} c="#f4f1ea" />
    </g>
  )
}
const Cadeira = ({ x, y }: { x: number; y: number }) => (
  <g><O x={x - 5} y={y - 15} w={10} h={8} c="#4b4558" /><R x={x - 4} y={y - 14} w={8} h={1} c="#6a6280" /><O x={x - 6} y={y - 7} w={12} h={4} c="#6a6280" /><R x={x - 6} y={y - 7} w={12} h={1} c="#857ca0" /></g>
)
const Vaso = ({ x, y }: { x: number; y: number }) => (
  <g><R x={x - 1} y={y + 9} w={10} h={2} c="#000" o={0.15} /><O x={x} y={y + 3} w={8} h={7} c="#b5653a" /><O x={x - 2} y={y - 6} w={5} h={9} c="#3f9a5a" k="sala-planta" /><O x={x + 4} y={y - 9} w={5} h={12} c="#4fb36b" k="sala-planta" /><O x={x + 2} y={y - 3} w={3} h={6} c="#2f7a46" /></g>
)
function Sofa({ x, y, w, c = "#6c5ba7" }: { x: number; y: number; w: number; c?: string }) {
  return <g><R x={x} y={y + 12} w={w} h={2} c="#000" o={0.15} /><O x={x} y={y} w={w} h={6} c={c} /><R x={x} y={y} w={w} h={1} c="#fff" o={0.2} /><O x={x - 2} y={y + 2} w={3} h={9} c={c} /><O x={x + w - 1} y={y + 2} w={3} h={9} c={c} /></g>
}
const SofaFrente = ({ x, y, w, c = "#7d6bb8" }: { x: number; y: number; w: number; c?: string }) => <O x={x} y={y + 7} w={w} h={4} c={c} />
function Janela({ x, w, ceu, noite }: { x: number; w: number; ceu: string; noite: boolean }) {
  return (
    <g>
      <O x={x} y={2} w={w} h={9} c="#6e6489" /><R x={x + 1} y={3} w={w - 2} h={7} c={ceu} />
      {!noite && <R x={x + 3} y={5} w={6} h={2} c="#fff" o={0.8} k="sala-nuvem" />}
      {noite && <R x={x + w - 6} y={4} w={2} h={2} c="#f4f1c9" />}
      <R x={x + Math.floor(w / 2)} y={3} w={1} h={7} c="#6e6489" />
    </g>
  )
}
const Estante = ({ x, y, h = 20 }: { x: number; y: number; h?: number }) => (
  <g><O x={x} y={y} w={14} h={h} c="#7d5733" />
    {Array.from({ length: Math.floor(h / 6) }, (_, i) => <g key={i}><R x={x + 1} y={y + 5 + i * 6} w={12} h={1} c="#5c3f24" />
      <R x={x + 2} y={y + 1 + i * 6} w={2} h={4} c={["#c0392b", "#2f7cf6", "#1f9d55", "#e07b1f"][i % 4]} /><R x={x + 5} y={y + 2 + i * 6} w={2} h={3} c="#f1c84b" /><R x={x + 8} y={y + 1 + i * 6} w={3} h={4} c="#8456e8" /></g>)}
  </g>
)
const Caixas = ({ x, y, c = "#c8a274", n = 3 }: { x: number; y: number; c?: string; n?: number }) => (
  <g>{Array.from({ length: n }, (_, i) => <g key={i}><O x={x + i * 9} y={y} w={8} h={7} c={c} /><R x={x + i * 9} y={y + 3} w={8} h={1} c="#000" o={0.12} /></g>)}
    {Array.from({ length: n - 1 }, (_, i) => <O key={`t${i}`} x={x + 4 + i * 9} y={y - 7} w={8} h={6} c={c} />)}</g>
)

function ConteudoSala({ s, ceu, noite, tela, quadro }: { s: Exclude<IdSala, "corredor">; ceu: string; noite: boolean; tela: Record<IdMesa, string | undefined>; quadro: { cota: number } }) {
  const J = (x: number, w: number) => <Janela x={x} w={w} ceu={ceu} noite={noite} />
  switch (s) {
    case "recepcao": return (
      <g>
        <O x={18} y={2} w={52} h={10} c={T} />
        <O x={78} y={2} w={10} h={12} c="#8a5a36" /><R x={85} y={8} w={1} h={1} c="#f1c84b" />
        <R x={20} y={30} w={52} h={30} c="#b9a3df" o={0.5} />
        <Vaso x={4} y={20} /><Vaso x={80} y={58} />
      </g>
    )
    case "comercial": return (
      <g>
        {J(4, 34)}{J(148, 30)}
        <O x={98} y={2} w={44} h={11} c="#2a2838" /><R x={100} y={4} w={40} h={7} c="#f5f3ff" />
        <R x={103} y={8} w={34} h={2} c="#e4dff0" /><R x={103} y={8} w={Math.round(34 * quadro.cota)} h={2} c={quadro.cota >= 1 ? "#d33a3c" : quadro.cota >= 0.75 ? "#e07b1f" : "#8456e8"} />
        <R x={6} y={22} w={96} h={68} c="#c8b6e6" o={0.45} />
        <Vaso x={96} y={46} />
        {/* mesa de reunião */}
        <R x={118} y={48} w={44} h={26} c="#c8b6e6" o={0.35} />
        <O x={128} y={44} w={6} h={5} c="#4b4558" /><O x={148} y={44} w={6} h={5} c="#4b4558" />
        <R x={123} y={66} w={36} h={2} c="#000" o={0.15} />
        <O x={122} y={52} w={38} h={12} c="#d6a96f" /><R x={122} y={52} w={38} h={1} c="#fff" o={0.3} /><O x={122} y={64} w={38} h={3} c="#9c6f42" />
        <O x={128} y={70} w={6} h={5} c="#4b4558" /><O x={148} y={70} w={6} h={5} c="#4b4558" />
        <O x={132} y={55} w={8} h={5} c="#ffffff" /><O x={146} y={56} w={3} h={3} c="#f4f1ea" />
        <Vaso x={170} y={20} />
      </g>
    )
    case "diretoria": return (
      <g>
        {J(6, 32)}
        <O x={48} y={3} w={16} h={9} c="#c99a3c" /><R x={50} y={5} w={12} h={5} c="#5aa6d6" /><R x={50} y={8} w={12} h={2} c="#4f9a5a" />
        <Estante x={78} y={8} h={22} />
        <R x={10} y={30} w={70} h={34} c="#d7c3a1" o={0.6} />
        <Cadeira x={44} y={42} />
        <Mesa x={24} y={42} w={40} tela={undefined} />
        <O x={28} y={44} w={8} h={3} c="#2a2838" />
        <Sofa x={10} y={70} w={16} c="#8a5a36" />
        <Vaso x={84} y={66} />
      </g>
    )
    case "copa": return (
      <g>
        <O x={4} y={2} w={58} h={6} c="#e8e2d4" />
        <O x={4} y={12} w={58} h={9} c="#d9d2c3" /><R x={4} y={12} w={58} h={1} c="#fff" o={0.4} />
        <O x={8} y={4} w={8} h={10} c="#3a3648" /><R x={10} y={6} w={4} h={2} c="#e07b1f" /><R x={11} y={1} w={1} h={2} c="#fff" o={0.6} k="sala-vapor" />
        <O x={28} y={13} w={10} h={4} c="#9fb4c8" />
        <O x={46} y={10} w={6} h={5} c="#f4f1ea" />
        <O x={68} y={2} w={14} h={24} c="#e8ecf2" /><R x={80} y={8} w={1} h={5} c="#9aa0ad" /><R x={68} y={13} w={14} h={1} c="#c2c7d2" />
        {/* mesa redonda com banquetas */}
        <R x={30} y={54} w={26} h={2} c="#000" o={0.15} />
        <O x={30} y={44} w={26} h={9} c="#f0e6d6" /><O x={30} y={53} w={26} h={2} c="#c9b996" />
        <O x={38} y={47} w={3} h={3} c="#f4f1ea" />
        <Sofa x={54} y={70} w={30} c="#d4497b" />
        <Vaso x={4} y={66} />
      </g>
    )
    case "orcamentos": return (
      <g>
        <O x={4} y={3} w={46} h={9} c="#7d5733" />
        {[0, 1, 2, 3, 4].map(i => <O key={i} x={6 + i * 9} y={4} w={7} h={6} c={["#8456e8", "#e07b1f", "#1f9d55", "#d4497b", "#c8a274"][i]} />)}
        <O x={58} y={3} w={30} h={10} c="#c99a64" />
        {[0, 1, 2, 3].map(i => <R key={i} x={61 + i * 7} y={5 + (i % 2)} w={5} h={5} c={["#fde68a", "#fbcfe8", "#bfdbfe", "#fde68a"][i]} />)}
        <O x={88} y={24} w={14} h={14} c="#c9ccd6" /><R x={90} y={26} w={10} h={3} c="#3a3648" /><R x={90} y={34} w={10} h={2} c="#fff" k="sala-tela" />
        {/* mesa de corte com amostras */}
        <R x={14} y={74} w={66} h={2} c="#000" o={0.15} />
        <O x={14} y={62} w={66} h={10} c="#e9e4dc" /><O x={14} y={72} w={66} h={3} c="#a59e92" />
        <O x={20} y={60} w={9} h={7} c="#8456e8" /><O x={34} y={61} w={7} h={6} c="#c8a274" /><O x={46} y={60} w={11} h={8} c="#1f9d55" /><O x={62} y={63} w={12} h={2} c="#ffffff" />
      </g>
    )
    case "treinamento": return (
      <g>
        <O x={6} y={2} w={42} h={11} c="#5b4f7a" /><R x={7} y={3} w={40} h={9} c="#fbfaff" />
        <Estante x={54} y={6} h={24} />
        <R x={8} y={28} w={50} h={28} c="#b9d7c8" o={0.55} />
        <O x={8} y={70} w={14} h={9} c="#e07b1f" /><R x={8} y={70} w={14} h={2} c="#fff" o={0.25} />
        <Vaso x={60} y={64} />
      </g>
    )
    case "producao": return (
      <g>
        <O x={56} y={2} w={38} h={12} c="#8e93a0" />{[0, 1, 2, 3].map(i => <R key={i} x={57} y={4 + i * 3} w={36} h={1} c="#6c717c" />)}
        <O x={6} y={3} w={40} h={8} c="#f1c84b" />
        {/* offset */}
        <R x={6} y={46} w={60} h={3} c="#000" o={0.18} />
        <O x={6} y={22} w={60} h={22} c="#cfd3dd" /><R x={6} y={22} w={60} h={2} c="#fff" o={0.4} />
        <R x={6} y={32} w={60} h={3} c="#2f7cf6" />
        {[0, 1, 2, 3].map(i => <O key={i} x={14 + i * 12} y={26} w={6} h={4} c="#4b4558" k={!noite ? "sala-tela" : undefined} />)}
        <O x={66} y={30} w={10} h={12} c="#ffffff" /><R x={67} y={32} w={8} h={1} c="#e4dff0" />
        <O x={10} y={38} w={8} h={4} c="#3a3648" /><R x={11} y={39} w={2} h={2} c={noite ? "#6e6a88" : "#6fe3a8"} k={noite ? undefined : "sala-ponto-1"} />
        {/* paletes com caixas */}
        <O x={6} y={68} w={34} h={4} c="#a77b4a" /><Caixas x={8} y={60} />
        <O x={50} y={68} w={34} h={4} c="#a77b4a" /><Caixas x={52} y={60} c="#f4f1ea" />
        <O x={88} y={30} w={4} h={8} c="#d33a3c" />
      </g>
    )
  }
}

// ── Caminhos: todo deslocamento passa pela porta e pelo corredor ─────────────
type Pos = { x: number; y: number }
function caminho(p: PlantaPredio, de: Ponto, para: Ponto): Pos[] {
  const a = abs(p, de.sala, de.x, de.y), b = abs(p, para.sala, para.x, para.y)
  if (de.sala === para.sala) return [{ x: b[0], y: b[1] }]
  const cor = p.salas.corredor, cy = cor.y + cor.h - 6
  const porta = (s: Exclude<IdSala, "corredor">) => {
    const [px] = abs(p, s, PORTA[s], 0), r = p.salas[s]
    return { x: px, y: EM_CIMA[s] ? r.y + r.h - 6 : r.y + FACE + 6 }
  }
  const pa = porta(de.sala), pb = porta(para.sala)
  return [{ x: pa.x, y: pa.y }, { x: pa.x, y: cy }, { x: pb.x, y: cy }, { x: pb.x, y: pb.y }, { x: b[0], y: b[1] }]
}

type Onde = { tipo: "mesa" | "pausa" | "descanso"; ponto: Ponto } | { tipo: "ronda" }
function ondeEsta(m: Mesa, idx: number, bloco: number, pausados: Set<IdMesa>): Onde {
  if (m.id === "vigia" && (m.estado === "plantao" || m.estado === "trabalhando")) return { tipo: "ronda" }
  if (m.estado === "descansando") return { tipo: "descanso", ponto: DESCANSO[m.id] }
  if (m.estado === "plantao" && pausados.has(m.id)) return { tipo: "pausa", ponto: PAUSA[(idx + bloco) % PAUSA.length] }
  return { tipo: "mesa", ponto: MESA[m.id] }
}

// Quem anda: segue o caminho ponto a ponto (a ~22 px/s); ao chegar, senta (o desenho sentado aparece na sala)
function useAndar(planta: PlantaPredio, ondes: Record<string, Onde>) {
  const [pos, setPos] = useState<Record<string, { x: number; y: number; dur: number; andando: boolean; vira: boolean }>>({})
  const anterior = useRef<Record<string, Onde>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({})
  useEffect(() => {
    for (const [id, o] of Object.entries(ondes)) {
      const antes = anterior.current[id]
      anterior.current[id] = o
      const alvo = o.tipo === "ronda" ? null : o.ponto
      if (!alvo) { setPos(p => { const n = { ...p }; delete n[id]; return n }); continue }
      const [ax, ay] = abs(planta, alvo.sala, alvo.x, alvo.y)
      const mesmo = antes && antes.tipo !== "ronda" && antes.ponto.sala === alvo.sala && antes.ponto.x === alvo.x && antes.ponto.y === alvo.y && antes.tipo === o.tipo
      if (!antes || antes.tipo === "ronda" || mesmo) { if (!mesmo) setPos(p => ({ ...p, [id]: { x: ax, y: ay, dur: 0, andando: false, vira: false } })); continue }
      for (const t of timers.current[id] ?? []) clearTimeout(t)
      timers.current[id] = []
      const passos = caminho(planta, antes.ponto, alvo)
      let [cx, cy] = abs(planta, antes.ponto.sala, antes.ponto.x, antes.ponto.y)
      let espera = 0
      setPos(p => ({ ...p, [id]: { x: cx, y: cy, dur: 0, andando: true, vira: false } }))
      for (const s of passos) {
        const dist = Math.hypot(s.x - cx, s.y - cy), dur = Math.max(0.2, dist / 22), vira = s.x < cx
        const de = espera
        timers.current[id].push(setTimeout(() => setPos(p => ({ ...p, [id]: { x: s.x, y: s.y, dur, andando: true, vira } })), de * 1000 + 60))
        espera += dur; cx = s.x; cy = s.y
      }
      timers.current[id].push(setTimeout(() => setPos(p => ({ ...p, [id]: { ...p[id], andando: false } })), espera * 1000 + 120))
    }
  }, [planta, ondes])
  useEffect(() => () => { for (const ts of Object.values(timers.current)) for (const t of ts) clearTimeout(t) }, [])
  return pos
}

type Props = { mesas: Mesa[]; selecionada: IdMesa | null; onSelecionar: (id: IdMesa | null) => void; cota: { usados: number; limite: number }; licoes: number; noHorario: boolean }

// Uma planta só por vez: a larga no computador, a alta no celular (decide pelo formato da área)
export function EscritorioVirtual(props: Props) {
  const [alta, setAlta] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px), (max-aspect-ratio: 4/5)")
    const f = () => setAlta(mq.matches)
    f(); mq.addEventListener("change", f)
    return () => mq.removeEventListener("change", f)
  }, [])
  return <div className="absolute inset-0"><Predio key={alta ? "alta" : "larga"} {...props} pl={alta ? ALTA : LARGA} /></div>
}

const ROTULO_SALA: Record<Exclude<IdSala, "corredor">, string> = { recepcao: "Recepção", comercial: "Comercial", diretoria: "Diretoria", copa: "Copa", orcamentos: "Orçamentos", treinamento: "Treinamento", producao: "Produção" }
const SALAS = Object.keys(ROTULO_SALA) as Exclude<IdSala, "corredor">[]
const PISO: Record<IdSala, string> = { recepcao: "url(#p-madeira)", comercial: "url(#p-carpete)", diretoria: "url(#p-madeira)", corredor: "url(#p-piso)", copa: "url(#p-piso)", orcamentos: "url(#p-madeira)", treinamento: "url(#p-carpete-verde)", producao: "url(#p-concreto)" }
const PAREDE: Record<IdSala, string> = { recepcao: "#ece6f7", comercial: "#ece6f7", diretoria: "#efe6da", corredor: "#e4e0ea", copa: "#f3efe6", orcamentos: "#ece6f7", treinamento: "#e3efe8", producao: "#d9dbe0" }

function Predio({ mesas, selecionada, onSelecionar, cota, licoes, noHorario, pl }: Props & { pl: PlantaPredio }) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 20_000); return () => clearInterval(t) }, [])
  const hora = Number(new Date(agora).toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }))
  const noite = hora < 6 || hora >= 19
  const ceu = noite ? "#1f2550" : hora < 8 || hora >= 17 ? "#f0a46b" : "#8fd0f5"
  const por = useMemo(() => new Map(mesas.map(m => [m.id, m])), [mesas])
  // Pausa para o café: a cada 3 min, até 2 dos que estão de plantão vão à copa (revezando)
  const bloco = Math.floor(agora / 180_000)
  const ondes = useMemo(() => {
    const plantao = mesas.filter(m => m.estado === "plantao" && m.id !== "vigia").map(m => m.id)
    const pausados = new Set(plantao.filter((_, i) => (i + bloco) % Math.max(4, plantao.length) < 2))
    return Object.fromEntries(mesas.map((m, i) => [m.id, ondeEsta(m, i, bloco, pausados)])) as Record<string, Onde>
  }, [mesas, bloco])
  const pos = useAndar(pl, ondes)
  const tela = Object.fromEntries(mesas.map(m => [m.id, m.estado === "trabalhando" ? PERS[m.id].roupa : m.estado === "travado" ? "#d33a3c" : undefined])) as Record<IdMesa, string | undefined>
  const sentado = (id: IdMesa) => { const o = ondes[id]; return o && o.tipo === "mesa" && !pos[id]?.andando }
  const { W, H } = pl
  const cor = pl.salas.corredor
  const rondaY = cor.y + cor.h - 5

  // Onde está cada um (para o nome e o balão)
  const lugarDe = (id: IdMesa): [number, number] | null => {
    const o = ondes[id]
    if (!o) return null
    if (o.tipo === "ronda") return null
    const p = pos[id]
    if (p) return [p.x, p.y]
    return abs(pl, o.ponto.sala, o.ponto.x, o.ponto.y)
  }
  const sel = selecionada ? por.get(selecionada) : null

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden" style={{ containerType: "size", background: "#7fb069", backgroundImage: "radial-gradient(rgba(0,0,0,0.07) 1px, transparent 1.5px)", backgroundSize: "14px 14px" }}>
      <div className="relative" style={{ width: `min(100cqw - 24px, (100cqh - 24px) * ${W / H})`, aspectRatio: `${W} / ${H}` }}>
        <div className="absolute -inset-[1.5%] rounded-[2%]" style={{ background: "#c9c4b6", boxShadow: "0 18px 40px rgba(20,30,10,0.35)" }} />
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" shapeRendering="crispEdges" role="img" aria-label="Escritório virtual da ENYLA">
          <defs>
            <pattern id="p-madeira" width="24" height="8" patternUnits="userSpaceOnUse"><rect width="24" height="8" fill="#dcc29a" /><rect y="7" width="24" height="1" fill="#c9ab80" /><rect x="11" width="1" height="7" fill="#cfb287" /></pattern>
            <pattern id="p-carpete" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#cdc3e3" /><rect x="1" y="1" width="1" height="1" fill="#bdb1d9" /><rect x="4" y="4" width="1" height="1" fill="#bdb1d9" /></pattern>
            <pattern id="p-carpete-verde" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#c3dccd" /><rect x="1" y="1" width="1" height="1" fill="#afcfbc" /><rect x="4" y="4" width="1" height="1" fill="#afcfbc" /></pattern>
            <pattern id="p-piso" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#eeeae3" /><rect width="6" height="6" fill="#e3ded5" /><rect x="6" y="6" width="6" height="6" fill="#e3ded5" /></pattern>
            <pattern id="p-concreto" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#c7c9cf" /><rect x="2" y="3" width="1" height="1" fill="#b4b7be" /><rect x="7" y="7" width="1" height="1" fill="#b4b7be" /></pattern>
          </defs>
          {/* paredes (o fundo) */}
          <R x={0} y={0} w={W} h={H} c="#3b3350" />
          {/* pisos e faces das paredes */}
          {(Object.keys(pl.salas) as IdSala[]).map(s => {
            const r = pl.salas[s], face = s === "corredor" ? 8 : FACE
            return (
              <g key={s}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={PISO[s]} />
                <R x={r.x} y={r.y} w={r.w} h={face} c={PAREDE[s]} />
                <R x={r.x} y={r.y + face - 4} w={r.w} h={4} c="#000" o={0.06} />
                <R x={r.x} y={r.y + face} w={r.w} h={2} c="#000" o={0.1} />
              </g>
            )
          })}
          {/* portas */}
          {SALAS.map(s => {
            const r = pl.salas[s], [px] = abs(pl, s, PORTA[s], 0)
            return EM_CIMA[s]
              ? <R key={s} x={px - 6} y={r.y + r.h} w={12} h={3} c="#d8d2c6" />
              : <g key={s}><R x={px - 6} y={r.y - 3} w={12} h={3} c="#d8d2c6" /><R x={px - 6} y={r.y} w={12} h={FACE} c="#5a4f73" /><R x={px - 5} y={r.y + 1} w={10} h={FACE - 1} c="#cfc6e3" o={0.35} /></g>
          })}
          {/* bebedouro e plantas no corredor */}
          <g transform={`translate(${cor.x + cor.w - 14} ${cor.y + 2})`}><O x={0} y={4} w={7} h={10} c="#e8ecf2" /><O x={1} y={-2} w={5} h={6} c="#9fd3f5" /></g>
          <g transform={`translate(${cor.x + 4} ${cor.y + 1})`}><Vaso x={0} y={2} /></g>
          {/* conteúdo das salas */}
          {SALAS.map(s => { const o = origem(pl, s); return <g key={s} transform={`translate(${o.x} ${o.y})`}><ConteudoSala s={s} ceu={ceu} noite={noite} tela={tela} quadro={{ cota: Math.min(1, cota.usados / cota.limite) }} /></g> })}
          {/* mesas de trabalho: cadeira, quem está sentado, mesa (nessa ordem) */}
          {(Object.keys(MESA) as IdMesa[]).map(id => {
            const m = por.get(id), pt = MESA[id], [x, y] = abs(pl, pt.sala, pt.x, pt.y)
            const est = m?.estado ?? "plantao"
            const recep = id === "vigia"
            return (
              <g key={id}>
                <Cadeira x={x} y={y} />
                {sentado(id) && <g transform={`translate(${x} ${y})`}><Sentado id={id} estado={est} /></g>}
                {recep
                  ? <g><R x={x - 24} y={y + 13} w={48} h={2} c="#000" o={0.16} /><O x={x - 24} y={y} w={48} h={8} c="#b9a3df" /><O x={x - 24} y={y + 8} w={48} h={5} c="#7d6aa8" /><O x={x - 6} y={y - 6} w={12} h={7} c="#3a3648" /><R x={x - 6} y={y - 6} w={12} h={1} c="#6fe3a8" /><O x={x + 12} y={y + 2} w={5} h={3} c="#f4f1ea" /></g>
                  : <Mesa x={x - 14} y={y} tela={tela[id]} />}
                {sentado(id) && <g transform={`translate(${x} ${y})`}><Balao estado={est} cor={PERS[id].roupa} /></g>}
              </g>
            )
          })}
          {/* sofás: quem descansa senta entre o encosto e a frente */}
          {(Object.keys(DESCANSO) as IdMesa[]).map(id => {
            const o = ondes[id]
            if (!o || o.tipo !== "descanso" || pos[id]?.andando) return null
            const [x, y] = abs(pl, o.ponto.sala, o.ponto.x, o.ponto.y)
            return <g key={id} transform={`translate(${x} ${y})`}><Sentado id={id} estado="descansando" /><Balao estado="descansando" cor="" /></g>
          })}
          {SALAS.map(s => {
            const o = origem(pl, s)
            if (s === "copa") return <g key={s} transform={`translate(${o.x} ${o.y})`}><SofaFrente x={54} y={70} w={30} c="#e0608e" /></g>
            if (s === "recepcao") return <g key={s} transform={`translate(${o.x} ${o.y})`}><Sofa x={6} y={74} w={30} /><SofaFrente x={6} y={74} w={30} /></g>
            if (s === "diretoria") return <g key={s} transform={`translate(${o.x} ${o.y})`}><SofaFrente x={10} y={70} w={16} c="#a06a40" /></g>
            if (s === "treinamento") return <g key={s} transform={`translate(${o.x} ${o.y})`}><O x={8} y={76} w={14} h={4} c="#c66a12" /></g>
            return null
          })}
          {/* em pé: pausa e quem está andando */}
          {(Object.keys(MESA) as IdMesa[]).map(id => {
            const o = ondes[id], p = pos[id]
            if (!o || o.tipo === "ronda" || !p) return null
            if (!p.andando && o.tipo !== "pausa") return null
            return (
              <g key={id} style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: `transform ${p.dur}s linear` }}>
                <g style={{ transform: p.vira ? "scaleX(-1)" : undefined }}><EmPe id={id} andando={p.andando} cafe={o.tipo === "pausa" && !p.andando} /></g>
              </g>
            )
          })}
          {/* vigia de ronda */}
          {ondes.vigia?.tipo === "ronda" && (
            <g transform={`translate(0 ${rondaY})`}>
              <g className="sala-ronda" style={{ ["--ini" as string]: `${cor.x + 10}px`, ["--fim" as string]: `${cor.x + cor.w - 24}px`, animationDuration: `${Math.round(cor.w / 9)}s` }}><EmPe id="vigia" andando /></g>
            </g>
          )}
          {/* noite */}
          {(noite || !noHorario) && <R x={0} y={0} w={W} h={H} c="#141a40" o={noite ? 0.32 : 0.12} />}
          {/* toque */}
          {(Object.keys(MESA) as IdMesa[]).map(id => { const l = lugarDe(id); return l ? <rect key={`t${id}`} x={l[0] - 10} y={l[1] - 26} width={20} height={32} fill="transparent" style={{ cursor: "pointer" }} onClick={() => onSelecionar(selecionada === id ? null : id)} /> : null })}
        </svg>

        {/* textos nítidos por cima */}
        {SALAS.map(s => {
          const r = pl.salas[s]
          return <span key={s} className="absolute pointer-events-none font-bold uppercase text-[#4a3f63]/70 tracking-[0.14em] leading-none text-right"
            style={{ right: `${(W - r.x - r.w + 3) / W * 100}%`, top: `${(r.y + r.h - 7) / H * 100}%`, fontSize: "clamp(6px, 1cqw, 10px)" }}>{ROTULO_SALA[s]}</span>
        })}
        {(() => { const o = origem(pl, "recepcao"); return <span className="absolute pointer-events-none flex items-center justify-center font-bold text-[#f4efff] tracking-[0.25em] leading-none" style={{ left: `${(o.x + 18) / W * 100}%`, width: `${52 / W * 100}%`, top: `${(o.y + 2) / H * 100}%`, height: `${10 / H * 100}%`, fontSize: "clamp(6px, 1.5cqw, 14px)" }}>ENYLA</span> })()}
        {(() => { const o = origem(pl, "comercial"); return <span className="absolute pointer-events-none flex items-center justify-center font-semibold text-[#3a3150] leading-none" style={{ left: `${(o.x + 100) / W * 100}%`, width: `${40 / W * 100}%`, top: `${(o.y + 3.5) / H * 100}%`, height: `${4 / H * 100}%`, fontSize: "clamp(5px, 1cqw, 10px)" }}>Envios {cota.usados}/{cota.limite}</span> })()}
        {(() => { const o = origem(pl, "treinamento"); return <span className="absolute pointer-events-none flex items-center justify-center text-center font-semibold text-[#3a3150] leading-none" style={{ left: `${(o.x + 7) / W * 100}%`, width: `${40 / W * 100}%`, top: `${(o.y + 3) / H * 100}%`, height: `${9 / H * 100}%`, fontSize: "clamp(5px, 0.95cqw, 10px)" }}>{licoes} lições</span> })()}
        {(() => { const o = origem(pl, "producao"); return <span className="absolute pointer-events-none flex items-center justify-center font-bold text-[#5a4300] tracking-[0.1em] leading-none" style={{ left: `${(o.x + 6) / W * 100}%`, width: `${40 / W * 100}%`, top: `${(o.y + 3) / H * 100}%`, height: `${8 / H * 100}%`, fontSize: "clamp(5px, 0.9cqw, 9px)" }}>OFFSET</span> })()}
        {(() => { const o = origem(pl, "diretoria"); return <span className="absolute pointer-events-none flex items-center justify-center font-semibold text-[#f4efff] leading-none" style={{ left: `${(o.x + 28) / W * 100}%`, width: `${8 / W * 100}%`, top: `${(o.y + 44) / H * 100}%`, height: `${3 / H * 100}%`, fontSize: "clamp(3px, 0.55cqw, 6px)" }}>Felipe</span> })()}

        {/* nomes de quem está no lugar (o vigia de ronda leva o nome na ronda) */}
        {mesas.map(m => {
          const l = lugarDe(m.id)
          if (!l) return null
          const p = pos[m.id]
          const cor = m.estado === "trabalhando" ? "#1f9d55" : m.estado === "travado" ? "#d33a3c" : m.estado === "descansando" ? "#898892" : "#2f7cf6"
          const sentadoNaMesa = sentado(m.id)
          return (
            <button key={m.id} onClick={() => onSelecionar(selecionada === m.id ? null : m.id)}
              className="absolute -translate-x-1/2 flex items-center gap-1 rounded-full px-1.5 py-[1px] whitespace-nowrap"
              style={{ left: `${l[0] / W * 100}%`, top: `${(l[1] + (sentadoNaMesa ? 15 : 3)) / H * 100}%`, transition: p ? `left ${p.dur}s linear, top ${p.dur}s linear` : undefined,
                background: selecionada === m.id ? "#ffffff" : "rgba(255,255,255,0.9)", boxShadow: "0 1px 3px rgba(0,0,0,0.18)", fontSize: "clamp(8px, 1.15cqw, 11px)" }}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cor }} />
              <span className="font-semibold text-[#2a2430]">{m.nome.replace("Orçamentista digital", "Digital").replace("Levantador de MQL", "MQL")}</span>
            </button>
          )
        })}

        {sel && (() => {
          const l = lugarDe(sel.id) ?? [cor.x + cor.w / 2, rondaY]
          const esq = l[0] / W < 0.5, emCima = l[1] / H < 0.45
          return (
            <div className="absolute z-20 ds-pop w-[min(260px,70cqw)] rounded-xl bg-white px-3 py-2.5 text-left"
              style={{ [esq ? "left" : "right"]: `${Math.max(1, esq ? l[0] - 8 : W - l[0] - 8) / W * 100}%`, ...(emCima ? { top: `${(l[1] + 20) / H * 100}%` } : { bottom: `${(H - l[1] + 30) / H * 100}%` }), boxShadow: "0 8px 28px rgba(0,0,0,0.22)" }}>
              <p className="text-[13px] font-semibold text-[#191625] leading-tight">{sel.nome}</p>
              <p className="text-[11.5px] text-[#898892] leading-tight">{sel.papel}</p>
              <p className={`text-[12px] leading-snug mt-1.5 ${sel.estado === "travado" ? "text-[#d33a3c] font-medium" : "text-[#3a3846]"}`}>{sel.agora}</p>
              <p className="text-[11px] text-[#898892] mt-1">{sel.hoje} {sel.hojeRotulo} hoje{sel.extra ? ` · ${sel.extra}` : ""}</p>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
