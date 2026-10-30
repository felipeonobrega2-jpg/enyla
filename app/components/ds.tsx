"use client"

// Componentes base do sistema. Toda tela nova (e cada tela revisada) usa só estes blocos,
// para que cartões, números, listas e animações tenham o mesmo comportamento em todo lugar.

import React from "react"
import { createPortal } from "react-dom"
import { ChevronRight, X } from "lucide-react"

export type Tom = "neutro" | "acento" | "sucesso" | "alerta" | "perigo" | "info"

export const COR: Record<Tom, string> = {
  neutro:  "#5e5c68",
  acento:  "#8456e8",
  sucesso: "#009351",
  alerta:  "#c57800",
  perigo:  "#d33a3c",
  info:    "#3a84ca",
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ")

const reduzMovimento = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

// ── Número animado ────────────────────────────────────────────────────────────
// O servidor já entrega o valor final; no navegador conta de onde estava até o novo valor.

export function NumeroAnimado({ valor, formato, duracao = 700, className }: {
  valor: number
  formato: (n: number) => string
  duracao?: number
  className?: string
}) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const anterior = React.useRef(0)
  const fmt = React.useRef(formato)
  React.useLayoutEffect(() => { fmt.current = formato })

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const de = anterior.current
    anterior.current = valor
    if (reduzMovimento() || de === valor) { el.textContent = fmt.current(valor); return }
    let raf = 0
    const t0 = performance.now()
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / duracao)
      const e = 1 - Math.pow(1 - p, 3)
      el.textContent = fmt.current(de + (valor - de) * e)
      if (p < 1) raf = requestAnimationFrame(passo)
    }
    el.textContent = fmt.current(de)
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [valor, duracao])

  return <span ref={ref} className={className}>{formato(valor)}</span>
}

// ── Estrutura de página ───────────────────────────────────────────────────────

export function Pagina({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--bg-page)" }}>
      <div className={cx("max-w-[1320px] mx-auto px-6 py-6 space-y-5 ds-entrada", className)}>{children}</div>
    </div>
  )
}

