"use client"

// Sala dos agentes em pixel art: cada agente é um personagem na sua bancada, animado pelo estado real
// (trabalhando digita, de plantão toma café, travado mostra "!", descansando cochila; o vigia faz ronda).
// Só desenho: lê os mesmos dados do Escritório, nenhuma chamada de IA.

import type { Mesa, IdMesa, EstadoMesa } from "../lib/escritorio"

const TRACO = "#2a2238"
// Retângulo com contorno de 1 px (o acabamento de pixel art)
const O = ({ x, y, w, h, c, className }: { x: number; y: number; w: number; h: number; c: string; className?: string }) => (
  <g className={className}><rect x={x - 1} y={y - 1} width={w + 2} height={h + 2} fill={TRACO} /><rect x={x} y={y} width={w} height={h} fill={c} /></g>
)
const R = ({ x, y, w, h, c, o, className }: { x: number; y: number; w: number; h: number; c: string; o?: number; className?: string }) => (
  <rect x={x} y={y} width={w} height={h} fill={c} opacity={o} className={className} />
)

type Bancada = { x: number; y: number; w: number; tipo?: "balcao" }
type Planta = {
  W: number; H: number; parede: number; lugar: Record<IdMesa, [number, number]>; bancadas: Bancada[]
  corredor: number; ronda: [number, number]; janelas: number[]; quadro: [number, number]; relogio: number | null
  planta: number; porta: number | null; placa: [number, number]; tapetes: { x: number; y: number; w: number; h: number; c: string }[]; bebedouro: [number, number] | null
}
const LARGA: Planta = {
  W: 256, H: 186, parede: 48, corredor: 133, ronda: [22, 200], janelas: [10, 172], quadro: [84, 70], relogio: 60, planta: 160, porta: 222,
  placa: [100, 38], bebedouro: [246, 132],
  lugar: { atendente: [40, 88], coletor: [100, 88], followup: [160, 88], reativacao: [220, 88], digital: [40, 160], propostas: [100, 160], aprendiz: [160, 160], vigia: [224, 160] },
  bancadas: [{ x: 12, y: 88, w: 236 }, { x: 12, y: 160, w: 176 }, { x: 204, y: 160, w: 42, tipo: "balcao" }],
  tapetes: [{ x: 6, y: 58, w: 244, h: 50, c: "#c8b6e6" }, { x: 6, y: 132, w: 186, h: 48, c: "#b9d7c8" }],
}
const ALTA: Planta = {
  W: 136, H: 328, parede: 46, corredor: 209, ronda: [14, 122], janelas: [6], quadro: [54, 56], relogio: null, planta: 118, porta: null,
  placa: [57, 24], bebedouro: null,
  lugar: { atendente: [36, 86], coletor: [100, 86], followup: [36, 152], reativacao: [100, 152], digital: [36, 238], propostas: [100, 238], aprendiz: [36, 304], vigia: [102, 304] },
  bancadas: [{ x: 8, y: 86, w: 120 }, { x: 8, y: 152, w: 120 }, { x: 8, y: 238, w: 120 }, { x: 8, y: 304, w: 58 }, { x: 80, y: 304, w: 46, tipo: "balcao" }],
  tapetes: [{ x: 4, y: 56, w: 128, h: 120, c: "#c8b6e6" }, { x: 4, y: 214, w: 128, h: 110, c: "#b9d7c8" }],
}

// Personagens originais: roupa = cor do agente
const PERS: Record<IdMesa, { roupa: string; cabelo: string; pele: string; estilo: "curto" | "longo" | "coque" | "careca" | "bone" | "cacheado" }> = {
  atendente: { roupa: "#8456e8", cabelo: "#3b2418", pele: "#f1c7a3", estilo: "longo" },
  coletor: { roupa: "#2f7cf6", cabelo: "#1d1d24", pele: "#c98e64", estilo: "curto" },
  followup: { roupa: "#0f9ba8", cabelo: "#b5651d", pele: "#f5d0b0", estilo: "coque" },
  reativacao: { roupa: "#d4497b", cabelo: "#2a1a12", pele: "#8d5a3b", estilo: "cacheado" },
  digital: { roupa: "#e07b1f", cabelo: "#d9b44a", pele: "#f3cfae", estilo: "curto" },
  propostas: { roupa: "#1f9d55", cabelo: "#5a5a62", pele: "#e0ac85", estilo: "careca" },
  vigia: { roupa: "#3c3b52", cabelo: "#1d1d24", pele: "#b67a52", estilo: "bone" },
  aprendiz: { roupa: "#c98a12", cabelo: "#7a3b1c", pele: "#f6d5b8", estilo: "coque" },
}

