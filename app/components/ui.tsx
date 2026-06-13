"use client"

import React from "react"
import { brl, num, margemCls } from "../utils"
import { LinhaTabela, Calculo } from "../types"

export function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(60,60,67,0.12)" }}>
      <p className="text-[9.5px] uppercase tracking-[0.13em] font-semibold text-[rgba(60,60,67,0.4)] mb-3">{label}</p>
      {children}
    </div>
  )
}

export function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10.5px] text-[rgba(60,60,67,0.55)] font-medium mb-1.5">{children}</p>
}

const inputCls = "w-full h-10 border rounded-xl px-3 text-[13px] text-[#1C1C1E] placeholder:text-[rgba(60,60,67,0.3)] bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all duration-150 hover:border-[rgba(60,60,67,0.25)]"

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
        ? "bg-[#1C1C1E] shadow-sm"
        : "bg-white hover:shadow-md hover:-translate-y-px"
    }`}
    style={{ borderColor: accent ? "rgba(255,255,255,0.08)" : "rgba(60,60,67,0.08)" }}>
      <p className={`text-[9.5px] uppercase tracking-[0.13em] font-semibold mb-3 ${accent ? "text-[rgba(255,255,255,0.4)]" : "text-[rgba(60,60,67,0.4)]"}`}>{label}</p>
      <p className={`text-[26px] font-black leading-none tracking-tight ${accent ? "text-white" : "text-[#1C1C1E]"}`}>{value}</p>
      {sub && <p className={`text-[11px] mt-2 leading-snug ${accent ? "text-[rgba(255,255,255,0.35)]" : "text-[rgba(60,60,67,0.45)]"}`}>{sub}</p>}
    </div>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-[9.5px] uppercase tracking-[0.13em] font-semibold text-[rgba(60,60,67,0.4)] shrink-0 leading-none">{title}</p>
        <div className="flex-1 h-px" style={{ background: "rgba(60,60,67,0.1)" }} />
      </div>
      {children}
    </div>
  )
}

export function TH({ children, br, blue }: { children?: React.ReactNode; br?: boolean; blue?: boolean }) {
  return (
    <th className={`px-3 py-3 text-left text-[9.5px] uppercase tracking-[0.08em] font-bold whitespace-nowrap
      ${blue ? "text-[#007AFF]" : "text-[rgba(60,60,67,0.4)]"}
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
      ${muted ? "text-[rgba(60,60,67,0.4)]" : blue ? "text-[#007AFF]" : green ? "text-[#34C759]" : "text-[#1C1C1E]"}
      ${mono ? "tabular-nums" : ""}
      ${br ? "border-r border-[rgba(60,60,67,0.08)]" : ""}`}>
      {children}
    </td>
  )
}

export function TabelaRow({ linha, comFaca, incluirVerniz, isMin, isIdeal }: {
  linha: LinhaTabela; comFaca: boolean; incluirVerniz: boolean; isMin: boolean; isIdeal: boolean
}) {
  const rowCls = isIdeal ? "bg-[#007AFF]/[0.04] hover:bg-[#007AFF]/[0.07]" : isMin ? "bg-[#FF9500]/[0.04] hover:bg-[#FF9500]/[0.07]" : "hover:bg-[rgba(0,0,0,0.02)]"
  const stickyBg = isIdeal ? "bg-[#EEF5FF]" : isMin ? "bg-[#FFF8EE]" : "bg-white"
  const leftBorder = isIdeal ? "border-l-[3px] border-l-[#007AFF]" : isMin ? "border-l-[3px] border-l-[#FF9500]" : ""

  return (
    <tr className={`transition-colors ${rowCls}`}>
      <td className={`sticky left-0 px-4 py-3 font-bold text-[#1C1C1E] whitespace-nowrap ${stickyBg} ${leftBorder}`}
        style={{ borderRight: "1px solid rgba(60,60,67,0.08)" }}>
        <span className="flex items-center gap-2">
          {num(linha.quantidade)}
          {isIdeal && <span className="text-[8.5px] bg-[#007AFF] text-white px-2 py-0.5 rounded-full font-bold tracking-wide">IDEAL</span>}
          {isMin && !isIdeal && <span className="text-[8.5px] bg-[#FF9500] text-white px-2 py-0.5 rounded-full font-bold tracking-wide">MÍN</span>}
        </span>
      </td>
      <TD muted mono>{num(linha.folhasReais)}</TD>
      <TD muted mono>{num(linha.folhasComAcrescimo)}</TD>
      <TD bold mono br>{num(linha.folhasPacote)}</TD>
      <TD muted mono>{brl(linha.custoPapel)}</TD>
      <TD muted mono>{brl(linha.custoImpressao)}</TD>
      <TD muted mono>{brl(linha.custoCorte)}</TD>
      {incluirVerniz && <TD muted mono>{brl(linha.custoVerniz)}</TD>}
      <TD muted mono>{brl(linha.custoColagem)}</TD>
      <TD muted mono br>{brl(linha.custoArte)}</TD>
      <TD mono>{brl(linha.custoTotalSemFaca)}</TD>
      <TD blue bold mono>{brl(linha.precoSemFaca)}</TD>
      {comFaca && <><TD mono>{brl(linha.custoTotalComFaca)}</TD><TD blue bold mono>{brl(linha.precoComFaca)}</TD></>}
      <TD mono>{brl(linha.unitarioSemFaca)}</TD>
      {comFaca && <TD mono>{brl(linha.unitarioComFaca)}</TD>}
      <td className={`px-3 py-2.5 whitespace-nowrap font-mono ${margemCls(linha.margemSemFaca)}`}>{num(linha.margemSemFaca, 1)}%</td>
      {comFaca && <td className={`px-3 py-2.5 whitespace-nowrap font-mono ${margemCls(linha.margemComFaca)}`}>{num(linha.margemComFaca, 1)}%</td>}
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
    { tag: "Para o cliente",       desc: "Menor custo por unidade",      linha: menorUnit,    cor: "border-[#007AFF]/15 bg-[#007AFF]/[0.03]", tagCor: "bg-[#007AFF]/10 text-[#007AFF]" },
    { tag: "Maior rentabilidade",  desc: "Melhor margem para a gráfica", linha: melhorMargem, cor: "border-[#34C759]/20 bg-[#34C759]/[0.03]",  tagCor: "bg-[#34C759]/10 text-[#34C759]" },
    { tag: "Sweet spot ideal",     desc: "Equilíbrio preço × lucro",     linha: sweetIdeal,   cor: "border-[#FF9500]/20 bg-[#FF9500]/[0.03]",  tagCor: "bg-[#FF9500]/10 text-[#FF9500]" },
  ]

  return (
    <Section title="Análise estratégica">
      <div className="grid grid-cols-3 gap-3 mb-3">
        {cards.map(c => (
          <div key={c.tag} className={`rounded-xl border p-5 bg-white ${c.cor}`}>
            <span className={`text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-[0.1em] ${c.tagCor}`}>{c.tag}</span>
            <p className="text-[rgba(60,60,67,0.55)] text-[11px] mt-3 mb-3 leading-snug">{c.desc}</p>
            <p className="text-[26px] font-black text-[#1C1C1E] leading-none tabular-nums">{brl(c.linha[precoKey as keyof LinhaTabela] as number)}</p>
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
        <p className="text-[9px] uppercase tracking-[0.15em] font-bold text-[rgba(60,60,67,0.4)] mb-3">Recomendação de fechamento</p>
        <p className="text-[rgba(60,60,67,0.7)] leading-relaxed text-[13px]">
          {cliente ? <strong className="text-[#1C1C1E]">{cliente}:</strong> : null}{" "}
          Apresente <strong className="text-[#1C1C1E]">{num(sweetIdeal.quantidade)} unidades</strong> como ponto ideal —{" "}
          {brl(sweetIdeal[precoKey as keyof LinhaTabela] as number)} com margem de{" "}
          <span className={margemCls(sweetIdeal[margKey as keyof LinhaTabela] as number)}>
            {num(sweetIdeal[margKey as keyof LinhaTabela] as number, 1)}%
          </span>.{" "}
          Se houver resistência, use <strong className="text-[#1C1C1E]">{num(sweetMin.quantidade)} un</strong> como mínimo aceitável.
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
        <div className="absolute -bottom-2 -right-2 w-7 h-7 rounded-xl bg-[#007AFF] flex items-center justify-center shadow-md shadow-[#007AFF]/30">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
      </div>
      <h2 className="text-[#1C1C1E] font-bold text-[17px] mb-2.5 tracking-tight">Comece um orçamento</h2>
      <p className="text-[rgba(60,60,67,0.5)] text-[13px] max-w-[220px] leading-relaxed">
        Preencha as dimensões da caixa na barra lateral para calcular a proposta.
      </p>
      <div className="mt-6 px-4 py-2.5 bg-white rounded-xl inline-flex items-center gap-1.5" style={{ border: "1px solid rgba(60,60,67,0.1)" }}>
        <svg className="w-3 h-3 text-[rgba(60,60,67,0.25)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <p className="text-[11px] text-[rgba(60,60,67,0.4)]">Largura · Altura · Profundidade</p>
      </div>
    </div>
  )
}
