"use client"
// Rua viva em volta do prédio: trânsito nas duas mãos, pedestres na calçada e o caminhão da ENYLA. O caminhão segue a
// Expedição real: com pedido lá, um operador carrega caixas e o caminhão sai para a entrega e volta; sem pedido, fica
// parado na porta. Clicar nele abre os pedidos da expedição.
import { useEffect, useRef, useState } from "react"
import { useFrame } from "@react-three/fiber"
import { RoundedBox } from "@react-three/drei"
import * as THREE from "three"
import { LARG, PROF, type M } from "./base3d"
import { Pessoa } from "./Interiores3D"

const PISTA_IDA = PROF / 2 + 13.2, PISTA_VOLTA = PROF / 2 + 16.2, ESTACIONADO = PROF / 2 + 10.6
const FIM = 115

function CarroAndando({ cor, pista, sentido, vel, inicio, m }: { cor: string; pista: number; sentido: 1 | -1; vel: number; inicio: number; m: M }) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!g.current) return
    const t = performance.now() / 1000
    const x = ((inicio + t * vel) % (2 * FIM)) - FIM
    g.current.position.x = sentido * x
  })
  return (
    <group ref={g} position={[0, 0, pista]} rotation={[0, sentido === 1 ? 0 : Math.PI, 0]}>
      <RoundedBox args={[4.3, 0.85, 1.85]} radius={0.22} position={[0, 0.72, 0]} castShadow><meshPhysicalMaterial color={cor} metalness={0.6} roughness={0.25} clearcoat={1} clearcoatRoughness={0.08} envMapIntensity={1.6} /></RoundedBox>
      <RoundedBox args={[2.3, 0.7, 1.7]} radius={0.25} position={[-0.25, 1.38, 0]} material={m.carroVidro} castShadow />
      {[[-1.35, 0.92], [1.35, 0.92], [-1.35, -0.92], [1.35, -0.92]].map(([x, z], k) => (
        <mesh key={k} material={m.pneu} position={[x, 0.36, z]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.36, 0.36, 0.26, 18]} /></mesh>
      ))}
      <mesh position={[2.16, 0.78, 0]}><boxGeometry args={[0.04, 0.16, 1.4]} /><meshStandardMaterial color="#fff6dd" emissive="#fff0c0" emissiveIntensity={1.5} toneMapped={false} /></mesh>
      <mesh position={[-2.16, 0.82, 0]}><boxGeometry args={[0.04, 0.12, 1.5]} /><meshStandardMaterial color="#ff3b3b" emissive="#ff2020" emissiveIntensity={1.2} toneMapped={false} /></mesh>
    </group>
  )
}

function Pedestre({ z, de, ate, vel, cor, pele, fase }: { z: number; de: number; ate: number; vel: number; cor: string; pele: number; fase: number }) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!g.current) return
    const t = performance.now() / 1000 + fase
    const L = ate - de, d = (t * vel) % (2 * L), indo = d < L
    g.current.position.x = indo ? de + d : ate - (d - L)
    g.current.position.y = Math.abs(Math.sin(t * 7)) * 0.06
    g.current.rotation.y = indo ? Math.PI / 2 : -Math.PI / 2
  })
  return <group ref={g} position={[de, 0, z]}><Pessoa p={[0, 0, 0]} cor={cor} pele={pele} /></group>
}