export function CabecalhoPagina({ titulo, sub, acoes }: { titulo: string; sub?: React.ReactNode; acoes?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold text-[#191625] tracking-[-0.02em] leading-tight">{titulo}</h1>
        {sub && <p className="text-[12.5px] text-[#898892] mt-1">{sub}</p>}
      </div>
      {acoes && <div className="flex items-center gap-2 flex-wrap">{acoes}</div>}
    </div>
  )
}

// ── Cartão ────────────────────────────────────────────────────────────────────

export function Cartao({ children, className, onClick, padding = true }: {
  children: React.ReactNode; className?: string; onClick?: () => void; padding?: boolean
}) {
  const Comp = onClick ? "button" : "div"
  return (
    <Comp onClick={onClick}
      className={cx(
        "ds-cartao bg-white rounded-xl text-left block w-full outline-none focus-visible:ring-2 focus-visible:ring-[#8456e8]/40",
        padding && "p-5",
        onClick && "ds-clicavel cursor-pointer",
        className,
      )}>
      {children}
    </Comp>
  )
}

export function TituloCartao({ titulo, sub, acao, icone }: {
  titulo: string; sub?: React.ReactNode; acao?: React.ReactNode; icone?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-[#191625] flex items-center gap-2">
          {icone && <span className="text-[#8456e8] shrink-0">{icone}</span>}{titulo}
        </p>
        {sub && <p className="text-[11.5px] text-[#898892] mt-0.5">{sub}</p>}
      </div>
      {acao}
    </div>
  )
}

// ── KPI ───────────────────────────────────────────────────────────────────────

export function Kpi({ rotulo, valor, formato, sub, tom = "neutro", icone, onClick, destaque }: {
  rotulo: string
  valor: number | null
  formato: (n: number) => string
  sub?: React.ReactNode
  tom?: Tom
  icone?: React.ReactNode
  onClick?: () => void
  destaque?: boolean
}) {
  return (
    <Cartao onClick={onClick} className={cx("group relative min-w-0", destaque && "ring-1 ring-[#8456e8]/20")}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-[11px] font-medium text-[#898892] flex items-center gap-1.5 truncate">
          {icone && <span style={{ color: COR[tom] }} className="shrink-0">{icone}</span>}{rotulo}
        </p>
        {onClick && <ChevronRight className="w-3.5 h-3.5 text-[#c7c7cc] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />}
      </div>
      <p className="text-[20px] sm:text-[24px] font-semibold leading-none tracking-[-0.02em] ds-num truncate"
        style={{ color: tom === "neutro" || tom === "acento" ? undefined : COR[tom] }}>
        {valor == null ? <span className="text-[#c7c7cc]">—</span> : <NumeroAnimado valor={valor} formato={formato} className={tom === "neutro" || tom === "acento" ? "text-[#191625]" : undefined} />}
      </p>
      {sub && <p className="text-[11px] text-[#898892] mt-2 leading-snug truncate">{sub}</p>}
    </Cartao>
  )
}

export function GradeKpis({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 ds-escalonado">{children}</div>
}

// ── Selo ──────────────────────────────────────────────────────────────────────

export function Selo({ tom = "neutro", children, className }: { tom?: Tom; children: React.ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10.5px] font-semibold whitespace-nowrap", className)}
      style={{ color: COR[tom], background: tom === "neutro" ? "rgba(116,116,128,0.1)" : `${COR[tom]}14` }}>
      {children}
    </span>
  )
}

// ── Botão ─────────────────────────────────────────────────────────────────────

export function Botao({ children, onClick, variante = "secundario", icone, disabled, className, title }: {
  children?: React.ReactNode
  onClick?: () => void
  variante?: "primario" | "secundario" | "fantasma"
  icone?: React.ReactNode
  disabled?: boolean
  className?: string
  title?: string
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={cx(
        "h-9 px-3.5 rounded-lg text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 transition-all duration-150 disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap",
        variante === "primario" && "bg-[#8456e8] hover:bg-[#7445d4] text-white shadow-sm shadow-[#8456e8]/20",
        variante === "secundario" && "bg-white text-[#191625] hover:bg-[rgba(116,116,128,0.06)] ds-borda",
        variante === "fantasma" && "text-[#5e5c68] hover:bg-[rgba(116,116,128,0.08)] hover:text-[#191625]",
        className,
      )}>
      {icone}{children}
    </button>
  )
}

// ── Seletor segmentado (com indicador deslizante) ─────────────────────────────

export function Segmentado<T extends string>({ valor, opcoes, onChange }: {
  valor: T; opcoes: { v: T; nome: string }[]; onChange: (v: T) => void
}) {
  const achado = opcoes.findIndex(o => o.v === valor)
  const i = Math.max(0, achado)
  return (
    <div className="relative inline-grid w-fit max-w-full self-start p-1 rounded-lg bg-[rgba(116,116,128,0.1)]"
      style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}>
      <span aria-hidden className="absolute top-1 bottom-1 left-1 rounded-md bg-white shadow-sm transition-all duration-300 ease-[cubic-bezier(.3,.9,.3,1)]"
        style={{ width: `calc((100% - 8px) / ${opcoes.length})`, transform: `translateX(${i * 100}%)`, opacity: achado < 0 ? 0 : 1 }} />
      {opcoes.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={cx("relative z-10 h-7 px-3 rounded-md text-[12px] font-medium transition-colors duration-200 whitespace-nowrap",
            o.v === valor ? "text-[#191625]" : "text-[#72707d] hover:text-[#191625]")}>
          {o.nome}
        </button>
      ))}
    </div>
  )
}

// ── Linha de lista ────────────────────────────────────────────────────────────

export function LinhaLista({ titulo, sub, valor, valorSub, tom, icone, onClick, acao }: {
  titulo: React.ReactNode
  sub?: React.ReactNode
  valor?: React.ReactNode
  valorSub?: React.ReactNode
  tom?: Tom
  icone?: React.ReactNode
  onClick?: () => void
  acao?: React.ReactNode
}) {
  const Comp = onClick ? "button" : "div"
  return (
    <div className="group flex items-center gap-1">
      <Comp onClick={onClick}
        className={cx("flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-150",
          onClick && "hover:bg-[rgba(116,116,128,0.06)] cursor-pointer")}>
        {icone && (
          <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ color: COR[tom ?? "neutro"], background: `${COR[tom ?? "neutro"]}12` }}>{icone}</span>
        )}
        <span className="flex-1 min-w-0">
          <span className="block text-[12.5px] font-medium text-[#191625] truncate">{titulo}</span>
          {sub && <span className="block text-[11px] text-[#898892] truncate mt-0.5">{sub}</span>}
        </span>
        {(valor != null || valorSub) && (
          <span className="text-right shrink-0">
            {valor != null && <span className="block text-[12.5px] font-semibold ds-num" style={{ color: tom && tom !== "neutro" ? COR[tom] : "#191625" }}>{valor}</span>}
            {valorSub && <span className="block text-[10.5px] text-[#898892] ds-num">{valorSub}</span>}
          </span>
        )}
        {onClick && <ChevronRight className="w-3.5 h-3.5 text-[#c7c7cc] shrink-0 group-hover:text-[#898892] transition-colors" />}
      </Comp>
      {acao}
    </div>
  )
}