function Cabeca({ p, estado }: { p: (typeof PERS)[IdMesa]; estado: EstadoMesa }) {
  const dorme = estado === "descansando"
  return (
    <g className={dorme ? "sala-cochila" : estado === "plantao" ? "sala-respira" : undefined}>
      {p.estilo === "longo" && <O x={-6} y={-25} w={12} h={11} c={p.cabelo} />}
      {p.estilo === "cacheado" && <O x={-7} y={-26} w={14} h={10} c={p.cabelo} />}
      <O x={-5} y={-24} w={10} h={9} c={p.pele} />
      <R x={-5} y={-16} w={10} h={1} c="#000" o={0.12} />
      <R x={-4} y={-18} w={1} h={1} c="#ff7a7a" o={0.45} /><R x={3} y={-18} w={1} h={1} c="#ff7a7a" o={0.45} />
      {p.estilo !== "careca" && p.estilo !== "bone" && <R x={-5} y={-24} w={10} h={3} c={p.cabelo} />}
      {(p.estilo === "longo" || p.estilo === "cacheado") && <><R x={-5} y={-21} w={1} h={4} c={p.cabelo} /><R x={4} y={-21} w={1} h={4} c={p.cabelo} /></>}
      {p.estilo === "curto" && <R x={2} y={-21} w={3} h={1} c={p.cabelo} />}
      {p.estilo === "coque" && <O x={-2} y={-28} w={4} h={3} c={p.cabelo} />}
      {p.estilo === "careca" && <><R x={-5} y={-22} w={1} h={3} c={p.cabelo} /><R x={4} y={-22} w={1} h={3} c={p.cabelo} /><R x={-2} y={-23} w={2} h={1} c="#fff" o={0.35} /></>}
      {p.estilo === "bone" && <><O x={-6} y={-26} w={12} h={4} c="#2f7cf6" /><R x={-6} y={-26} w={12} h={1} c="#fff" o={0.25} /><O x={4} y={-23} w={4} h={1} c="#2459c4" /></>}
      {dorme
        ? <><R x={-3} y={-19} w={2} h={1} c={TRACO} /><R x={1} y={-19} w={2} h={1} c={TRACO} /></>
        : <g className="sala-pisca"><R x={-3} y={-20} w={1} h={2} c={TRACO} /><R x={2} y={-20} w={1} h={2} c={TRACO} /></g>}
      <R x={-1} y={-17} w={2} h={1} c={estado === "travado" ? "#7a2a2a" : "#b8664f"} />
    </g>
  )
}

// Atrás da bancada: cadeira e personagem
function PessoaSentada({ id, estado, lugar, ausente }: { id: IdMesa; estado: EstadoMesa; lugar: [number, number]; ausente: boolean }) {
  const [cx, cy] = lugar, p = PERS[id]
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <O x={-8} y={-22} w={16} h={18} c="#4b4558" />
      <R x={-7} y={-21} w={14} h={2} c="#6a6280" />
      {!ausente && <>
        <O x={-9} y={-13} w={3} h={8} c={p.roupa} /><O x={6} y={-13} w={3} h={8} c={p.roupa} />
        <O x={-6} y={-14} w={12} h={11} c={p.roupa} />
        <R x={-6} y={-14} w={12} h={1} c="#fff" o={0.22} />
        <R x={-6} y={-7} w={12} h={4} c="#000" o={0.18} />
        <R x={-2} y={-14} w={4} h={2} c={p.pele} />
        <Cabeca p={p} estado={estado} />
      </>}
    </g>
  )
}

