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
import type { FinanceiroAndar } from "../../lib/financeiroAndar"
import { DIRETORES, type Diretor } from "../../lib/diretoria"

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

// ── Financeiro (2º andar) ────────────────────────────────────────────────────
const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

// Painel de TV na parede, desenhado com os números reais
function TelaFinanceiro({ fin }: { fin: FinanceiroAndar }) {
  const tex = React.useMemo(() => {
    const c = document.createElement("canvas"); c.width = 1400; c.height = 680
    const g = c.getContext("2d")!
    const fundo = g.createLinearGradient(0, 0, 0, c.height); fundo.addColorStop(0, "#14121f"); fundo.addColorStop(1, "#1d1830")
    g.fillStyle = fundo; g.fillRect(0, 0, c.width, c.height)
    g.fillStyle = "#a99be0"; g.font = "600 34px Helvetica, Arial"; g.fillText(`Financeiro · ${new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`, 60, 80)
    const cartao = (x: number, y: number, rot: string, valor: string, cor: string) => {
      g.fillStyle = "rgba(255,255,255,0.06)"; g.beginPath(); g.roundRect(x, y, 400, 210, 24); g.fill()
      g.fillStyle = "#b9b3cc"; g.font = "500 28px Helvetica, Arial"; g.fillText(rot, x + 30, y + 58)
      g.fillStyle = cor; g.font = "700 64px Helvetica, Arial"; g.fillText(valor, x + 30, y + 150)
    }
    cartao(60, 120, "Recebido no mês", brl0(fin.recebidoMes), "#3fe08a")
    cartao(500, 120, "Saiu no mês", brl0(fin.pagoMes), "#ff8a8a")
    cartao(940, 120, "Resultado", brl0(fin.resultadoMes), fin.resultadoMes >= 0 ? "#3fe08a" : "#ff8a8a")
    cartao(60, 380, "A receber", brl0(fin.aReceber), "#ffd36b")
    cartao(500, 380, "Cobrança vencida", brl0(fin.vencido), fin.vencido > 0 ? "#ff8a8a" : "#3fe08a")
    cartao(940, 380, "Digital no mês", brl0(fin.digital.recebidoMes - fin.digital.custoVillaMes), "#8fd3ff")
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t
  }, [fin])
  return (
    <group>
      <mesh position={[0, 0, -0.06]} castShadow><boxGeometry args={[7.4, 3.7, 0.1]} /><meshStandardMaterial color="#0c0c10" metalness={0.6} roughness={0.3} /></mesh>
      <mesh><planeGeometry args={[7.1, 3.45]} /><meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.9} toneMapped={false} /></mesh>
    </group>
  )
}