// ── Barras horizontais (distribuição) ─────────────────────────────────────────

export function ListaBarras({ itens, formatoValor, onClick }: {
  itens: { chave: string | number; rotulo: string; qtd: number; valor?: number; tom?: Tom; peso?: number }[]
  formatoValor?: (n: number) => string
  onClick?: (chave: string | number) => void
}) {
  // A barra mede `peso` quando informado (ex.: valor em R$); senão, a quantidade
  const medida = (i: { qtd: number; peso?: number }) => i.peso ?? i.qtd
  const max = Math.max(1, ...itens.map(medida))
  return (
    <div className="space-y-1">
      {itens.map((it, idx) => {
        const Comp = onClick ? "button" : "div"
        return (
          <Comp key={it.chave} onClick={onClick ? () => onClick(it.chave) : undefined}
            className={cx("w-full text-left px-2 py-1.5 rounded-lg transition-colors", onClick && "hover:bg-[rgba(116,116,128,0.06)]")}>
            <div className="flex items-center justify-between gap-3 text-[12px] mb-1">
              <span className="text-[#5e5c68] font-medium truncate">{it.rotulo}</span>
              <span className="shrink-0 ds-num text-[#191625] font-semibold">
                {it.qtd}{it.valor != null && formatoValor && <span className="text-[#898892] font-normal ml-2">{formatoValor(it.valor)}</span>}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[rgba(116,116,128,0.1)] overflow-hidden">
              <div className="h-full rounded-full ds-cresce-x"
                style={{ width: `${(medida(it) / max) * 100}%`, background: COR[it.tom ?? "acento"], animationDelay: `${idx * 50}ms` }} />
            </div>
          </Comp>
        )
      })}
    </div>
  )
}

// ── Colunas (série mensal) ────────────────────────────────────────────────────

export function Colunas({ itens, formato, altura = 140, onClick }: {
  itens: { rotulo: string; valor: number; destaque?: boolean; chave?: string }[]
  formato: (n: number) => string
  altura?: number
  onClick?: (chave: string) => void
}) {
  const max = Math.max(1, ...itens.map(i => i.valor))
  return (
    <div className="flex items-end gap-2" style={{ height: altura + 34 }}>
      {itens.map((it, idx) => (
        <div key={it.chave ?? it.rotulo} onClick={onClick ? () => onClick(it.chave ?? it.rotulo) : undefined}
          className={cx("group flex-1 min-w-0 flex flex-col items-center justify-end h-full rounded-lg transition-colors", onClick && "cursor-pointer hover:bg-[rgba(132,86,232,0.04)]")}>
          <span className="text-[10.5px] ds-num text-[#898892] mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            {formato(it.valor)}
          </span>
          <div className="w-full max-w-[44px] rounded-t-md ds-cresce-y transition-colors group-hover:brightness-95"
            style={{
              height: Math.max(2, (it.valor / max) * altura),
              background: it.destaque ? "#8456e8" : "rgba(132,86,232,0.22)",
              animationDelay: `${idx * 60}ms`,
            }} />
          <span className={cx("text-[10.5px] mt-1.5 capitalize", it.destaque ? "text-[#191625] font-semibold" : "text-[#898892]")}>{it.rotulo}</span>
        </div>
      ))}
    </div>
  )
}

