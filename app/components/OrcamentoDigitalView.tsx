"use client"

import { useState, useMemo } from "react"
import { gerarHtmlPropostaCustom } from "../pdf"
import type { PropostaCustom, LinhaPropostaCustom } from "../types"
import { brl } from "../utils"

// ── Pricing engine ─────────────────────────────────────────────────────────

function calcN(A: number, L: number, P: number): number {
  const fw = 2 * (L + P) + 1.5
  const fh = A + 2 * P
  if (fw <= 0 || fh <= 0) return 0
  const A3W = 28.7, A3H = 41
  const opA = Math.floor(A3W / fw) * Math.floor(A3H / fh)
  const opB = Math.floor(A3W / fh) * Math.floor(A3H / fw)
  return Math.max(opA, opB)
}

function fixo(q: number): number {
  if (q <= 100) return 200
  if (q <= 300) return 200 + ((q - 100) / 200) * 400
  if (q <= 500) return 600 + ((q - 300) / 200) * 250
  return 850 + ((q - 500) / 200) * 250
}

function precoNosso(q: number, n: number): number {
  const forn = fixo(q) + (150 + 1.5 * q) / n
  return forn * (q <= 100 ? 2.0 : 1.5)
}

// Arredondamento psicológico → X,88 (sensação de barato)
function charm(valor: number): number {
  return Math.round(valor) - 0.12
}

// ── Parser de dimensões estilo WhatsApp ────────────────────────────────────

function parseDims(text: string): [number, number, number] | null {
  const nums = text.match(/\d+(?:[.,]\d+)?/g)?.map(n => parseFloat(n.replace(",", "."))) ?? []
  if (nums.length >= 3) {
    const [a, l, p] = nums
    if (a > 0 && l > 0 && p > 0) return [a, l, p]
  }
  return null
}

// ── PDF ────────────────────────────────────────────────────────────────────

