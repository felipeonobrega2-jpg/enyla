"use client"

import { useState, useMemo } from "react"
import { gerarHtmlPropostaCustom } from "../pdf"
import type { PropostaCustom, LinhaPropostaCustom } from "../types"
import { brl } from "../utils"
import { facaAberta, folhaDaFaca, quantidadesDa, precoDigital, PrecoDigital, RegraDigital, REGRA_DIGITAL_PADRAO } from "../lib/precoDigital"

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


type Res = { proposta: PropostaCustom; telefone: string }

export function OrcamentoDigitalView({
  onSalvar,
  onVerKanban,
  regra = REGRA_DIGITAL_PADRAO,
  onRegra,
}: {
  onSalvar: (draft: Omit<PropostaCustom, "id" | "numero" | "cardId">) => PropostaCustom
  onVerKanban: () => void
  regra?: RegraDigital                      // preço = custo da Villa + arte + margem (por pedido)
  onRegra?: (r: RegraDigital) => void
}) {
  const [dimInput,   setDimInput]   = useState("")
  const [qtdsSel,    setQtdsSel]   = useState<number[]>([20, 50, 100])
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
    const faca = facaAberta(a, l, p)
    return { a, l, p, fw: faca.largura, fh: faca.altura, folha: folhaDaFaca(faca.largura, faca.altura) }
  }, [dimInput])

  const todasQtds = useMemo(() => {
    const extra = parseInt(customQtd)
    const base  = [...qtdsSel]
    if (isFinite(extra) && extra > 0 && !base.includes(extra)) base.push(extra)
    return [...new Set(base)].sort((a, b) => a - b)
  }, [qtdsSel, customQtd])

  const precos = useMemo(() => {
    if (!dims) return []
    if (!dims?.folha) return []
    return todasQtds.map(q => precoDigital(q, dims.folha!, regra)).filter((x): x is PrecoDigital => !!x)
  }, [dims, todasQtds, regra])
  const qtdsDaFolha = dims?.folha ? quantidadesDa(dims.folha) : []

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
    if (!dims.folha) { setErro("A caixa aberta não cabe numa A3: consulte a Villa."); return }
    if (precos.length === 0) { setErro("Selecione ao menos uma quantidade."); return }
    if (!nome.trim())        { setErro("Informe o nome do cliente."); return }

    const midIdx = Math.floor(precos.length / 2)
    const linhas: LinhaPropostaCustom[] = precos.map((r, i) => ({
      id: crypto.randomUUID(), quantidade: r.q, unitario: r.unit, ativa: true, isIdeal: i === midIdx,
    }))

    const draft: Omit<PropostaCustom, "id" | "numero" | "cardId"> = {
      nomeCliente: nome.trim(),
      descricao:   "Caixinha Personalizada — Impressão Digital 4/4",
      material:    "Triplex 300g com laminação fosca ou brilhante",
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
    setQtdsSel([20, 50, 100]); setCustomQtd(""); setShowCustom(false); setShowObs(false)
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
                    <p className="text-[9px] font-bold text-[#8456e8] mt-0.5">Recomendado</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[16px] font-bold text-[#191625] ds-num">{brl(total)}</p>
                  <p className="text-[11px] text-[#8E8E93] ds-num">{brl(l.unitario)}/un</p>
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
                <span className="text-[11px] text-[#8E8E93]">faca {dims.fw.toLocaleString("pt-BR")} × {dims.fh.toLocaleString("pt-BR")} cm</span>
              </div>
              <span className="text-[11px] font-semibold" style={{ color: dims.folha ? "#8456e8" : "#d33a3c" }}>
                {dims.folha ? `cabe na ${dims.folha}` : "maior que A3"}
              </span>
            </div>
          ) : dimInput.trim() ? (
            <p className="px-4 pb-3 text-[11px] text-[#d33a3c]">Não reconheci — tente: 10 x 6 x 4</p>
          ) : null}
        </div>

        {/* ── 2. Quantidades + Preços ────────────────────────────────────── */}
        {dims && (
          <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
            <div className="px-4 pt-4 pb-2.5 border-b border-[rgba(60,60,67,0.08)] flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[9.5px] font-bold uppercase tracking-widest text-[#8E8E93]">Quantidades</p>
              <div className="flex items-center gap-1.5 text-[11px] text-[#5e5c68]" title="Preço do pedido = custo da Villa + arte + a sua margem">
                <span>Villa +</span>
                <label className="flex items-center gap-1">arte R$<input type="number" min={0} value={regra.arte} onChange={e => onRegra?.({ ...regra, arte: Math.max(0, Number(e.target.value) || 0) })} disabled={!onRegra}
                  className="w-12 h-6 px-1.5 rounded-md bg-[rgba(116,116,128,0.08)] text-[11.5px] font-semibold text-[#191625] ds-num outline-none focus:ring-2 focus:ring-[#8456e8]/20" /></label>
                <span>+</span>
                <label className="flex items-center gap-1">margem R$<input type="number" min={0} value={regra.margem} onChange={e => onRegra?.({ ...regra, margem: Math.max(0, Number(e.target.value) || 0) })} disabled={!onRegra}
                  className="w-14 h-6 px-1.5 rounded-md bg-[rgba(116,116,128,0.08)] text-[11.5px] font-semibold text-[#191625] ds-num outline-none focus:ring-2 focus:ring-[#8456e8]/20" /></label>
              </div>
            </div>

            {!dims.folha && <p className="px-4 py-3 text-[12px] text-[#d33a3c]">A caixa aberta ({dims.fw.toLocaleString("pt-BR")} × {dims.fh.toLocaleString("pt-BR")} cm) não cabe numa A3. Peça o valor para a Villa.</p>}
            {qtdsDaFolha.map(q => {
              const sel    = qtdsSel.includes(q)
              const prev   = precos.find(r => r.q === q)
              const isIdeal = q === 100
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
                      <p className="text-[15px] font-bold text-[#191625] ds-num">{brl(prev.total)}</p>
                      <p className="text-[11px] text-[#8E8E93] ds-num">{brl(prev.unit)}/un</p>
                      <p className="text-[10.5px] text-[#898892] ds-num mt-0.5" title="Só para você: não vai no PDF">Villa {brl(prev.custo)} · arte {brl(prev.arte)} · você <span className="font-semibold text-[#009351]">{brl(prev.margem)}</span></p>
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
                    className="flex-1 px-3 py-2 bg-[rgba(116,116,128,0.06)] rounded-lg text-[14px] font-semibold text-[#191625] placeholder:text-[#C7C7CC] outline-none ds-num"
                  />
                  {customQtd && dims && isFinite(parseInt(customQtd)) && parseInt(customQtd) > 0 && (
                    <p className="text-[14px] font-bold ds-num text-[#191625] shrink-0">
                      {dims.folha && precoDigital(parseInt(customQtd), dims.folha, regra) ? brl(precoDigital(parseInt(customQtd), dims.folha, regra)!.total) : "consultar a Villa"}
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
