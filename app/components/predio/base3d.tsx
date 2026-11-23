"use client"

// Base do prédio 3D: medidas, materiais e peças que o prédio e os interiores dos andares usam.

import React, { useMemo } from "react"
import * as THREE from "three"

// ── Medidas (metros) ─────────────────────────────────────────────────────────
export const LARG = 26, PROF = 16           // planta do prédio
export const H_TERREO = 5.4, H_ANDAR = 3.7, LAJE = 0.35
export const VAO = 1.6                       // distância entre montantes da fachada

// altura da base de cada andar (de baixo para cima: térreo, 1º, 2º, 3º, cobertura)
export const baseDo = (i: number) => i === 0 ? 0 : H_TERREO + (i - 1) * H_ANDAR
export const alturaDo = (i: number) => i === 0 ? H_TERREO : H_ANDAR

// ── Materiais ────────────────────────────────────────────────────────────────
export function useMateriais() {
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
export type M = ReturnType<typeof useMateriais>

// Luz de teto: acende onde tem trabalho (e à noite brilha mais)
export function Luminarias({ y, ativo, noite }: { y: number; ativo: boolean; noite: boolean }) {
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
export function Mesa({ p, m, tela }: { p: [number, number, number]; m: M; tela: boolean }) {
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

