"use client"
// Reunião com um diretor em tela cheia, no jeito de uma chamada de vídeo: o quadro do diretor e o do Felipe lado a
// lado, quem fala acende (pelo volume de verdade), legenda ao vivo, câmera opcional (fica só neste computador),
// barra de controles e o chat da reunião na lateral (onde ficam os cartões para aprovar). Mãos livres: com o
// microfone ligado, o sistema ouve sempre que o diretor não está falando nem pensando.
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Captions, CaptionsOff, Hand, MessageSquare, Mic, MicOff, PhoneOff, Video, VideoOff, X } from "lucide-react"
import type { IdDiretor } from "../../lib/diretoria"

const COR: Record<IdDiretor, [string, string]> = {
  coo: ["#3d7be0", "#2a4fa3"], cco: ["#e8833a", "#b8561b"], cmo: ["#d64f8a", "#9c2c60"], cfo: ["#1f9e6a", "#14704a"], cto: ["#2aa3b3", "#1a6f7c"],
}
const hhmm = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
const duracao = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

export type EstadoChamada = {
  falando: boolean; pensando: boolean; nivelDiretor: number; legenda: string
  ouvindo: boolean; entendendo: boolean; nivelFelipe: number; minhaFala: string | null
  mudo: boolean; pendentes: number; aviso: string | null; erro: string | null
}

