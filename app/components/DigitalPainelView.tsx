"use client"

// Painel do braço digital: os pedidos que o agente fecha sozinho em impressão digital. Quem está esperando o sinal
// (abriu a página? quais lembretes já foram?), quem pagou e o andamento até o envio. Abrir um pedido mostra o
// briefing da arte e os botões para avançar o status.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Printer, Clock, CheckCircle2, Truck, Wallet, MessageCircle, ExternalLink, ArrowRight, X, Eye, EyeOff, Copy, Check } from "lucide-react"
import { Pagina, CabecalhoPagina, Cartao, Kpi, GradeKpis, Selo, Botao, Segmentado, LinhaLista, Vazio, Gaveta, type Tom } from "./ds"
import { ROTULO_STATUS, PROXIMO_STATUS, type StatusDigital } from "@/app/lib/digital"
import { haQuanto } from "@/app/lib/hoje"

type Pedido = {
  id: string; jid: string; nome: string | null; em: string; ml: number | null; medidas: { a: number; l: number; p: number }; padrao: boolean; folha: string
  quantidade: number; total: number; sinal: number; custo: number; arte: number; margem: number
  status: StatusDigital; sinalPagoEm: string | null; statusEm: string | null
  vistoEm: string | null; ultimaVista: string | null; vistas: number; lembretes: { nivel: number; em: string }[]
  briefing: { marca: string; cores: string; referencias: string; arquivos: number } | null
  vence: string; link: string
}
type Filtro = "abertos" | "pagos" | "enviados" | "todos"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const cm = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
const PAGOS: StatusDigital[] = ["sinal_pago", "arte", "producao"]
const TOM_STATUS: Record<StatusDigital, Tom> = { aguardando_sinal: "alerta", sinal_pago: "sucesso", arte: "acento", producao: "info", enviado: "neutro", cancelado: "neutro" }
const ICONE: Record<StatusDigital, React.ReactNode> = {
  aguardando_sinal: <Clock className="w-4 h-4" />, sinal_pago: <Wallet className="w-4 h-4" />, arte: <Printer className="w-4 h-4" />,
  producao: <Printer className="w-4 h-4" />, enviado: <Truck className="w-4 h-4" />, cancelado: <X className="w-4 h-4" />,
}
const ROTULO_AVANCAR: Partial<Record<StatusDigital, string>> = { sinal_pago: "Arte começou", arte: "Foi para produção", producao: "Enviado" }

