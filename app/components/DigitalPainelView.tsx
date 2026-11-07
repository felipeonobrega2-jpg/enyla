"use client"

// Painel do braço digital: os pedidos que o agente fecha sozinho em impressão digital. Quem está esperando o sinal
// (abriu a página? quais lembretes já foram?), quem pagou e o andamento até o envio. Abrir um pedido mostra o
// briefing da arte e os botões para avançar o status.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Printer, Clock, CheckCircle2, Truck, Wallet, MessageCircle, ExternalLink, ArrowRight, X, Eye, EyeOff, Copy, Check, Upload, Send, Palette, Users, Loader2 } from "lucide-react"
import { Pagina, CabecalhoPagina, Cartao, Kpi, GradeKpis, Selo, Botao, Segmentado, LinhaLista, Vazio, Gaveta, type Tom } from "./ds"
import { ROTULO_STATUS, PROXIMO_STATUS, type StatusDigital } from "@/app/lib/digital"
import { haQuanto } from "@/app/lib/hoje"

type Pedido = {
  id: string; jid: string; nome: string | null; em: string; ml: number | null; medidas: { a: number; l: number; p: number }; padrao: boolean; folha: string
  quantidade: number; total: number; sinal: number; custo: number; arte: number; margem: number
  status: StatusDigital; sinalPagoEm: string | null; statusEm: string | null
  vistoEm: string | null; ultimaVista: string | null; vistas: number; lembretes: { nivel: number; em: string }[]
  briefing: { marca: string; cores: string; referencias: string; laminacao: string; arquivos: number } | null
  vence: string; link: string; linkDesigner: string
  arteAtual: { url: string; nome: string; em: string } | null; versoes: number; arteEnviadaEm: string | null; arteAprovadaEm: string | null
  ajustes: { texto: string; em: string }[]; designerAvisadoEm: string | null; villaEnviadoEm: string | null
  frete: number | null; restante: number | null; restantePagoEm: string | null; entrega: { cep: string; endereco: string } | null; acertadoEm: string | null
  teste?: boolean
}
type Contatos = { villa?: string; designer?: string; designerNome?: string }
type Filtro = "abertos" | "pagos" | "enviados" | "acerto" | "todos"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const cm = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
const PAGOS: StatusDigital[] = ["sinal_pago", "arte", "producao"]
const TOM_STATUS: Record<StatusDigital, Tom> = { aguardando_sinal: "alerta", sinal_pago: "sucesso", arte: "acento", producao: "info", enviado: "neutro", cancelado: "neutro" }
const ICONE: Record<StatusDigital, React.ReactNode> = {
  aguardando_sinal: <Clock className="w-4 h-4" />, sinal_pago: <Wallet className="w-4 h-4" />, arte: <Printer className="w-4 h-4" />,
  producao: <Printer className="w-4 h-4" />, enviado: <Truck className="w-4 h-4" />, cancelado: <X className="w-4 h-4" />,
}
const ROTULO_AVANCAR: Partial<Record<StatusDigital, string>> = { sinal_pago: "Arte começou", arte: "Cliente aprovou (WhatsApp)", producao: "Enviado" }

