"use client"

// Prédio ENYLA em 3D (computador): torre corporativa de vidro, com a luz do sol da hora certa, sombras, reflexo no
// vidro e a rua em volta. Térreo de pé-direito duplo com a gráfica à mostra pela vitrine; andares de escritório com
// mesas e luz acesa onde tem trabalho; elevador panorâmico que vai até o andar escolhido; a câmera voa até ele.
// Tudo é desenhado aqui (sem arquivos externos): geometria simples + materiais e luz bons.

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, Environment, Lightformer, ContactShadows, Html, Sky, RoundedBox } from "@react-three/drei"
import { EffectComposer, N8AO, Bloom, SMAA } from "@react-three/postprocessing"
import * as THREE from "three"
import type { Andar } from "./PredioView"
import { GraficaInterior, AgentesInterior, Canteiro, FinanceiroInterior, DiretoriaInterior } from "./Interiores3D"
import type { Diretor } from "../../lib/diretoria"
import type { Reuniao } from "../../lib/reuniaoDiretoria"
import type { FinanceiroAndar } from "../../lib/financeiroAndar"
import { atrasado } from "./GraficaVirtual"
import { COLUNAS_KANBAN, type KanbanCard } from "../../types"
import type { Mesa as MesaAgente, EventoEscritorio } from "../../lib/escritorio"
import { LARG, PROF, H_TERREO, H_ANDAR, LAJE, VAO, baseDo, alturaDo, useMateriais, Luminarias, Mesa, type M } from "./base3d"

