"use client"

// Sala dos agentes em pixel art: cada agente é um personagem na sua mesa, animado pelo estado real
// (trabalhando digita, de plantão toma café, travado mostra "!", descansando dorme; o vigia faz ronda).
// Só desenho: lê os mesmos dados do Escritório, nenhuma chamada de IA.

import type { Mesa, IdMesa, EstadoMesa } from "../lib/escritorio"

// Duas plantas da sala: larga (computador, 4 mesas por fileira) e alta (celular, 2 por fileira, bonecos maiores)
type Planta = { W: number; H: number; parede: number; lugar: Record<IdMesa, [number, number]>; corredor: number; ronda: [number, number]; janelas: number[]; quadro: [number, number]; relogio: number | null; planta: number }
const LARGA: Planta = {
  W: 256, H: 180, parede: 46, corredor: 122, ronda: [24, 232], janelas: [18, 196], quadro: [92, 72], relogio: 74, planta: 172,
  lugar: { atendente: [38, 80], coletor: [98, 80], followup: [158, 80], reativacao: [218, 80], digital: [38, 152], propostas: [98, 152], vigia: [158, 152], aprendiz: [218, 152] },
}
const ALTA: Planta = {
  W: 136, H: 300, parede: 38, corredor: 186, ronda: [16, 120], janelas: [6], quadro: [54, 56], relogio: null, planta: 116,
  lugar: { atendente: [36, 72], coletor: [100, 72], followup: [36, 132], reativacao: [100, 132], digital: [36, 214], propostas: [100, 214], vigia: [36, 276], aprendiz: [100, 276] },
}
// Personagens (originais): cor da roupa = cor do agente
const PERS: Record<IdMesa, { roupa: string; cabelo: string; pele: string; estilo: "curto" | "longo" | "coque" | "careca" | "bone" }> = {
  atendente: { roupa: "#8456e8", cabelo: "#3b2418", pele: "#f1c7a3", estilo: "longo" },
  coletor: { roupa: "#2f7cf6", cabelo: "#1d1d24", pele: "#c98e64", estilo: "curto" },
  followup: { roupa: "#0f9ba8", cabelo: "#b5651d", pele: "#f5d0b0", estilo: "coque" },
  reativacao: { roupa: "#d4497b", cabelo: "#2a1a12", pele: "#8d5a3b", estilo: "longo" },
  digital: { roupa: "#e07b1f", cabelo: "#d9b44a", pele: "#f3cfae", estilo: "curto" },
  propostas: { roupa: "#1f9d55", cabelo: "#4a4a52", pele: "#e0ac85", estilo: "careca" },
  vigia: { roupa: "#3c3b46", cabelo: "#1d1d24", pele: "#b67a52", estilo: "bone" },
  aprendiz: { roupa: "#c98a12", cabelo: "#7a3b1c", pele: "#f6d5b8", estilo: "coque" },
}

function Cabeca({ p, estado }: { p: (typeof PERS)[IdMesa]; estado: EstadoMesa }) {
  const dormindo = estado === "descansando"
  return (
    <g className={dormindo ? "sala-cochila" : estado === "plantao" ? "sala-respira" : undefined}>
      <rect x={-4} y={-22} width={8} height={8} fill={p.pele} />
      {p.estilo === "careca" ? <rect x={-4} y={-22} width={8} height={1} fill={p.cabelo} opacity={0.5} /> : <rect x={-4} y={-23} width={8} height={3} fill={p.cabelo} />}
      {p.estilo === "longo" && <><rect x={-5} y={-22} width={1} height={8} fill={p.cabelo} /><rect x={4} y={-22} width={1} height={8} fill={p.cabelo} /></>}
      {p.estilo === "coque" && <rect x={-2} y={-25} width={4} height={2} fill={p.cabelo} />}
      {p.estilo === "bone" && <><rect x={-5} y={-24} width={10} height={3} fill="#2f7cf6" /><rect x={3} y={-22} width={4} height={1} fill="#2f7cf6" /></>}
      {dormindo
        ? <><rect x={-3} y={-18} width={2} height={1} fill="#3a3340" /><rect x={1} y={-18} width={2} height={1} fill="#3a3340" /></>
        : <g className="sala-pisca"><rect x={-3} y={-19} width={1} height={2} fill="#2a2430" /><rect x={2} y={-19} width={1} height={2} fill="#2a2430" /></g>}
      <rect x={-1} y={-16} width={2} height={1} fill={estado === "travado" ? "#7a2a2a" : "#c0806a"} />
    </g>
  )
}

