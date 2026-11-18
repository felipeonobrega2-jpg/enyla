"use client"

// Exatidão dos dados: o Auditor confere a cada hora se pedidos, financeiro, banco, digital e WhatsApp batem entre si.
// Aqui você vê quanto dos dados confere, o que está errado (do mais grave) e onde abrir para acertar.
// "Está certo" tira o item da conta (quando a diferença é de propósito).

import { useCallback, useEffect, useState } from "react"
import { ShieldCheck, ChevronDown, Check, RefreshCw, ArrowUpRight, Package, Wallet, Landmark, Printer, MessageCircle } from "lucide-react"
import { Pagina, CabecalhoPagina, Cartao, Botao, Esqueleto, Segmentado, NumeroAnimado } from "./ds"
import type { Auditoria, ResultadoRegra, Problema, Area } from "../lib/auditoria"

const brlCurto = (n: number) => n >= 1000 ? `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: n >= 100_000 ? 0 : 1 })} mil` : brl(n)
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const GRAV = { alta: { rotulo: "Grave", cor: "#d33a3c", fundo: "rgba(211,58,60,0.09)" }, media: { rotulo: "Atenção", cor: "#c26a0a", fundo: "rgba(224,123,31,0.10)" }, baixa: { rotulo: "Ajuste", cor: "#5e5c68", fundo: "rgba(116,116,128,0.09)" } } as const
const AREA: Record<Area, { nome: string; Icone: typeof Package }> = {
  pedidos: { nome: "Pedidos", Icone: Package }, financeiro: { nome: "Financeiro", Icone: Wallet }, banco: { nome: "Banco", Icone: Landmark },
  digital: { nome: "Digital", Icone: Printer }, whatsapp: { nome: "WhatsApp", Icone: MessageCircle },
}
const ORDEM = { alta: 0, media: 1, baixa: 2 }

function ha(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  return m < 1 ? "agora" : m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)}h`
}

function LinhaRegra({ r, onAbrir, onCerto }: { r: ResultadoRegra; onAbrir: (p: Problema) => void; onCerto: (p: Problema) => void }) {
  const [aberta, setAberta] = useState(false)
  const [mostrar, setMostrar] = useState(15)
  const g = GRAV[r.gravidade]
  const valor = r.problemas.reduce((t, p) => t + (p.valor ?? 0), 0)
  const { Icone } = AREA[r.area]
  return (
    <div className="border-b last:border-b-0 border-[rgba(116,116,128,0.12)]">
      <button onClick={() => setAberta(a => !a)} className="ds-toque w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[rgba(116,116,128,0.04)]">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: g.fundo, color: g.cor }}><Icone className="w-4 h-4" strokeWidth={1.9} /></span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-semibold text-[#191625]">{r.nome}</span>
            <span className="text-[10.5px] font-semibold rounded-full px-1.5 py-0.5" style={{ color: g.cor, background: g.fundo }}>{g.rotulo}</span>
          </span>
          <span className="block text-[12px] text-[#898892]">{AREA[r.area].nome}{valor > 0 ? ` · ${brl(valor)} envolvidos` : ""}</span>
        </span>
        <span className="text-[17px] font-bold ds-num text-[#191625]">{r.problemas.length}</span>
        <ChevronDown className={`w-4 h-4 text-[#898892] transition-transform ${aberta ? "rotate-180" : ""}`} />
      </button>
      {aberta && (
        <div className="px-4 pb-3 ds-entrada">
          <p className="text-[12.5px] text-[#5e5c68] leading-snug mb-2 sm:pl-11">{r.explica}</p>
          <ul className="sm:pl-11 space-y-1.5">
            {r.problemas.slice(0, mostrar).map(p => (
              <li key={p.id} className="rounded-xl bg-[rgba(116,116,128,0.05)] px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-[#191625] truncate">{p.titulo}</span>
                  <span className="block text-[12px] text-[#5e5c68] leading-snug">{p.detalhe}</span>
                </span>
                <span className="flex gap-1.5 shrink-0">
                  <button onClick={() => onAbrir(p)} className="ds-toque h-8 px-2.5 rounded-lg text-[12px] font-semibold text-[#8456e8] bg-[rgba(132,86,232,0.08)] flex items-center gap-1">Abrir<ArrowUpRight className="w-3.5 h-3.5" /></button>
                  <button onClick={() => onCerto(p)} title="A diferença é de propósito: tira da conta" className="ds-toque h-8 px-2.5 rounded-lg text-[12px] font-semibold text-[#5e5c68] bg-white ds-borda flex items-center gap-1"><Check className="w-3.5 h-3.5" />Está certo</button>
                </span>
              </li>
            ))}
          </ul>
          {r.problemas.length > mostrar && <button onClick={() => setMostrar(n => n + 30)} className="sm:ml-11 mt-2 text-[12.5px] font-semibold text-[#8456e8]">Mostrar mais ({r.problemas.length - mostrar})</button>}
        </div>
      )}
    </div>
  )
}