// Andar de escritório: piso, mesas, luz e a parede de vidro
function AndarEscritorio({ i, m, ativo, noite, mesas, marcado }: { i: number; m: M; ativo: boolean; noite: boolean; mesas: number; marcado: boolean }) {
  const y = baseDo(i), h = alturaDo(i)
  const pos: [number, number, number][] = []
  for (let k = 0; k < mesas; k++) pos.push([-LARG / 2 + 3.5 + (k % 6) * 3.6, y + LAJE, -PROF / 2 + 3.5 + Math.floor(k / 6) * 4])
  return (
    <group>
      <mesh material={m.piso} position={[0, y + LAJE / 2, 0]} receiveShadow castShadow><boxGeometry args={[LARG - 0.2, LAJE, PROF - 0.2]} /></mesh>
      {pos.map((p, k) => <Mesa key={k} p={p} m={m} tela={ativo && k % 3 !== 2} />)}
      {/* núcleo (escada/elevador interno) */}
      <mesh material={m.concreto} position={[LARG / 2 - 3, y + h / 2, PROF / 2 - 3.5]} castShadow><boxGeometry args={[4, h, 5]} /></mesh>
      <Luminarias y={y + h - 0.12} ativo={ativo} noite={noite} />
      {marcado && <mesh position={[0, y + LAJE + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[LARG - 1, PROF - 1]} /><meshBasicMaterial color="#8456e8" transparent opacity={0.12} /></mesh>}
    </group>
  )
}

// Fachada de vidro com montantes e as faixas das lajes
// corte: com um andar aberto, a fachada vai só até a base dele (os de cima somem, o andar fica à mostra)
function Fachada({ m, corte = null }: { m: M; corte?: number | null }) {
  const TOPO_REAL = baseDo(4) + alturaDo(4)
  const H = corte == null ? TOPO_REAL : Math.max(0.01, baseDo(corte))
  const montantes = (comp: number) => Array.from({ length: Math.floor(comp / VAO) + 1 }, (_, k) => -comp / 2 + k * (comp / Math.floor(comp / VAO)))
  return (
    <group>
      {/* vidro nos 4 lados */}
      {[[0, PROF / 2, LARG, 0], [0, -PROF / 2, LARG, Math.PI], [LARG / 2, 0, PROF, Math.PI / 2], [-LARG / 2, 0, PROF, -Math.PI / 2]].map(([x, z, comp, rot], k) => (
        <group key={k} position={[x, 0, z]} rotation={[0, rot, 0]}>
          <mesh material={m.vidro} position={[0, H / 2, 0]}><planeGeometry args={[comp, H]} /></mesh>
          {montantes(comp).map((mx, j) => <mesh key={j} material={m.aluminio} position={[mx, H / 2, 0.04]} castShadow><boxGeometry args={[0.045, H, 0.1]} /></mesh>)}
          {/* faixas de laje (spandrel) */}
          {[1, 2, 3, 4].filter(a => corte == null || a <= corte).map(a => <mesh key={a} material={m.vidroEscuro} position={[0, baseDo(a) + LAJE / 2, 0.06]}><boxGeometry args={[comp, LAJE + 0.4, 0.08]} /></mesh>)}
          <mesh material={m.aluminio} position={[0, H + 0.2, 0.05]}><boxGeometry args={[comp + 0.3, 0.4, 0.2]} /></mesh>
        </group>
      ))}
      {corte == null && <>
      {/* aletas verticais na fachada da frente (sombra e ritmo) */}
      {Array.from({ length: 7 }, (_, k) => <mesh key={k} material={m.aletas} position={[-LARG / 2 + 1.6 + k * ((LARG - 3.2) / 6), H_TERREO + (H - H_TERREO) / 2, PROF / 2 + 0.28]} castShadow><boxGeometry args={[0.1, H - H_TERREO, 0.5]} /></mesh>)}
      </>}
      {/* embasamento revestido de pedra nos fundos e na lateral esquerda do térreo */}
      <mesh material={m.pedra} position={[0, H_TERREO / 2, -PROF / 2 - 0.08]} castShadow receiveShadow><boxGeometry args={[LARG + 0.2, H_TERREO, 0.16]} /></mesh>
      <mesh material={m.pedra} position={[-LARG / 2 - 0.08, H_TERREO / 2, -PROF / 4]} castShadow receiveShadow><boxGeometry args={[0.16, H_TERREO, PROF / 2]} /></mesh>
      {/* porta de vidro com moldura */}
      <group position={[0, 0, PROF / 2 + 0.06]}>
        <mesh material={m.aluminio} position={[0, 1.45, 0]}><boxGeometry args={[3.4, 2.9, 0.12]} /></mesh>
        <mesh material={m.vidroEscuro} position={[0, 1.4, 0.07]}><planeGeometry args={[3.1, 2.7]} /></mesh>
        <mesh material={m.aluminio} position={[0, 1.4, 0.09]}><boxGeometry args={[0.05, 2.7, 0.04]} /></mesh>
      </group>
      {corte == null && <>
      {/* marquise da entrada */}
      <mesh material={m.aluminio} position={[0, H_TERREO - 0.6, PROF / 2 + 1.6]} castShadow><boxGeometry args={[8, 0.18, 3.2]} /></mesh>
      </>}
      {corte == null && <>
      {/* cobertura: laje, casa de máquinas, letreiro */}
      <mesh material={m.concreto} position={[0, H + 0.12, 0]} castShadow receiveShadow><boxGeometry args={[LARG + 0.3, 0.25, PROF + 0.3]} /></mesh>
      <mesh material={m.concreto} position={[LARG / 2 - 4, H + 1.4, -PROF / 2 + 3]} castShadow><boxGeometry args={[6, 2.6, 4]} /></mesh>
      </>}
    </group>
  )
}

// Letreiro aceso no topo com a logo oficial (a versão clara: branco e verde brilham sobre o painel escuro).
// Caminho relativo: no sistema vira /brand/…; nas telas de conferência, a pasta brand copiada ao lado.
function Letreiro({ y }: { y: number }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    let vivo = true
    new THREE.TextureLoader().load("brand/enyla-wordmark-light.png", t => { if (!vivo) return; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; setTex(t) }, undefined, () => null)
    return () => { vivo = false }
  }, [])
  const L = 11, A = L * 328 / 1335
  return (
    <group position={[0, y, PROF / 2 - 0.4]}>
      <mesh position={[0, 0, -0.08]} castShadow><boxGeometry args={[L + 1.2, A + 0.9, 0.14]} /><meshStandardMaterial color="#121318" metalness={0.6} roughness={0.35} /></mesh>
      {[-1, 1].map(sx => <mesh key={sx} position={[sx * (L / 2 + 0.2), -A / 2 - 0.9, -0.2]}><boxGeometry args={[0.12, 1.4, 0.12]} /><meshStandardMaterial color="#2b2f36" metalness={0.7} roughness={0.3} /></mesh>)}
      {tex && <mesh position={[0, 0, 0.001]}><planeGeometry args={[L, A]} />
        <meshStandardMaterial map={tex} transparent alphaTest={0.02} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={1.8} toneMapped={false} /></mesh>}
      {tex && <pointLight position={[0, 0, 1.2]} intensity={6} distance={8} color="#7ff0b8" />}
    </group>
  )
}

