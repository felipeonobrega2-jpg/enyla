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

// ── Medidas (metros) ─────────────────────────────────────────────────────────
const LARG = 26, PROF = 16           // planta do prédio
const H_TERREO = 5.4, H_ANDAR = 3.7, LAJE = 0.35
const VAO = 1.6                       // distância entre montantes da fachada

// altura da base de cada andar (de baixo para cima: térreo, 1º, 2º, 3º, cobertura)
const baseDo = (i: number) => i === 0 ? 0 : H_TERREO + (i - 1) * H_ANDAR
const alturaDo = (i: number) => i === 0 ? H_TERREO : H_ANDAR

// ── Materiais ────────────────────────────────────────────────────────────────
function useMateriais() {
  return useMemo(() => ({
    vidro: new THREE.MeshPhysicalMaterial({ color: "#cfe2ee", metalness: 0.25, roughness: 0.03, transparent: true, opacity: 0.26, envMapIntensity: 2.6, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide }),
    pedra: new THREE.MeshStandardMaterial({ color: "#3a3d42", roughness: 0.55, metalness: 0.15 }),
    carroVidro: new THREE.MeshPhysicalMaterial({ color: "#1c2530", metalness: 0.4, roughness: 0.08, envMapIntensity: 2 }),
    pneu: new THREE.MeshStandardMaterial({ color: "#141518", roughness: 0.9 }),
    vidroEscuro: new THREE.MeshPhysicalMaterial({ color: "#41586b", metalness: 0.3, roughness: 0.08, transparent: true, opacity: 0.55, envMapIntensity: 1.8, clearcoat: 1 }),
    aluminio: new THREE.MeshStandardMaterial({ color: "#b4bac2", metalness: 0.55, roughness: 0.32, envMapIntensity: 1.4 }),
    aletas: new THREE.MeshStandardMaterial({ color: "#d9dde2", metalness: 0.3, roughness: 0.4 }),
    concreto: new THREE.MeshStandardMaterial({ color: "#d9d6cf", roughness: 0.85 }),
    piso: new THREE.MeshStandardMaterial({ color: "#c9c4ba", roughness: 0.6 }),
    pisoGrafica: new THREE.MeshStandardMaterial({ color: "#8f969c", roughness: 0.75 }),
    madeira: new THREE.MeshStandardMaterial({ color: "#a47b55", roughness: 0.55 }),
    branco: new THREE.MeshStandardMaterial({ color: "#f2f2f0", roughness: 0.4 }),
    preto: new THREE.MeshStandardMaterial({ color: "#1d1f24", roughness: 0.45 }),
    roxo: new THREE.MeshStandardMaterial({ color: "#8456e8", roughness: 0.4, metalness: 0.1 }),
    maquina: new THREE.MeshStandardMaterial({ color: "#3e4a5c", metalness: 0.55, roughness: 0.35 }),
    papelao: new THREE.MeshStandardMaterial({ color: "#c69a63", roughness: 0.9 }),
    asfalto: new THREE.MeshStandardMaterial({ color: "#3b3d42", roughness: 0.95 }),
    calcada: new THREE.MeshStandardMaterial({ color: "#b7b3ab", roughness: 0.9 }),
    grama: new THREE.MeshStandardMaterial({ color: "#6f9a52", roughness: 1 }),
    folha: new THREE.MeshStandardMaterial({ color: "#4f7f3a", roughness: 0.9 }),
    tronco: new THREE.MeshStandardMaterial({ color: "#5b4330", roughness: 1 }),
    vizinho: new THREE.MeshStandardMaterial({ color: "#c8ccd2", roughness: 0.7 }),
    vizinhoVidro: new THREE.MeshPhysicalMaterial({ color: "#5d7486", metalness: 0.4, roughness: 0.15, envMapIntensity: 1.2 }),
  }), [])
}
type M = ReturnType<typeof useMateriais>

// Luz de teto: acende onde tem trabalho (e à noite brilha mais)
function Luminarias({ y, ativo, noite }: { y: number; ativo: boolean; noite: boolean }) {
  const cor = ativo ? "#fff3d6" : "#9aa3ad", intens = ativo ? (noite ? 3.2 : 1.4) : (noite ? 0.25 : 0.1)
  return (
    <group>
      {Array.from({ length: 5 }, (_, i) => Array.from({ length: 3 }, (_, j) => (
        <mesh key={`${i}-${j}`} position={[-LARG / 2 + 3 + i * 5, y, -PROF / 2 + 3 + j * 5]}>
          <boxGeometry args={[2.4, 0.04, 0.5]} />
          <meshStandardMaterial color={cor} emissive={cor} emissiveIntensity={intens} toneMapped={false} />
        </mesh>
      )))}
      {ativo && <pointLight position={[0, y - 0.4, 0]} intensity={noite ? 40 : 12} distance={22} color="#ffe9c4" />}
    </group>
  )
}