export function AuditoriaView({ onAbrirCard, onNavegar }: { onAbrirCard: (id: string) => void; onNavegar: (v: "financeiro" | "digital" | "whatsapp") => void }) {
  const [d, setD] = useState<Auditoria | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [area, setArea] = useState<"todas" | Area>("todas")
  const conferir = useCallback(() => {
    setCarregando(true); setErro(null)
    fetch("/api/auditoria").then(r => r.json()).then(x => { if (x.erro) setErro(x.erro); else setD(x) }).catch(e => setErro(String(e))).finally(() => setCarregando(false))
  }, [])
  useEffect(() => { conferir() }, [conferir])

  const certo = (p: Problema) => {
    setD(a => a && ({ ...a, total: a.total - 1, ignorados: a.ignorados + 1, regras: a.regras.map(r => r.id === p.regra ? { ...r, problemas: r.problemas.filter(x => x.id !== p.id) } : r) }))
    fetch("/api/auditoria", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id }) }).catch(() => {})
  }
  const abrir = (p: Problema) => {
    if (p.ref.cardId) return onAbrirCard(p.ref.cardId)
    if (p.ref.digitalId) return onNavegar("digital")
    if (p.ref.jid) return onNavegar("whatsapp")
    onNavegar("financeiro")
  }

  if (!d) return (
    <Pagina>
      <CabecalhoPagina titulo="Exatidão dos dados" sub="O Auditor está conferindo tudo…" />
      {erro ? <Cartao><p className="text-[13px] text-[#d33a3c]">Não consegui conferir agora: {erro}</p><div className="mt-3"><Botao onClick={conferir}>Tentar de novo</Botao></div></Cartao> : <Esqueleto linhas={6} />}
    </Pagina>
  )

  const comProblema = d.regras.filter(r => r.problemas.length).sort((a, b) => ORDEM[a.gravidade] - ORDEM[b.gravidade] || b.problemas.length - a.problemas.length)
  const limpas = d.regras.filter(r => !r.problemas.length)
  const visiveis = comProblema.filter(r => area === "todas" || r.area === area)
  const areas = (Object.keys(AREA) as Area[]).filter(a => comProblema.some(r => r.area === a))
  const cor = d.confianca >= 95 ? "#1f9d55" : d.confianca >= 85 ? "#c26a0a" : "#d33a3c"

  return (
    <Pagina>
      <CabecalhoPagina titulo="Exatidão dos dados" sub={`O Auditor confere tudo a cada hora · última conferência ${ha(d.em)}`}
        acoes={<Botao onClick={conferir} disabled={carregando} icone={<RefreshCw className={`w-4 h-4 ${carregando ? "animate-spin" : ""}`} />}>{carregando ? "Conferindo…" : "Conferir agora"}</Botao>} />

      <Cartao className="ds-entrada">
        <div className="flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex items-center gap-4 lg:w-[360px] shrink-0">
            <span className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${cor}14`, color: cor }}><ShieldCheck className="w-7 h-7" strokeWidth={1.8} /></span>
            <div className="min-w-0">
              <p className="text-[34px] leading-none font-bold ds-num" style={{ color: cor }}><NumeroAnimado valor={d.confianca} formato={v => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} /></p>
              <p className="text-[12.5px] text-[#5e5c68] mt-1">dos registros conferem ({(d.conferidos - d.comProblema).toLocaleString("pt-BR")} de {d.conferidos.toLocaleString("pt-BR")}, últimos 6 meses)</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-3 flex-1">
            {[
              { r: "Graves", v: d.graves.toLocaleString("pt-BR"), c: d.graves ? "#d33a3c" : "#1f9d55" },
              { r: "Para acertar", v: d.total.toLocaleString("pt-BR"), c: "#191625" },
              { r: "Envolvido", v: brlCurto(d.valorEmJogo), c: "#191625" },
            ].map(k => (
              <div key={k.r} className="rounded-xl bg-[rgba(116,116,128,0.05)] px-3 py-2 sm:py-2.5 min-w-0 flex sm:block items-center justify-between gap-3">
                <p className="text-[12px] sm:text-[10.5px] sm:uppercase sm:tracking-wide font-semibold text-[#898892] truncate">{k.r}</p>
                <p className="text-[16px] sm:text-[19px] font-bold ds-num whitespace-nowrap" style={{ color: k.c }}>{k.v}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 h-2 rounded-full bg-[rgba(116,116,128,0.10)] overflow-hidden">
          <div className="h-full rounded-full ds-cresce-x" style={{ width: `${d.confianca}%`, background: cor }} />
        </div>
      </Cartao>

      {comProblema.length > 0 ? (
        <Cartao padding={false} className="ds-entrada">
          <div className="px-4 pt-4 pb-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div>
              <p className="text-[15px] font-semibold text-[#191625]">O que não bate</p>
              <p className="text-[12px] text-[#898892]">Do mais grave para o mais simples. Toque para ver cada caso.</p>
            </div>
            {areas.length > 1 && <Segmentado valor={area} onChange={setArea} opcoes={[{ v: "todas" as const, nome: "Tudo" }, ...areas.map(a => ({ v: a, nome: AREA[a].nome }))]} />}
          </div>
          <div className="border-t border-[rgba(116,116,128,0.12)]">
            {visiveis.map(r => <LinhaRegra key={r.id} r={r} onAbrir={abrir} onCerto={certo} />)}
          </div>
        </Cartao>
      ) : (
        <Cartao className="ds-entrada"><p className="text-[14px] font-semibold text-[#1f9d55] flex items-center gap-2"><Check className="w-4 h-4" />Tudo batendo. Nenhuma diferença encontrada.</p></Cartao>
      )}

      <Cartao className="ds-entrada">
        <p className="text-[13px] font-semibold text-[#191625] mb-2">Conferências sem nenhum problema ({limpas.length})</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {limpas.map(r => <li key={r.id} className="flex items-center gap-2 text-[12.5px] text-[#5e5c68]"><Check className="w-3.5 h-3.5 text-[#1f9d55] shrink-0" />{r.nome}</li>)}
        </ul>
        {d.ignorados > 0 && <p className="mt-3 text-[11.5px] text-[#898892]">{d.ignorados} {d.ignorados === 1 ? "item marcado" : "itens marcados"} como "está certo" (fora da conta).</p>}
      </Cartao>
    </Pagina>
  )
}