// Em cima da bancada: notebook, mãos, caneca, objetos e balões
function SobreBancada({ id, estado, lugar, ausente, ativo }: { id: IdMesa; estado: EstadoMesa; lugar: [number, number]; ausente: boolean; ativo: boolean }) {
  const [cx, cy] = lugar, p = PERS[id]
  const tela = estado === "trabalhando" ? p.roupa : estado === "travado" ? "#d33a3c" : estado === "descansando" ? "#3a3648" : "#9fb4d8"
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <O x={-7} y={-11} w={14} h={8} c="#cfd3dd" />
      <R x={-7} y={-11} w={14} h={1} c={tela} className={estado === "trabalhando" ? "sala-tela" : estado === "travado" ? "sala-alerta" : undefined} />
      <R x={-1} y={-8} w={2} h={2} c="#f2f3f7" />
      <O x={-9} y={-3} w={18} h={1} c="#a9aeba" />
      {!ausente && <>
        <O x={-8} y={-5} w={3} h={2} c={p.pele} className={estado === "trabalhando" ? "sala-digita-a" : undefined} />
        <O x={5} y={-5} w={3} h={2} c={p.pele} className={estado === "trabalhando" ? "sala-digita-b" : undefined} />
      </>}
      <g className={estado === "plantao" && !ausente ? "sala-cafe" : undefined}>
        <O x={11} y={-7} w={4} h={4} c="#f4f1ea" /><R x={15} y={-6} w={1} h={2} c={TRACO} /><R x={11} y={-7} w={4} h={1} c="#6b3f22" />
      </g>
      {estado === "plantao" && !ausente && <g className="sala-vapor"><R x={12} y={-10} w={1} h={2} c="#fff" o={0.8} /><R x={14} y={-12} w={1} h={2} c="#fff" o={0.6} /></g>}
      {(id === "propostas" || id === "digital") && <><O x={-17} y={-5} w={7} h={2} c="#ffffff" /><R x={-16} y={-6} w={6} h={1} c="#e8e6ef" /></>}
      {id === "aprendiz" && <><O x={-17} y={-6} w={6} h={3} c="#c0392b" /><O x={-16} y={-9} w={5} h={2} c="#2f7cf6" /></>}
      {id === "atendente" && <O x={-16} y={-8} w={3} h={5} c="#2a2833" />}
      {id === "coletor" && <O x={-17} y={-5} w={6} h={2} c="#fde68a" />}
      {id === "vigia" && <><O x={-17} y={-9} w={7} h={6} c="#3a3648" /><R x={-16} y={-8} w={5} h={3} c="#6fe3a8" className="sala-tela" /></>}
      {ativo && <R x={-20} y={-36} w={40} h={1} c={p.roupa} o={0.9} />}
      {estado === "travado" && !ausente && (
        <g className="sala-alerta"><O x={7} y={-38} w={9} h={10} c="#ffffff" /><R x={11} y={-36} w={1} h={4} c="#d33a3c" /><R x={11} y={-31} w={1} h={1} c="#d33a3c" /></g>
      )}
      {estado === "trabalhando" && !ausente && (
        <g><O x={7} y={-37} w={14} h={7} c="#ffffff" />
          <R x={9} y={-34} w={2} h={2} c={p.roupa} className="sala-ponto-1" /><R x={13} y={-34} w={2} h={2} c={p.roupa} className="sala-ponto-2" /><R x={17} y={-34} w={2} h={2} c={p.roupa} className="sala-ponto-3" /></g>
      )}
      {estado === "descansando" && !ausente && (
        <g className="sala-zzz"><R x={7} y={-30} w={3} h={1} c="#6e6a88" /><R x={8} y={-29} w={1} h={1} c="#6e6a88" /><R x={7} y={-28} w={3} h={1} c="#6e6a88" /></g>
      )}
    </g>
  )
}

function DesenhoBancada({ b }: { b: Bancada }) {
  const balcao = b.tipo === "balcao"
  const topo = balcao ? "#b9a3df" : "#d6a96f", frente = balcao ? "#7d6aa8" : "#9c6f42", friso = balcao ? "#66558f" : "#7d5733"
  return (
    <g>
      <R x={b.x + 2} y={b.y + 11} w={b.w - 4} h={4} c="#000" o={0.13} />
      <O x={b.x} y={b.y - 4} w={b.w} h={4} c={topo} />
      <R x={b.x} y={b.y - 4} w={b.w} h={1} c="#fff" o={0.3} />
      <O x={b.x} y={b.y} w={b.w} h={10} c={frente} />
      <R x={b.x} y={b.y} w={b.w} h={1} c={friso} />
      {!balcao && Array.from({ length: Math.floor((b.w - 1) / 60) }, (_, i) => <R key={i} x={b.x + 58 + i * 60} y={b.y + 1} w={1} h={9} c={friso} />)}
      {balcao && <R x={b.x + 4} y={b.y + 3} w={b.w - 8} h={1} c="#fff" o={0.25} />}
    </g>
  )
}

