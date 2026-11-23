"use client"

// Orçamento → Arte prévia: arraste o material do cliente (logo, fotos, referências, PDF), escreva a ideia, e a IA
// monta a arte de cada face; a caixa aparece em 3D. Dá para pedir ajuste e escolher se vai na proposta.

import React, { useRef, useState } from "react"
import { Sparkles, Upload, X, Loader2, FileText, RotateCcw, Wand2, Trash2 } from "lucide-react"
import { Caixa3DArte } from "./Caixa3DArte"
import type { ArtePrevia, DimsCaixa } from "../lib/artePrevia"

type Material = { nome: string; tipo: string; dados: string; previa?: string }
const LIMITE_BYTES = 3_600_000   // o corpo da requisição na Vercel vai até ~4,5 MB

// Foto vira JPEG de até 1.400 px (a IA lê bem e o envio fica leve); PDF vai como está
async function prepararArquivo(f: File): Promise<Material | null> {
  if (f.type === "application/pdf") {
    if (f.size > 3_000_000) return null
    const b64 = await new Promise<string>(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] ?? ""); r.readAsDataURL(f) })
    return { nome: f.name, tipo: f.type, dados: b64 }
  }
  if (!f.type.startsWith("image/")) return null
  const url = URL.createObjectURL(f)
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = url })
    const esc = Math.min(1, 1400 / Math.max(img.width, img.height))
    const c = document.createElement("canvas"); c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc)
    const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height)
    const dataUrl = c.toDataURL("image/jpeg", 0.85)
    return { nome: f.name, tipo: "image/jpeg", dados: dataUrl.split(",")[1], previa: dataUrl }
  } catch { return null } finally { URL.revokeObjectURL(url) }
}

