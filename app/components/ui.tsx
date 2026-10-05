"use client"

import React from "react"
import { brl, num, margemCls } from "../utils"
import { LinhaTabela, Calculo } from "../types"

export function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(60,60,67,0.12)" }}>
      <p className="text-[9.5px] uppercase tracking-wide font-semibold text-[#898892] mb-3">{label}</p>
      {children}
    </div>
  )
}

export function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10.5px] text-[rgba(60,60,67,0.55)] font-medium mb-1.5">{children}</p>
}

const inputCls = "w-full h-10 border rounded-xl px-3 text-[13px] text-[#191625] placeholder:text-[#898892] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] transition-all duration-150 hover:border-[rgba(60,60,67,0.25)]"

export function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={inputCls} style={{ borderColor: "rgba(60,60,67,0.18)" }} />
  )
}

export function NumberInput({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input type="number" value={value || ""} onChange={e => onChange(Number(e.target.value))}
      min={min} max={max} placeholder="0"
      className={`${inputCls} text-center font-semibold tabular-nums`}
      style={{ borderColor: "rgba(60,60,67,0.18)" }} />
  )
}

export function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-5 border transition-all duration-200 ${
      accent
        ? "bg-[#0b0914] shadow-sm"
        : "bg-white hover:shadow-md hover:-translate-y-px"
    }`}
    style={{ borderColor: accent ? "rgba(255,255,255,0.08)" : "rgba(60,60,67,0.08)" }}>
      <p className={`text-[9.5px] uppercase tracking-wide font-semibold mb-3 ${accent ? "text-[rgba(255,255,255,0.4)]" : "text-[#898892]"}`}>{label}</p>
      <p className={`text-[26px] font-semibold leading-none tracking-tight ${accent ? "text-white" : "text-[#191625]"}`}>{value}</p>
      {sub && <p className={`text-[11px] mt-2 leading-snug ${accent ? "text-[rgba(255,255,255,0.35)]" : "text-[rgba(60,60,67,0.45)]"}`}>{sub}</p>}
    </div>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-[9.5px] uppercase tracking-wide font-semibold text-[#898892] shrink-0 leading-none">{title}</p>
        <div className="flex-1 h-px" style={{ background: "rgba(60,60,67,0.1)" }} />
      </div>
      {children}
    </div>
  )
}

export function TH({ children, br, blue }: { children?: React.ReactNode; br?: boolean; blue?: boolean }) {
  return (
    <th className={`px-3 py-3 text-left text-[9.5px] uppercase font-semibold whitespace-nowrap
      ${blue ? "text-[#8456e8]" : "text-[#898892]"}
      ${br ? "border-r border-[rgba(60,60,67,0.08)]" : ""}`}>
      {children}
    </th>
  )
}

export function TD({ children, bold, muted, blue, green, mono, br }: {
  children: React.ReactNode; bold?: boolean; muted?: boolean; blue?: boolean; green?: boolean; mono?: boolean; br?: boolean
}) {
  return (
    <td className={`px-3 py-2.5 whitespace-nowrap text-[12.5px]
      ${bold ? "font-semibold" : ""}
      ${muted ? "text-[#898892]" : blue ? "text-[#8456e8]" : green ? "text-[#009351]" : "text-[#191625]"}
      ${mono ? "tabular-nums" : ""}
      ${br ? "border-r border-[rgba(60,60,67,0.08)]" : ""}`}>
      {children}
    </td>
  )
}

type CampoCusto = "custoPapel" | "custoImpressao" | "custoCorte" | "custoVerniz" | "custoColagem" | "custoArte" | "custoUnitSF" | "custoUnitCF"
type CustosCustomRow = Partial<Record<CampoCusto, number>>

export function TabelaRow({ linha, comFaca, incluirVerniz, isMin, isIdeal, custosCustom, onCustoEdit, customPacotes, onPacoteEdit, acabamentos, acabamentoCustos, onAcabamentoCustoEdit }: {
  linha: LinhaTabela; comFaca: boolean; incluirVerniz: boolean; isMin: boolean; isIdeal: boolean
  custosCustom?: CustosCustomRow
  onCustoEdit?: (qtd: number, campo: CampoCusto, val: number | null) => void
  customPacotes?: number
  onPacoteEdit?: (qtd: number, val: number | null) => void
  acabamentos?: string[]
  acabamentoCustos?: Record<string, number>
  onAcabamentoCustoEdit?: (nome: string, qtd: number, val: number | null) => void
}) {
  const [editando, setEditando]           = React.useState<CampoCusto | null>(null)
  const [tempVal, setTempVal]             = React.useState("")
  const [editandoPacote, setEditandoPacote] = React.useState(false)
  const [tempPacote, setTempPacote]         = React.useState("")
  const [editandoAcab, setEditandoAcab]   = React.useState<string | null>(null)
  const [tempAcab, setTempAcab]           = React.useState("")

  const cc = custosCustom ?? {}
  const papel      = cc.custoPapel      ?? linha.custoPapel
  const impressao  = cc.custoImpressao  ?? linha.custoImpressao
  const corte      = cc.custoCorte      ?? linha.custoCorte
  const verniz     = cc.custoVerniz     ?? linha.custoVerniz
  const colagem    = cc.custoColagem    ?? linha.custoColagem
  const arte       = cc.custoArte       ?? linha.custoArte

  const totalAcabamentos = (acabamentos ?? []).reduce((s, n) => s + (acabamentoCustos?.[n] ?? 0), 0)
  const componenteSF = papel + impressao + corte + (incluirVerniz ? verniz : 0) + colagem + arte + totalAcabamentos
  const diffFaca     = linha.custoTotalComFaca - linha.custoTotalSemFaca
  // totalSF e totalCF são sempre baseados nos componentes (custoUnitSF só existe como campo legado)
  const totalSF  = componenteSF
  const totalCF  = totalSF + diffFaca
  const unitSF   = linha.quantidade > 0 ? totalSF / linha.quantidade : 0
  const unitCF   = linha.quantidade > 0 ? totalCF / linha.quantidade : 0
  const margemSF = linha.precoSemFaca > 0 ? (linha.precoSemFaca - totalSF) / linha.precoSemFaca * 100 : linha.margemSemFaca
  const margemCF = linha.precoComFaca > 0 ? (linha.precoComFaca - totalCF) / linha.precoComFaca * 100 : linha.margemComFaca

  const rowCls = isIdeal ? "bg-[#8456e8]/[0.04] hover:bg-[#8456e8]/[0.07]" : isMin ? "bg-[#c57800]/[0.04] hover:bg-[#c57800]/[0.07]" : "hover:bg-[rgba(0,0,0,0.02)]"
  const stickyBg = isIdeal ? "bg-[#EEF5FF]" : isMin ? "bg-[#FFF8EE]" : "bg-white"
  const leftBorder = isIdeal ? "border-l-[3px] border-l-[#8456e8]" : isMin ? "border-l-[3px] border-l-[#c57800]" : ""

  function iniciar(campo: CampoCusto, val: number) {
    setEditando(campo)
    setTempVal(val.toFixed(2).replace(".", ","))
  }

  function confirmar(campo: CampoCusto) {
    const val = parseFloat(tempVal.replace(",", "."))
    if (!isNaN(val) && val >= 0) onCustoEdit?.(linha.quantidade, campo, val)
    setEditando(null)
  }

  function EditCell({ campo, val, muted, br }: { campo: CampoCusto; val: number; muted?: boolean; br?: boolean }) {
    const isCustom = cc[campo] != null
    const isEditing = editando === campo
    const base = `px-3 py-2.5 whitespace-nowrap tabular-nums text-[12.5px]`

    if (isEditing) return (
      <td className="px-1.5 py-1.5 whitespace-nowrap">
        <input autoFocus value={tempVal}
          onChange={e => setTempVal(e.target.value)}
          onBlur={() => confirmar(campo)}
          onKeyDown={e => { if (e.key === "Enter") confirmar(campo); if (e.key === "Escape") setEditando(null) }}
          className="w-[88px] h-7 border-2 border-[#8456e8] rounded-lg px-2 text-[12px] font-mono text-[#191625] bg-white focus:outline-none tabular-nums text-right"
        />
      </td>
    )

    return (
      <td
        title="Duplo clique para editar"
        onDoubleClick={() => iniciar(campo, val)}
        className={`${base} select-none cursor-pointer group/ec transition-colors
          ${isCustom ? "text-[#8456e8] font-semibold" : muted ? "text-[#898892]" : "text-[#191625]"}
          ${br ? "border-r border-[rgba(60,60,67,0.08)]" : ""}`}
      >
        <span className="flex items-center gap-1">
          {brl(val)}
          {isCustom
            ? <button className="opacity-0 group-hover/ec:opacity-100 text-[9px] text-[#898892] hover:text-[#e53e3e] transition-all leading-none"
                onDoubleClick={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onCustoEdit?.(linha.quantidade, campo, null) }}>✕</button>
            : <span className="opacity-0 group-hover/ec:opacity-60 text-[9px] text-[#8456e8] leading-none transition-all">✎</span>
          }
        </span>
      </td>
    )
  }

  const anyCustom = Object.keys(cc).some(k => k !== "custoUnitSF" && k !== "custoUnitCF")

  return (
    <tr className={`transition-colors ${rowCls}`}>
      <td className={`sticky left-0 px-4 py-3 font-bold text-[#191625] whitespace-nowrap ${stickyBg} ${leftBorder}`}
        style={{ borderRight: "1px solid rgba(60,60,67,0.08)" }}>
        <span className="flex items-center gap-2">
          {num(linha.quantidade)}
          {isIdeal && <span className="text-[8.5px] bg-[#8456e8] text-white px-2 py-0.5 rounded-full font-bold tracking-wide">IDEAL</span>}
          {isMin && !isIdeal && <span className="text-[8.5px] bg-[#c57800] text-white px-2 py-0.5 rounded-full font-bold tracking-wide">MÍN</span>}
        </span>
      </td>
      <TD muted mono>{num(linha.folhasReais)}</TD>
      <TD muted mono>{num(linha.folhasComAcrescimo)}</TD>
      {/* PACOTE — editável (nº de pacotes de 100 folhas) */}
      {editandoPacote ? (
        <td className="px-1.5 py-1.5 whitespace-nowrap border-r border-[rgba(60,60,67,0.08)]">
          <input autoFocus value={tempPacote}
            onChange={e => setTempPacote(e.target.value)}
            onBlur={() => {
              const v = parseInt(tempPacote, 10)
              if (!isNaN(v) && v >= 1) onPacoteEdit?.(linha.quantidade, v)
              setEditandoPacote(false)
            }}
            onKeyDown={e => {
              if (e.key === "Enter") {
                const v = parseInt(tempPacote, 10)
                if (!isNaN(v) && v >= 1) onPacoteEdit?.(linha.quantidade, v)
                setEditandoPacote(false)
              }
              if (e.key === "Escape") setEditandoPacote(false)
            }}
            className="w-14 h-7 border-2 border-[#8456e8] rounded-lg px-2 text-[12px] font-mono text-[#191625] bg-white focus:outline-none tabular-nums text-center"
          />
        </td>
      ) : (
        <td
          title="Duplo clique para editar nº de pacotes"
          onDoubleClick={() => {
            setTempPacote(String(customPacotes ?? linha.folhasPacote / 100))
            setEditandoPacote(true)
          }}
          className={`px-3 py-2.5 whitespace-nowrap tabular-nums text-[12.5px] font-semibold select-none cursor-pointer border-r border-[rgba(60,60,67,0.08)] group/pc transition-colors
            ${customPacotes !== undefined ? "text-[#8456e8]" : "text-[#191625]"}`}
        >
          <span className="flex items-center gap-1">
            {customPacotes ?? linha.folhasPacote / 100}
            {customPacotes !== undefined
              ? <button className="opacity-0 group-hover/pc:opacity-100 text-[9px] text-[#898892] hover:text-[#e53e3e] transition-all leading-none"
                  onClick={e => { e.stopPropagation(); onPacoteEdit?.(linha.quantidade, null) }}>✕</button>
              : <span className="opacity-0 group-hover/pc:opacity-60 text-[9px] text-[#8456e8] leading-none transition-all">✎</span>
            }
          </span>
        </td>
      )}
      <EditCell campo="custoPapel"     val={papel}     muted />
      <EditCell campo="custoImpressao" val={impressao} muted />
      <EditCell campo="custoCorte"     val={corte}     muted />
      {incluirVerniz && <EditCell campo="custoVerniz" val={verniz} muted />}
      <EditCell campo="custoColagem" val={colagem} muted />
      <EditCell campo="custoArte"    val={arte}    muted br={!acabamentos?.length} />
      {(acabamentos ?? []).map((nome, i) => {
        const val = acabamentoCustos?.[nome] ?? 0
        const isCustom = val > 0
        const isLast = i === (acabamentos?.length ?? 0) - 1
        if (editandoAcab === nome) return (
          <td key={nome} className="px-1.5 py-1.5 whitespace-nowrap">
            <input autoFocus value={tempAcab}
              onChange={e => setTempAcab(e.target.value)}
              onBlur={() => {
                const v = parseFloat(tempAcab.replace(",", "."))
                if (!isNaN(v) && v >= 0) onAcabamentoCustoEdit?.(nome, linha.quantidade, v === 0 ? null : v)
                setEditandoAcab(null)
              }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const v = parseFloat(tempAcab.replace(",", "."))
                  if (!isNaN(v) && v >= 0) onAcabamentoCustoEdit?.(nome, linha.quantidade, v === 0 ? null : v)
                  setEditandoAcab(null)
                }
                if (e.key === "Escape") setEditandoAcab(null)
              }}
              className="w-[88px] h-7 border-2 border-[#8456e8] rounded-lg px-2 text-[12px] font-mono text-[#191625] bg-white focus:outline-none tabular-nums text-right"
            />
          </td>
        )
        return (
          <td key={nome}
            title="Duplo clique para editar"
            onDoubleClick={() => { setTempAcab(val.toFixed(2).replace(".", ",")); setEditandoAcab(nome) }}
            className={`px-3 py-2.5 whitespace-nowrap tabular-nums text-[12.5px] select-none cursor-pointer group/acab transition-colors
              ${isCustom ? "text-[#8456e8] font-semibold" : "text-[#898892]"}
              ${isLast ? "border-r border-[rgba(60,60,67,0.08)]" : ""}`}
          >
            <span className="flex items-center gap-1">
              {brl(val)}
              {isCustom
                ? <button className="opacity-0 group-hover/acab:opacity-100 text-[9px] text-[#898892] hover:text-[#e53e3e] transition-all leading-none"
                    onDoubleClick={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); onAcabamentoCustoEdit?.(nome, linha.quantidade, null) }}>✕</button>
                : <span className="opacity-0 group-hover/acab:opacity-60 text-[9px] text-[#8456e8] leading-none transition-all">✎</span>
              }
            </span>
          </td>
        )
      })}
      <td className={`px-3 py-2.5 whitespace-nowrap tabular-nums text-[12.5px] ${anyCustom ? "text-[#8456e8] font-semibold" : "text-[#191625]"}`}>{brl(totalSF)}</td>
      <TD blue bold mono>{brl(linha.precoSemFaca)}</TD>
      {comFaca && <>
        <td className={`px-3 py-2.5 whitespace-nowrap tabular-nums text-[12.5px] ${anyCustom ? "text-[#8456e8] font-semibold" : "text-[#191625]"}`}>{brl(totalCF)}</td>
        <TD blue bold mono>{brl(linha.precoComFaca)}</TD>
      </>}
      <TD mono>{brl(unitSF)}</TD>
      {comFaca && <TD mono>{brl(unitCF)}</TD>}
      <td className={`px-3 py-2.5 whitespace-nowrap font-mono ${margemCls(margemSF)}`}>{num(margemSF, 1)}%</td>
      {comFaca && <td className={`px-3 py-2.5 whitespace-nowrap font-mono ${margemCls(margemCF)}`}>{num(margemCF, 1)}%</td>}
      <TD muted mono>{brl(linha.parcela12xSemFaca)}</TD>
      {comFaca && <TD muted mono>{brl(linha.parcela12xComFaca)}</TD>}
    </tr>
  )
}