function Posto({ id, m, ativo, onClick, lugar }: { id: IdMesa; m?: Mesa; ativo: boolean; onClick: () => void; lugar: [number, number] }) {
  const [cx, cy] = lugar
  const p = PERS[id]
  const estado = m?.estado ?? "plantao"
  const rondando = id === "vigia" && estado !== "descansando" && estado !== "travado"
  const tela = estado === "trabalhando" ? p.roupa : estado === "travado" ? "#d33a3c" : estado === "descansando" ? "#2a2833" : "#9fb4d8"
  return (
    <g transform={`translate(${cx} ${cy})`} onClick={onClick} style={{ cursor: "pointer" }}>
      {/* destaque de selecionado */}
      {ativo && <rect x={-20} y={-30} width={40} height={44} fill={p.roupa} opacity={0.12} />}
      {/* cadeira */}
      <rect x={-7} y={-18} width={14} height={13} fill="#4b4558" />
      <rect x={-6} y={-17} width={12} height={2} fill="#5d566c" />
      {/* personagem sentado (o vigia está de ronda: cadeira vazia) */}
      {!rondando && <>
        <rect x={-6} y={-14} width={12} height={10} fill={p.roupa} />
        <rect x={-6} y={-14} width={12} height={2} fill="#ffffff" opacity={0.15} />
        <Cabeca p={p} estado={estado} />
        {/* mãos no teclado */}
        <rect x={-6} y={-5} width={3} height={2} fill={p.pele} className={estado === "trabalhando" ? "sala-digita-a" : undefined} />
        <rect x={3} y={-5} width={3} height={2} fill={p.pele} className={estado === "trabalhando" ? "sala-digita-b" : undefined} />
      </>}
      {/* mesa */}
      <rect x={-17} y={-3} width={34} height={3} fill="#c99a64" />
      <rect x={-17} y={0} width={34} height={9} fill="#9c6f42" />
      <rect x={-17} y={0} width={34} height={1} fill="#7d5733" />
      <rect x={-15} y={9} width={2} height={4} fill="#6b4a2b" /><rect x={13} y={9} width={2} height={4} fill="#6b4a2b" />
      {/* notebook (de costas pra gente) com o brilho da tela */}
      <rect x={-7} y={-8} width={14} height={6} fill="#c8ccd6" />
      <rect x={-1} y={-6} width={2} height={2} fill="#eef0f4" />
      <rect x={-8} y={-3} width={16} height={1} fill="#a9aeba" />
      <rect x={-7} y={-9} width={14} height={1} fill={tela} className={estado === "trabalhando" ? "sala-tela" : estado === "travado" ? "sala-alerta" : undefined} />
      {/* caneca: quem está de plantão toma café */}
      <g className={estado === "plantao" && !rondando ? "sala-cafe" : undefined}>
        <rect x={10} y={-6} width={4} height={4} fill="#f4f1ea" /><rect x={14} y={-5} width={1} height={2} fill="#f4f1ea" />
        <rect x={10} y={-6} width={4} height={1} fill="#6b3f22" />
      </g>
      {estado === "plantao" && !rondando && <g className="sala-vapor"><rect x={11} y={-9} width={1} height={2} fill="#ffffff" opacity={0.7} /><rect x={13} y={-11} width={1} height={2} fill="#ffffff" opacity={0.5} /></g>}
      {/* papelada de quem orça */}
      {(id === "propostas" || id === "digital") && <><rect x={-15} y={-5} width={6} height={2} fill="#ffffff" /><rect x={-14} y={-6} width={6} height={1} fill="#e8e6ef" /></>}
      {id === "aprendiz" && <><rect x={-15} y={-6} width={5} height={3} fill="#c0392b" /><rect x={-15} y={-7} width={5} height={1} fill="#2f7cf6" /></>}
      {/* balões */}
      {estado === "travado" && !rondando && (
        <g className="sala-alerta">
          <rect x={6} y={-34} width={9} height={9} fill="#ffffff" stroke="#d33a3c" strokeWidth={1} />
          <rect x={10} y={-32} width={1} height={3} fill="#d33a3c" /><rect x={10} y={-28} width={1} height={1} fill="#d33a3c" />
        </g>
      )}
      {estado === "trabalhando" && !rondando && (
        <g>
          <rect x={6} y={-33} width={13} height={7} fill="#ffffff" stroke="#d9d6e3" strokeWidth={1} />
          <rect x={8} y={-30} width={2} height={2} fill={p.roupa} className="sala-ponto-1" />
          <rect x={11.5} y={-30} width={2} height={2} fill={p.roupa} className="sala-ponto-2" />
          <rect x={15} y={-30} width={2} height={2} fill={p.roupa} className="sala-ponto-3" />
        </g>
      )}
      {estado === "descansando" && !rondando && (
        <g className="sala-zzz" fill="#8a87a0">
          <rect x={6} y={-27} width={3} height={1} /><rect x={7} y={-26} width={1} height={1} /><rect x={6} y={-25} width={3} height={1} />
        </g>
      )}
    </g>
  )
}