// Elevador panorâmico (lateral): a cabine vai até o andar escolhido
function Elevador({ alvo, m }: { alvo: number; m: M }) {
  const cab = useRef<THREE.Group>(null)
  const H = baseDo(4) + alturaDo(4)
  useFrame((_, dt) => { if (cab.current) cab.current.position.y = THREE.MathUtils.damp(cab.current.position.y, baseDo(alvo) + LAJE, 2.2, dt) })
  return (
    <group position={[LARG / 2 + 1.3, 0, 2]}>
      {[-1, 1].map(s => <mesh key={s} material={m.aluminio} position={[s * 1.05, H / 2, 0]} castShadow><boxGeometry args={[0.14, H, 0.14]} /></mesh>)}
      <mesh material={m.vidro} position={[1.05, H / 2, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[2, H]} /></mesh>
      <group ref={cab}>
        <mesh material={m.aluminio} position={[0, 0.05, 0]} castShadow><boxGeometry args={[1.9, 0.1, 1.9]} /></mesh>
        <mesh material={m.aluminio} position={[0, 2.45, 0]}><boxGeometry args={[1.9, 0.1, 1.9]} /></mesh>
        <mesh material={m.vidro} position={[0, 1.25, 0]}><boxGeometry args={[1.85, 2.3, 1.85]} /></mesh>
        <mesh position={[0, 2.38, 0]}><boxGeometry args={[1.2, 0.03, 0.3]} /><meshStandardMaterial color="#fff3d6" emissive="#fff3d6" emissiveIntensity={2} toneMapped={false} /></mesh>
      </group>
    </group>
  )
}

function Arvore({ p, m }: { p: [number, number, number]; m: M }) {
  return (
    <group position={p}>
      <mesh material={m.tronco} position={[0, 1.1, 0]} castShadow><cylinderGeometry args={[0.12, 0.18, 2.2, 8]} /></mesh>
      <mesh material={m.folha} position={[0, 2.9, 0]} castShadow><icosahedronGeometry args={[1.25, 1]} /></mesh>
      <mesh material={m.folha} position={[0.7, 2.5, 0.3]} castShadow><icosahedronGeometry args={[0.85, 1]} /></mesh>
      <mesh material={m.folha} position={[-0.6, 2.6, -0.4]} castShadow><icosahedronGeometry args={[0.9, 1]} /></mesh>
      <mesh material={m.folha} position={[0.1, 3.7, 0.1]} castShadow><icosahedronGeometry args={[0.8, 1]} /></mesh>
    </group>
  )
}

function Carro({ p, cor, rot = 0, m }: { p: [number, number, number]; cor: string; rot?: number; m: M }) {
  return (
    <group position={p} rotation={[0, rot, 0]}>
      <RoundedBox args={[4.3, 0.85, 1.85]} radius={0.22} position={[0, 0.72, 0]} castShadow><meshPhysicalMaterial color={cor} metalness={0.6} roughness={0.25} clearcoat={1} clearcoatRoughness={0.08} envMapIntensity={1.6} /></RoundedBox>
      <RoundedBox args={[2.3, 0.7, 1.7]} radius={0.25} position={[-0.25, 1.38, 0]} material={m.carroVidro} castShadow />
      {[[-1.35, 0.92], [1.35, 0.92], [-1.35, -0.92], [1.35, -0.92]].map(([x, z], k) => (
        <mesh key={k} material={m.pneu} position={[x, 0.36, z]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.36, 0.36, 0.26, 18]} /></mesh>
      ))}
    </group>
  )
}

function Poste({ p, m, noite }: { p: [number, number, number]; m: M; noite: boolean }) {
  return (
    <group position={p}>
      <mesh material={m.aluminio} position={[0, 3.2, 0]} castShadow><cylinderGeometry args={[0.07, 0.1, 6.4, 10]} /></mesh>
      <mesh material={m.aluminio} position={[0.6, 6.35, 0]}><boxGeometry args={[1.3, 0.08, 0.12]} /></mesh>
      <mesh position={[1.15, 6.25, 0]}><boxGeometry args={[0.5, 0.1, 0.25]} /><meshStandardMaterial color="#fff6dd" emissive="#ffe7b0" emissiveIntensity={noite ? 4 : 0.2} toneMapped={false} /></mesh>
      {noite && <pointLight position={[1.15, 6, 0]} intensity={30} distance={16} color="#ffd9a0" />}
    </group>
  )
}

// Rua, calçada, grama, prédios vizinhos
function Entorno({ m, noite }: { m: M; noite: boolean }) {
  return (
    <group>
      <mesh material={m.grama} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow><planeGeometry args={[220, 220]} /></mesh>
      <mesh material={m.calcada} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow><planeGeometry args={[LARG + 14, PROF + 16]} /></mesh>
      <mesh material={m.asfalto} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, PROF / 2 + 14]} receiveShadow><planeGeometry args={[220, 10]} /></mesh>
      {Array.from({ length: 18 }, (_, k) => <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[-100 + k * 12, 0.02, PROF / 2 + 14]}><planeGeometry args={[4, 0.2]} /><meshStandardMaterial color="#f2f2f2" /></mesh>)}
      {[[-46, 0, -14, 14, 26, 16], [-62, 0, 34, 16, 14, 12], [6, 0, -48, 30, 18, 12], [-20, 0, -52, 16, 30, 12], [48, 0, -30, 12, 34, 14]].map(([x, , z, w, h, d], k) => (
        <group key={k} position={[x, 0, z]}>
          <mesh material={k % 2 ? m.vizinhoVidro : m.vizinho} position={[0, h / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, h, d]} /></mesh>
          {Array.from({ length: Math.floor(h / 3.4) }, (_, j) => <mesh key={j} material={m.vizinhoVidro} position={[0, 2.4 + j * 3.4, 0]}><boxGeometry args={[w + 0.06, 1.4, d + 0.06]} /></mesh>)}
        </group>
      ))}
      {[[-15, 0, 11], [-9, 0, 11], [9, 0, 11], [15, 0, 11], [-16, 0, -10], [16, 0, -10]].map((p, k) => <Arvore key={k} p={p as [number, number, number]} m={m} />)}
      {[[-22, "#c8ccd2", 0], [-14, "#1f2a44", 0], [12, "#8b1e2b", 0], [24, "#f2f2f2", 0]].map(([x, cor], k) => <Carro key={k} p={[x as number, 0, PROF / 2 + 10.6]} cor={cor as string} m={m} />)}
      <Carro p={[-6, 0, PROF / 2 + 16.8]} cor="#2d2f34" rot={Math.PI} m={m} />
      {[-24, -8, 8, 24].map(x => <Poste key={x} p={[x, 0, PROF / 2 + 8.8]} m={m} noite={noite} />)}
    </group>
  )
}