// Mesa de escritório com monitor e cadeira
function Mesa({ p, m, tela }: { p: [number, number, number]; m: M; tela: boolean }) {
  return (
    <group position={p}>
      <mesh material={m.madeira} position={[0, 0.74, 0]} castShadow receiveShadow><boxGeometry args={[1.6, 0.05, 0.8]} /></mesh>
      {[[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]].map(([x, z], i) => <mesh key={i} material={m.aluminio} position={[x, 0.37, z]}><boxGeometry args={[0.04, 0.74, 0.04]} /></mesh>)}
      <mesh material={m.preto} position={[0, 1.05, -0.25]} castShadow><boxGeometry args={[0.62, 0.38, 0.03]} /></mesh>
      <mesh position={[0, 1.05, -0.234]}><planeGeometry args={[0.58, 0.34]} /><meshStandardMaterial color={tela ? "#7fc3ff" : "#1b2733"} emissive={tela ? "#5aa9ff" : "#000"} emissiveIntensity={tela ? 0.9 : 0} toneMapped={false} /></mesh>
      <mesh material={m.preto} position={[0, 0.48, 0.62]} castShadow><boxGeometry args={[0.5, 0.08, 0.5]} /></mesh>
      <mesh material={m.preto} position={[0, 0.8, 0.85]}><boxGeometry args={[0.5, 0.55, 0.06]} /></mesh>
    </group>
  )
}

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

// Térreo: a gráfica à mostra (impressora offset, UV, corte e vinco, esteira, paletes de caixas)
function Grafica({ m, ativos, noite }: { m: M; ativos: { impressao: boolean; verniz: boolean; corte: boolean; expedicao: boolean }; noite: boolean }) {
  const rolos = useRef<THREE.Group>(null), prensa = useRef<THREE.Mesh>(null), uv = useRef<THREE.MeshStandardMaterial>(null)
  useFrame((_, dt) => {
    if (rolos.current && ativos.impressao) rolos.current.children.forEach(c => { c.rotation.x += dt * 6 })
    if (prensa.current && ativos.corte) prensa.current.position.y = 2.05 + Math.abs(Math.sin(performance.now() / 300)) * -0.35
    if (uv.current) uv.current.emissiveIntensity = ativos.verniz ? 1.5 + Math.sin(performance.now() / 260) * 0.8 : 0.1
  })
  return (
    <group>
      <mesh material={m.pisoGrafica} position={[0, 0.05, 0]} receiveShadow><boxGeometry args={[LARG - 0.2, 0.1, PROF - 0.2]} /></mesh>
      {/* faixas amarelas de segurança */}
      {[-3.2, 3.2].map(z => <mesh key={z} position={[0, 0.11, z]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[LARG - 2, 0.12]} /><meshStandardMaterial color="#e8b520" /></mesh>)}
      {/* impressora offset (4 cores) */}
      <group position={[-7, 0.1, -2.5]}>
        <RoundedBox args={[6.5, 2.1, 2.2]} radius={0.12} position={[0, 1.05, 0]} material={m.maquina} castShadow receiveShadow />
        <group ref={rolos}>
          {["#00aeef", "#ec008c", "#fff200", "#222222"].map((c, k) => (
            <mesh key={k} position={[-2.3 + k * 1.5, 2.25, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.32, 0.32, 2.3, 24]} /><meshStandardMaterial color={c} metalness={0.3} roughness={0.35} />
            </mesh>
          ))}
        </group>
        <mesh position={[3.6, 1.0, 0]} material={m.branco} castShadow><boxGeometry args={[1, 0.6, 1.4]} /></mesh>
        <mesh position={[2.6, 1.6, 1.12]}><planeGeometry args={[0.8, 0.45]} /><meshStandardMaterial color="#3fe08a" emissive="#3fe08a" emissiveIntensity={ativos.impressao ? 1.4 : 0.05} toneMapped={false} /></mesh>
      </group>
      {/* túnel de verniz UV */}
      <group position={[0.5, 0.1, -2.5]}>
        <RoundedBox args={[3.2, 1.6, 1.8]} radius={0.1} position={[0, 0.8, 0]} material={m.maquina} castShadow />
        <mesh position={[0, 0.85, 0.91]}><planeGeometry args={[2.4, 0.5]} /><meshStandardMaterial ref={uv} color="#b78cff" emissive="#a36bff" emissiveIntensity={1} toneMapped={false} /></mesh>
      </group>
      {/* corte e vinco (prensa) */}
      <group position={[5.5, 0.1, -2.5]}>
        <mesh material={m.maquina} position={[0, 0.6, 0]} castShadow><boxGeometry args={[2.2, 1.2, 1.8]} /></mesh>
        {[-0.9, 0.9].map(x => <mesh key={x} material={m.aluminio} position={[x, 1.8, 0]}><boxGeometry args={[0.18, 1.6, 0.18]} /></mesh>)}
        <mesh material={m.maquina} position={[0, 2.75, 0]} castShadow><boxGeometry args={[2.2, 0.35, 1.8]} /></mesh>
        <mesh ref={prensa} material={m.aluminio} position={[0, 2.05, 0]} castShadow><boxGeometry args={[1.7, 0.25, 1.5]} /></mesh>
      </group>
      {/* esteira com caixas */}
      <mesh material={m.preto} position={[1, 0.55, 1.2]} castShadow receiveShadow><boxGeometry args={[16, 0.12, 0.9]} /></mesh>
      {Array.from({ length: 9 }, (_, k) => <mesh key={k} material={m.papelao} position={[-6 + k * 1.8, 0.78, 1.2]} castShadow><boxGeometry args={[0.45, 0.35, 0.45]} /></mesh>)}
      {/* paletes de expedição */}
      {[0, 1, 2].map(k => (
        <group key={k} position={[8.5 + (k % 2) * 1.6, 0.1, 3.8 + Math.floor(k / 2) * 1.5]}>
          <mesh material={m.madeira} position={[0, 0.08, 0]} castShadow><boxGeometry args={[1.2, 0.16, 1]} /></mesh>
          {Array.from({ length: ativos.expedicao ? 6 : 2 }, (_, j) => <mesh key={j} material={m.papelao} position={[-0.3 + (j % 2) * 0.6, 0.38 + Math.floor(j / 2) * 0.42, 0]} castShadow><boxGeometry args={[0.55, 0.4, 0.9]} /></mesh>)}
        </group>
      ))}
      {/* pilha de folhas esperando impressão */}
      <group position={[-11, 0.1, 2.8]}>{Array.from({ length: 6 }, (_, k) => <mesh key={k} material={m.branco} position={[0, 0.12 + k * 0.14, 0]} castShadow><boxGeometry args={[1.1, 0.12, 0.8]} /></mesh>)}</group>
      <Luminarias y={H_TERREO - 0.15} ativo={ativos.impressao || ativos.verniz || ativos.corte || ativos.expedicao} noite={noite} />
    </group>
  )
}