export function FinanceiroInterior({ m, y, fin, noite, rotulos }: { m: M; y: number; fin: FinanceiroAndar; noite: boolean; rotulos: boolean }) {
  const base = y + LAJE
  const maior = Math.max(1, ...fin.porMes.flatMap(x => [x.receita, x.despesa]))
  const alt = (v: number) => Math.max(0.04, v / maior * 2.4)
  return (
    <group>
      <mesh material={m.piso} position={[0, y + LAJE / 2, 0]} receiveShadow castShadow><boxGeometry args={[LARG - 0.2, LAJE, PROF - 0.2]} /></mesh>
      <mesh position={[-1, base + 0.01, -0.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[16, 10]} /><meshStandardMaterial color="#3f4a46" roughness={1} /></mesh>
      {/* parede do painel */}
      <mesh material={m.branco} position={[-2, base + 1.7, -PROF / 2 + 0.6]} castShadow><boxGeometry args={[11, 3.4, 0.2]} /></mesh>
      <group position={[-2, base + 1.85, -PROF / 2 + 0.78]}><TelaFinanceiro fin={fin} /></group>
      {/* gráfico físico: barras dos últimos 6 meses (verde entrou, vermelho saiu) */}
      <group position={[-6.5, base, 1.5]}>
        <mesh material={m.preto} position={[0, 0.06, 0]} castShadow receiveShadow><boxGeometry args={[7.2, 0.12, 2.2]} /></mesh>
        {fin.porMes.map((x, k) => (
          <group key={k} position={[-3 + k * 1.2, 0.12, 0]}>
            <mesh position={[-0.2, alt(x.receita) / 2, 0]} castShadow><boxGeometry args={[0.34, alt(x.receita), 0.5]} /><meshStandardMaterial color="#20b26b" metalness={0.2} roughness={0.35} emissive="#0d5c36" emissiveIntensity={k === 5 ? 0.6 : 0.15} /></mesh>
            <mesh position={[0.2, alt(x.despesa) / 2, 0]} castShadow><boxGeometry args={[0.34, alt(x.despesa), 0.5]} /><meshStandardMaterial color="#d9534f" metalness={0.2} roughness={0.35} /></mesh>
            <Placa visivel={rotulos} p={[0, alt(Math.max(x.receita, x.despesa)) + 0.45, 0]} titulo={x.rotulo} sub={brl0(x.receita)} cor="#20b26b" />
          </group>
        ))}
      </group>
      {/* cofre com o saldo das contas */}
      <group position={[9.5, base, -4.8]}>
        <RoundedBox args={[1.6, 1.9, 1.3]} radius={0.06} position={[0, 0.95, 0]} castShadow><meshStandardMaterial color="#4a4f58" metalness={0.75} roughness={0.28} /></RoundedBox>
        <mesh position={[0, 1.05, 0.67]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.26, 0.26, 0.06, 32]} /><meshStandardMaterial color="#c8a24a" metalness={0.9} roughness={0.2} /></mesh>
        <mesh position={[0.45, 1.05, 0.68]}><boxGeometry args={[0.06, 0.5, 0.06]} /><meshStandardMaterial color="#c8a24a" metalness={0.9} roughness={0.2} /></mesh>
        <Placa visivel={rotulos} p={[0, 2.5, 0]} titulo={fin.saldoContas != null ? `Saldo ${brl0(fin.saldoContas)}` : "Cofre"} sub="nas contas" cor="#c8a24a" />
      </group>
      {/* quadro de cobranças vencidas */}
      <group position={[9.2, base, 1.8]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh material={m.branco} position={[0, 1.5, 0]} castShadow><boxGeometry args={[3.2, 1.8, 0.06]} /></mesh>
        {fin.vencidos.slice(0, 5).map((_, k) => <mesh key={k} position={[-0.3, 2.1 - k * 0.28, 0.035]}><planeGeometry args={[2.2, 0.08]} /><meshStandardMaterial color="#d9534f" /></mesh>)}
        {[-1.3, 1.3].map(x => <mesh key={x} material={m.aluminio} position={[x, 0.6, 0]}><boxGeometry args={[0.06, 1.2, 0.06]} /></mesh>)}
        <Placa visivel={rotulos} p={[0, 2.8, 0]} titulo={`Vencido ${brl0(fin.vencido)}`} sub={`${fin.vencidos.length} ${fin.vencidos.length === 1 ? "cliente" : "clientes"}`} cor={fin.vencido > 0 ? "#d33a3c" : "#009351"} />
      </group>
      {/* CFO e analista */}
      <Mesa p={[2.5, base, 2]} m={m} tela />
      <Pessoa p={[2.5, base, 2.62]} rot={Math.PI} cor="#2d2a4a" sentado pele={1} trabalhando />
      <Mesa p={[5.6, base, 2]} m={m} tela />
      <Pessoa p={[5.6, base, 2.62]} rot={Math.PI} cor="#5b6b7f" sentado pele={3} trabalhando />
      <Placa visivel={rotulos} p={[4, base + 2.3, 2]} titulo="CFO e analista" sub={`${brl0(fin.recebidoMes)} recebido no mês`} cor="#8456e8" />
      {[[-12, -6.5], [-12, 6.5], [11.8, 6.5]].map(([x, z], k) => (
        <group key={k} position={[x, base, z]}>
          <mesh material={m.branco} position={[0, 0.3, 0]} castShadow><cylinderGeometry args={[0.32, 0.26, 0.6, 16]} /></mesh>
          <mesh material={m.folha} position={[0, 1.05, 0]} castShadow><icosahedronGeometry args={[0.55, 1]} /></mesh>
        </group>
      ))}
      {rotulos ? <pointLight position={[0, y + 3.2, 0]} intensity={noite ? 45 : 14} distance={26} color="#fff1dc" /> : <Luminarias y={y + 3.55} ativo noite={noite} />}
    </group>
  )
}

// ── Diretoria (cobertura): a mesa diretora ──────────────────────────────────
const COR_TOM: Record<string, string> = { ok: "#20c07a", atencao: "#f0a91c", problema: "#ff4d4d" }

function TelaPlacar({ diretores }: { diretores: Diretor[] }) {
  const tex = React.useMemo(() => {
    const n = diretores.length, col = 390, c = document.createElement("canvas"); c.width = 60 + n * (col + 20); c.height = 600
    const g = c.getContext("2d")!
    g.fillStyle = "#101018"; g.fillRect(0, 0, c.width, c.height)
    g.fillStyle = "#a99be0"; g.font = "600 34px Helvetica, Arial"; g.fillText("Placar da diretoria", 40, 62)
    diretores.forEach((d, k) => {
      const x = 40 + k * (col + 20)
      g.fillStyle = "rgba(255,255,255,0.05)"; g.beginPath(); g.roundRect(x, 90, col, 480, 20); g.fill()
      g.fillStyle = COR_TOM[d.tom]; g.beginPath(); g.arc(x + 32, 136, 12, 0, Math.PI * 2); g.fill()
      g.fillStyle = "#ffffff"; g.font = "700 34px Helvetica, Arial"; g.fillText(d.cargo, x + 56, 148)
      g.fillStyle = "#b9b3cc"; g.font = "500 24px Helvetica, Arial"; g.fillText(d.area, x + 56 + g.measureText(d.cargo).width * 1.35, 148)
      d.placar.slice(0, 5).forEach((p, j) => {
        const y = 210 + j * 66
        g.fillStyle = "#b9b3cc"; g.font = "500 23px Helvetica, Arial"; g.fillText(p.rotulo, x + 22, y)
        g.fillStyle = COR_TOM[p.tom]; g.font = "700 27px Helvetica, Arial"; g.textAlign = "right"; g.fillText(p.valor, x + col - 20, y); g.textAlign = "left"
      })
      g.fillStyle = "#8f87a8"; g.font = "500 21px Helvetica, Arial"; g.fillText(`${d.decisoes.length} para decidir · ${d.conhecimento} conhecimentos`, x + 22, 548)
    })
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t
  }, [diretores])
  const W = 9.6, H = W * 600 / (60 + diretores.length * 410)
  return (
    <group>
      <mesh position={[0, 0, -0.06]}><boxGeometry args={[W + 0.3, H + 0.3, 0.1]} /><meshStandardMaterial color="#0c0c10" metalness={0.6} roughness={0.3} /></mesh>
      <mesh><planeGeometry args={[W, H]} /><meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.9} toneMapped={false} /></mesh>
    </group>
  )
}