// Câmera: voa até o andar escolhido; "dentro" desce até ele (o andar aberto, visto de cima, como maquete)
function Camera({ alvo, dentro, controles }: { alvo: number; dentro: boolean; controles: React.RefObject<{ target: THREE.Vector3; update: () => void } | null> }) {
  const { camera } = useThree()
  const destino = useRef(new THREE.Vector3()), foco = useRef(new THREE.Vector3())
  const voando = useRef(true)
  useEffect(() => {
    const yA = baseDo(alvo) + alturaDo(alvo) / 2
    if (dentro && alvo === 4) { foco.current.set(3.4, baseDo(alvo) + 1, 0.4); destino.current.set(10.5, baseDo(alvo) + 8.5, 11.5) }   // mesa diretora de perto (à esquerda do painel)
    else if (dentro) { foco.current.set(0, baseDo(alvo) + 0.8, 0.5); destino.current.set(15, baseDo(alvo) + 13, 19) }
    else { foco.current.set(0, Math.max(yA, 8), 0); destino.current.set(42, Math.max(yA, 8) + 15, 60) }
    voando.current = true
  }, [alvo, dentro])
  useFrame((_, dt) => {
    const c = controles.current
    if (!c || !voando.current) return
    camera.position.lerp(destino.current, 1 - Math.exp(-dt * 2.2))
    c.target.lerp(foco.current, 1 - Math.exp(-dt * 2.6))
    c.update()
    if (camera.position.distanceTo(destino.current) < 0.15) voando.current = false
  })
  return null
}

// Posição do sol pela hora de São Paulo
function sol(): { pos: [number, number, number]; noite: boolean } {
  const teste = typeof window !== "undefined" ? Number(new URLSearchParams(window.location.search).get("hora")) : NaN   // ?hora=14 para conferir
  const h = teste >= 0 && teste < 24 && !Number.isNaN(teste) && teste !== 0 ? teste : new Date().getHours() + new Date().getMinutes() / 60
  const ang = ((h - 6) / 12) * Math.PI   // 6h nasce, 18h se põe
  const noite = h < 6 || h >= 18.5
  return { pos: [Math.cos(ang) * 80, Math.max(-10, Math.sin(ang) * 70), 40], noite }
}

export type Dados3D = { kanban: KanbanCard[]; mesas: MesaAgente[]; feed: EventoEscritorio[]; financeiro?: FinanceiroAndar; diretores?: Diretor[]; onConhecimento?: () => void }