function openPdf(proposta: PropostaCustom, telefone?: string) {
  const html = gerarHtmlPropostaCustom(proposta, telefone)
  // Injeta script de auto-print para o browser exibir o diálogo de salvar como PDF
  const withPrint = html.replace(
    "</body>",
    `<script>window.addEventListener('DOMContentLoaded',function(){setTimeout(function(){window.print()},500)})</script></body>`,
  )
  const blob = new Blob([withPrint], { type: "text/html;charset=utf-8" })
  const url  = URL.createObjectURL(blob)
  window.open(url, "_blank", "noopener")
  setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

// ── Component ──────────────────────────────────────────────────────────────

const QTDS_PADRAO = [100, 300, 500]

type Res = { proposta: PropostaCustom; telefone: string }

export function OrcamentoDigitalView({
  onSalvar,
  onVerKanban,
}: {
  onSalvar: (draft: Omit<PropostaCustom, "id" | "numero" | "cardId">) => PropostaCustom
  onVerKanban: () => void
}) {
  const [dimInput,   setDimInput]   = useState("")
  const [qtdsSel,    setQtdsSel]   = useState<number[]>([100, 300, 500])
  const [customQtd,  setCustomQtd] = useState("")
  const [showCustom, setShowCustom] = useState(false)
  const [nome,       setNome]       = useState("")
  const [tel,        setTel]        = useState("")
  const [obs,        setObs]        = useState("")
  const [showObs,    setShowObs]   = useState(false)
  const [resultado,  setRes]        = useState<Res | null>(null)
  const [erro,       setErro]       = useState("")

  const dims = useMemo(() => {
    const parsed = parseDims(dimInput)
    if (!parsed) return null
    const [a, l, p] = parsed
    const n = calcN(a, l, p)
    if (n === 0) return null
    return { a, l, p, n, fw: +(2 * (l + p) + 1.5).toFixed(2), fh: +(a + 2 * p).toFixed(2) }
  }, [dimInput])

  const todasQtds = useMemo(() => {
    const extra = parseInt(customQtd)
    const base  = [...qtdsSel]
    if (isFinite(extra) && extra > 0 && !base.includes(extra)) base.push(extra)
    return [...new Set(base)].sort((a, b) => a - b)
  }, [qtdsSel, customQtd])

  const precos = useMemo(() => {
    if (!dims) return []
    return todasQtds.map(q => ({
      q,
      total: charm(precoNosso(q, dims.n)),
      unit:  charm(precoNosso(q, dims.n) / q),
    }))
  }, [dims, todasQtds])

  function toggleQtd(q: number) {
    setQtdsSel(prev =>
      prev.includes(q) ? prev.filter(x => x !== q) : [...prev, q].sort((a, b) => a - b)
    )
  }

  function gerar() {
    setErro("")
    if (!dims) {
      setErro(dimInput.trim() ? "Não reconheci — tente: 10 x 6 x 4" : "Cole ou informe as dimensões.")
      return
    }
    if (precos.length === 0) { setErro("Selecione ao menos uma quantidade."); return }
    if (!nome.trim())        { setErro("Informe o nome do cliente."); return }

    const midIdx = Math.floor(precos.length / 2)
    const linhas: LinhaPropostaCustom[] = precos.map((r, i) => ({
      id: crypto.randomUUID(), quantidade: r.q, unitario: r.unit, ativa: true, isIdeal: i === midIdx,
    }))

    const draft: Omit<PropostaCustom, "id" | "numero" | "cardId"> = {
      nomeCliente: nome.trim(),
      descricao:   "Caixinha Personalizada — Impressão Digital 4/4",
      material:    "Couché 300g",
      dimensoes:   `${dims.a} × ${dims.l} × ${dims.p} cm (Alt × Larg × Prof)`,
      incluirVerniz: false, comFaca: false, valorFaca: 0, numSKUs: 1,
      validadeDias: 7, obsCliente: obs.trim(),
      data:        new Date().toLocaleString("pt-BR"),
      linhas, parcFator: 0,
    }

    setRes({ proposta: onSalvar(draft), telefone: tel.trim() })
  }

  function reset() {
    setRes(null); setErro("")
    setDimInput(""); setNome(""); setTel(""); setObs("")
    setQtdsSel([100, 300, 500]); setCustomQtd(""); setShowCustom(false); setShowObs(false)
  }

  // ── Tela de resultado ────────────────────────────────────────────────────────
  if (resultado) {
    const p = resultado.proposta
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 gap-6">

        <div className="w-14 h-14 rounded-2xl bg-[#8456e8] flex items-center justify-center shadow-[0_4px_16px_rgba(80,9,196,0.3)]">
          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>

        <div className="text-center space-y-1">
          <p className="text-[18px] font-bold text-[#191625]">{p.nomeCliente}</p>
          <p className="text-[12px] text-[#8E8E93]">{p.numero} · {p.dimensoes}</p>
        </div>

        {/* Tabela de preços */}
        <div className="w-full max-w-sm bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          {p.linhas.filter(l => l.ativa).map((l, i, arr) => {
            const total  = l.unitario * l.quantidade
            const isLast = i === arr.length - 1
            return (
              <div key={l.id}
                className={`flex items-center justify-between px-5 py-4 ${!isLast ? "border-b border-[rgba(60,60,67,0.08)]" : ""} ${l.isIdeal ? "bg-[#8456e8]/[0.04]" : ""}`}>
                <div>
                  <p className="text-[15px] font-bold text-[#191625]">{l.quantidade.toLocaleString("pt-BR")} un</p>
                  {l.isIdeal && (
                    <p className="text-[9px] font-bold text-[#8456e8] uppercase tracking-wider mt-0.5">Recomendado</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[16px] font-bold text-[#191625] tabular-nums">{brl(total)}</p>
                  <p className="text-[11px] text-[#8E8E93] tabular-nums">{brl(l.unitario)}/un</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Ações */}
        <div className="w-full max-w-sm space-y-2.5">
          <button
            onClick={() => openPdf(resultado.proposta, resultado.telefone || undefined)}
            className="w-full py-3.5 rounded-xl text-[14px] font-bold text-white bg-[#8456e8] hover:bg-[#3f078d] active:scale-[0.99] transition-all shadow-[0_2px_8px_rgba(80,9,196,0.25)]">
            Abrir PDF →
          </button>
          <button onClick={onVerKanban}
            className="w-full py-3 rounded-xl text-[13px] font-semibold text-[#8456e8] border border-[#8456e8]/25 hover:bg-[#8456e8]/[0.04] transition-colors">
            Ver no Kanban
          </button>
          <button onClick={reset}
            className="w-full py-2.5 rounded-xl text-[12px] text-[#8E8E93] hover:text-[#191625] border border-[rgba(0,0,0,0.08)] transition-colors">
            + Novo orçamento
          </button>
        </div>
      </div>
    )
  }

  // ── Formulário ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {/* ── 1. Medidas ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="px-4 pt-4 pb-3">
            <p className="text-[9.5px] font-bold uppercase tracking-widest text-[#8E8E93] mb-2.5">Medidas da caixa</p>
            <input
              type="text"
              value={dimInput}
              onChange={e => setDimInput(e.target.value)}
              placeholder="Cole do WhatsApp: 10x6x4  ·  10, 6, 4  ·  10 6 4 cm"
              autoComplete="off"
              className="w-full px-4 py-3 bg-[rgba(116,116,128,0.06)] rounded-xl text-[15px] font-medium text-[#191625] placeholder:text-[#898892] focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 transition-all"
            />
          </div>

          {dims ? (
            <div className="px-4 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#009351]" />
                <span className="text-[12px] font-semibold text-[#191625]">{dims.a} × {dims.l} × {dims.p} cm</span>
                <span className="text-[10px] text-[#C7C7CC]">·</span>
                <span className="text-[11px] text-[#8E8E93]">faca {dims.fw}×{dims.fh}</span>
              </div>
              <span className="text-[11px] font-semibold" style={{ color: "#8456e8" }}>
                {dims.n}×/A3
              </span>
            </div>
          ) : dimInput.trim() ? (
            <p className="px-4 pb-3 text-[11px] text-[#d33a3c]">Não reconheci — tente: 10 x 6 x 4</p>
          ) : null}
        </div>

        {/* ── 2. Quantidades + Preços ────────────────────────────────────── */}
        {dims && (
          <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
            <div className="px-4 pt-4 pb-2.5 border-b border-[rgba(60,60,67,0.08)]">
              <p className="text-[9.5px] font-bold uppercase tracking-widest text-[#8E8E93]">Quantidades</p>
            </div>

            {QTDS_PADRAO.map((q, i) => {
              const sel    = qtdsSel.includes(q)
              const prev   = precos.find(r => r.q === q)
              const isIdeal = i === 1
              return (
                <button key={q} type="button" onClick={() => toggleQtd(q)}
                  className={`w-full flex items-center justify-between px-4 py-3.5 border-b border-[rgba(60,60,67,0.07)] last:border-b-0 transition-colors text-left ${
                    !sel ? "opacity-40" : isIdeal ? "bg-[#8456e8]/[0.03]" : ""
                  }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      sel ? "border-[#8456e8] bg-[#8456e8]" : "border-[rgba(60,60,67,0.25)]"
                    }`}>
                      {sel && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-[14px] font-bold text-[#191625]">{q.toLocaleString("pt-BR")} un</p>
                      {isIdeal && (
                        <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#8456e8" }}>Recomendado</p>
                      )}
                    </div>
                  </div>
                  {prev && (
                    <div className="text-right">
                      <p className="text-[15px] font-bold text-[#191625] tabular-nums">{brl(prev.total)}</p>
                      <p className="text-[11px] text-[#8E8E93] tabular-nums">{brl(prev.unit)}/un</p>
                    </div>
                  )}
                </button>
              )
            })}

            {/* Outra quantidade */}
            <div className="px-4 py-3 border-t border-[rgba(60,60,67,0.07)]">
              {showCustom ? (
                <div className="flex items-center gap-3">
                  <input
                    type="number" min={1} autoFocus
                    value={customQtd}
                    onChange={e => setCustomQtd(e.target.value)}
                    placeholder="Ex: 200"
                    className="flex-1 px-3 py-2 bg-[rgba(116,116,128,0.06)] rounded-lg text-[14px] font-semibold text-[#191625] placeholder:text-[#C7C7CC] outline-none tabular-nums"
                  />
                  {customQtd && dims && isFinite(parseInt(customQtd)) && parseInt(customQtd) > 0 && (
                    <p className="text-[14px] font-bold tabular-nums text-[#191625] shrink-0">
                      {brl(charm(precoNosso(parseInt(customQtd), dims.n)))}
                    </p>
                  )}
                  <button onClick={() => { setShowCustom(false); setCustomQtd("") }}
                    className="text-[#8E8E93] hover:text-[#d33a3c] text-xl leading-none shrink-0 transition-colors">×</button>
                </div>
              ) : (
                <button onClick={() => setShowCustom(true)}
                  className="text-[12px] text-[#8E8E93] hover:text-[#8456e8] transition-colors">
                  + Outra quantidade
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── 3. Cliente ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="px-4 pt-4 pb-2.5 border-b border-[rgba(60,60,67,0.08)]">
            <p className="text-[9.5px] font-bold uppercase tracking-widest text-[#8E8E93]">Cliente</p>
          </div>
          <div className="divide-y divide-[rgba(60,60,67,0.07)]">
            <div className="px-4 py-3.5">
              <input
                type="text" value={nome} onChange={e => setNome(e.target.value)}
                placeholder="Nome do cliente *"
                className="w-full text-[15px] font-medium text-[#191625] placeholder:text-[#898892] bg-transparent outline-none"
              />
            </div>
            <div className="px-4 py-3.5">
              <input
                type="text" value={tel} onChange={e => setTel(e.target.value)}
                placeholder="Telefone ou e-mail"
                className="w-full text-[14px] text-[#191625] placeholder:text-[#898892] bg-transparent outline-none"
              />
            </div>
            {showObs ? (
              <div className="px-4 py-3.5">
                <textarea
                  value={obs} onChange={e => setObs(e.target.value)}
                  placeholder="Observações para o cliente..."
                  rows={2} autoFocus
                  className="w-full text-[13px] text-[#191625] placeholder:text-[#898892] bg-transparent outline-none resize-none"
                />
              </div>
            ) : (
              <button onClick={() => setShowObs(true)}
                className="w-full px-4 py-3.5 text-left text-[13px] text-[#898892] hover:text-[#8456e8] transition-colors">
                + Observação
              </button>
            )}
          </div>
        </div>

        {erro && (
          <p className="text-[12px] font-medium text-[#d33a3c] px-1">{erro}</p>
        )}

        {/* ── CTA ─────────────────────────────────────────────────────────── */}
        <button
          onClick={gerar}
          className="w-full py-4 rounded-2xl text-[15px] font-bold text-white bg-[#0b0914] hover:bg-[#333] active:scale-[0.99] transition-all">
          Gerar orçamento →
        </button>

        <div className="h-2" />
      </div>
    </div>
  )
}
