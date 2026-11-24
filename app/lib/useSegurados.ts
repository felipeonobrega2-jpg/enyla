"use client"
// Pedidos aguardando pagamento do cliente, para as telas (a marca mora no servidor, ver pedidoSegurado.ts).
import { useCallback, useEffect, useState } from "react"
import type { MapaSegurados } from "./pedidoSegurado"

export function useSegurados() {
  const [segurados, setSegurados] = useState<MapaSegurados>({})
  useEffect(() => {
    let vivo = true
    fetch("/api/pedido-segurado").then(r => r.ok ? r.json() : null).then(j => { if (vivo && j?.segurados) setSegurados(j.segurados) }).catch(() => null)
    return () => { vivo = false }
  }, [])
  const mudar = useCallback(async (numero: string, segurar: boolean) => {
    const r = await fetch("/api/pedido-segurado", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ numero, segurar }) }).catch(() => null)
    const j = r?.ok ? await r.json().catch(() => null) : null
    if (j?.segurados) setSegurados(j.segurados)
  }, [])
  return { segurados, mudar }
}