// O vigia andando pelo corredor (vai e volta), quando está de pé
function Vigia({ m, ronda }: { m?: Mesa; ronda: [number, number] }) {
  const p = PERS.vigia
  if (!m || m.estado === "descansando" || m.estado === "travado") return null
  return (
    <g className="sala-ronda" style={{ ["--ini" as string]: `${ronda[0]}px`, ["--fim" as string]: `${ronda[1]}px` }}>
      <g className="sala-passo">
        <rect x={-3} y={-2} width={2} height={4} fill="#2a2833" className="sala-perna-a" />
        <rect x={1} y={-2} width={2} height={4} fill="#2a2833" className="sala-perna-b" />
        <rect x={-5} y={-12} width={10} height={10} fill={p.roupa} />
        <rect x={-1} y={-11} width={2} height={2} fill="#f1c84b" />
        <g transform="translate(0 2)"><Cabeca p={p} estado="plantao" /></g>
        <rect x={5} y={-9} width={3} height={2} fill="#f1c84b" />
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

  return (
    <div className="relative w-full overflow-hidden rounded-2xl select-none" style={{ aspectRatio: `${W} / ${H}`, background: "#2a2833" }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" shapeRendering="crispEdges" role="img" aria-label="Sala dos agentes">
        {/* parede */}
        <rect x={0} y={0} width={W} height={parede} fill="#e9e3f5" />
        <rect x={0} y={parede - 4} width={W} height={4} fill="#cfc6e3" />
        {/* janelas */}
        {pl.janelas.map(x => (
          <g key={x}>
            <rect x={x} y={8} width={42} height={24} fill="#6e6489" />
            <rect x={x + 2} y={10} width={38} height={20} fill={ceu} />
            {noite ? <><rect x={x + 8} y={14} width={1} height={1} fill="#fff" /><rect x={x + 28} y={18} width={1} height={1} fill="#fff" /><rect x={x + 31} y={12} width={3} height={3} fill="#f4f1c9" /></>
              : <><rect x={x + 8} y={16} width={8} height={3} fill="#ffffff" opacity={0.8} className="sala-nuvem" /><rect x={x + 6} y={17} width={12} height={2} fill="#ffffff" opacity={0.8} className="sala-nuvem" /></>}
            <rect x={x + 20} y={10} width={2} height={20} fill="#6e6489" />
          </g>
        ))}
        {/* quadro: envios na hora */}
        <rect x={qx} y={7} width={qw} height={28} fill="#5b4f7a" />
        <rect x={qx + 2} y={9} width={qw - 4} height={24} fill="#fbfaff" />
        <rect x={qx + 6} y={24} width={qw - 12} height={4} fill="#e4dff0" />
        <rect x={qx + 6} y={24} width={Math.round((qw - 12) * pctCota)} height={4} fill={pctCota >= 1 ? "#d33a3c" : pctCota >= 0.75 ? "#e07b1f" : "#8456e8"} />
        {/* relógio e planta */}
        {pl.relogio !== null && <>
          <rect x={pl.relogio} y={12} width={10} height={10} fill="#ffffff" stroke="#5b4f7a" strokeWidth={1} />
          <rect x={pl.relogio + 4.5} y={14} width={1} height={3.5} fill="#2a2430" /><rect x={pl.relogio + 5} y={17} width={3} height={1} fill="#2a2430" />
        </>}
        <g transform={`translate(${pl.planta - 172} ${parede - 46})`}>
          <rect x={172} y={30} width={8} height={12} fill="#b5653a" />
          <rect x={170} y={22} width={4} height={8} fill="#3f9a5a" className="sala-planta" /><rect x={176} y={18} width={4} height={12} fill="#4fb36b" className="sala-planta" /><rect x={173} y={24} width={4} height={6} fill="#2f7a46" />
        </g>
        {/* chão */}
        <rect x={0} y={parede} width={W} height={H - parede} fill="#d8c3a0" />
        {Array.from({ length: Math.ceil((H - parede) / 14) }, (_, i) => <rect key={i} x={0} y={parede + 6 + i * 14} width={W} height={1} fill="#c6ae88" />)}
        {Array.from({ length: Math.ceil(W / 32) + 1 }, (_, i) => <rect key={`v${i}`} x={i * 32 + 8} y={parede} width={1} height={H - parede} fill="#cdb791" opacity={0.6} />)}
        {/* tapete do corredor */}
        <rect x={6} y={pl.corredor - 6} width={W - 12} height={10} fill="#b9a6d6" opacity={0.55} />
        {/* mesas */}
        {ordem.map(id => <Posto key={id} id={id} lugar={pl.lugar[id]} m={por.get(id)} ativo={selecionada === id} onClick={() => onSelecionar(selecionada === id ? null : id)} />)}
        <g transform={`translate(0 ${pl.corredor})`}><Vigia m={por.get("vigia")} ronda={pl.ronda} /></g>
      </svg>

      {/* textos (HTML para ficarem nítidos) */}
      <div className="absolute pointer-events-none text-center font-semibold text-[#3a3150] leading-none" style={{ left: `${(qx + 2) / W * 100}%`, width: `${(qw - 4) / W * 100}%`, top: `${11 / H * 100}%`, fontSize: W < 200 ? "10px" : "clamp(7px, 1.4vw, 12px)" }}>
        Envios na hora · {cota.usados}/{cota.limite}
      </div>
      {ordem.map(id => {
        const m = por.get(id); const [cx, cy] = pl.lugar[id]
        if (!m) return null
        const cor = m.estado === "trabalhando" ? "#1f9d55" : m.estado === "travado" ? "#d33a3c" : m.estado === "descansando" ? "#898892" : "#2f7cf6"
        return (
          <button key={id} onClick={() => onSelecionar(selecionada === id ? null : id)}
            className="absolute -translate-x-1/2 flex items-center gap-1 rounded-full px-1.5 sm:px-2 py-[2px] whitespace-nowrap"
            style={{ left: `${cx / W * 100}%`, top: `${(cy + 15) / H * 100}%`, background: selecionada === id ? "#ffffff" : "rgba(255,255,255,0.82)", boxShadow: "0 1px 2px rgba(0,0,0,0.12)" }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cor }} />
            <span className="font-semibold text-[#2a2430]" style={{ fontSize: W < 200 ? "11px" : "clamp(7.5px, 1.3vw, 11.5px)" }}>{m.nome.replace("Orçamentista digital", "Digital").replace("Levantador de MQL", "MQL")}</span>
          </button>
        )
      })}

      {/* balão do selecionado: o que está fazendo */}
      {sel && (() => {
        const [cx, cy] = pl.lugar[sel.id]
        const esq = cx / W < 0.5
        return (
          <div className="absolute z-10 ds-pop max-w-[78%] sm:max-w-[40%] rounded-xl bg-white px-2.5 py-2 text-left"
            style={{ [esq ? "left" : "right"]: `${(esq ? cx - 10 : W - cx - 10) / W * 100}%`, bottom: `${(H - cy + 30) / H * 100}%`, boxShadow: "0 6px 20px rgba(0,0,0,0.18)" }}>
            <p className="text-[12px] font-semibold text-[#191625] leading-tight">{sel.nome}</p>
            <p className={`text-[11.5px] leading-snug mt-0.5 ${sel.estado === "travado" ? "text-[#d33a3c] font-medium" : "text-[#5e5c68]"}`}>{sel.agora}</p>
            <p className="text-[10.5px] text-[#898892] mt-1">{sel.hoje} {sel.hojeRotulo} hoje{sel.extra ? ` · ${sel.extra}` : ""}</p>
          </div>
        )
      })()}
    </div>
  )
}