// Uma cadeira da mesa: a pessoa, a plaquinha de mesa e a luz da área
function Assento({ p, rot, cor, pele, titulo, sub, tom, rotulos, ativa, onClick, ceo, alturaPlaca = 2.05, fala }: {
  p: [number, number, number]; rot: number; cor: string; pele: number; titulo: string; sub: string; tom: string; rotulos: boolean; ativa: boolean; onClick: () => void; ceo?: boolean; alturaPlaca?: number
  fala?: string | null
}) {
  return (
    <group position={p} onClick={ev => { ev.stopPropagation(); onClick() }}>
      {/* quem está falando: foco de luz e balão */}
      {fala && <spotLight position={[0, 4.2, 0]} angle={0.35} penumbra={0.6} intensity={60} distance={8} color="#fff4dc" castShadow={false} target-position={[0, 0, 0]} />}
      <Html position={[0, 2.9, 0]} center zIndexRange={[40, 0]} style={{ visibility: fala ? "visible" : "hidden", pointerEvents: "none" }}>
        <div style={{ width: 300, background: "#ffffff", color: "#191625", borderRadius: 14, padding: "10px 12px", boxShadow: "0 12px 34px rgba(0,0,0,.28)",
          fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 12.5, lineHeight: 1.4, position: "relative", borderTop: `4px solid ${COR_TOM[tom]}` }}>
          <b style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "#6b6876", marginBottom: 3 }}>{titulo}</b>
          {fala ?? ""}
          <span style={{ position: "absolute", left: "50%", bottom: -8, marginLeft: -8, width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: "8px solid #ffffff" }} />
        </div>
      </Html>
      <group rotation={[0, rot, 0]}>
        {/* cadeira: assento e encosto atrás de quem senta (não esconde a pessoa) */}
        <RoundedBox args={[ceo ? 0.7 : 0.58, 0.1, 0.55]} radius={0.04} position={[0, 0.44, 0.66]} castShadow><meshStandardMaterial color={ceo ? "#3b2a20" : "#1d1f24"} roughness={0.55} /></RoundedBox>
        <RoundedBox args={[ceo ? 0.72 : 0.58, ceo ? 1.05 : 0.8, 0.1]} radius={0.05} position={[0, ceo ? 1.0 : 0.88, 0.96]} castShadow><meshStandardMaterial color={ceo ? "#3b2a20" : "#1d1f24"} roughness={0.55} /></RoundedBox>
        <mesh material={undefined} position={[0, 0.22, 0.66]}><cylinderGeometry args={[0.04, 0.04, 0.44, 10]} /><meshStandardMaterial color="#6b737d" metalness={0.7} roughness={0.3} /></mesh>
        <Pessoa p={[0, 0, 0.62]} rot={Math.PI} cor={cor} sentado pele={pele} trabalhando />
        <mesh position={[0, 0.83, -0.25]} rotation={[-0.35, 0, 0]}><boxGeometry args={[0.5, 0.14, 0.02]} /><meshStandardMaterial color="#f2efe8" /></mesh>
        <mesh position={[0.4, 0.82, -0.25]}><sphereGeometry args={[0.06, 14, 10]} /><meshStandardMaterial color={COR_TOM[tom]} emissive={COR_TOM[tom]} emissiveIntensity={2.6} toneMapped={false} /></mesh>
      </group>
      <Placa visivel={rotulos} p={[0, alturaPlaca, l0(rot)]} titulo={titulo} sub={sub} cor={COR_TOM[tom]} ativa={ativa} onClick={onClick} />
    </group>
  )
}
// placa um pouco para fora da mesa, do lado de cada um (não se empilham no meio)
const l0 = (rot: number) => Math.abs(rot) < 0.1 ? -0.9 : Math.abs(rot - Math.PI) < 0.1 ? 0.9 : 0

