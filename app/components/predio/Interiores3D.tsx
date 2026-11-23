"use client"

// Interiores do prédio 3D, com os dados reais:
//  · Gráfica (térreo): uma estação por etapa do quadro, operador na máquina que tem pedido, caixas na esteira
//    (vermelhas se atrasadas) e uma plaquinha com quantos pedidos tem ali (clique para ver a lista).
//  · Agentes (1º): uma mesa por agente, a pessoa sentada; monitor aceso trabalhando, luz vermelha travado,
//    cadeira vazia descansando; plaquinha com o nome e o estado (clique para ver o que ele está fazendo).
//  · Canteiro: os andares que ainda vão ser construídos (andaime, cones, material).

import React, { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { Html, RoundedBox } from "@react-three/drei"
import * as THREE from "three"
import { LARG, PROF, LAJE, Luminarias, Mesa, type M } from "./base3d"
import type { KanbanCard } from "../../types"
import type { Mesa as MesaAgente } from "../../lib/escritorio"
import { ESTACOES, atrasado } from "./GraficaVirtual"

const PELES = ["#f1c9a5", "#d6a37c", "#8d5a3b", "#e8b896", "#a8704d"]

// Pessoa simples (sentada ou em pé): calça, camisa, cabeça e cabelo
export function Pessoa({ p, rot = 0, cor, sentado = false, pele = 0, trabalhando = false }: { p: [number, number, number]; rot?: number; cor: string; sentado?: boolean; pele?: number; trabalhando?: boolean }) {
  const corpo = useRef<THREE.Group>(null)
  useFrame(() => { if (corpo.current && trabalhando) corpo.current.rotation.x = Math.sin(performance.now() / 700 + p[0]) * 0.04 })
  const calca = <meshStandardMaterial color="#2c3140" roughness={0.8} />, camisa = <meshStandardMaterial color={cor} roughness={0.7} />
  const cabeca = <meshStandardMaterial color={PELES[pele % PELES.length]} roughness={0.6} />, cabelo = <meshStandardMaterial color="#2a211b" roughness={0.9} />
  return (
    <group position={p} rotation={[0, rot, 0]}>
      {sentado ? <>
        {[-0.11, 0.11].map(x => <mesh key={x} position={[x, 0.5, 0.18]} castShadow><boxGeometry args={[0.15, 0.14, 0.45]} />{calca}</mesh>)}
        {[-0.11, 0.11].map(x => <mesh key={`c${x}`} position={[x, 0.24, 0.38]} castShadow><boxGeometry args={[0.13, 0.48, 0.14]} />{calca}</mesh>)}
      </> : [-0.11, 0.11].map(x => <mesh key={x} position={[x, 0.45, 0]} castShadow><boxGeometry args={[0.15, 0.9, 0.16]} />{calca}</mesh>)}
      <group ref={corpo} position={[0, sentado ? 0.55 : 0.9, 0]}>
        <RoundedBox args={[0.44, 0.6, 0.26]} radius={0.08} position={[0, 0.32, 0]} castShadow>{camisa}</RoundedBox>
        {[-0.27, 0.27].map(x => <mesh key={x} position={[x, 0.3, sentado ? -0.1 : 0]} rotation={[sentado ? -0.9 : 0, 0, 0]} castShadow><boxGeometry args={[0.11, 0.5, 0.12]} />{camisa}</mesh>)}
        <mesh position={[0, 0.78, 0]} castShadow><sphereGeometry args={[0.15, 18, 14]} />{cabeca}</mesh>
        <mesh position={[0, 0.85, 0.02]} castShadow><sphereGeometry args={[0.155, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />{cabelo}</mesh>
      </group>
    </group>
  )
}

// Plaquinha flutuante (HTML)
// (sempre montada; "visivel" só esconde: desmontar o HTML do drei no meio da transição quebrava a tela)
function Placa({ p, titulo, sub, cor, ativa, onClick, visivel = true }: { p: [number, number, number]; titulo: string; sub?: string; cor: string; ativa?: boolean; onClick?: () => void; visivel?: boolean }) {
  return (
    <Html position={p} center zIndexRange={[30, 0]} style={{ visibility: visivel ? "visible" : "hidden", pointerEvents: visivel ? "auto" : "none" }}>
      <button onClick={onClick} style={{ cursor: "pointer", border: "none", whiteSpace: "nowrap", borderRadius: 10, padding: "5px 9px", textAlign: "left",
        background: ativa ? "#191625" : "rgba(255,255,255,0.94)", color: ativa ? "#fff" : "#191625", boxShadow: "0 6px 20px rgba(0,0,0,.22)",
        fontFamily: "-apple-system, system-ui, sans-serif", borderLeft: `4px solid ${cor}` }}>
        <span style={{ display: "block", fontSize: 12, fontWeight: 700 }}>{titulo}</span>
        {sub && <span style={{ display: "block", fontSize: 10.5, opacity: 0.75, maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>}
      </button>
    </Html>
  )
}

// ── Gráfica ──────────────────────────────────────────────────────────────────
function Maquina3D({ coluna, m, ativa, qtd }: { coluna: number; m: M; ativa: boolean; qtd: number }) {
  const rolos = useRef<THREE.Group>(null), prensa = useRef<THREE.Mesh>(null), uv = useRef<THREE.MeshStandardMaterial>(null)
  useFrame((_, dt) => {
    if (rolos.current && ativa) rolos.current.children.forEach(c => { c.rotation.x += dt * 6 })
    if (prensa.current) prensa.current.position.y = ativa ? 1.95 - Math.abs(Math.sin(performance.now() / 320)) * 0.3 : 1.95
    if (uv.current) uv.current.emissiveIntensity = ativa ? 1.6 + Math.sin(performance.now() / 260) * 0.8 : 0.08
  })
  switch (coluna) {
    case 2: return <group><Mesa p={[0, 0, 0]} m={m} tela={ativa} /><mesh material={m.preto} position={[0.55, 1.05, -0.25]}><boxGeometry args={[0.4, 0.3, 0.03]} /></mesh></group>
    case 3: return (
      <group>
        <mesh material={m.madeira} position={[0, 0.75, 0]} castShadow receiveShadow><boxGeometry args={[1.8, 0.05, 1]} /></mesh>
        <mesh material={m.aluminio} position={[0, 0.37, 0]}><boxGeometry args={[0.08, 0.74, 0.08]} /></mesh>
        {Array.from({ length: Math.min(4, qtd) }, (_, k) => <mesh key={k} material={m.branco} position={[-0.5 + k * 0.33, 0.79, 0]} rotation={[0, k * 0.2, 0]}><boxGeometry args={[0.3, 0.01, 0.42]} /></mesh>)}
        <mesh material={m.branco} position={[0.6, 1.4, -0.5]} castShadow><boxGeometry args={[0.9, 1.1, 0.04]} /></mesh>
        <mesh position={[0.6, 1.4, -0.47]}><planeGeometry args={[0.3, 0.3]} /><meshStandardMaterial color={ativa ? "#009351" : "#c9c6d2"} emissive={ativa ? "#00b862" : "#000"} emissiveIntensity={ativa ? 0.6 : 0} /></mesh>
      </group>)
    case 4: return (
      <group>
        <mesh material={m.madeira} position={[0, 0.08, 0]} castShadow><boxGeometry args={[1.3, 0.16, 1]} /></mesh>
        {Array.from({ length: 3 + Math.min(8, qtd * 2) }, (_, k) => <mesh key={k} material={k % 2 ? m.branco : m.piso} position={[0, 0.24 + k * 0.1, 0]} castShadow><boxGeometry args={[1.1, 0.09, 0.8]} /></mesh>)}
      </group>)
    case 5: return (
      <group>
        <RoundedBox args={[4.2, 2, 2]} radius={0.12} position={[0, 1, 0]} material={m.maquina} castShadow receiveShadow />
        <group ref={rolos}>
          {["#00aeef", "#ec008c", "#fff200", "#222222"].map((c, k) => (
            <mesh key={k} position={[-1.5 + k * 1, 2.15, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.28, 0.28, 2.1, 24]} /><meshStandardMaterial color={c} metalness={0.3} roughness={0.35} /></mesh>
          ))}
        </group>
        <mesh position={[1.5, 1.5, 1.01]}><planeGeometry args={[0.7, 0.4]} /><meshStandardMaterial color="#3fe08a" emissive="#3fe08a" emissiveIntensity={ativa ? 1.4 : 0.05} toneMapped={false} /></mesh>
        <mesh material={m.branco} position={[2.5, 0.9, 0]} castShadow><boxGeometry args={[0.8, 0.5, 1.2]} /></mesh>
      </group>)
    case 6: return (
      <group>
        <RoundedBox args={[2.6, 1.5, 1.7]} radius={0.1} position={[0, 0.75, 0]} material={m.maquina} castShadow />
        <mesh position={[0, 0.8, 0.86]}><planeGeometry args={[2, 0.45]} /><meshStandardMaterial ref={uv} color="#b78cff" emissive="#a36bff" emissiveIntensity={1} toneMapped={false} /></mesh>
      </group>)
    case 7: return (
      <group>
        <mesh material={m.maquina} position={[0, 0.55, 0]} castShadow><boxGeometry args={[2, 1.1, 1.7]} /></mesh>
        {[-0.85, 0.85].map(x => <mesh key={x} material={m.aluminio} position={[x, 1.7, 0]}><boxGeometry args={[0.16, 1.5, 0.16]} /></mesh>)}
        <mesh material={m.maquina} position={[0, 2.55, 0]} castShadow><boxGeometry args={[2, 0.32, 1.7]} /></mesh>
        <mesh ref={prensa} material={m.aluminio} position={[0, 1.95, 0]} castShadow><boxGeometry args={[1.6, 0.22, 1.4]} /></mesh>
      </group>)
    case 8: return (
      <group>
        {Array.from({ length: 2 }, (_, k) => (
          <group key={k} position={[-0.7 + k * 1.4, 0, 0]}>
            <mesh material={m.madeira} position={[0, 0.08, 0]} castShadow><boxGeometry args={[1.2, 0.16, 1]} /></mesh>
            {Array.from({ length: Math.min(8, 2 + qtd * 2) }, (_, j) => <mesh key={j} material={m.papelao} position={[-0.3 + (j % 2) * 0.6, 0.38 + Math.floor(j / 2) * 0.42, 0]} castShadow><boxGeometry args={[0.55, 0.4, 0.9]} /></mesh>)}
          </group>
        ))}
      </group>)
  }
  return null
}

export function GraficaInterior({ m, kanban, noite, rotulos, estacao, onEstacao }: {
  m: M; kanban: KanbanCard[]; noite: boolean; rotulos: boolean; estacao: number | null; onEstacao: (c: number | null) => void
}) {
  const hoje = new Date().toLocaleDateString("sv-SE")
  const porColuna = new Map<number, KanbanCard[]>()
  for (const c of kanban) if (c.coluna >= 2 && c.coluna <= 8) porColuna.set(c.coluna, [...(porColuna.get(c.coluna) ?? []), c])
  const algum = [...porColuna.values()].some(l => l.length)
  const xDe = (i: number) => -LARG / 2 + 2.4 + i * ((LARG - 4.8) / (ESTACOES.length - 1))
  return (
    <group>
      <mesh material={m.pisoGrafica} position={[0, 0.05, 0]} receiveShadow><boxGeometry args={[LARG - 0.2, 0.1, PROF - 0.2]} /></mesh>
      {[-1.6, 2.6].map(z => <mesh key={z} position={[0, 0.11, z]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[LARG - 2, 0.12]} /><meshStandardMaterial color="#e8b520" /></mesh>)}
      {/* esteira que corre por todas as etapas */}
      <mesh material={m.preto} position={[0, 0.5, 1.6]} castShadow receiveShadow><boxGeometry args={[LARG - 3, 0.12, 0.8]} /></mesh>
      {[-LARG / 2 + 2, LARG / 2 - 2].map(x => <mesh key={x} material={m.aluminio} position={[x, 0.25, 1.6]}><boxGeometry args={[0.12, 0.5, 0.7]} /></mesh>)}
      {ESTACOES.map((e, i) => {
        const cards = porColuna.get(e.coluna) ?? [], n = cards.length, atras = cards.filter(c => atrasado(c, hoje)).length
        const x = xDe(i)
        return (
          <group key={e.coluna}>
            <group position={[x, 0.1, -1.2]} onClick={ev => { ev.stopPropagation(); onEstacao(estacao === e.coluna ? null : e.coluna) }}>
              <Maquina3D coluna={e.coluna} m={m} ativa={n > 0} qtd={n} />
            </group>
            {n > 0 && <Pessoa p={[x + (e.coluna === 2 ? 0 : 1.1), 0.1, e.coluna === 2 ? -0.55 : 0.1]} rot={e.coluna === 2 ? Math.PI : Math.PI} cor={["#8456e8", "#2f6fdf", "#e07b39", "#3a3d42", "#2a9d8f", "#c2410c", "#4b5563"][i]}
              sentado={e.coluna === 2} pele={i} trabalhando />}
            {cards.slice(0, 4).map((c, k) => <mesh key={c.id} position={[x - 0.6 + k * 0.4, 0.72, 1.6]} castShadow><boxGeometry args={[0.32, 0.3, 0.32]} />
              <meshStandardMaterial color={atrasado(c, hoje) ? "#d33a3c" : "#c69a63"} roughness={0.85} /></mesh>)}
            {<Placa visivel={rotulos} p={[x, 3.4, -1.2]} titulo={`${e.curto} · ${n}`} sub={atras ? `${atras} atrasado${atras > 1 ? "s" : ""}` : n ? "trabalhando" : "parada"}
              cor={atras ? "#d33a3c" : n ? "#009351" : "#9a9aa5"} ativa={estacao === e.coluna} onClick={() => onEstacao(estacao === e.coluna ? null : e.coluna)} />}
          </group>
        )
      })}
      {/* porta de carga dos fundos */}
      <mesh material={m.aluminio} position={[LARG / 2 - 3.5, 2.2, -PROF / 2 + 0.2]}><boxGeometry args={[4, 4, 0.1]} /></mesh>
      {Array.from({ length: 10 }, (_, k) => <mesh key={k} material={m.preto} position={[LARG / 2 - 3.5, 0.4 + k * 0.38, -PROF / 2 + 0.27]}><boxGeometry args={[3.9, 0.03, 0.02]} /></mesh>)}
      {rotulos ? <pointLight position={[0, 4.6, 0]} intensity={noite ? 55 : 18} distance={30} color="#fff1dc" /> : <Luminarias y={5.25} ativo={algum} noite={noite} />}
    </group>
  )
}

// ── Agentes ──────────────────────────────────────────────────────────────────
const COR_AGENTE: Record<string, string> = {
  atendente: "#8456e8", coletor: "#2f6fdf", followup: "#e07b39", reativacao: "#2a9d8f", digital: "#c2410c",
  propostas: "#4b5563", vigia: "#1f2937", aprendiz: "#0ea5e9", auditor: "#059669",
}
const COR_ESTADO = { trabalhando: "#009351", plantao: "#2f6fdf", travado: "#d33a3c", descansando: "#9a9aa5" } as const
const NOME_ESTADO = { trabalhando: "trabalhando", plantao: "de plantão", travado: "travado", descansando: "descansando" } as const

export function AgentesInterior({ m, y, mesas, noite, rotulos, sel, onSel }: {
  m: M; y: number; mesas: MesaAgente[]; noite: boolean; rotulos: boolean; sel: string | null; onSel: (id: string | null) => void
}) {
  const algum = mesas.some(x => x.estado === "trabalhando")
  const base = y + LAJE
  return (
    <group>
      <mesh material={m.piso} position={[0, y + LAJE / 2, 0]} receiveShadow castShadow><boxGeometry args={[LARG - 0.2, LAJE, PROF - 0.2]} /></mesh>
      {/* tapete da área dos agentes */}
      <mesh position={[-3, base + 0.01, -0.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[15, 10]} /><meshStandardMaterial color="#5b5f6e" roughness={1} /></mesh>
      {mesas.slice(0, 9).map((a, k) => {
        const px = -9 + (k % 3) * 4.6, pz = -4.2 + Math.floor(k / 3) * 3.4
        const presente = a.estado !== "descansando"
        return (
          <group key={a.id} onClick={ev => { ev.stopPropagation(); onSel(sel === a.id ? null : a.id) }}>
            <Mesa p={[px, base, pz]} m={m} tela={a.estado === "trabalhando"} />
            {presente && <Pessoa p={[px, base, pz + 0.62]} rot={Math.PI} cor={COR_AGENTE[a.id] ?? "#8456e8"} sentado pele={k} trabalhando={a.estado === "trabalhando"} />}
            {a.estado === "travado" && <mesh position={[px, base + 2.1, pz]}><sphereGeometry args={[0.12, 14, 10]} /><meshStandardMaterial color="#ff3b3b" emissive="#ff2020" emissiveIntensity={3} toneMapped={false} /></mesh>}
            {<Placa visivel={rotulos} p={[px, base + 2.35, pz]} titulo={a.nome} sub={a.estado === "trabalhando" || a.estado === "travado" ? a.agora : NOME_ESTADO[a.estado]}
              cor={COR_ESTADO[a.estado]} ativa={sel === a.id} onClick={() => onSel(sel === a.id ? null : a.id)} />}
          </group>
        )
      })}
      {/* sala de reunião de vidro */}
      <group position={[7.5, base, -3.5]}>
        <mesh material={m.madeira} position={[0, 0.74, 0]} castShadow><boxGeometry args={[3, 0.06, 1.3]} /></mesh>
        {[-1.1, 0, 1.1].map(x => [-0.95, 0.95].map(z => <mesh key={`${x}${z}`} material={m.preto} position={[x, 0.45, z]} castShadow><boxGeometry args={[0.45, 0.9, 0.45]} /></mesh>))}
        {[[0, -2.2, 6, 0], [0, 2.2, 6, 0], [-3, 0, 4.4, Math.PI / 2]].map(([x, z, w, r], k) => <mesh key={k} material={m.vidro} position={[x, 1.4, z]} rotation={[0, r, 0]}><planeGeometry args={[w, 2.8]} /></mesh>)}
      </group>
      {/* recepção e sofá */}
      <group position={[7.5, base, 4.5]}>
        <RoundedBox args={[3, 1.05, 0.8]} radius={0.08} position={[0, 0.52, 0]} material={m.branco} castShadow />
        <mesh position={[0, 0.7, 0.41]}><planeGeometry args={[1.4, 0.25]} /><meshStandardMaterial color="#8456e8" emissive="#8456e8" emissiveIntensity={0.6} /></mesh>
      </group>
      <RoundedBox args={[3, 0.45, 0.9]} radius={0.12} position={[2.5, base + 0.3, 5.6]} castShadow><meshStandardMaterial color="#6c5ba7" roughness={0.8} /></RoundedBox>
      {/* plantas */}
      {[[-12, -6.5], [-12, 6.5], [11.8, 6.5], [4.2, -6.5]].map(([x, z], k) => (
        <group key={k} position={[x, base, z]}>
          <mesh material={m.branco} position={[0, 0.3, 0]} castShadow><cylinderGeometry args={[0.32, 0.26, 0.6, 16]} /></mesh>
          <mesh material={m.folha} position={[0, 1.05, 0]} castShadow><icosahedronGeometry args={[0.55, 1]} /></mesh>
        </group>
      ))}
      {rotulos ? <pointLight position={[0, y + 3.2, 0]} intensity={noite ? 45 : 14} distance={26} color="#fff1dc" /> : <Luminarias y={y + 3.55} ativo={algum} noite={noite} />}
    </group>
  )
}

// ── Canteiro (andar em obras) ────────────────────────────────────────────────
export function Canteiro({ m, y }: { m: M; y: number }) {
  const base = y + LAJE
  return (
    <group>
      <mesh material={m.concreto} position={[0, y + LAJE / 2, 0]} receiveShadow castShadow><boxGeometry args={[LARG - 0.2, LAJE, PROF - 0.2]} /></mesh>
      {/* andaime */}
      {Array.from({ length: 4 }, (_, i) => Array.from({ length: 2 }, (_, j) => (
        <mesh key={`${i}${j}`} position={[-6 + i * 2.2, base + 1.6, -3 + j * 1.4]}><cylinderGeometry args={[0.04, 0.04, 3.2, 8]} /><meshStandardMaterial color="#d28a1e" metalness={0.5} roughness={0.4} /></mesh>
      )))}
      {[0.8, 2.4].map(h => <mesh key={h} position={[-2.7, base + h, -2.3]}><boxGeometry args={[7, 0.08, 1.6]} /><meshStandardMaterial color="#a47b55" /></mesh>)}
      {/* cones */}
      {[[3, 2], [4.2, 2.6], [5.4, 2]].map(([x, z], k) => (
        <group key={k} position={[x, base, z]}>
          <mesh position={[0, 0.3, 0]} castShadow><coneGeometry args={[0.2, 0.6, 16]} /><meshStandardMaterial color="#ff7a1a" /></mesh>
          <mesh position={[0, 0.34, 0]}><cylinderGeometry args={[0.13, 0.15, 0.08, 16]} /><meshStandardMaterial color="#ffffff" /></mesh>
        </group>
      ))}
      {/* material empilhado e sacos */}
      {Array.from({ length: 5 }, (_, k) => <mesh key={k} material={m.aletas} position={[8, base + 0.1 + k * 0.12, -4]} castShadow><boxGeometry args={[3, 0.1, 1.2]} /></mesh>)}
      {Array.from({ length: 6 }, (_, k) => <mesh key={k} position={[-9 + (k % 3) * 0.7, base + 0.18 + Math.floor(k / 3) * 0.3, 4]} castShadow><boxGeometry args={[0.6, 0.28, 0.45]} /><meshStandardMaterial color="#cfc6b4" roughness={1} /></mesh>)}
      <pointLight position={[0, base + 2.8, 0]} intensity={6} distance={14} color="#ffe2b0" />
    </group>
  )
}