function Vigia({ m, ronda }: { m?: Mesa; ronda: [number, number] }) {
  const p = PERS.vigia
  if (!m || m.estado === "descansando" || m.estado === "travado") return null
  return (
    <g className="sala-ronda" style={{ ["--ini" as string]: `${ronda[0]}px`, ["--fim" as string]: `${ronda[1]}px` }}>
      <R x={-6} y={1} w={12} h={3} c="#000" o={0.15} />
      <g className="sala-passo">
        <O x={-4} y={-3} w={3} h={5} c="#22202e" className="sala-perna-a" />
        <O x={1} y={-3} w={3} h={5} c="#22202e" className="sala-perna-b" />
        <O x={-6} y={-13} w={12} h={10} c={p.roupa} />
        <R x={-6} y={-13} w={12} h={1} c="#fff" o={0.2} />
        <R x={-3} y={-11} w={2} h={2} c="#f1c84b" />
        <O x={6} y={-11} w={2} h={6} c={p.roupa} />
        <O x={7} y={-6} w={3} h={2} c="#f1c84b" />
        <g transform="translate(0 2)"><Cabeca p={p} estado="plantao" /></g>
      </g>
    </g>
  )
}

type Props = { mesas: Mesa[]; selecionada: IdMesa | null; onSelecionar: (id: IdMesa | null) => void; cota: { usados: number; limite: number } }

export function SalaAgentes(props: Props) {
  return (
    <>
      <div className="sm:hidden"><Sala {...props} pl={ALTA} /></div>
      <div className="hidden sm:block max-w-[940px] mx-auto"><Sala {...props} pl={LARGA} /></div>
    </>
  )
}