// Caminhão baú com a logo; ciclo de 40 s quando há pedido na expedição: 20 s carregando, 10 s saindo, 10 s voltando
function Caminhao({ m, expedicao, onClick }: { m: M; expedicao: number; onClick: () => void }) {
  const g = useRef<THREE.Group>(null), carregador = useRef<THREE.Group>(null), caixa = useRef<THREE.Mesh>(null)
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  const [fase, setFase] = useState<"carregando" | "saiu" | "parado">(expedicao ? "carregando" : "parado")
  useEffect(() => {
    let vivo = true
    new THREE.TextureLoader().load("brand/enyla-wordmark-light.png", t => { if (!vivo) return; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; setTex(t) }, undefined, () => null)
    return () => { vivo = false }
  }, [])
  const X0 = LARG / 2 - 2.5
  useFrame(() => {
    if (!g.current) return
    const ciclo = expedicao ? (performance.now() / 1000) % 40 : 0
    const suave = (u: number) => u * u * (3 - 2 * u)
    let x = X0, z = ESTACIONADO, agora: typeof fase = expedicao ? "carregando" : "parado"
    if (ciclo >= 20 && ciclo < 30) { const u = (ciclo - 20) / 10; x = X0 + u * u * (FIM - X0); z = ESTACIONADO + (PISTA_IDA - ESTACIONADO) * suave(Math.min(1, u * 4)); agora = "saiu" }
    else if (ciclo >= 30) { const u = (ciclo - 30) / 10; x = -FIM + (1 - (1 - u) * (1 - u)) * (X0 + FIM); z = PISTA_IDA + (ESTACIONADO - PISTA_IDA) * suave(Math.max(0, (u - 0.75) * 4)); agora = "saiu" }
    g.current.position.set(x, 0, z)
    if (agora !== fase) setFase(agora)
    // operador leva caixas da porta da gráfica até o baú
    if (carregador.current && caixa.current) {
      const ativo = agora === "carregando"
      carregador.current.visible = ativo
      const t = performance.now() / 1000, d = (t * 1.6) % 14, indo = d < 7
      const p = indo ? d / 7 : 1 - (d - 7) / 7
      carregador.current.position.set(X0 - 4.6, Math.abs(Math.sin(t * 7)) * 0.05, PROF / 2 + 1 + p * (ESTACIONADO - PROF / 2 - 1.6))
      carregador.current.rotation.y = indo ? 0 : Math.PI
      caixa.current.visible = indo
    }
  })
  return (
    <>
      <group ref={g} position={[X0, 0, ESTACIONADO]} onClick={e => { e.stopPropagation(); onClick() }}>
        {/* cabine (frente para +x) */}
        <RoundedBox args={[1.9, 2.0, 2.2]} radius={0.18} position={[2.55, 1.35, 0]} castShadow><meshPhysicalMaterial color="#f4f4f6" metalness={0.3} roughness={0.3} clearcoat={1} /></RoundedBox>
        <mesh material={m.carroVidro} position={[3.42, 1.75, 0]}><boxGeometry args={[0.1, 0.8, 1.9]} /></mesh>
        {/* baú roxo com a logo dos dois lados */}
        <RoundedBox args={[5.0, 2.6, 2.3]} radius={0.08} position={[-0.95, 1.75, 0]} castShadow><meshStandardMaterial color="#5b3bb8" roughness={0.45} metalness={0.2} /></RoundedBox>
        {tex && [1, -1].map(s => <mesh key={s} position={[-0.95, 1.85, s * 1.16]} rotation={[0, s === 1 ? 0 : Math.PI, 0]}><planeGeometry args={[3.6, 3.6 * 328 / 1335]} /><meshBasicMaterial map={tex} transparent toneMapped={false} /></mesh>)}
        <mesh position={[-3.47, 1.75, 0]}><boxGeometry args={[0.04, 2.4, 2.1]} /><meshStandardMaterial color="#4a2f99" /></mesh>
        <mesh material={m.preto} position={[0, 0.45, 0]}><boxGeometry args={[6.8, 0.25, 1.8]} /></mesh>
        {[[-2.4, 1.05], [-1.3, 1.05], [2.6, 1.05], [-2.4, -1.05], [-1.3, -1.05], [2.6, -1.05]].map(([x, zz], k) => (
          <mesh key={k} material={m.pneu} position={[x, 0.45, zz]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.45, 0.45, 0.3, 18]} /></mesh>
        ))}
        <mesh position={[3.5, 0.85, 0]}><boxGeometry args={[0.04, 0.18, 1.7]} /><meshStandardMaterial color="#fff6dd" emissive="#fff0c0" emissiveIntensity={1.5} toneMapped={false} /></mesh>
      </group>
      <group ref={carregador} visible={false}>
        <Pessoa p={[0, 0, 0]} cor="#4b5563" pele={3} />
        <mesh ref={caixa} position={[0, 1.15, 0.35]} castShadow><boxGeometry args={[0.55, 0.42, 0.45]} /><meshStandardMaterial color="#c69a63" roughness={0.85} /></mesh>
      </group>
    </>
  )
}

export const VAGA_CAMINHAO: [number, number, number] = [LARG / 2 - 2.5, 4.2, ESTACIONADO]

export function RuaViva({ m, noite, expedicao, onExpedicao }: { m: M; noite: boolean; expedicao: number; onExpedicao: () => void }) {
  return (
    <group>
      <CarroAndando cor="#2f6fdf" pista={PISTA_IDA} sentido={1} vel={9} inicio={0} m={m} />
      <CarroAndando cor="#e8e8ea" pista={PISTA_IDA} sentido={1} vel={7.5} inicio={120} m={m} />
      <CarroAndando cor="#1f2a44" pista={PISTA_VOLTA} sentido={-1} vel={8.5} inicio={60} m={m} />
      <CarroAndando cor="#b8361f" pista={PISTA_VOLTA} sentido={-1} vel={6.5} inicio={170} m={m} />
      {!noite && <CarroAndando cor="#c8ccd2" pista={PISTA_VOLTA} sentido={-1} vel={10} inicio={10} m={m} />}
      <Pedestre z={PROF / 2 + 5.6} de={-20} ate={6} vel={1.3} cor="#2a9d8f" pele={1} fase={0} />
      <Pedestre z={PROF / 2 + 6.6} de={-24} ate={4} vel={1.1} cor="#e07b39" pele={4} fase={9} />
      {!noite && <>
        <Pedestre z={PROF / 2 + 5.9} de={-12} ate={8} vel={1.4} cor="#8456e8" pele={2} fase={4} />
        <Pedestre z={PROF / 2 + 6.9} de={-26} ate={-2} vel={1.2} cor="#c2410c" pele={0} fase={15} />
      </>}
      <Caminhao m={m} expedicao={expedicao} onClick={onExpedicao} />
    </group>
  )
}
