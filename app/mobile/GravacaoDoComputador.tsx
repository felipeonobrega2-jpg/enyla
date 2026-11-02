"use client"

// No celular: quando você pede "Gravar no celular" no computador, o gravador abre aqui sozinho (vibra) em ~2 s.
// Só enquanto o sistema está aberto na tela; o navegador não deixa a página ouvir com o celular bloqueado.

import { useEffect, useRef, useState } from "react"
import { GravarClient } from "../gravar/GravarClient"

type Pedido = { id: string; nome: string; token: string; expira: number; estado: string }

export function GravacaoDoComputador() {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const atendidos = useRef(new Set<string>())
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const olhar = async () => {
      if (!document.hidden) {
        const g = await fetch("/api/whatsapp/gravar-celular").then(r => r.ok ? r.json() : null).catch(() => null) as Pedido | null
        if (g && g.estado === "aguardando" && !atendidos.current.has(g.id)) {
          atendidos.current.add(g.id)
          setPedido(g)
          navigator.vibrate?.([120, 60, 120])
          fetch("/api/whatsapp/gravar-celular", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: g.id, estado: "aberto" }) }).catch(() => {})
        }
      }
      t = setTimeout(olhar, 2000)
    }
    olhar()
    return () => clearTimeout(t)
  }, [])
  if (!pedido) return null
  const fechar = (cancelou: boolean) => {
    if (cancelou) fetch("/api/whatsapp/gravar-celular", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: pedido.id, estado: "cancelado" }) }).catch(() => {})
    setPedido(null)
  }
  return (
    <div className="fixed inset-0 z-[90] animate-[apple-slide-up_.25s_ease-out]">
      <GravarClient token={pedido.token} nome={pedido.nome} expira={pedido.expira} onFechar={() => fechar(true)} onEnviado={() => setTimeout(() => fechar(false), 1400)} />
    </div>
  )
}