function Sala({ mesas, selecionada, onSelecionar, cota, pl }: Props & { pl: Planta }) {
  const { W, H, parede } = pl
  const por = new Map(mesas.map(m => [m.id, m]))
  const hora = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }))
  const noite = hora < 6 || hora >= 19
  const ceu = noite ? "#1f2550" : hora < 8 || hora >= 17 ? "#f0a46b" : "#8fd0f5"
  const pctCota = Math.min(1, cota.usados / cota.limite)
  const sel = selecionada ? por.get(selecionada) : null
  const [qx, qw] = pl.quadro
  const ordem = Object.keys(pl.lugar) as IdMesa[]
  const v = por.get("vigia")
  const vigiaRonda = !!v && v.estado !== "descansando" && v.estado !== "travado"
  const ausente = (id: IdMesa) => id === "vigia" && vigiaRonda
  const estado = (id: IdMesa): EstadoMesa => por.get(id)?.estado ?? "plantao"

  return (
    <div className="relative w-full overflow-hidden rounded-2xl select-none" style={{ aspectRatio: `${W} / ${H}`, background: TRACO, boxShadow: "0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(42,34,56,0.12)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" shapeRendering="crispEdges" role="img" aria-label="Sala dos agentes">
        {/* parede */}
        <R x={0} y={0} w={W} h={parede} c="#ece6f7" />
        <R x={0} y={parede - 14} w={W} h={14} c="#ddd3f0" />
        <R x={0} y={parede - 14} w={W} h={1} c="#c9bce6" />
        <R x={0} y={parede - 3} w={W} h={3} c="#8c7bb5" />
        {pl.janelas.map(x => (
          <g key={x}>
            <O x={x} y={6} w={40} h={24} c="#6e6489" />
            <R x={x + 2} y={8} w={36} h={20} c={ceu} />
            {noite ? <><R x={x + 7} y={12} w={1} h={1} c="#fff" /><R x={x + 26} y={16} w={1} h={1} c="#fff" /><R x={x + 29} y={10} w={3} h={3} c="#f4f1c9" /></>
              : <><R x={x + 7} y={14} w={8} h={3} c="#fff" o={0.85} className="sala-nuvem" /><R x={x + 5} y={15} w={12} h={2} c="#fff" o={0.85} className="sala-nuvem" /></>}
            <R x={x + 19} y={8} w={2} h={20} c="#6e6489" />
            <R x={x + 2} y={17} w={36} h={1} c="#6e6489" />
            <O x={x - 2} y={30} w={44} h={2} c="#b9add6" />
          </g>
        ))}
        <O x={qx} y={4} w={qw} h={26} c="#5b4f7a" />
        <R x={qx + 2} y={6} w={qw - 4} h={22} c="#fbfaff" />
        <R x={qx + 6} y={21} w={qw - 12} h={4} c="#e4dff0" />
        <R x={qx + 6} y={21} w={Math.round((qw - 12) * pctCota)} h={4} c={pctCota >= 1 ? "#d33a3c" : pctCota >= 0.75 ? "#e07b1f" : "#8456e8"} />
        {pl.relogio !== null && <>
          <O x={pl.relogio} y={9} w={11} h={11} c="#ffffff" />
          <R x={pl.relogio + 5} y={11} w={1} h={4} c={TRACO} /><R x={pl.relogio + 5} y={14} w={4} h={1} c={TRACO} />
        </>}
        <O x={pl.placa[0]} y={parede - 11} w={pl.placa[1]} h={7} c={TRACO} />
        <g transform={`translate(${pl.planta} ${parede - 16})`}>
          <O x={0} y={4} w={8} h={10} c="#b5653a" /><R x={0} y={4} w={8} h={1} c="#fff" o={0.25} />
          <O x={-2} y={-4} w={4} h={8} c="#3f9a5a" className="sala-planta" /><O x={5} y={-8} w={4} h={12} c="#4fb36b" className="sala-planta" /><O x={2} y={-2} w={3} h={6} c="#2f7a46" />
        </g>
        {pl.porta !== null && <>
          <O x={pl.porta} y={10} w={22} h={parede - 10} c="#8a5a36" />
          <R x={pl.porta + 2} y={12} w={18} h={12} c="#9c6a42" /><R x={pl.porta + 2} y={27} w={18} h={parede - 31} c="#9c6a42" />
          <R x={pl.porta + 17} y={28} w={2} h={2} c="#f1c84b" />
        </>}

        {/* chão de madeira */}
        <R x={0} y={parede} w={W} h={H - parede} c="#dcc29a" />
        {Array.from({ length: Math.ceil((H - parede) / 8) }, (_, i) => (
          <g key={i}>
            <R x={0} y={parede + 7 + i * 8} w={W} h={1} c="#c9ab80" />
            {Array.from({ length: Math.ceil(W / 40) + 1 }, (_, j) => <R key={j} x={((j * 40 + (i % 2) * 20 + (i % 3) * 7) % (W + 40)) - 4} y={parede + i * 8} w={1} h={7} c="#cfb287" />)}
          </g>
        ))}
        <R x={0} y={parede} w={W} h={2} c="#000" o={0.08} />
        {pl.tapetes.map((t, i) => (
          <g key={i}>
            <R x={t.x + 1} y={t.y} w={t.w - 2} h={t.h} c={t.c} o={0.75} />
            <R x={t.x} y={t.y + 1} w={t.w} h={t.h - 2} c={t.c} o={0.75} />
            <R x={t.x + 3} y={t.y + 3} w={t.w - 6} h={1} c="#fff" o={0.35} /><R x={t.x + 3} y={t.y + t.h - 4} w={t.w - 6} h={1} c="#fff" o={0.35} />
          </g>
        ))}
        <R x={4} y={pl.corredor - 7} w={W - 8} h={11} c="#a99ac6" o={0.35} />
        {pl.bebedouro && <g transform={`translate(${pl.bebedouro[0]} ${pl.bebedouro[1]})`}>
          <R x={-5} y={1} w={10} h={2} c="#000" o={0.15} />
          <O x={-4} y={-10} w={8} h={11} c="#e8ecf2" /><O x={-3} y={-18} w={6} h={7} c="#9fd3f5" /><R x={-2} y={-17} w={1} h={5} c="#fff" o={0.6} />
        </g>}

        {/* gente, bancadas e o que está em cima */}
        {ordem.map(id => <PessoaSentada key={id} id={id} estado={estado(id)} lugar={pl.lugar[id]} ausente={ausente(id)} />)}
        {pl.bancadas.map((b, i) => <DesenhoBancada key={i} b={b} />)}
        {ordem.map(id => <SobreBancada key={id} id={id} estado={estado(id)} lugar={pl.lugar[id]} ausente={ausente(id)} ativo={selecionada === id} />)}
        <g transform={`translate(0 ${pl.corredor})`}><Vigia m={v} ronda={pl.ronda} /></g>
        {ordem.map(id => { const [cx, cy] = pl.lugar[id]; return <rect key={`t${id}`} x={cx - 22} y={cy - 38} width={44} height={50} fill="transparent" style={{ cursor: "pointer" }} onClick={() => onSelecionar(selecionada === id ? null : id)} /> })}
      </svg>

      {/* textos (HTML para ficarem nítidos) */}
      <div className="absolute pointer-events-none text-center font-semibold text-[#3a3150] leading-none" style={{ left: `${(qx + 2) / W * 100}%`, width: `${(qw - 4) / W * 100}%`, top: `${9 / H * 100}%`, fontSize: W < 200 ? "10px" : "clamp(7px, 1.4vw, 12px)" }}>
        Envios na hora · {cota.usados}/{cota.limite}
      </div>
      <div className="absolute pointer-events-none flex items-center justify-center font-bold text-[#f4efff] leading-none tracking-[0.2em]" style={{ left: `${pl.placa[0] / W * 100}%`, width: `${pl.placa[1] / W * 100}%`, top: `${(parede - 11) / H * 100}%`, height: `${7 / H * 100}%`, fontSize: W < 200 ? "9px" : "clamp(6px, 1.1vw, 10px)" }}>
        ENYLA
      </div>
      {ordem.map(id => {
        const m = por.get(id); const [cx, cy] = pl.lugar[id]
        if (!m) return null
        const cor = m.estado === "trabalhando" ? "#1f9d55" : m.estado === "travado" ? "#d33a3c" : m.estado === "descansando" ? "#898892" : "#2f7cf6"
        return (
          <button key={id} onClick={() => onSelecionar(selecionada === id ? null : id)}
            className="absolute -translate-x-1/2 flex items-center gap-1 rounded-full px-1.5 sm:px-2 py-[2px] whitespace-nowrap"
            style={{ left: `${cx / W * 100}%`, top: `${(cy + 15.5) / H * 100}%`, background: selecionada === id ? "#ffffff" : "rgba(255,255,255,0.92)", boxShadow: "0 1px 3px rgba(0,0,0,0.14)" }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cor }} />
            <span className="font-semibold text-[#2a2430]" style={{ fontSize: W < 200 ? "11px" : "clamp(7.5px, 1.3vw, 11.5px)" }}>{m.nome.replace("Orçamentista digital", "Digital").replace("Levantador de MQL", "MQL")}</span>
          </button>
        )
      })}

      {sel && (() => {
        const [cx, cy] = pl.lugar[sel.id]
        const esq = cx / W < 0.5
        return (
          <div className="absolute z-10 ds-pop max-w-[78%] sm:max-w-[40%] rounded-xl bg-white px-2.5 py-2 text-left"
            style={{ [esq ? "left" : "right"]: `${Math.max(2, esq ? cx - 12 : W - cx - 12) / W * 100}%`, bottom: `${(H - cy + 38) / H * 100}%`, boxShadow: "0 6px 20px rgba(0,0,0,0.18)" }}>
            <p className="text-[12px] font-semibold text-[#191625] leading-tight">{sel.nome}</p>
            <p className={`text-[11.5px] leading-snug mt-0.5 ${sel.estado === "travado" ? "text-[#d33a3c] font-medium" : "text-[#5e5c68]"}`}>{sel.agora}</p>
            <p className="text-[10.5px] text-[#898892] mt-1">{sel.hoje} {sel.hojeRotulo} hoje{sel.extra ? ` · ${sel.extra}` : ""}</p>
          </div>
        )
      })()}
    </div>
  )
}
