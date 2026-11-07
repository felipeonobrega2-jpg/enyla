"use client"

// Biblioteca de mídia do agente: vídeos e fotos de produção. O F2 (1 dia sem resposta) leva o vídeo menos usado.

import { useEffect, useState } from "react"
import { Film, Image as ImageIcon, Loader2, Upload, Trash2, Pause, Play } from "lucide-react"
import { Cartao, TituloCartao, Selo } from "./ds"
import type { MidiaAgente } from "../lib/midiaAgente"

export default function MidiaAgenteCard() {
  const [midia, setMidia] = useState<MidiaAgente[] | null>(null)
  const [descricao, setDescricao] = useState("")
  const [subindo, setSubindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetch("/api/midia").then(r => r.json()).then(d => { if (vivo) setMidia(d.midia ?? []) }).catch(() => { if (vivo) setMidia([]) })
    return () => { vivo = false }
  }, [])

  async function subir(f: File | undefined) {
    if (!f) return
    setSubindo(true); setErro(null)
    const fd = new FormData(); fd.append("file", f); fd.append("descricao", descricao)
    const r = await fetch("/api/midia", { method: "POST", body: fd }).catch(() => null)
    const d = await r?.json().catch(() => null)
    if (r?.ok) { setMidia(d.midia); setDescricao("") } else setErro(d?.erro ?? "Não consegui subir.")
    setSubindo(false)
  }
  const mudar = async (corpo: Record<string, unknown>) => {
    const d = await fetch("/api/midia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).then(r => r.json()).catch(() => null)
    if (d?.midia) setMidia(d.midia)
  }

  const videos = (midia ?? []).filter(m => m.tipo === "video" && m.ativo !== false).length
  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Biblioteca de mídia" icone={<Film className="w-4 h-4" />}
        sub={`Vídeos e fotos de produção. Quem fica 1 dia sem responder recebe, junto do F2, o vídeo menos usado. ${videos ? `${videos} vídeo(s) ativo(s).` : "Sem vídeo, o F2 vai só com texto."}`} />
      <div className="flex gap-2 flex-wrap">
        <input value={descricao} onChange={e => setDescricao(e.target.value)} maxLength={140} placeholder="O que é (ex.: caixa rígida preta sendo montada)"
          className="flex-1 min-w-[200px] h-9 rounded-lg px-3 text-[12.5px] text-[#191625] bg-white ds-borda focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20" />
        <label className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#8456e8] text-white text-[12.5px] font-semibold cursor-pointer ${subindo ? "opacity-60 pointer-events-none" : ""}`}>
          {subindo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}{subindo ? "Subindo…" : "Subir vídeo ou foto"}
          <input type="file" accept="video/mp4,video/quicktime,image/jpeg,image/png,image/webp" className="hidden" onChange={e => void subir(e.target.files?.[0])} />
        </label>
      </div>
      <p className="text-[11px] text-[#898892] mt-1.5">Até 16 MB (MP4 720p, 15 a 40 segundos funciona melhor). Sem rosto de cliente nem marca de outro cliente.</p>
      {erro && <p className="text-[11.5px] text-[#d33a3c] mt-1.5">{erro}</p>}
      <div className="mt-3 space-y-1.5">
        {(midia ?? []).map(m => (
          <div key={m.id} className="flex items-center gap-3 rounded-lg ds-borda px-3 py-2">
            {m.tipo === "video" ? <Film className="w-4 h-4 text-[#8456e8] shrink-0" /> : <ImageIcon className="w-4 h-4 text-[#8456e8] shrink-0" />}
            <a href={m.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0">
              <span className="block text-[12.5px] font-semibold text-[#191625] truncate">{m.descricao}</span>
              <span className="block text-[11px] text-[#898892]">{m.usos ?? 0} envio(s)</span>
            </a>
            {m.ativo === false && <Selo>pausado</Selo>}
            <button title={m.ativo === false ? "Voltar a usar" : "Pausar"} onClick={() => void mudar({ id: m.id, ativo: m.ativo === false })} className="text-[#898892] hover:text-[#191625]">
              {m.ativo === false ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
            <button title="Tirar" onClick={() => { if (confirm("Tirar da biblioteca?")) void mudar({ id: m.id, tirar: true }) }} className="text-[#898892] hover:text-[#d33a3c]"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
    </Cartao>
  )
}
