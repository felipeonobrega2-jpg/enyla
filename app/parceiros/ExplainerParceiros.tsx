"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Play, Pause, RotateCcw, ArrowRight, Package } from "lucide-react"
import { EXPLAINER as E, DURACAO_S, cenaEm } from "./explainerParceiros"

const ROXO = "#7c4ee4"
const VEU = "linear-gradient(165deg, rgba(26,14,64,0.92) 0%, rgba(58,30,140,0.80) 45%, rgba(124,78,228,0.52) 100%)"

const MQ = "(prefers-reduced-motion: reduce)"
function assinaReduzido(cb: () => void) {
  const mq = window.matchMedia(MQ)
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}

function BotaoParceiro({ onClick, claro }: { onClick: () => void; claro?: boolean }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center justify-center gap-2 h-14 px-8 rounded-2xl text-[16.5px] font-bold active:scale-[0.99] transition ${claro ? "bg-white shadow-[0_10px_30px_rgba(0,0,0,0.25)]" : "text-white"}`} style={claro ? { color: ROXO } : { background: ROXO }}>
      {E.cena6.botao}<ArrowRight className="w-5 h-5" />
    </button>
  )
}

export default function ExplainerParceiros({ onComecar }: { onComecar: () => void }) {
  const reduzido = useSyncExternalStore(assinaReduzido, () => window.matchMedia(MQ).matches, () => null)
  const [t, setT] = useState(0)
  const [rodando, setRodando] = useState(true)
  const fim = t >= DURACAO_S
  const ultimo = useRef(0)

  useEffect(() => {
    if (reduzido !== false || !rodando || fim) return
    ultimo.current = performance.now()
    const id = setInterval(() => {
      const agora = performance.now()
      const dt = (agora - ultimo.current) / 1000
      ultimo.current = agora
      setT(x => Math.min(DURACAO_S, x + dt))
    }, 100)
    return () => clearInterval(id)
  }, [reduzido, rodando, fim])

  const alternar = () => {
    if (fim) { setT(0); setRodando(true) } else setRodando(r => !r)
  }

  if (reduzido === null) return <section className="max-w-[1040px] mx-auto px-5 pt-12"><div className="rounded-3xl aspect-[9/12] sm:aspect-video" style={{ background: VEU }} /></section>

  if (reduzido) {
    return (
      <section className="max-w-[1040px] mx-auto px-5 pt-12" aria-label="Como o programa funciona">
        <div className="rounded-3xl p-6 sm:p-10 text-white" style={{ background: VEU }}>
          <p className="text-[13px] font-semibold text-white/80">{E.selo}</p>
          <h2 className="mt-2 text-[28px] sm:text-[36px] font-extrabold leading-tight tracking-tight">{E.cena1.titulo}</h2>
          <p className="mt-4 text-[17px] font-semibold">{E.cena2.linhas.join(" ")}</p>
          <p className="mt-3 text-[16px] font-semibold">{E.cena3.linhas.join(" ")}</p>
          <p className="mt-4 text-[24px] font-semibold leading-snug" style={{ fontFamily: '"IBM Plex Mono", ui-monospace, monospace' }}>{E.cena4.percentuais[0]}<br />{E.cena4.percentuais[1]}</p>
          <p className="mt-4 text-[16px] font-semibold">{E.cena5.linhas[1]}</p>
          <p className="mt-4 text-[18px] font-bold">{E.cena6.linhas.join(" ")}</p>
          <div className="mt-5"><BotaoParceiro onClick={onComecar} claro /></div>
          <p className="mt-3 text-[13px] text-white/70">{E.cena6.apoio}</p>
        </div>
      </section>
    )
  }

  const c = cenaEm(t)
  const pct = (t / DURACAO_S) * 100
  const linha = "text-white font-extrabold tracking-tight leading-[1.12] text-[26px] sm:text-[38px]"
  const apoio = "mt-4 text-white/80 text-[15px] sm:text-[17px] leading-snug max-w-[460px]"

  return (
    <section className="max-w-[1040px] mx-auto px-5 pt-12" aria-label="Como o programa funciona">
      <div
        className="relative overflow-hidden rounded-3xl aspect-[9/12] sm:aspect-video outline-none focus-visible:ring-4 focus-visible:ring-[#7c4ee4]/40"
        style={{ background: VEU, backgroundColor: "#1a0e40" }}
        tabIndex={0}
        role="group"
        aria-roledescription="explainer animado"
        onKeyDown={e => { if (e.key === " " && e.target === e.currentTarget) { e.preventDefault(); alternar() } }}
      >
        <div className="absolute -right-24 -bottom-32 w-[360px] h-[360px] rounded-full bg-[#2fd39a]/10 blur-2xl" />
        <img src="/brand/enyla-wordmark-light.png" alt="ENYLA" className="absolute left-5 top-5 h-6" onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />

        {/* Texto no terço central; cada cena remonta e anima a entrada */}
        <div key={c} className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 sm:px-14 flex flex-col items-start">
          {c === 1 && (<>
            <span className="rounded-full bg-white/15 text-white text-[12.5px] font-semibold px-3 py-1 par-in-fwd">{E.selo}</span>
            <p className="mt-4 text-white/85 text-[16px] sm:text-[19px] font-semibold par-in-fwd">{E.cena1.pequena}</p>
            <h3 className={`${linha} mt-2 text-[34px] sm:text-[56px] par-in-fwd`} style={{ animationDelay: "1.2s" }}>{E.cena1.titulo}</h3>
          </>)}
          {c === 2 && (<>
            {E.cena2.linhas.map((l, i) => <p key={l} className={`${linha} par-in-fwd`} style={{ animationDelay: `${i * 0.6}s` }}>{l}</p>)}
            <p className={`${apoio} par-in-fwd`} style={{ animationDelay: "1.4s" }}>{E.cena2.apoio}</p>
          </>)}
          {c === 3 && (<>
            {E.cena3.linhas.map((l, i) => <p key={l} className={`${linha} par-in-fwd`} style={{ animationDelay: `${i * 0.6}s` }}>{l}</p>)}
            <div className="mt-5 w-full max-w-[420px] rounded-2xl bg-white/95 shadow-[0_14px_40px_rgba(10,5,40,0.35)] p-3.5 flex items-center gap-3 par-in-fwd" style={{ animationDelay: "1.4s" }}>
              <span className="w-11 h-11 rounded-xl grid place-items-center shrink-0 text-white" style={{ background: ROXO }}><Package className="w-5 h-5" /></span>
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold" style={{ color: ROXO }}>{E.cena3.cartao.titulo}</span>
                <span className="block text-[14px] font-bold text-[#1d1a29] leading-tight">{E.cena3.cartao.detalhe}</span>
                <span className="block text-[12px] text-[#6b6878]">{E.cena3.cartao.canal}</span>
              </span>
            </div>
          </>)}
          {c === 4 && (<>
            {E.cena4.percentuais.map((p, i) => <p key={p} className="text-white font-semibold text-[28px] sm:text-[44px] leading-tight par-in-fwd" style={{ fontFamily: '"IBM Plex Mono", ui-monospace, monospace', animationDelay: `${i * 0.7}s` }}>{p}</p>)}
            <p className={`${apoio} par-in-fwd`} style={{ animationDelay: "1.6s" }}>{E.cena4.apoio}</p>
          </>)}
          {c === 5 && (<>
            {E.cena5.linhas.map((l, i) => <p key={l} className={`${linha} par-in-fwd`} style={{ animationDelay: `${i * 0.7}s` }}>{l}</p>)}
            <p className={`${apoio} par-in-fwd`} style={{ animationDelay: "1.6s" }}>{E.cena5.apoio}</p>
          </>)}
          {c === 6 && (<>
            {E.cena6.linhas.map((l, i) => <p key={l} className={`${linha} text-[32px] sm:text-[48px] par-in-fwd`} style={{ animationDelay: `${i * 0.5}s` }}>{l}</p>)}
            <div className="mt-6 par-in-fwd" style={{ animationDelay: "1s" }}><BotaoParceiro onClick={onComecar} claro /></div>
            <p className="mt-3 text-white/65 text-[13px] par-in-fwd" style={{ animationDelay: "1.2s" }}>{E.cena6.apoio}</p>
          </>)}
        </div>

        {/* Controles */}
        <div className="absolute inset-x-0 bottom-0 px-4 pb-3 flex items-center gap-3">
          <button onClick={alternar} aria-label={fim ? "Ver de novo" : rodando ? "Pausar" : "Reproduzir"} className="w-12 h-12 rounded-full bg-white/20 backdrop-blur text-white grid place-items-center active:scale-95 transition shrink-0">
            {fim ? <RotateCcw className="w-5 h-5" /> : rodando ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <div className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={DURACAO_S} aria-valuenow={Math.round(t)}>
            <div className="h-full bg-white/80" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </section>
  )
}