export default function ReuniaoChamada({ diretor, nome, cargo, area, estado, painel, onMudo, onInterromper, onSair }: {
  diretor: IdDiretor; nome: string; cargo: string; area: string; estado: EstadoChamada; painel: ReactNode
  onMudo: () => void; onInterromper: () => void; onSair: () => void
}) {
  const e = estado
  const primeiro = nome.split(" ")[0]
  const iniciais = nome.split(" ").map(p => p[0]).slice(0, 2).join("")
  const [chat, setChat] = useState(false)
  const [legendas, setLegendas] = useState(true)
  const [camera, setCamera] = useState<MediaStream | null>(null)
  const [erroCam, setErroCam] = useState<string | null>(null)
  const [seg, setSeg] = useState(0)
  const [relogio, setRelogio] = useState(hhmm)
  const video = useRef<HTMLVideoElement>(null)
  const camRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    const t = setInterval(() => { setSeg(s => s + 1); setRelogio(hhmm()) }, 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { if (video.current) video.current.srcObject = camera }, [camera])
  useEffect(() => () => camRef.current?.getTracks().forEach(t => t.stop()), [])
  // Esc sai da reunião; espaço interrompe o diretor
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.closest("textarea,input")) return
      if (ev.key === "Escape") onSair()
      if (ev.key === " " && e.falando) { ev.preventDefault(); onInterromper() }
    }
    window.addEventListener("keydown", tecla)
    return () => window.removeEventListener("keydown", tecla)
  }, [e.falando, onSair, onInterromper])

  const alternarCamera = async () => {
    if (camera) { camera.getTracks().forEach(t => t.stop()); setCamera(null); camRef.current = null; return }
    setErroCam(null)
    try { const s = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } }); setCamera(s); camRef.current = s }
    catch { setErroCam("Sem acesso à câmera. Libere a câmera para o site no navegador.") }
  }

  const [c1, c2] = COR[diretor]
  const fala = e.falando ? Math.max(0.15, e.nivelDiretor) : 0
  const voce = e.ouvindo && !e.mudo ? e.nivelFelipe : 0
  const legenda = e.falando && e.legenda ? { quem: primeiro, texto: e.legenda, cor: c1 }
    : e.entendendo ? { quem: "Você", texto: "…", cor: "#8a8797" }
    : e.minhaFala && e.pensando ? { quem: "Você", texto: e.minhaFala, cor: "#8a8797" } : null
  const botao = "w-12 h-12 rounded-full grid place-items-center transition-colors"

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-[#15131c] text-white select-none">
      {/* Palco */}
      <div className="flex-1 min-h-0 flex gap-3 p-3 sm:p-4">
        <div className="flex-1 min-w-0 relative flex flex-col lg:flex-row gap-3">
          {/* Diretor */}
          <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden grid place-items-center transition-[box-shadow] duration-100"
            style={{ background: `radial-gradient(120% 90% at 50% 35%, ${c2}55, #24212d 70%)`, boxShadow: e.falando ? `inset 0 0 0 3px ${c1}` : "inset 0 0 0 1px rgba(255,255,255,0.06)" }}>
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <span className="absolute inset-0 rounded-full transition-transform duration-100" style={{ background: c1, opacity: 0.28, transform: `scale(${1 + fala * 0.45})` }} />
                <span className="absolute inset-0 rounded-full transition-transform duration-150" style={{ background: c1, opacity: 0.16, transform: `scale(${1 + fala * 0.8})` }} />
                <div className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full grid place-items-center text-[40px] sm:text-[52px] font-semibold tracking-tight shadow-[0_10px_40px_rgba(0,0,0,0.35)]"
                  style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{iniciais}</div>
              </div>
              {e.pensando && <div className="flex items-center gap-2 text-[13px] text-white/70">
                <span className="flex gap-1">{[0, 1, 2].map(k => <span key={k} className="w-1.5 h-1.5 rounded-full bg-white/70 animate-bounce" style={{ animationDelay: `${k * 0.15}s` }} />)}</span>
                {primeiro} está pensando, olhando os números
              </div>}
            </div>
            <div className="absolute left-3 bottom-3 flex items-center gap-2 rounded-lg bg-black/45 backdrop-blur px-2.5 py-1 text-[13px]">
              {e.falando && <Barras nivel={fala} />}
              <span className="font-medium">{nome}</span><span className="text-white/60">{cargo} · {area}</span>
            </div>
            {e.falando && <button onClick={onInterromper} className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/45 hover:bg-black/60 backdrop-blur px-3 py-1.5 text-[12px] font-medium">
              <Hand className="w-3.5 h-3.5" />Interromper <span className="text-white/50">espaço</span>
            </button>}
          </div>

          {/* Felipe */}
          <div className="relative lg:w-[38%] h-40 lg:h-auto shrink-0 rounded-2xl overflow-hidden grid place-items-center bg-[#24212d] transition-[box-shadow] duration-100"
            style={{ boxShadow: voce > 0.12 ? "inset 0 0 0 3px #8456e8" : "inset 0 0 0 1px rgba(255,255,255,0.06)" }}>
            {camera ? <video ref={video} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover -scale-x-100" />
              : <div className="relative">
                <span className="absolute inset-0 rounded-full bg-[#8456e8]/30 transition-transform duration-100" style={{ transform: `scale(${1 + voce * 0.5})` }} />
                <div className="relative w-20 h-20 lg:w-28 lg:h-28 rounded-full grid place-items-center text-[32px] lg:text-[40px] font-semibold bg-gradient-to-br from-[#8456e8] to-[#5b3bb8]">F</div>
              </div>}
            <div className="absolute left-3 bottom-3 flex items-center gap-2 rounded-lg bg-black/45 backdrop-blur px-2.5 py-1 text-[13px]">
              {e.mudo ? <MicOff className="w-3.5 h-3.5 text-[#ff6b6b]" /> : e.ouvindo ? <Barras nivel={voce} /> : <Mic className="w-3.5 h-3.5 text-white/60" />}
              <span className="font-medium">Você</span>
            </div>
            {e.ouvindo && !e.mudo && !e.entendendo && <span className="absolute right-3 top-3 rounded-full bg-black/45 backdrop-blur px-2.5 py-1 text-[11.5px] text-white/80">Ouvindo</span>}
          </div>

          {/* Aviso de cartão para aprovar */}
          {e.pendentes > 0 && !chat && <button onClick={() => setChat(true)}
            className="absolute left-1/2 -translate-x-1/2 top-3 z-10 flex items-center gap-2 rounded-full bg-white text-[#191625] shadow-lg px-4 py-2 text-[13px] font-medium">
            <span className="w-2 h-2 rounded-full bg-[#009351]" />
            {primeiro} deixou {e.pendentes === 1 ? "1 item" : `${e.pendentes} itens`} para o seu Aprovo
            <span className="text-[#5b3bb8] font-semibold">Abrir</span>
          </button>}

          {/* Legenda */}
          {legendas && legenda && <div className="absolute left-1/2 -translate-x-1/2 bottom-14 w-[min(860px,calc(100%-32px))] z-10 pointer-events-none">
            <div className="rounded-xl bg-black/70 backdrop-blur px-4 py-3 flex gap-3 items-start">
              <span className="text-[12px] font-semibold shrink-0 mt-[3px]" style={{ color: legenda.cor === "#8a8797" ? "#c9c6d4" : legenda.cor }}>{legenda.quem}</span>
              <p className="text-[17px] leading-snug text-white">{legenda.texto}</p>
            </div>
          </div>}
        </div>

        {/* Chat da reunião */}
        {chat && <div className="w-[400px] max-w-[calc(100vw-24px)] shrink-0 rounded-2xl bg-white text-[#191625] flex flex-col overflow-hidden max-lg:absolute max-lg:right-3 max-lg:top-3 max-lg:bottom-[84px] max-lg:z-20">
          <div className="flex items-center px-4 py-3 border-b border-black/5">
            <p className="flex-1 text-[14px] font-semibold">Chat da reunião</p>
            <button onClick={() => setChat(false)} aria-label="Fechar o chat" className="w-8 h-8 rounded-lg grid place-items-center text-[#6b6876] hover:bg-black/5"><X className="w-4 h-4" /></button>
          </div>
          {painel}
        </div>}
      </div>

      {(e.erro || erroCam || e.aviso) && <p className="px-4 -mt-1 mb-1 text-center text-[12px] text-white/60">{e.erro ?? erroCam ?? e.aviso}</p>}

      {/* Barra de controles */}
      <div className="h-[76px] shrink-0 grid grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6">
        <p className="text-[14px] text-white/85 truncate"><span className="font-medium">{relogio}</span><span className="text-white/30 mx-2.5">|</span><span className="max-sm:hidden">Reunião com {nome}</span><span className="text-white/40 ml-2.5 tabular-nums">{duracao(seg)}</span></p>
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button onClick={onMudo} title={e.mudo ? "Ligar o microfone" : "Desligar o microfone"} className={`${botao} ${e.mudo ? "bg-[#ea4335] hover:bg-[#d33a2c]" : "bg-[#3a3744] hover:bg-[#47434f]"}`}>
            {e.mudo ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <button onClick={alternarCamera} title={camera ? "Desligar a câmera" : "Ligar a câmera"} className={`${botao} ${camera ? "bg-[#3a3744] hover:bg-[#47434f]" : "bg-[#ea4335] hover:bg-[#d33a2c]"}`}>
            {camera ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
          <button onClick={() => setLegendas(v => !v)} title={legendas ? "Desligar legendas" : "Ligar legendas"} className={`${botao} ${legendas ? "bg-[#cbb8ff] text-[#2b1a63] hover:bg-[#d9caff]" : "bg-[#3a3744] hover:bg-[#47434f]"}`}>
            {legendas ? <Captions className="w-5 h-5" /> : <CaptionsOff className="w-5 h-5" />}
          </button>
          <button onClick={onSair} title="Sair da reunião" className="h-12 px-6 rounded-full bg-[#ea4335] hover:bg-[#d33a2c] grid place-items-center"><PhoneOff className="w-5 h-5" /></button>
        </div>
        <div className="flex justify-end">
          <button onClick={() => setChat(v => !v)} title="Chat da reunião" className={`relative ${botao} ${chat ? "bg-[#cbb8ff] text-[#2b1a63]" : "hover:bg-white/10"}`}>
            <MessageSquare className="w-5 h-5" />
            {e.pendentes > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#009351] text-[10.5px] font-bold grid place-items-center">{e.pendentes}</span>}
          </button>
        </div>
      </div>
    </div>
  )
}

function Barras({ nivel }: { nivel: number }) {
  return <span className="flex items-center gap-[2px] h-3.5">{[0.6, 1, 0.7].map((k, i) =>
    <span key={i} className="w-[3px] rounded-full bg-white transition-[height] duration-75" style={{ height: `${Math.max(3, Math.min(14, 3 + nivel * 14 * k))}px` }} />)}</span>
}