export default function DigitalPainelView({ onAbrirConversa }: { onAbrirConversa: (jid: string) => void }) {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>("abertos")
  const [aberto, setAberto] = useState<string | null>(null)
  const [mudando, setMudando] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [contatos, setContatos] = useState<Contatos>({})
  const [editContatos, setEditContatos] = useState<Contatos | null>(null)
  const [acerto, setAcerto] = useState<{ ids: string[]; total: number }>({ ids: [], total: 0 })
  const [frete, setFrete] = useState("")
  const [ocupado, setOcupado] = useState<string | null>(null)

  const buscar = useCallback(() => fetch("/api/digital").then(async r => {
    const j = await r.json() as { pedidos?: Pedido[]; contatos?: Contatos; acerto?: { ids: string[]; total: number }; erro?: string }
    if (!r.ok) throw new Error(j.erro ?? `erro ${r.status}`)
    return j
  }), [])
  const aplicar = (j: Awaited<ReturnType<typeof buscar>>) => { setPedidos(j.pedidos ?? []); setContatos(j.contatos ?? {}); setAcerto(j.acerto ?? { ids: [], total: 0 }) }
  useEffect(() => {
    let vivo = true
    buscar().then(j => { if (vivo) { setPedidos(j.pedidos ?? []); setContatos(j.contatos ?? {}); setAcerto(j.acerto ?? { ids: [], total: 0 }) } }).catch(e => { if (vivo) setErro(String((e as Error).message ?? e)) })
    return () => { vivo = false }
  }, [buscar])

  const [agora] = useState(() => Date.now())
  const d30 = agora - 30 * 86_400_000
  const resumo = useMemo(() => {
    const ps = (pedidos ?? []).filter(p => !p.teste)
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
      : filtro === "acerto" ? acerto.ids.includes(p.id)
      : p.status === "enviado")
  const sel = (pedidos ?? []).find(p => p.id === aberto) ?? null

  const mudar = async (p: Pedido, status: StatusDigital) => {
    if (status === "cancelado" && !confirm(`Cancelar o ${p.id}? O link para de funcionar para o cliente.`)) return
    if (status === "enviado" && p.restante && !p.restantePagoEm && !confirm(`O restante de ${brl(p.restante)} ainda não caiu no extrato. Marcar como enviado mesmo assim?`)) return
    setMudando(true)
    try {
      const r = await fetch("/api/digital", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, status }) })
      const j = await r.json() as { erro?: string }
      if (!r.ok) { alert(j.erro ?? "Não deu para mudar."); return }
      aplicar(await buscar())
      if (status === "cancelado") setAberto(null)
    } finally { setMudando(false) }
  }
  const copiar = (t: string, qual = "link") => { void navigator.clipboard?.writeText(t); setCopiado(qual); setTimeout(() => setCopiado(null), 1500) }
  const acao = async (nome: string, corpo: Record<string, unknown>) => {
    setOcupado(nome)
    try {
      const r = await fetch("/api/digital", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
      const j = await r.json() as { erro?: string }
      if (!r.ok) alert(j.erro ?? "Não deu certo.")
      aplicar(await buscar())
    } finally { setOcupado(null) }
  }
  const subirArte = async (p: Pedido, f: File | undefined) => {
    if (!f) return
    setOcupado("arte")
    try {
      const fd = new FormData(); fd.append("file", f)
      const r = await fetch(`/api/d/${encodeURIComponent(p.id)}/arte`, { method: "POST", body: fd })
      const j = await r.json() as { erro?: string }
      if (!r.ok) alert(j.erro ?? "Não consegui subir a arte.")
      aplicar(await buscar())
    } finally { setOcupado(null) }
  }

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
          <Segmentado valor={filtro} onChange={setFiltro} opcoes={[{ v: "abertos", nome: "Abertos" }, { v: "pagos", nome: "Pagos" }, { v: "enviados", nome: "Enviados" }, { v: "acerto", nome: `Acerto${acerto.ids.length ? ` (${acerto.ids.length})` : ""}` }, { v: "todos", nome: "Todos" }]} />
          <div className="flex items-center gap-3">
            <p className="text-[11px] text-[#898892] hidden sm:block">Quem não paga recebe lembrete em 3 h, 24 h e 72 h</p>
            <Botao disabled={!!ocupado} onClick={() => { if (confirm("Criar um pedido de teste de R$ 20 (sinal R$ 10 + restante R$ 10) e mandar o link no seu WhatsApp?")) void acao("teste", { teste: true }) }}>Pedido de teste</Botao>
          </div>
        </div>
        {erro ? <Vazio icone={<X className="w-5 h-5" />} titulo="Não deu para carregar" sub={erro} />
          : !pedidos ? <p className="text-[12.5px] text-[#898892] px-3 py-2">Carregando…</p>
          : !lista.length ? <Vazio icone={<Printer className="w-5 h-5" />} titulo="Nada por aqui" sub={filtro === "abertos" ? "Nenhum orçamento esperando o sinal." : filtro === "acerto" ? "Nada para acertar com a Villa." : "Nenhum pedido nesta lista."} />
          : <div className="-mx-2">{lista.map(p => (
              <LinhaLista key={p.id} onClick={() => setAberto(p.id)} icone={ICONE[p.status]} tom={TOM_STATUS[p.status]}
                titulo={<>{p.nome || p.jid.split("@")[0]} <span className="text-[#898892] font-normal">· {p.id}</span>{p.teste && <Selo tom="info" className="ml-1.5">teste</Selo>}</>}
                sub={subDe(p)} valor={brl(p.total)}
                valorSub={<span className="hidden sm:inline"><Selo tom={TOM_STATUS[p.status]}>{ROTULO_STATUS[p.status]}</Selo></span>} />
            ))}</div>}
        {filtro === "acerto" && acerto.ids.length > 0 && (
          <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-[rgba(60,60,67,0.08)] flex-wrap">
            <p className="text-[12.5px] text-[#5e5c68]">A pagar para a Villa: <b className="text-[#191625] ds-num">{brl(acerto.total)}</b> · o resumo chega toda segunda no seu WhatsApp</p>
            <Botao variante="primario" disabled={!!ocupado} onClick={() => { if (confirm(`Marcar ${acerto.ids.length} pedido(s) como acertados (${brl(acerto.total)})?`)) void acao("acertar", { acertar: acerto.ids }) }} icone={<Check className="w-3.5 h-3.5" />}>Paguei a Villa</Botao>
          </div>
        )}
      </Cartao>

      <Cartao className="mt-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#191625] flex items-center gap-2"><Users className="w-4 h-4 text-[#8456e8]" />Contatos do digital</p>
            <p className="text-[11.5px] text-[#898892] mt-0.5">
              Designer: {contatos.designer ? `${contatos.designerNome || "cadastrada"} · ${contatos.designer}` : <span className="text-[#c57800]">falta cadastrar (o briefing vem para você)</span>}
              {" · "}Villa: {contatos.villa ? contatos.villa : <span className="text-[#c57800]">falta cadastrar (a arte aprovada vem para você encaminhar)</span>}
            </p>
          </div>
          {!editContatos && <Botao onClick={() => setEditContatos(contatos)}>Editar</Botao>}
        </div>
        {editContatos && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input value={editContatos.designerNome ?? ""} onChange={e => setEditContatos({ ...editContatos, designerNome: e.target.value })} placeholder="Nome da designer"
              className="h-9 rounded-lg px-3 text-[12.5px] text-[#191625] bg-white ds-borda focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20" />
            <input value={editContatos.designer ?? ""} onChange={e => setEditContatos({ ...editContatos, designer: e.target.value })} placeholder="WhatsApp da designer (5584…)" inputMode="numeric"
              className="h-9 rounded-lg px-3 text-[12.5px] text-[#191625] bg-white ds-borda focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20" />
            <input value={editContatos.villa ?? ""} onChange={e => setEditContatos({ ...editContatos, villa: e.target.value })} placeholder="WhatsApp do Leandro / Villa" inputMode="numeric"
              className="h-9 rounded-lg px-3 text-[12.5px] text-[#191625] bg-white ds-borda focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20" />
            <div className="sm:col-span-3 flex gap-2 justify-end">
              <Botao variante="fantasma" onClick={() => setEditContatos(null)}>Cancelar</Botao>
              <Botao variante="primario" disabled={!!ocupado} onClick={() => { void acao("contatos", { contatos: editContatos }).then(() => setEditContatos(null)) }}>Salvar</Botao>
            </div>
          </div>
        )}
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
                  <p><b className="text-[#191625]">Laminação:</b> {sel.briefing.laminacao === "brilho" ? "brilho" : "fosca"}</p>
                  {sel.briefing.referencias && <p className="whitespace-pre-wrap"><b className="text-[#191625]">Referências:</b> {sel.briefing.referencias}</p>}
                  {sel.briefing.arquivos > 0 && <p>{sel.briefing.arquivos} arquivo(s) enviado(s)</p>}
                </div>
              ) : <p className="text-[#898892]">O cliente ainda não preencheu.</p>}
            </div>

            {sel.status !== "aguardando_sinal" && sel.status !== "cancelado" && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#898892] mb-1.5 flex items-center gap-1.5"><Palette className="w-3.5 h-3.5" />Arte</p>
                {sel.arteAtual ? (
                  <div className="flex gap-3 items-start">
                    {/\.pdf($|\?)/i.test(sel.arteAtual.url)
                      ? <a href={sel.arteAtual.url} target="_blank" rel="noreferrer" className="w-20 h-20 rounded-lg ds-borda grid place-items-center text-[11px] text-[#8456e8] shrink-0">PDF</a>
                      // eslint-disable-next-line @next/next/no-img-element
                      : <a href={sel.arteAtual.url} target="_blank" rel="noreferrer" className="shrink-0"><img src={sel.arteAtual.url} alt="Arte" className="w-20 h-20 object-cover rounded-lg ds-borda" /></a>}
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[#191625] font-semibold">Versão {sel.versoes} · {sel.arteAprovadaEm ? `aprovada ${haQuanto(sel.arteAprovadaEm)}` : sel.arteEnviadaEm ? `com o cliente desde ${haQuanto(sel.arteEnviadaEm)}` : "ainda não foi para o cliente"}</p>
                      {sel.ajustes.length > 0 && <p className="whitespace-pre-wrap"><b className="text-[#c57800]">Ajuste pedido:</b> {sel.ajustes.at(-1)!.texto}</p>}
                    </div>
                  </div>
                ) : <p className="text-[#898892]">{sel.designerAvisadoEm ? `Designer recebeu o briefing ${haQuanto(sel.designerAvisadoEm)}.` : "Nenhuma arte ainda."}</p>}
                {!sel.arteAprovadaEm && (
                  <div className="flex gap-2 flex-wrap mt-2">
                    <label className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg ds-borda text-[12px] font-semibold text-[#191625] cursor-pointer ${ocupado ? "opacity-60 pointer-events-none" : ""}`}>
                      {ocupado === "arte" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}{sel.arteAtual ? "Nova versão" : "Subir arte"}
                      <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={e => void subirArte(sel, e.target.files?.[0])} />
                    </label>
                    {sel.arteAtual && !sel.arteEnviadaEm && <Botao variante="primario" disabled={!!ocupado} onClick={() => void acao("mandarArte", { id: sel.id, acao: "mandarArte" })} icone={<Send className="w-3.5 h-3.5" />}>Mandar para aprovar</Botao>}
                    <Botao disabled={!!ocupado} onClick={() => void acao("designer", { id: sel.id, acao: "designer" })}>Briefing à designer</Botao>
                    <button onClick={() => copiar(sel.linkDesigner, "designer")} className="inline-flex items-center gap-1 text-[12px] text-[#8456e8] hover:underline">
                      {copiado === "designer" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Link da designer
                    </button>
                  </div>
                )}
              </div>
            )}

            {sel.arteAprovadaEm && (
              <div className="rounded-xl bg-[rgba(116,116,128,0.06)] px-3.5 py-3 space-y-1.5">
                <p className="flex items-center gap-2"><Printer className="w-3.5 h-3.5" />{sel.villaEnviadoEm ? `Na Villa desde ${haQuanto(sel.villaEnviadoEm)}${sel.acertadoEm ? " · acertado" : " · falta acertar"}` : "Ainda não foi para a Villa"}
                  {!sel.villaEnviadoEm && <button className="text-[#8456e8] hover:underline ml-1" disabled={!!ocupado} onClick={() => void acao("villa", { id: sel.id, acao: "villa" })}>mandar agora</button>}</p>
                <p className="flex items-center gap-2"><Wallet className="w-3.5 h-3.5" />Restante {brl(sel.restante ?? 0)}{sel.frete ? ` (com frete ${brl(sel.frete)})` : ""}: {sel.restantePagoEm ? <b className="text-[#009351]">pago {haQuanto(sel.restantePagoEm)}</b> : "esperando Pix"}</p>
                <p className="flex items-center gap-2"><Truck className="w-3.5 h-3.5" />{sel.entrega ? `${sel.entrega.endereco} · CEP ${sel.entrega.cep}` : "Cliente ainda não mandou o endereço"}</p>
                {!sel.restantePagoEm && (
                  <div className="flex gap-2 items-center pt-1">
                    <input value={frete} onChange={e => setFrete(e.target.value)} placeholder={sel.frete ? String(sel.frete) : "Frete R$"} inputMode="decimal"
                      className="w-28 h-8 rounded-lg px-2.5 text-[12.5px] text-[#191625] bg-white ds-borda focus:outline-none" />
                    <Botao disabled={!!ocupado || !frete.trim()} onClick={() => { void acao("frete", { id: sel.id, acao: "frete", frete: Number(frete.replace(",", ".")) }).then(() => setFrete("")) }}>Somar frete ao restante</Botao>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 flex-wrap">
              <a href={sel.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[#8456e8] hover:underline">Ver a página do pedido <ExternalLink className="w-3 h-3" /></a>
              <button onClick={() => copiar(sel.link)} className="inline-flex items-center gap-1 text-[12px] text-[#8456e8] hover:underline">
                {copiado === "link" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copiar link
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
