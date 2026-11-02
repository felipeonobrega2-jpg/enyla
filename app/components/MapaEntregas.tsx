"use client"

// Mapa da página Entregas (Leaflet + OpenStreetMap, sem chave): pontos da corrida com letras, rota pelas ruas
// e o motorista ao vivo. No tema escuro o mesmo mapa ganha um filtro.

import { useEffect, useRef } from "react"
import type * as L from "leaflet"
import "leaflet/dist/leaflet.css"

export type PontoMapa = { lat: number; lng: number; rotulo: string; nome: string; cor: string }

const letra = (p: PontoMapa) =>
  `<div style="width:28px;height:28px;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);background:${p.cor};box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff;display:grid;place-items:center">
     <span style="transform:rotate(45deg);color:#fff;font:700 12px/1 system-ui">${p.rotulo}</span></div>`
const carro = `<div class="mapa-motorista"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg></div>`

// linha: traçado pelas ruas (vem da página, que usa o mesmo cálculo para o tempo); sem ela, linha reta tracejada.
// animar: um ponto percorre a rota em loop, no estilo Waze (enquanto se monta a corrida).
export function MapaEntregas({ pontos, linha, motorista, escuro, animar }: { pontos: PontoMapa[]; linha?: [number, number][] | null; motorista?: { lat: number; lng: number } | null; escuro?: boolean; animar?: boolean }) {
  const viajante = useRef<L.CircleMarker | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const lib = useRef<typeof L | null>(null)
  const camada = useRef<L.LayerGroup | null>(null)
  const fundo = useRef<L.TileLayer | null>(null)
  const carroRef = useRef<L.Marker | null>(null)
  const pronto = useRef<Promise<void> | null>(null)

  // Cria o mapa uma vez (Leaflet só existe no navegador)
  useEffect(() => {
    let vivo = true
    pronto.current = import("leaflet").then(mod => {
      const Lf = (mod as unknown as { default?: typeof L }).default ?? (mod as unknown as typeof L)
      if (!vivo || !caixa.current || mapa.current) return
      lib.current = Lf
      mapa.current = Lf.map(caixa.current, { zoomControl: false, attributionControl: true }).setView([-23.55, -46.63], 12)
      Lf.control.zoom({ position: "bottomright" }).addTo(mapa.current)
      camada.current = Lf.layerGroup().addTo(mapa.current)
    })
    return () => { vivo = false; mapa.current?.remove(); mapa.current = null }
  }, [])

  // Fundo claro/escuro
  useEffect(() => {
    pronto.current?.then(() => {
      const Lf = lib.current, m = mapa.current
      if (!Lf || !m) return
      fundo.current?.remove()
      // Escuro: o mesmo mapa com filtro (classe mapa-escuro), sem depender de serviço pago
      fundo.current = Lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19, className: escuro ? "mapa-escuro" : "" })
      fundo.current.addTo(m)
    })
  }, [escuro])

  // Pontos + rota (linha reta tracejada enquanto o traçado pelas ruas não chega)
  const chave = pontos.map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)},${p.rotulo}`).join(";")
  const chaveLinha = linha ? `${linha.length}:${linha[0]?.join(",")}:${linha[linha.length - 1]?.join(",")}` : ""
  useEffect(() => {
    let vivo = true
    pronto.current?.then(() => {
      const Lf = lib.current, m = mapa.current, g = camada.current
      if (!Lf || !m || !g || !vivo) return
      g.clearLayers()
      if (!pontos.length) return
      const coords = pontos.map(p => [p.lat, p.lng] as [number, number])
      if (linha?.length) {
        Lf.polyline(linha, { color: "#ffffff", weight: 8, opacity: escuro ? 0.15 : 0.9 }).addTo(g)
        Lf.polyline(linha, { color: "#8456e8", weight: 4.5, opacity: 0.95 }).addTo(g)
      } else if (coords.length > 1) Lf.polyline(coords, { color: "#8456e8", weight: 3, opacity: 0.35, dashArray: "6 8" }).addTo(g)
      for (const p of pontos) Lf.marker([p.lat, p.lng], { icon: Lf.divIcon({ html: letra(p), className: "", iconSize: [28, 28], iconAnchor: [14, 28] }) }).bindTooltip(p.nome, { direction: "top", offset: [0, -28] }).addTo(g)
      if (coords.length === 1) m.flyTo(coords[0], 15, { duration: 0.6 })
      else m.flyToBounds(Lf.latLngBounds(linha?.length ? linha : coords).pad(0.25), { duration: 0.6, paddingTopLeft: [0, 90] })
    })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, chaveLinha, escuro])

  // Ponto percorrendo a rota em loop (6 s), velocidade constante pela distância
  useEffect(() => {
    let raf = 0, vivo = true
    pronto.current?.then(() => {
      const Lf = lib.current, m = mapa.current
      viajante.current?.remove(); viajante.current = null
      if (!Lf || !m || !vivo || !animar || !linha || linha.length < 2) return
      const acum = [0]
      for (let i = 1; i < linha.length; i++) acum.push(acum[i - 1] + Math.hypot(linha[i][0] - linha[i - 1][0], linha[i][1] - linha[i - 1][1]))
      const total = acum[acum.length - 1] || 1
      viajante.current = Lf.circleMarker(linha[0], { radius: 6, color: "#fff", weight: 2.5, fillColor: "#f16622", fillOpacity: 1 }).addTo(m)
      const t0 = performance.now()
      const passo = (t: number) => {
        if (!vivo) return
        const alvo = (((t - t0) % 6000) / 6000) * total
        let k = 1
        while (k < acum.length - 1 && acum[k] < alvo) k++
        const f = (alvo - acum[k - 1]) / ((acum[k] - acum[k - 1]) || 1)
        viajante.current?.setLatLng([linha[k - 1][0] + (linha[k][0] - linha[k - 1][0]) * f, linha[k - 1][1] + (linha[k][1] - linha[k - 1][1]) * f])
        raf = requestAnimationFrame(passo)
      }
      if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) raf = requestAnimationFrame(passo)
    })
    return () => { vivo = false; cancelAnimationFrame(raf); viajante.current?.remove(); viajante.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveLinha, animar])

  // Motorista ao vivo: o marcador desliza até a nova posição
  useEffect(() => {
    pronto.current?.then(() => {
      const Lf = lib.current, m = mapa.current
      if (!Lf || !m) return
      if (!motorista) { carroRef.current?.remove(); carroRef.current = null; return }
      const alvo: [number, number] = [motorista.lat, motorista.lng]
      if (!carroRef.current) {
        carroRef.current = Lf.marker(alvo, { icon: Lf.divIcon({ html: carro, className: "", iconSize: [34, 34], iconAnchor: [17, 17] }), zIndexOffset: 1000 }).addTo(m)
        return
      }
      const de = carroRef.current.getLatLng(), t0 = performance.now()
      const passo = (t: number) => {
        const k = Math.min(1, (t - t0) / 1200), e = 1 - Math.pow(1 - k, 3)
        carroRef.current?.setLatLng([de.lat + (alvo[0] - de.lat) * e, de.lng + (alvo[1] - de.lng) * e])
        if (k < 1) requestAnimationFrame(passo)
      }
      requestAnimationFrame(passo)
    })
  }, [motorista?.lat, motorista?.lng, motorista])

  return <div ref={caixa} className="w-full h-full" style={{ background: escuro ? "#0b0914" : "#e9e7f0" }} />
}