export default function Predio3D({ andares, sel, onSel, dados }: { andares: Andar[]; sel: string; onSel: (id: string) => void; dados: Dados3D }) {
  // andares vem de cima para baixo; no 3D o índice 0 é o térreo
  const deBaixo = [...andares].reverse()
  const iSel = Math.max(0, deBaixo.findIndex(a => a.id === sel))
  const controles = useRef<{ target: THREE.Vector3; update: () => void } | null>(null)
  const [{ pos, noite }] = useState(sol)
  const [dentro, setDentro] = useState(false)
  const [estacao, setEstacao] = useState<number | null>(null)
  const [agente, setAgente] = useState<string | null>(null)
  useEffect(() => { setEstacao(null); setAgente(null) }, [sel])
  // Reunião de diretoria: a última ata, convocar e assistir (cada um fala por alguns segundos)
  const [reuniao, setReuniao] = useState<Reuniao | null>(null)
  const [reunindo, setReunindo] = useState(false)
  const [erroReuniao, setErroReuniao] = useState<string | null>(null)
  const [vez, setVez] = useState<number | null>(null)      // -1 = abertura, 0..n-1 = falas, n = fechamento
  useEffect(() => { fetch("/api/diretoria/reuniao").then(r => r.ok ? r.json() : null).then(x => { if (x?.reuniao) setReuniao(x.reuniao) }).catch(() => {}) }, [])
  useEffect(() => {
    if (vez == null || !reuniao) return
    const fim = reuniao.falas.length
    const texto = vez < 0 ? reuniao.abertura : vez < fim ? reuniao.falas[vez].fala : reuniao.fechamento
    const t = setTimeout(() => setVez(v => v == null ? null : v >= fim ? null : v + 1), Math.min(11000, 2600 + texto.length * 45))
    return () => clearTimeout(t)
  }, [vez, reuniao])
  const convocar = async () => {
    setReunindo(true); setErroReuniao(null)
    const r = await fetch("/api/diretoria/reuniao", { method: "POST" }).catch(() => null)
    const x = r ? await r.json().catch(() => ({})) : {}
    setReunindo(false)
    if (!r?.ok || !x.reuniao) { setErroReuniao(x.erro ?? "A diretoria não conseguiu se reunir agora."); return }
    setReuniao(x.reuniao); setVez(-1)
  }
  const responder = (recId: string, resposta: "aprovo" | "depois") => {
    if (!reuniao) return
    const atual = reuniao.falas.flatMap(f => f.recomendacoes).find(r => r.id === recId)?.resposta
    const nova = atual === resposta ? null : resposta
    setReuniao({ ...reuniao, falas: reuniao.falas.map(f => ({ ...f, recomendacoes: f.recomendacoes.map(r => r.id === recId ? { ...r, resposta: nova } : r) })) })
    fetch("/api/diretoria/reuniao", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reuniao: reuniao.id, rec: recId, resposta: nova }) }).catch(() => {})
  }
  const falando = vez == null || !reuniao ? null
    : vez < 0 ? { quem: "ceo", texto: reuniao.abertura }
    : vez < reuniao.falas.length ? { quem: reuniao.falas[vez].diretor, texto: reuniao.falas[vez].fala }
    : { quem: "ceo", texto: reuniao.fechamento }
  const a = deBaixo[iSel]
  const hoje = new Date().toLocaleDateString("sv-SE")
  const pedidosEst = estacao != null ? dados.kanban.filter(c => c.coluna === estacao) : []
  const ag = agente ? dados.mesas.find(x => x.id === agente) : null
  const feedAg = ag ? dados.feed.filter(e => e.mesa === ag.id).slice(0, 6) : []
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  return (
    <div className="relative w-full h-full">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [60, 34, 80], fov: 36, near: 0.3, far: 600 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        style={{ background: noite ? "#0f1426" : "#bcd9ee" }}>
        <Cena andares={deBaixo} iSel={iSel} onSel={id => { onSel(id); }} noite={noite} sol={pos} controles={controles} dentro={dentro} setDentro={setDentro}
          dados={dados} estacao={estacao} setEstacao={setEstacao} agente={agente} setAgente={setAgente} falando={a?.id === "cobertura" ? falando : null} />
      </Canvas>

      {/* painel do andar (flutuante) */}
      <div className="absolute top-3 right-3 w-[300px] max-h-[calc(100%-24px)] overflow-y-auto rounded-2xl p-4 text-[#191625]"
        style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(14px)", boxShadow: "0 10px 40px rgba(0,0,0,.18)", zIndex: 100 }}>
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#898892]">{a?.rotulo}</p>
        <p className="text-[18px] font-semibold leading-tight">{a?.nome}</p>
        <p className="text-[12px] text-[#5e5c68] mt-0.5">{a?.obras ? "em obras" : a?.resumo}</p>
        <button onClick={() => setDentro(d => !d)}
          className="mt-3 w-full h-9 rounded-xl text-[13px] font-semibold text-white" style={{ background: dentro ? "#191625" : "#8456e8" }}>
          {dentro ? "Sair para a rua" : "Entrar no andar"}
        </button>
        {a?.obras && <p className="text-[12px] text-[#5e5c68] mt-3 leading-relaxed">{a.obras}</p>}
        {dentro && a?.id === "terreo" && (
          <div className="mt-3">
            {estacao == null ? <p className="text-[12px] text-[#898892]">Clique numa máquina para ver os pedidos dela.</p> : <>
              <p className="text-[12.5px] font-semibold mb-1">{COLUNAS_KANBAN[estacao]} · {pedidosEst.length}</p>
              {pedidosEst.length === 0 ? <p className="text-[12px] text-[#898892]">Nenhum pedido nesta etapa.</p> : (
                <ul className="divide-y divide-black/5">
                  {pedidosEst.map(c => <li key={c.id} className="py-1.5 text-[12px]">
                    <span className="font-semibold">{c.numero}</span> <span className="text-[#5e5c68]">{c.nomeCliente}</span>
                    {c.dataEntregaPrevista && <span className={`block text-[11px] ${atrasado(c, hoje) ? "text-[#d33a3c] font-semibold" : "text-[#898892]"}`}>
                      {atrasado(c, hoje) ? "atrasado · " : "entrega "}{new Date(c.dataEntregaPrevista.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>}
                  </li>)}
                </ul>
              )}
            </>}
          </div>
        )}
        {a?.id === "2" && dados.financeiro && (() => {
          const f = dados.financeiro, b = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
          const linha = (r: string, v: string, cor?: string) => <div className="flex items-baseline justify-between py-1 text-[12.5px]"><span className="text-[#5e5c68]">{r}</span><span className="font-semibold ds-num" style={{ color: cor }}>{v}</span></div>
          return <div className="mt-3">
            {linha("Recebido no mês", b(f.recebidoMes), "#009351")}{linha("Saiu no mês", b(f.pagoMes), "#d33a3c")}{linha("Resultado", b(f.resultadoMes), f.resultadoMes >= 0 ? "#009351" : "#d33a3c")}
            {linha("A receber", b(f.aReceber))}{linha("Cobrança vencida", b(f.vencido), f.vencido > 0 ? "#d33a3c" : undefined)}
            {f.saldoContas != null && linha("Saldo nas contas", b(f.saldoContas))}
            {linha("Digital no mês", b(f.digital.recebidoMes - f.digital.custoVillaMes), "#2f6fdf")}
            {f.vencidos.length > 0 && <><p className="text-[11.5px] font-semibold mt-3 mb-1">Quem está devendo</p>
              <ul>{f.vencidos.map(v => <li key={v.numero} className="flex justify-between text-[11.5px] py-0.5"><span className="truncate mr-2">{v.numero} · {v.cliente}</span><span className="text-[#d33a3c] font-semibold shrink-0">{b(v.valor)}</span></li>)}</ul></>}
          </div>
        })()}
        {a?.id === "cobertura" && (
          <div className="mt-3 rounded-xl p-3" style={{ background: "rgba(132,86,232,0.08)" }}>
            <button onClick={() => { if (!dentro) setDentro(true); convocar() }} disabled={reunindo}
              className="w-full h-9 rounded-lg text-[13px] font-semibold text-white disabled:opacity-60" style={{ background: "#8456e8" }}>
              {reunindo ? "A diretoria está se reunindo…" : reuniao ? "Convocar nova reunião" : "Convocar reunião de diretoria"}
            </button>
            {reunindo && <p className="text-[11.5px] text-[#5e5c68] mt-1.5">Cada diretor está lendo os números da área e o que você ensinou a ele (uns 30 segundos).</p>}
            {erroReuniao && <p className="text-[11.5px] text-[#d33a3c] mt-1.5">{erroReuniao}</p>}
            {reuniao && !reunindo && <>
              <div className="flex items-center justify-between mt-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6b6876]">Ata · {new Date(reuniao.em).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                <button onClick={() => { if (!dentro) setDentro(true); setVez(-1) }} className="text-[11.5px] font-semibold text-[#8456e8]">{vez != null ? "assistindo…" : "assistir"}</button>
              </div>
              <p className="text-[12px] text-[#191625] mt-1 leading-snug">{reuniao.abertura}</p>
              <div className="mt-2 space-y-2.5">
                {reuniao.falas.map((f, k) => (
                  <div key={f.diretor} className={`rounded-lg p-2 transition-colors ${vez === k ? "bg-white shadow-sm" : ""}`}>
                    <p className="text-[12px] font-semibold">{f.cargo}</p>
                    <p className="text-[11.5px] text-[#3c3a45] leading-snug">{f.fala}</p>
                    {f.recomendacoes.map(r => (
                      <div key={r.id} className="mt-1.5">
                        <p className="text-[11.5px] text-[#191625] leading-snug"><span className={`mr-1 text-[9.5px] font-bold uppercase px-1 rounded align-[1px] ${r.urgencia === "hoje" ? "bg-[#d33a3c]/10 text-[#d33a3c]" : "bg-black/5 text-[#6b6876]"}`}>{r.urgencia}</span>{r.texto}</p>
                        <div className="flex gap-1 mt-0.5">
                        <button onClick={() => responder(r.id, "aprovo")} className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded ${r.resposta === "aprovo" ? "bg-[#009351] text-white" : "text-[#009351] hover:bg-[#009351]/10"}`}>Aprovo</button>
                        <button onClick={() => responder(r.id, "depois")} className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded ${r.resposta === "depois" ? "bg-[#6b6876] text-white" : "text-[#6b6876] hover:bg-black/5"}`}>Depois</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <p className="text-[12px] font-semibold text-[#191625] mt-2 leading-snug">{reuniao.fechamento}</p>
            </>}
          </div>
        )}
        {a?.id === "cobertura" && dados.diretores && (() => {
          const ds = dados.diretores, cor = { ok: "#009351", atencao: "#c57800", problema: "#d33a3c" } as const
          const lista = agente === "ceo" || !agente ? ds : ds.filter(d => d.id === agente)
          return <div className="mt-3 space-y-3">
            {!dentro && <p className="text-[12px] text-[#898892]">Entre no andar e clique num diretor.</p>}
            {lista.map(d => <div key={d.id}>
              <p className="text-[12.5px] font-semibold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: cor[d.tom] }} />{d.cargo} · {d.area}</p>
              {agente === d.id && d.placar.map(p => <div key={p.rotulo} className="flex justify-between text-[12px] py-0.5"><span className="text-[#5e5c68]">{p.rotulo}</span><span className="font-semibold" style={{ color: cor[p.tom] }}>{p.valor}</span></div>)}
              {d.decisoes.length ? <ul className="mt-1 space-y-1">{d.decisoes.map((x, k) => <li key={k} className="text-[11.5px] text-[#3c3a45] pl-3 relative"><span className="absolute left-0 top-[6px] w-1.5 h-1.5 rounded-full bg-[#8456e8]" />{x}</li>)}</ul>
                : <p className="text-[11.5px] text-[#009351] mt-0.5">Nada para você decidir aqui.</p>}
              {agente === d.id && <ConhecimentoDiretor diretor={d.id} cargo={d.cargo} onMudou={dados.onConhecimento} />}
            </div>)}
          </div>
        })()}
        {dentro && a?.id === "1" && (
          <div className="mt-3">
            {!ag ? <p className="text-[12px] text-[#898892]">Clique num agente para ver o que ele está fazendo.</p> : <>
              <p className="text-[13px] font-semibold">{ag.nome}</p>
              <p className="text-[11.5px] text-[#898892]">{ag.papel}</p>
              <p className="text-[12px] mt-1.5"><span className="font-semibold">Agora:</span> {ag.agora}</p>
              <p className="text-[12px] text-[#5e5c68]">{ag.hoje} {ag.hojeRotulo} hoje</p>
              {feedAg.length > 0 && <ul className="mt-2 space-y-1">{feedAg.map((e, k) => <li key={k} className="text-[11.5px] text-[#3c3a45]"><span className="text-[#898892] mr-1.5">{hhmm(e.em)}</span>{e.texto}</li>)}</ul>}
            </>}
          </div>
        )}
      </div>
      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11.5px] text-white/90 bg-black/35 backdrop-blur px-3 py-1 rounded-full pointer-events-none">
        {dentro ? "Arraste para girar · role para aproximar · clique nas máquinas e nas pessoas" : "Clique num andar · arraste para girar · role para aproximar"}
      </p>
    </div>
  )
}

// Base de conhecimento de um diretor: o que ele já sabe e um campo para ensinar mais (os agentes diretores leem isso)
function ConhecimentoDiretor({ diretor, cargo, onMudou }: { diretor: string; cargo: string; onMudou?: () => void }) {
  const [lista, setLista] = useState<{ id: string; texto: string; em: string }[] | null>(null)
  const [texto, setTexto] = useState("")
  const [salvando, setSalvando] = useState(false)
  const carregar = () => fetch("/api/diretoria").then(r => r.ok ? r.json() : null).then(x => setLista(x?.conhecimento?.[diretor] ?? [])).catch(() => setLista([]))
  useEffect(() => { carregar() }, [diretor])   // eslint-disable-line react-hooks/exhaustive-deps
  const ensinar = async () => {
    if (texto.trim().length < 3 || salvando) return
    setSalvando(true)
    const r = await fetch("/api/diretoria", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ diretor, texto }) }).catch(() => null)
    setSalvando(false)
    if (r?.ok) { setTexto(""); carregar(); onMudou?.() }
  }
  const tirar = async (id: string) => { await fetch(`/api/diretoria?diretor=${diretor}&id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null); carregar(); onMudou?.() }
  return (
    <div className="mt-3 pt-3 border-t border-black/5">
      <p className="text-[11.5px] font-semibold mb-1.5">O que o {cargo} sabe {lista ? `(${lista.length})` : ""}</p>
      <div className="flex gap-1.5">
        <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === "Enter") ensinar() }} maxLength={1500}
          placeholder={`Ensinar o ${cargo}…`} className="flex-1 min-w-0 h-8 rounded-lg bg-white px-2.5 text-[12px] border border-black/10 focus:outline-none focus:ring-2 focus:ring-[#8456e8]/25" />
        <button onClick={ensinar} disabled={salvando || texto.trim().length < 3} className="h-8 px-2.5 rounded-lg text-[11.5px] font-semibold text-white disabled:opacity-50" style={{ background: "#8456e8" }}>Ensinar</button>
      </div>
      {lista && lista.length > 0 && <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
        {lista.map(l => <li key={l.id} className="group flex items-start gap-1.5 text-[11.5px] text-[#3c3a45]">
          <span className="flex-1">{l.texto}</span>
          <button onClick={() => tirar(l.id)} aria-label="Tirar" className="opacity-0 group-hover:opacity-100 text-[#898892] hover:text-[#d33a3c] shrink-0">×</button>
        </li>)}
      </ul>}
    </div>
  )
}

function Cena({ andares, iSel, onSel, noite, sol: s, controles, dentro, setDentro, dados, estacao, setEstacao, agente, setAgente, falando }: {
  andares: Andar[]; iSel: number; onSel: (id: string) => void; noite: boolean; sol: [number, number, number]
  controles: React.RefObject<{ target: THREE.Vector3; update: () => void } | null>; dentro: boolean; setDentro: (v: boolean) => void
  dados: Dados3D; estacao: number | null; setEstacao: (c: number | null) => void; agente: string | null; setAgente: (id: string | null) => void
  falando: { quem: string; texto: string } | null
}) {
  const m = useMateriais()
  const [hover, setHover] = useState<number | null>(null)
  const H = baseDo(4) + alturaDo(4)
  const corte = dentro ? iSel : null
  const visivel = (k: number) => !dentro || k <= iSel
  useEffect(() => { document.body.style.cursor = hover != null ? "pointer" : "auto"; return () => { document.body.style.cursor = "auto" } }, [hover])
  return (
    <>
      {noite ? <color attach="background" args={["#0f1426"]} /> : <Sky sunPosition={s} turbidity={6} rayleigh={1.2} mieCoefficient={0.005} mieDirectionalG={0.85} />}
      <fog attach="fog" args={[noite ? "#0f1426" : "#cfe3f1", 90, 260]} />
      <ambientLight intensity={noite ? 0.18 : 0.5} />
      <directionalLight position={noite ? [-40, 60, 30] : s} intensity={noite ? 0.25 : 2.6} color={noite ? "#9fb3ff" : "#fff4e0"} castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-45} shadow-camera-right={45} shadow-camera-top={45} shadow-camera-bottom={-45} shadow-bias={-0.0004} />
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={noite ? 0.6 : 2.2} position={[0, 30, -20]} scale={[60, 20, 1]} color={noite ? "#2b3566" : "#ffffff"} />
        <Lightformer intensity={noite ? 0.4 : 1.2} position={[-40, 10, 20]} rotation-y={Math.PI / 2} scale={[40, 10, 1]} color={noite ? "#3a2f66" : "#dbe9ff"} />
        <Lightformer intensity={noite ? 0.2 : 0.8} position={[40, 6, 0]} rotation-y={-Math.PI / 2} scale={[40, 8, 1]} color="#ffe9c9" />
        <Lightformer form="ring" intensity={noite ? 0 : 3} position={[s[0] / 3, s[1] / 3, s[2] / 3]} scale={8} color="#fff4e0" />
      </Environment>

      <Entorno m={m} noite={noite} />
      <group>
        <GraficaInterior m={m} kanban={dados.kanban} noite={noite} rotulos={dentro && iSel === 0} estacao={estacao} onEstacao={c => { setEstacao(c); if (!dentro) { onSel(andares[0].id); setDentro(true) } }} />
        {andares.slice(1).map((a, k) => {
          const i = k + 1
          if (!visivel(i)) return null
          if (a.obras) return <Canteiro key={a.id} m={m} y={baseDo(i)} />
          if (a.id === "cobertura" && dados.diretores) return <DiretoriaInterior key={a.id} m={m} y={baseDo(i)} diretores={dados.diretores} noite={noite} rotulos={dentro && iSel === i} sel={agente} falando={dentro && iSel === i ? falando : null}
            onSel={id => { setAgente(id); if (!dentro) { onSel(a.id); setDentro(true) } }} />
          if (a.id === "2" && dados.financeiro) return <FinanceiroInterior key={a.id} m={m} y={baseDo(i)} fin={dados.financeiro} noite={noite} rotulos={dentro && iSel === i} />
          if (a.id === "1") return <AgentesInterior key={a.id} m={m} y={baseDo(i)} mesas={dados.mesas} noite={noite} rotulos={dentro && iSel === i} sel={agente}
            onSel={id => { setAgente(id); if (!dentro) { onSel(a.id); setDentro(true) } }} />
          return <AndarEscritorio key={a.id} i={i} m={m} ativo={a.ativo} noite={noite} mesas={12} marcado={i === iSel} />
        })}
        <Fachada m={m} corte={corte} />
        {!dentro && <Letreiro y={H + 1.9} />}
        <Elevador alvo={iSel} m={m} />
        {/* zonas clicáveis de cada andar + etiqueta (de fora) */}
        {andares.map((a, k) => (
          <group key={a.id}>
            <mesh visible={!dentro} position={[0, baseDo(k) + alturaDo(k) / 2, 0]} onClick={e => { if (dentro) return; e.stopPropagation(); if (k === iSel) setDentro(true); else onSel(a.id) }}
              onPointerOver={e => { e.stopPropagation(); setHover(k) }} onPointerOut={() => setHover(h => h === k ? null : h)}>
              <boxGeometry args={[LARG + 0.6, alturaDo(k) - 0.1, PROF + 0.6]} />
              <meshBasicMaterial color="#8456e8" transparent opacity={hover === k ? 0.08 : 0} depthWrite={false} />
            </mesh>
            <Html position={[-LARG / 2 - 0.8, baseDo(k) + alturaDo(k) / 2, PROF / 2]} zIndexRange={[20, 0]} style={{ visibility: dentro ? "hidden" : "visible", pointerEvents: dentro ? "none" : "auto" }}>
              <button onClick={() => { if (k === iSel) setDentro(true); else onSel(a.id) }}
                style={{ whiteSpace: "nowrap", transform: "translate(-100%, -50%)", padding: "4px 10px", borderRadius: 999, border: "none", cursor: "pointer",
                  fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 12, fontWeight: 600,
                  background: k === iSel ? "#8456e8" : "rgba(255,255,255,0.92)", color: k === iSel ? "#fff" : "#191625", boxShadow: "0 4px 18px rgba(0,0,0,.18)" }}>
                {a.rotulo} · {a.nome}{a.obras ? " (em obras)" : ""}
              </button>
            </Html>
          </group>
        ))}
      </group>
      <ContactShadows position={[0, 0.03, 0]} opacity={0.45} scale={70} blur={2.4} far={20} />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <N8AO aoRadius={dentro ? 1.2 : 2.2} intensity={2.2} distanceFalloff={1.2} quality="medium" halfRes />
        <Bloom intensity={noite ? 0.9 : 0.25} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur />
        <SMAA />
      </EffectComposer>
      <Camera alvo={iSel} dentro={dentro} controles={controles} />
      <OrbitControls ref={controles as never} enableDamping dampingFactor={0.08} minDistance={dentro ? 6 : 14} maxDistance={dentro ? 45 : 110} maxPolarAngle={Math.PI / 2.08} target={[0, 6, 0]} />
    </>
  )
}