// Fachada de vidro com montantes e as faixas das lajes
function Fachada({ m }: { m: M }) {
  const H = baseDo(4) + alturaDo(4)
  const montantes = (comp: number) => Array.from({ length: Math.floor(comp / VAO) + 1 }, (_, k) => -comp / 2 + k * (comp / Math.floor(comp / VAO)))
  return (
    <group>
      {/* vidro nos 4 lados */}
      {[[0, PROF / 2, LARG, 0], [0, -PROF / 2, LARG, Math.PI], [LARG / 2, 0, PROF, Math.PI / 2], [-LARG / 2, 0, PROF, -Math.PI / 2]].map(([x, z, comp, rot], k) => (
        <group key={k} position={[x, 0, z]} rotation={[0, rot, 0]}>
          <mesh material={m.vidro} position={[0, H / 2, 0]}><planeGeometry args={[comp, H]} /></mesh>
          {montantes(comp).map((mx, j) => <mesh key={j} material={m.aluminio} position={[mx, H / 2, 0.04]} castShadow><boxGeometry args={[0.045, H, 0.1]} /></mesh>)}
          {/* faixas de laje (spandrel) */}
          {[1, 2, 3, 4].map(a => <mesh key={a} material={m.vidroEscuro} position={[0, baseDo(a) + LAJE / 2, 0.06]}><boxGeometry args={[comp, LAJE + 0.4, 0.08]} /></mesh>)}
          <mesh material={m.aluminio} position={[0, H + 0.2, 0.05]}><boxGeometry args={[comp + 0.3, 0.4, 0.2]} /></mesh>
        </group>
      ))}
      {/* aletas verticais na fachada da frente (sombra e ritmo) */}
      {Array.from({ length: 7 }, (_, k) => <mesh key={k} material={m.aletas} position={[-LARG / 2 + 1.6 + k * ((LARG - 3.2) / 6), H_TERREO + (H - H_TERREO) / 2, PROF / 2 + 0.28]} castShadow><boxGeometry args={[0.1, H - H_TERREO, 0.5]} /></mesh>)}
      {/* embasamento revestido de pedra nos fundos e na lateral esquerda do térreo */}
      <mesh material={m.pedra} position={[0, H_TERREO / 2, -PROF / 2 - 0.08]} castShadow receiveShadow><boxGeometry args={[LARG + 0.2, H_TERREO, 0.16]} /></mesh>
      <mesh material={m.pedra} position={[-LARG / 2 - 0.08, H_TERREO / 2, -PROF / 4]} castShadow receiveShadow><boxGeometry args={[0.16, H_TERREO, PROF / 2]} /></mesh>
      {/* porta de vidro com moldura */}
      <group position={[0, 0, PROF / 2 + 0.06]}>
        <mesh material={m.aluminio} position={[0, 1.45, 0]}><boxGeometry args={[3.4, 2.9, 0.12]} /></mesh>
        <mesh material={m.vidroEscuro} position={[0, 1.4, 0.07]}><planeGeometry args={[3.1, 2.7]} /></mesh>
        <mesh material={m.aluminio} position={[0, 1.4, 0.09]}><boxGeometry args={[0.05, 2.7, 0.04]} /></mesh>
      </group>
      {/* marquise da entrada */}
      <mesh material={m.aluminio} position={[0, H_TERREO - 0.6, PROF / 2 + 1.6]} castShadow><boxGeometry args={[8, 0.18, 3.2]} /></mesh>
      {/* cobertura: laje, casa de máquinas, letreiro */}
      <mesh material={m.concreto} position={[0, H + 0.12, 0]} castShadow receiveShadow><boxGeometry args={[LARG + 0.3, 0.25, PROF + 0.3]} /></mesh>
      <mesh material={m.concreto} position={[LARG / 2 - 4, H + 1.4, -PROF / 2 + 3]} castShadow><boxGeometry args={[6, 2.6, 4]} /></mesh>
    </group>
  )
}