// ── Colunas duplas (entradas × saídas) ────────────────────────────────────────

export function ColunasDuplas({ itens, formato, altura = 130, nomes = ["Entradas", "Saídas"] }: {
  itens: { rotulo: string; a: number; b: number; destaque?: boolean }[]
  formato: (n: number) => string
  altura?: number
  nomes?: [string, string]
}) {
  const max = Math.max(1, ...itens.flatMap(i => [i.a, i.b]))
  return (
    <div>
      <div className="flex items-center gap-4 mb-3 text-[11px] text-[#898892]">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#009351]" />{nomes[0]}</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#d33a3c]/70" />{nomes[1]}</span>
      </div>
      <div className="flex items-end gap-1.5" style={{ height: altura + 22 }}>
        {itens.map((it, idx) => (
          <div key={it.rotulo + idx} className="group relative flex-1 min-w-0 flex flex-col items-center justify-end h-full">
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 hidden group-hover:block whitespace-nowrap rounded-lg bg-[#191625] text-white text-[10.5px] px-2.5 py-1.5 shadow-lg">
              <p className="capitalize text-white/60">{it.rotulo}</p>
              <p className="ds-num">+{formato(it.a)} · −{formato(it.b)}</p>
              <p className={`ds-num font-semibold ${it.a - it.b >= 0 ? "text-[#4ade80]" : "text-[#fca5a5]"}`}>{it.a - it.b >= 0 ? "+" : "−"}{formato(Math.abs(it.a - it.b))}</p>
            </div>
            <div className="w-full flex items-end justify-center gap-[3px]" style={{ height: altura }}>
              <div className="w-[42%] max-w-[18px] rounded-t-[3px] bg-[#009351] ds-cresce-y" style={{ height: Math.max(2, it.a / max * altura), animationDelay: `${idx * 40}ms`, opacity: it.destaque ? 1 : 0.8 }} />
              <div className="w-[42%] max-w-[18px] rounded-t-[3px] bg-[#d33a3c] ds-cresce-y" style={{ height: Math.max(2, it.b / max * altura), animationDelay: `${idx * 40 + 20}ms`, opacity: it.destaque ? 0.85 : 0.55 }} />
            </div>
            <span className={cx("text-[10.5px] mt-1.5 capitalize", it.destaque ? "text-[#191625] font-semibold" : "text-[#898892]")}>{it.rotulo}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Estado vazio ──────────────────────────────────────────────────────────────

export function Vazio({ icone, titulo, sub }: { icone: React.ReactNode; titulo: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4">
      <span className="text-[#c7c7cc] mb-2.5">{icone}</span>
      <p className="text-[12.5px] font-medium text-[#5e5c68]">{titulo}</p>
      {sub && <p className="text-[11.5px] text-[#898892] mt-1 max-w-[280px]">{sub}</p>}
    </div>
  )
}

// ── Gaveta lateral (detalhe por trás de um número) ────────────────────────────

export function Gaveta({ aberta, titulo, sub, onFechar, children, rodape }: {
  aberta: boolean
  titulo: string
  sub?: React.ReactNode
  onFechar: () => void
  children: React.ReactNode
  rodape?: React.ReactNode
}) {
  React.useEffect(() => {
    if (!aberta) return
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar() }
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  }, [aberta, onFechar])
  if (!aberta || typeof document === "undefined") return null
  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/20 apple-backdrop-enter" onClick={onFechar} />
      <aside className="absolute right-0 top-0 bottom-0 w-full max-w-[460px] bg-white shadow-2xl flex flex-col ds-gaveta">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(60,60,67,0.08)" }}>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold text-[#191625] tracking-[-0.01em]">{titulo}</p>
            {sub && <p className="text-[12px] text-[#898892] mt-0.5">{sub}</p>}
          </div>
          <button onClick={onFechar} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#898892] hover:bg-[rgba(116,116,128,0.08)] hover:text-[#191625] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2 ds-escalonado">{children}</div>
        {rodape && <div className="px-5 py-3.5 flex justify-end gap-2" style={{ borderTop: "1px solid rgba(60,60,67,0.08)" }}>{rodape}</div>}
      </aside>
    </div>,
    document.body,
  )
}