export function DiretoriaInterior({ m, y, diretores, noite, rotulos, sel, onSel, falando }: {
  m: M; y: number; diretores: Diretor[]; noite: boolean; rotulos: boolean; sel: string | null; onSel: (id: string | null) => void
  falando?: { quem: string; texto: string } | null       // reunião em andamento: quem fala agora ("ceo" na abertura)
}) {
  const base = y + LAJE
  const total = diretores.reduce((t, d) => t + d.decisoes.length, 0)
  // Mesa diretora: CEO na cabeceira (x−), três diretores de um lado, dois do outro
  const lugares: { x: number; z: number; rot: number }[] = [
    { x: -1.6, z: -1.45, rot: 0 }, { x: 0.6, z: -1.45, rot: 0 }, { x: 2.8, z: -1.45, rot: 0 },
    { x: -0.5, z: 1.45, rot: Math.PI }, { x: 1.7, z: 1.45, rot: Math.PI },
  ]
  const cores = ["#1f2937", "#7a1f3d", "#0f5c4d", "#2d2a4a", "#0f3b52"]
  return (
    <group>
      <mesh position={[0, y + LAJE / 2, 0]} receiveShadow castShadow><boxGeometry args={[LARG - 0.2, LAJE, PROF - 0.2]} /><meshStandardMaterial color="#d8d2c8" roughness={0.35} /></mesh>
      <mesh position={[0.4, base + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[12, 7]} /><meshStandardMaterial color="#4a3f3a" roughness={1} /></mesh>
      {/* a mesa */}
      <group position={[0.6, base, 0]}>
        <RoundedBox args={[7.6, 0.1, 2.4]} radius={0.05} position={[0, 0.76, 0]} castShadow receiveShadow><meshStandardMaterial color="#2b211b" roughness={0.22} metalness={0.15} /></RoundedBox>
        {[-2.6, 2.6].map(x => <mesh key={x} material={m.aluminio} position={[x, 0.38, 0]}><boxGeometry args={[0.12, 0.76, 1.6]} /></mesh>)}
        {Array.from({ length: 6 }, (_, k) => <mesh key={k} position={[-2.8 + k * 1.1, 0.82, 0]}><boxGeometry args={[0.32, 0.01, 0.22]} /><meshStandardMaterial color="#f5f3ee" /></mesh>)}
      </group>
      <group position={[0.6, base, 0]}>
        {diretores.map((d, k) => {
          const l = lugares[k] ?? lugares[0]
          return <Assento key={d.id} p={[l.x, 0, l.z]} rot={l.rot} cor={cores[k % cores.length]} pele={k + 1} titulo={`${DIRETORES.find(x => x.id === d.id)?.nome.split(" ")[0] ?? d.cargo} · ${d.cargo}`}
            sub={`${d.area} · ${d.decisoes.length ? `${d.decisoes.length} para decidir` : "tudo em ordem"}`} tom={d.tom} rotulos={rotulos && !falando}
            alturaPlaca={l.rot === 0 ? 2.5 : 1.75} fala={falando?.quem === d.id ? falando.texto : null}
            ativa={sel === d.id} onClick={() => onSel(sel === d.id ? null : d.id)} />
        })}
        <Assento p={[-4.4, 0, 0]} rot={-Math.PI / 2} cor="#8456e8" pele={0} titulo="CEO · Felipe" sub={total ? `${total} ${total === 1 ? "decisão esperando" : "decisões esperando"}` : "nada esperando você"}
          tom={total ? "atencao" : "ok"} rotulos={rotulos && !falando} ativa={sel === "ceo"} onClick={() => onSel(sel === "ceo" ? null : "ceo")} ceo fala={falando?.quem === "ceo" ? falando.texto : null} />
      </group>
      {/* placar na parede do fundo */}
      <mesh material={m.branco} position={[0.6, base + 1.75, -PROF / 2 + 0.6]} castShadow><boxGeometry args={[11, 3.4, 0.2]} /></mesh>
      <group position={[0.6, base + 1.85, -PROF / 2 + 0.76]}><TelaPlacar diretores={diretores} /></group>
      {/* lounge e plantas */}
      <RoundedBox args={[3.2, 0.5, 1]} radius={0.15} position={[9, base + 0.32, 4.8]} castShadow><meshStandardMaterial color="#5c4b3f" roughness={0.8} /></RoundedBox>
      <RoundedBox args={[1, 0.5, 2.6]} radius={0.15} position={[10.8, base + 0.32, 3.2]} castShadow><meshStandardMaterial color="#5c4b3f" roughness={0.8} /></RoundedBox>
      <mesh position={[9, base + 0.25, 3.2]} castShadow><cylinderGeometry args={[0.6, 0.6, 0.5, 24]} /><meshStandardMaterial color="#1d1f24" roughness={0.3} /></mesh>
      {[[-11.8, -6.5], [-11.8, 6.5], [11.8, -6.5], [6.5, 6.5]].map(([x, z], k) => (
        <group key={k} position={[x, base, z]}>
          <mesh material={m.branco} position={[0, 0.35, 0]} castShadow><cylinderGeometry args={[0.35, 0.3, 0.7, 16]} /></mesh>
          <mesh material={m.folha} position={[0, 1.2, 0]} castShadow><icosahedronGeometry args={[0.62, 1]} /></mesh>
        </group>
      ))}
      {rotulos ? <pointLight position={[0.6, y + 3.2, 0]} intensity={noite ? 45 : 14} distance={28} color="#fff1dc" /> : <Luminarias y={y + 3.55} ativo noite={noite} />}
    </group>
  )
}