// Letreiro ENYLA aceso no topo (textura desenhada aqui, sem fonte externa)
function Letreiro({ y }: { y: number }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 256
    const g = c.getContext("2d")!
    g.fillStyle = "rgba(0,0,0,0)"; g.fillRect(0, 0, c.width, c.height)
    g.font = "800 190px Helvetica, Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"
    g.fillStyle = "#ffffff"; g.fillText("ENYLA", c.width / 2, c.height / 2 + 8)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
  }, [])
  return (
    <group position={[0, y, PROF / 2 - 0.4]}>
      <mesh position={[0, 0, -0.06]}><boxGeometry args={[11, 2.6, 0.1]} /><meshStandardMaterial color="#1d1f24" metalness={0.6} roughness={0.3} /></mesh>
      <mesh><planeGeometry args={[10, 2.5]} /><meshStandardMaterial map={tex} transparent emissive="#c7b2ff" emissiveMap={tex} emissiveIntensity={2.2} toneMapped={false} /></mesh>
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

// Câmera: voa até o andar escolhido (o alvo do OrbitControls acompanha)
function Camera({ alvo, controles }: { alvo: number; controles: React.RefObject<{ target: THREE.Vector3; update: () => void } | null> }) {
  const { camera } = useThree()
  const destino = useRef(new THREE.Vector3()), foco = useRef(new THREE.Vector3())
  const voando = useRef(true)
  useEffect(() => {
    const yA = baseDo(alvo) + alturaDo(alvo) / 2
    foco.current.set(0, yA, 0)
    destino.current.set(38, yA + 13, 54)
    voando.current = true
  }, [alvo])
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

export default function Predio3D({ andares, sel, onSel }: { andares: Andar[]; sel: string; onSel: (id: string) => void }) {
  // andares vem de cima para baixo; no 3D o índice 0 é o térreo
  const deBaixo = [...andares].reverse()
  const iSel = Math.max(0, deBaixo.findIndex(a => a.id === sel))
  const controles = useRef<{ target: THREE.Vector3; update: () => void } | null>(null)
  const [{ pos, noite }] = useState(sol)
  const terreo = deBaixo[0]
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [60, 34, 80], fov: 36, near: 0.5, far: 600 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      style={{ background: noite ? "#0f1426" : "#bcd9ee" }}>
      <Cena andares={deBaixo} iSel={iSel} onSel={onSel} noite={noite} sol={pos} controles={controles} terreoAtivo={terreo?.ativo ?? false} />
    </Canvas>
  )
}

function Cena({ andares, iSel, onSel, noite, sol: s, controles, terreoAtivo }: {
  andares: Andar[]; iSel: number; onSel: (id: string) => void; noite: boolean; sol: [number, number, number]
  controles: React.RefObject<{ target: THREE.Vector3; update: () => void } | null>; terreoAtivo: boolean
}) {
  const m = useMateriais()
  const [hover, setHover] = useState<number | null>(null)
  const H = baseDo(4) + alturaDo(4)
  useEffect(() => { document.body.style.cursor = hover != null ? "pointer" : "auto"; return () => { document.body.style.cursor = "auto" } }, [hover])
  return (
    <>
      {noite ? <color attach="background" args={["#0f1426"]} /> : <Sky sunPosition={s} turbidity={6} rayleigh={1.2} mieCoefficient={0.005} mieDirectionalG={0.85} />}
      <fog attach="fog" args={[noite ? "#0f1426" : "#cfe3f1", 90, 260]} />
      <ambientLight intensity={noite ? 0.15 : 0.45} />
      <directionalLight position={noite ? [-40, 60, 30] : s} intensity={noite ? 0.25 : 2.6} color={noite ? "#9fb3ff" : "#fff4e0"} castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-45} shadow-camera-right={45} shadow-camera-top={45} shadow-camera-bottom={-45} shadow-bias={-0.0004} />
      {/* ambiente de reflexo do vidro, montado aqui (sem baixar nada) */}
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={noite ? 0.6 : 2.2} position={[0, 30, -20]} scale={[60, 20, 1]} color={noite ? "#2b3566" : "#ffffff"} />
        <Lightformer intensity={noite ? 0.4 : 1.2} position={[-40, 10, 20]} rotation-y={Math.PI / 2} scale={[40, 10, 1]} color={noite ? "#3a2f66" : "#dbe9ff"} />
        <Lightformer intensity={noite ? 0.2 : 0.8} position={[40, 6, 0]} rotation-y={-Math.PI / 2} scale={[40, 8, 1]} color="#ffe9c9" />
        <Lightformer form="ring" intensity={noite ? 0 : 3} position={[s[0] / 3, s[1] / 3, s[2] / 3]} scale={8} color="#fff4e0" />
      </Environment>

      <Entorno m={m} noite={noite} />
      <group>
        {/* núcleo de concreto + lajes + interiores */}
        <Grafica m={m} noite={noite} ativos={{ impressao: terreoAtivo, verniz: terreoAtivo, corte: terreoAtivo, expedicao: terreoAtivo }} />
        {andares.slice(1).map((a, k) => (
          <AndarEscritorio key={a.id} i={k + 1} m={m} ativo={a.ativo || (k + 1 === iSel)} noite={noite} mesas={a.obras ? 0 : 12} marcado={k + 1 === iSel} />
        ))}
        <Fachada m={m} />
        <Letreiro y={H + 1.9} />
        <Elevador alvo={iSel} m={m} />
        {/* zonas clicáveis de cada andar (invisíveis) + etiqueta */}
        {andares.map((a, k) => (
          <group key={a.id}>
            <mesh position={[0, baseDo(k) + alturaDo(k) / 2, 0]} onClick={e => { e.stopPropagation(); onSel(a.id) }}
              onPointerOver={e => { e.stopPropagation(); setHover(k) }} onPointerOut={() => setHover(h => h === k ? null : h)}>
              <boxGeometry args={[LARG + 0.6, alturaDo(k) - 0.1, PROF + 0.6]} />
              <meshBasicMaterial color="#8456e8" transparent opacity={hover === k && k !== iSel ? 0.08 : 0} depthWrite={false} />
            </mesh>
            <Html position={[-LARG / 2 - 0.8, baseDo(k) + alturaDo(k) / 2, PROF / 2]} zIndexRange={[20, 0]}>
              <button onClick={() => onSel(a.id)}
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
        <N8AO aoRadius={2.2} intensity={2.4} distanceFalloff={1.2} quality="medium" halfRes />
        <Bloom intensity={noite ? 0.9 : 0.25} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur />
        <SMAA />
      </EffectComposer>
      <Camera alvo={iSel} controles={controles} />
      <OrbitControls ref={controles as never} enableDamping dampingFactor={0.08} minDistance={14} maxDistance={110} maxPolarAngle={Math.PI / 2.08} target={[0, 6, 0]} />
    </>
  )
}