export function ArtePreviaCard({ dims, acabamento, valor, onChange }: {
  dims: DimsCaixa | null
  acabamento: string
  valor: ArtePrevia | undefined
  onChange: (a: ArtePrevia | undefined) => void
}) {
  const [materiais, setMateriais] = useState<Material[]>([])
  const [texto, setTexto] = useState(valor?.pedido ?? "")
  const [ajuste, setAjuste] = useState("")
  const [gerando, setGerando] = useState<{ desde: number } | null>(null)
  const [segundos, setSegundos] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [sobre, setSobre] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const adicionar = async (lista: FileList | File[]) => {
    setErro(null)
    const novos = (await Promise.all([...lista].slice(0, 6).map(prepararArquivo))).filter((m): m is Material => !!m)
    if (novos.length < [...lista].slice(0, 6).length) setErro("Alguns arquivos não entraram (aceita imagem e PDF de até 3 MB).")
    setMateriais(m => [...m, ...novos].slice(0, 6))
  }
  const gerar = async (comAjuste: boolean) => {
    if (!dims || gerando) return
    const tamanho = materiais.reduce((s, m) => s + m.dados.length, 0)
    if (tamanho > LIMITE_BYTES) { setErro("Material grande demais: tire algum arquivo."); return }
    setErro(null); const desde = Date.now(); setGerando({ desde }); setSegundos(0)
    const t = setInterval(() => setSegundos(Math.round((Date.now() - desde) / 1000)), 1000)
    try {
      const r = await fetch("/api/arte-previa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        arquivos: comAjuste ? [] : materiais.map(({ nome, tipo, dados }) => ({ nome, tipo, dados })),
        texto, dims, acabamento, anterior: comAjuste ? valor?.faces : null, ajuste: comAjuste ? ajuste : undefined,
      }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(d.erro ?? "Não deu para montar agora."); return }
      onChange({ faces: d.faces, nota: d.nota, em: new Date().toISOString(), naProposta: valor?.naProposta ?? true, pedido: texto })
      if (comAjuste) setAjuste("")
    } catch { setErro("Sem conexão.") } finally { clearInterval(t); setGerando(null) }
  }

  return (
    <div className="bg-white rounded-xl border border-[rgba(60,60,67,0.08)] p-4">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#8456e814", color: "#8456e8" }}><Sparkles className="w-4 h-4" /></span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-[#191625]">Arte prévia</p>
          <p className="text-[12px] text-[#898892]">Arraste o que o cliente mandou e escreva a ideia: a IA monta algo parecido, em 3D, para ir na proposta.</p>
        </div>
        {valor && <button onClick={() => onChange(undefined)} title="Descartar a prévia" className="h-8 px-2 rounded-lg text-[12px] text-[#898892] hover:text-[#d33a3c] hover:bg-[#d33a3c]/5 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Descartar</button>}
      </div>

      {!dims && <p className="mt-3 text-[12.5px] text-[#8a5400]">Preencha as medidas da caixa para montar a prévia.</p>}

      <div className={`grid gap-4 mt-4 ${valor ? "lg:grid-cols-[1fr_300px]" : ""}`}>
        <div className="space-y-3 min-w-0">
          {/* Material do cliente */}
          <div onDragOver={e => { e.preventDefault(); setSobre(true) }} onDragLeave={() => setSobre(false)}
            onDrop={e => { e.preventDefault(); setSobre(false); if (e.dataTransfer.files.length) adicionar(e.dataTransfer.files) }}
            onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") input.current?.click() }}
            className="rounded-xl border-2 border-dashed px-4 py-4 text-center cursor-pointer transition-colors"
            style={{ borderColor: sobre ? "#8456e8" : "rgba(60,60,67,0.15)", background: sobre ? "rgba(132,86,232,0.05)" : "rgba(116,116,128,0.03)" }}>
            <Upload className="w-5 h-5 mx-auto text-[#898892]" />
            <p className="text-[12.5px] text-[#5e5c68] mt-1">Arraste aqui logo, fotos, caixa de referência ou PDF <span className="text-[#898892]">(até 6)</span></p>
            <input ref={input} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={e => { if (e.target.files) adicionar(e.target.files); e.target.value = "" }} />
          </div>
          {materiais.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {materiais.map((m, i) => (
                <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-[rgba(60,60,67,0.12)] bg-[#f6f5f9] flex items-center justify-center" title={m.nome}>
                  {m.previa ? <img src={m.previa} alt={m.nome} className="w-full h-full object-cover" /> : <FileText className="w-6 h-6 text-[#898892]" />}
                  <button onClick={() => setMateriais(l => l.filter((_, k) => k !== i))} aria-label={`Tirar ${m.nome}`}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} maxLength={3000}
            placeholder="Ex.: caixa preta fosca, logo dourado no centro da frente, nome em árabe na lateral, tampa com o símbolo"
            className="w-full rounded-lg bg-white px-3 py-2 text-[13px] text-[#191625] border border-[rgba(60,60,67,0.15)] resize-none focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20" />
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => gerar(false)} disabled={!dims || !!gerando || (!materiais.length && !texto.trim())}
              className="h-9 px-4 rounded-lg text-[13px] font-semibold text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: "#8456e8" }}>
              {gerando && !ajuste ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{valor ? "Montar de novo" : "Montar prévia"}
            </button>
            {gerando && <span className="text-[12px] text-[#898892]">Desenhando as 6 faces… {segundos}s (leva uns 60 a 90 s)</span>}
          </div>
          {erro && <p className="text-[12px] text-[#d33a3c]">{erro}</p>}
          {valor && (
            <div className="space-y-2 pt-1">
              {valor.nota && <p className="text-[12px] text-[#5e5c68] italic line-clamp-3" title={valor.nota}>{valor.nota}</p>}
              <div className="flex items-center gap-2">
                <input value={ajuste} onChange={e => setAjuste(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && ajuste.trim()) gerar(true) }}
                  placeholder="Ajustar: logo maior, fundo azul, tirar a faixa…" maxLength={1500}
                  className="flex-1 min-w-0 h-9 rounded-lg bg-white px-3 text-[13px] border border-[rgba(60,60,67,0.15)] focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20" />
                <button onClick={() => gerar(true)} disabled={!ajuste.trim() || !!gerando}
                  className="h-9 px-3 rounded-lg text-[12.5px] font-semibold text-[#8456e8] border border-[#8456e8]/30 hover:bg-[#8456e8]/5 flex items-center gap-1.5 disabled:opacity-50">
                  {gerando && ajuste ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Ajustar
                </button>
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-[#3c3a45] cursor-pointer">
                <input type="checkbox" checked={valor.naProposta} onChange={e => onChange({ ...valor, naProposta: e.target.checked })} className="accent-[#8456e8]" />
                Mostrar na proposta do cliente (com o aviso de que é ilustrativa)
              </label>
            </div>
          )}
        </div>
        {valor && dims && (
          <div className="flex flex-col items-center justify-center">
            <Caixa3DArte faces={valor.faces} dims={dims} tamanho={280} palco />
            <button onClick={() => gerar(false)} disabled={!!gerando} className="mt-2 text-[11.5px] text-[#898892] hover:text-[#8456e8] flex items-center gap-1"><RotateCcw className="w-3 h-3" /> outra versão</button>
          </div>
        )}
      </div>
    </div>
  )
}