export default function DigitalPainelView({ onAbrirConversa }: { onAbrirConversa: (jid: string) => void }) {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>("abertos")
  const [aberto, setAberto] = useState<string | null>(null)
  const [mudando, setMudando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const buscar = useCallback(() => fetch("/api/digital").then(async r => {
    const j = await r.json() as { pedidos?: Pedido[]; erro?: string }
    if (!r.ok) throw new Error(j.erro ?? `erro ${r.status}`)
    return j.pedidos ?? []
  }), [])
  useEffect(() => {
    let vivo = true
    buscar().then(p => { if (vivo) setPedidos(p) }).catch(e => { if (vivo) setErro(String((e as Error).message ?? e)) })
    return () => { vivo = false }
  }, [buscar])

  const [agora] = useState(() => Date.now())
  const d30 = agora - 30 * 86_400_000
  const resumo = useMemo(() => {
    const ps = pedidos ?? []
    const abertos = ps.filter(p => p.status === "aguardando_sinal" && new Date(p.vence).getTime() > agora)
    const pagos30 = ps.filter(p => p.sinalPagoEm && new Date(p.sinalPagoEm).getTime() >= d30)
    return {
      abertos: abertos.length, sinais: abertos.reduce((a, p) => a + p.sinal, 0), naoAbriram: abertos.filter(p => !p.vistoEm).length,
      pagos: pagos30.length, margem: pagos30.reduce((a, p) => a + p.margem, 0),
      andamento: ps.filter(p => PAGOS.includes(p.status)).length,
    }
  }, [pedidos, agora, d30])

  const lista = (pedidos ?? []).filter(p =>
    filtro === "todos" ? true
      : filtro === "abertos" ? p.status === "aguardando_sinal" && new Date(p.vence).getTime() > agora
      : filtro === "pagos" ? PAGOS.includes(p.status)
      : p.status === "enviado")
  const sel = (pedidos ?? []).find(p => p.id === aberto) ?? null

  const mudar = async (p: Pedido, status: StatusDigital) => {
    if (status === "cancelado" && !confirm(`Cancelar o ${p.id}? O link para de funcionar para o cliente.`)) return
    setMudando(true)
    try {
      const r = await fetch("/api/digital", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, status }) })
      const j = await r.json() as { erro?: string }
      if (!r.ok) { alert(j.erro ?? "Não deu para mudar."); return }
      setPedidos(await buscar())
      if (status === "cancelado") setAberto(null)
    } finally { setMudando(false) }
  }
  const copiar = (t: string) => { void navigator.clipboard?.writeText(t); setCopiado(true); setTimeout(() => setCopiado(false), 1500) }

  const subDe = (p: Pedido) => {
    const caixa = `${p.quantidade.toLocaleString("pt-BR")} caixinhas${p.ml ? ` · ${p.ml} ml` : ""} (${cm(p.medidas.a)} × ${cm(p.medidas.l)} × ${cm(p.medidas.p)})`
    if (p.status !== "aguardando_sinal") return `${caixa} · ${p.statusEm ? `${ROTULO_STATUS[p.status]} ${haQuanto(p.statusEm)}` : p.sinalPagoEm ? `sinal pago ${haQuanto(p.sinalPagoEm)}` : ""}`
    const visto = p.vistoEm ? `abriu ${haQuanto(p.ultimaVista ?? p.vistoEm)}${p.vistas > 1 ? ` (${p.vistas}×)` : ""}` : "ainda não abriu"
    const lemb = p.lembretes.length ? ` · ${p.lembretes.map(l => `F${l.nivel}`).join(", ")}` : ""
    return `${caixa} · ${visto}${lemb}`
  }

  return (
    <Pagina>
      <CabecalhoPagina titulo="Digital" sub="Pedidos em impressão digital que o agente fecha sozinho" />

      <GradeKpis>
        <Kpi rotulo="Esperando" valor={pedidos ? resumo.abertos : null} formato={n => String(n)} tom="alerta" icone={<Clock className="w-3.5 h-3.5" />}
          sub={pedidos ? `${resumo.naoAbriram} ${resumo.naoAbriram === 1 ? "não abriu" : "não abriram"} · ${brl(resumo.sinais)}` : undefined} destaque />
        <Kpi rotulo="Pagos" valor={pedidos ? resumo.pagos : null} formato={n => String(n)} tom="sucesso" icone={<CheckCircle2 className="w-3.5 h-3.5" />} sub="sinal pago em 30 dias" />
        <Kpi rotulo="Andamento" valor={pedidos ? resumo.andamento : null} formato={n => String(n)} tom="info" icone={<Printer className="w-3.5 h-3.5" />} sub="arte e produção" />
        <Kpi rotulo="Margem" valor={pedidos ? resumo.margem : null} formato={brl} icone={<Wallet className="w-3.5 h-3.5" />} sub="pagos em 30 dias" />
      </GradeKpis>

      <Cartao className="mt-3">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <Segmentado valor={filtro} onChange={setFiltro} opcoes={[{ v: "abertos", nome: "Abertos" }, { v: "pagos", nome: "Pagos" }, { v: "enviados", nome: "Enviados" }, { v: "todos", nome: "Todos" }]} />
          <p className="text-[11px] text-[#898892]">Quem não paga recebe lembrete em 3 h, 24 h e 72 h</p>
        </div>
        {erro ? <Vazio icone={<X className="w-5 h-5" />} titulo="Não deu para carregar" sub={erro} />
          : !pedidos ? <p className="text-[12.5px] text-[#898892] px-3 py-2">Carregando…</p>
          : !lista.length ? <Vazio icone={<Printer className="w-5 h-5" />} titulo="Nada por aqui" sub={filtro === "abertos" ? "Nenhum orçamento esperando o sinal." : "Nenhum pedido nesta lista."} />
          : <div className="-mx-2">{lista.map(p => (
              <LinhaLista key={p.id} onClick={() => setAberto(p.id)} icone={ICONE[p.status]} tom={TOM_STATUS[p.status]}
                titulo={<>{p.nome || p.jid.split("@")[0]} <span className="text-[#898892] font-normal">· {p.id}</span></>}
                sub={subDe(p)} valor={brl(p.total)}
                valorSub={<span className="hidden sm:inline"><Selo tom={TOM_STATUS[p.status]}>{ROTULO_STATUS[p.status]}</Selo></span>} />
            ))}</div>}
      </Cartao>

      <Gaveta aberta={!!sel} onFechar={() => setAberto(null)} titulo={sel ? `${sel.id} · ${sel.nome ?? ""}` : ""}
        sub={sel ? `${ROTULO_STATUS[sel.status]} · cotado ${haQuanto(sel.em)}` : undefined}
        rodape={sel && (
          <div className="flex gap-2 flex-wrap">
            {PROXIMO_STATUS[sel.status] && <Botao variante="primario" disabled={mudando} onClick={() => void mudar(sel, PROXIMO_STATUS[sel.status]!)} icone={<ArrowRight className="w-3.5 h-3.5" />}>{ROTULO_AVANCAR[sel.status]}</Botao>}
            <Botao onClick={() => onAbrirConversa(sel.jid)} icone={<MessageCircle className="w-3.5 h-3.5" />}>Conversa</Botao>
            {sel.status !== "enviado" && sel.status !== "cancelado" && <Botao variante="fantasma" disabled={mudando} onClick={() => void mudar(sel, "cancelado")}>Cancelar</Botao>}
          </div>
        )}>
        {sel && (
          <div className="space-y-4 text-[12.5px] text-[#5e5c68]">
            <div className="grid grid-cols-2 gap-2">
              <Info rotulo="Quantidade" valor={`${sel.quantidade.toLocaleString("pt-BR")} caixinhas`} />
              <Info rotulo="Caixa" valor={`${cm(sel.medidas.a)} × ${cm(sel.medidas.l)} × ${cm(sel.medidas.p)} cm${sel.padrao ? " (padrão)" : ""}`} />
              <Info rotulo="Total" valor={brl(sel.total)} />
              <Info rotulo="Sinal (Pix)" valor={brl(sel.sinal)} />
              <Info rotulo="Villa + arte" valor={`${brl(sel.custo)} + ${brl(sel.arte)}`} />
              <Info rotulo="Sua margem" valor={brl(sel.margem)} />
            </div>

            {sel.status === "aguardando_sinal" && (
              <div className="rounded-xl bg-[rgba(116,116,128,0.06)] px-3.5 py-3 space-y-1.5">
                <p className="flex items-center gap-2">{sel.vistoEm ? <Eye className="w-3.5 h-3.5 text-[#009351]" /> : <EyeOff className="w-3.5 h-3.5 text-[#898892]" />}
                  {sel.vistoEm ? `Abriu a página ${haQuanto(sel.ultimaVista ?? sel.vistoEm)}${sel.vistas > 1 ? `, ${sel.vistas} vezes` : ""}` : "Ainda não abriu a página"}</p>
                <p>Lembretes: {sel.lembretes.length ? sel.lembretes.map(l => `F${l.nivel} ${haQuanto(l.em)}`).join(" · ") : "nenhum ainda"}</p>
                <p>Vale até {new Date(sel.vence).toLocaleDateString("pt-BR")}</p>
              </div>
            )}

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#898892] mb-1.5">Briefing da arte</p>
              {sel.briefing && (sel.briefing.marca || sel.briefing.cores || sel.briefing.referencias || sel.briefing.arquivos) ? (
                <div className="space-y-1">
                  {sel.briefing.marca && <p><b className="text-[#191625]">Marca:</b> {sel.briefing.marca}</p>}
                  {sel.briefing.cores && <p><b className="text-[#191625]">Cores:</b> {sel.briefing.cores}</p>}
                  {sel.briefing.referencias && <p className="whitespace-pre-wrap"><b className="text-[#191625]">Referências:</b> {sel.briefing.referencias}</p>}
                  {sel.briefing.arquivos > 0 && <p>{sel.briefing.arquivos} arquivo(s) enviado(s)</p>}
                </div>
              ) : <p className="text-[#898892]">O cliente ainda não preencheu.</p>}
            </div>

            <div className="flex gap-3 flex-wrap">
              <a href={sel.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[#8456e8] hover:underline">Ver a página do pedido <ExternalLink className="w-3 h-3" /></a>
              <button onClick={() => copiar(sel.link)} className="inline-flex items-center gap-1 text-[12px] text-[#8456e8] hover:underline">
                {copiado ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copiar link
              </button>
            </div>
          </div>
        )}
      </Gaveta>
    </Pagina>
  )
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-[rgba(116,116,128,0.06)] px-3 py-2.5 min-w-0">
      <p className="text-[10.5px] text-[#898892] truncate">{rotulo}</p>
      <p className="text-[13px] font-semibold text-[#191625] ds-num truncate mt-0.5">{valor}</p>
    </div>
  )
}