export function AnaliseEstrategica({ calculo, comFaca, cliente }: { calculo: Calculo; comFaca: boolean; cliente: string }) {
  const { tabela, sweetSpotMinimoQtd, sweetSpotIdealQtd } = calculo
  if (!tabela.length) return null

  const melhorMargem = tabela.reduce((b, c) => c.margemSemFaca > b.margemSemFaca ? c : b, tabela[0])
  const menorUnit    = tabela.reduce((b, c) => c.unitarioSemFaca < b.unitarioSemFaca ? c : b, tabela[0])
  const sweetMin     = tabela.find(l => l.quantidade === sweetSpotMinimoQtd) ?? tabela[0]
  const sweetIdeal   = tabela.find(l => l.quantidade === sweetSpotIdealQtd)  ?? tabela[tabela.length - 1]

  const precoKey = comFaca ? "precoComFaca" : "precoSemFaca"
  const unitKey  = comFaca ? "unitarioComFaca" : "unitarioSemFaca"
  const margKey  = comFaca ? "margemComFaca" : "margemSemFaca"
  const lucroKey = comFaca ? "lucroComFaca" : "lucroSemFaca"

  const cards = [
    { tag: "Para o cliente",       desc: "Menor custo por unidade",      linha: menorUnit,    cor: "border-[#8456e8]/15 bg-[#8456e8]/[0.03]", tagCor: "bg-[#8456e8]/10 text-[#8456e8]" },
    { tag: "Maior rentabilidade",  desc: "Melhor margem para a gráfica", linha: melhorMargem, cor: "border-[#009351]/20 bg-[#009351]/[0.03]",  tagCor: "bg-[#009351]/10 text-[#009351]" },
    { tag: "Sweet spot ideal",     desc: "Equilíbrio preço × lucro",     linha: sweetIdeal,   cor: "border-[#c57800]/20 bg-[#c57800]/[0.03]",  tagCor: "bg-[#c57800]/10 text-[#c57800]" },
  ]

  return (
    <Section title="Análise estratégica">
      <div className="grid grid-cols-3 gap-3 mb-3">
        {cards.map(c => (
          <div key={c.tag} className={`rounded-xl border p-5 bg-white ${c.cor}`}>
            <span className={`text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${c.tagCor}`}>{c.tag}</span>
            <p className="text-[rgba(60,60,67,0.55)] text-[11px] mt-3 mb-3 leading-snug">{c.desc}</p>
            <p className="text-[26px] font-semibold text-[#191625] leading-none tabular-nums">{brl(c.linha[precoKey as keyof LinhaTabela] as number)}</p>
            <p className="text-[11px] text-[rgba(60,60,67,0.5)] mt-1.5 tabular-nums">
              {num(c.linha.quantidade)} un · {brl(c.linha[unitKey as keyof LinhaTabela] as number)}/un
            </p>
            <p className={`text-[11.5px] mt-1.5 font-semibold tabular-nums ${margemCls(c.linha[margKey as keyof LinhaTabela] as number)}`}>
              {num(c.linha[margKey as keyof LinhaTabela] as number, 1)}% · lucro {brl(c.linha[lucroKey as keyof LinhaTabela] as number)}
            </p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl p-5" style={{ border: "1px solid rgba(60,60,67,0.08)" }}>
        <p className="text-[9px] uppercase tracking-wide font-bold text-[#898892] mb-3">Recomendação de fechamento</p>
        <p className="text-[rgba(60,60,67,0.7)] leading-relaxed text-[13px]">
          {cliente ? <strong className="text-[#191625]">{cliente}:</strong> : null}{" "}
          Apresente <strong className="text-[#191625]">{num(sweetIdeal.quantidade)} unidades</strong> como ponto ideal —{" "}
          {brl(sweetIdeal[precoKey as keyof LinhaTabela] as number)} com margem de{" "}
          <span className={margemCls(sweetIdeal[margKey as keyof LinhaTabela] as number)}>
            {num(sweetIdeal[margKey as keyof LinhaTabela] as number, 1)}%
          </span>.{" "}
          Se houver resistência, use <strong className="text-[#191625]">{num(sweetMin.quantidade)} un</strong> como mínimo aceitável.
          {comFaca && " A faca é investimento único — amortizada já na segunda tiragem."}
        </p>
      </div>
    </Section>
  )
}

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 select-none">
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-3xl bg-white flex items-center justify-center shadow-sm" style={{ border: "1px solid rgba(60,60,67,0.1)" }}>
          <svg className="w-11 h-11 text-[rgba(60,60,67,0.2)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
        </div>
        <div className="absolute -bottom-2 -right-2 w-7 h-7 rounded-xl bg-[#8456e8] flex items-center justify-center shadow-md shadow-[#8456e8]/30">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
      </div>
      <h2 className="text-[#191625] font-bold text-[17px] mb-2.5 tracking-tight">Comece um orçamento</h2>
      <p className="text-[rgba(60,60,67,0.5)] text-[13px] max-w-[220px] leading-relaxed">
        Preencha as dimensões da caixa na barra lateral para calcular a proposta.
      </p>
      <div className="mt-6 px-4 py-2.5 bg-white rounded-xl inline-flex items-center gap-1.5" style={{ border: "1px solid rgba(60,60,67,0.1)" }}>
        <svg className="w-3 h-3 text-[rgba(60,60,67,0.25)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <p className="text-[11px] text-[#898892]">Largura · Altura · Profundidade</p>
      </div>
    </div>
  )
}
