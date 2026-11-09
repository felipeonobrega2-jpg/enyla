"use client"

// Cartuxo · pedidos feitos no site da loja. Quem pagou, quem ficou no meio do caminho e o que cada um levou.
// Pedido pago entra sozinho na chapa (tela Chapas).

import { useCallback, useEffect, useMemo, useState } from "react"
import { ShoppingBag, Wallet, Clock, Receipt, MessageCircle, ExternalLink, AlertTriangle, RotateCcw, Truck, Archive, Undo2 } from "lucide-react"
import ArtePedido, { resumoArte } from "./ArtePedido"
import type { Acompanhamento } from "../lib/acompanhamento"
import { situacao, esfriouDeVez, mensagem, linkWhats, quandoTexto, MOTIVOS, type Recuperacao, type Situacao } from "../lib/recuperacao"
import { Pagina, CabecalhoPagina, Cartao, Kpi, GradeKpis, Selo, Botao, Segmentado, LinhaLista, Vazio, Gaveta, type Tom } from "@/app/components/ds"
import { SITE_CARTUXO, DOMINIO_CARTUXO } from "../lib/site"

type Item = { nome: string; medida: string; qtd: number; acab: string; prazo: string; marca: string | null; freteIncluso: boolean; total: number }
type Pedido = {
  id: string; numero: string; status: string; forma: string; criadoEm: string; total: number; pago: number
  cliente: { nome: string; email: string; telefone: string; documento: string }; cidade: string
  itens: Item[]; metodo: string | null; recusado?: boolean; acompanhamento?: Acompanhamento | null
}
type Filtro = "pagos" | "arte" | "aguardando" | "arquivados" | "todos"

const SITE = SITE_CARTUXO
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const n = (x: number) => x.toLocaleString("pt-BR")
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
const pago = (p: Pedido) => p.status === "pago" || p.status === "sinal_pago"
const STATUS: Record<string, { tom: Tom; texto: string }> = {
  pago: { tom: "sucesso", texto: "Pago" },
  sinal_pago: { tom: "sucesso", texto: "Sinal pago" },
  aguardando_pagamento: { tom: "alerta", texto: "Aguardando pagamento" },
  cancelado: { tom: "neutro", texto: "Cancelado" },
}

export default function PedidosSiteView({ onVerChapas }: { onVerChapas?: () => void }) {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null)
  const [erro, setErro] = useState("")
  const [filtro, setFiltro] = useState<Filtro>("pagos")
  const [aberto, setAberto] = useState<Pedido | null>(null)
  const [rec, setRec] = useState<Recuperacao>({})
  const [avisoRec, setAvisoRec] = useState("")
  const [texto, setTexto] = useState("")
  const [motivo, setMotivo] = useState("")
  const [agora, setAgora] = useState(() => Date.now())

  const buscar = useCallback(() => fetch("/api/cartuxo/pedidos").then(r => r.json())
    .then(j => { if (j.erro) setErro(j.erro); else { setErro(""); setPedidos(j.pedidos ?? []); setRec(j.recuperacao ?? {}); setAvisoRec(j.avisoRecuperacao ?? ""); setAgora(Date.now()) } })
    .catch(() => setErro("Sem conexão")), [])
  useEffect(() => { buscar() }, [buscar])

  const sit = useCallback((p: Pedido) => situacao(p, rec[p.id], agora), [rec, agora])
  const arquivado = (p: Pedido) => !!rec[p.id]?.arquivado

  // Mensagem do toque da vez ao abrir um pedido parado
  useEffect(() => {
    if (!aberto || aberto.status !== "aguardando_pagamento") return
    const s = situacao(aberto, rec[aberto.id])
    const toque = s.tipo === "chamar" || s.tipo === "esperar" ? s.toque : 3
    setTexto(mensagem(aberto, toque)); setMotivo("")
  }, [aberto, rec])

  async function agir(acao: "toque" | "desfazer" | "arquivar" | "reabrir", p: Pedido, extra: object = {}) {
    try {
      const j = await fetch("/api/cartuxo/pedidos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao, pedido: p.id, ...extra }) }).then(x => x.json())
      if (j.erro) { setAvisoRec(j.erro); return false }
      setRec(j.recuperacao ?? {}); setAgora(Date.now()); return true
    } catch { setAvisoRec("Sem conexão"); return false }
  }

  const r = useMemo(() => {
    const t = pedidos ?? []
    const desde = Date.now() - 30 * 86_400_000
    const pagos30 = t.filter(p => pago(p) && new Date(p.criadoEm).getTime() >= desde)
    const fat = pagos30.reduce((s, p) => s + p.pago, 0)
    const caixas = pagos30.reduce((s, p) => s + p.itens.reduce((a, i) => a + i.qtd, 0), 0)
    return {
      pagos: pagos30.length, fat, ticket: pagos30.length ? fat / pagos30.length : 0, caixas,
      aguardando: t.filter(p => p.status === "aguardando_pagamento" && !arquivado(p)),
      chamar: t.filter(p => p.status === "aguardando_pagamento" && sit(p).tipo === "chamar").length,
      recuperados: pagos30.filter(p => (rec[p.id]?.toques.length ?? 0) > 0).length,
      arte: t.filter(p => pago(p) && resumoArte(p).suaVez).length,
    }
  }, [pedidos, rec, sit])

  const ordemSit = (s: Situacao) => (s.tipo === "chamar" ? 0 : s.tipo === "esperar" ? 1 : 2)
  const lista = (pedidos ?? [])
    .filter(p => filtro === "todos" || (filtro === "pagos" ? pago(p) : filtro === "arte" ? pago(p) && resumoArte(p).suaVez
      : filtro === "arquivados" ? p.status === "aguardando_pagamento" && arquivado(p)
      : p.status === "aguardando_pagamento" && !arquivado(p)))
    .sort((a, b) => filtro === "aguardando" ? ordemSit(sit(a)) - ordemSit(sit(b)) : 0)
  const seloParado = (p: Pedido) => {
    const s = sit(p)
    if (s.tipo === "chamar") return <Selo tom="alerta">{s.toque}º toque · chamar agora</Selo>
    if (s.tipo === "esperar") return <Selo tom="neutro">{s.toque}º toque {quandoTexto(s.quando, agora)}</Selo>
    if (s.tipo === "arquivado") return <Selo tom="neutro">{s.motivo}</Selo>
    return <Selo tom="neutro">{esfriouDeVez(s, agora) ? "esfriou · arquivar" : "3 toques feitos"}</Selo>
  }

  return (
    <Pagina>
      <CabecalhoPagina titulo="Pedidos do site" sub={`Pedidos feitos em ${DOMINIO_CARTUXO} nos últimos 90 dias. Pedido pago entra sozinho na chapa.`}
        acoes={<div className="flex gap-2">
          <Botao icone={<RotateCcw className="w-3.5 h-3.5" />} onClick={buscar}>Atualizar</Botao>
          <a href={SITE} target="_blank" rel="noopener"><Botao icone={<ExternalLink className="w-3.5 h-3.5" />}>Abrir o site</Botao></a>
        </div>} />

      {avisoRec && <Cartao className="mb-4"><p className="text-[13px] text-[#c27c0e] flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{avisoRec}</p></Cartao>}
      {erro && <Cartao className="mb-4"><p className="text-[13px] text-[#d33a3c] flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{erro}</p></Cartao>}

      <GradeKpis>
        <Kpi rotulo="Pedidos pagos (30 dias)" valor={pedidos ? r.pagos : null} formato={n} sub={r.recuperados ? `${r.recuperados} depois de um toque no WhatsApp` : undefined}
          icone={<ShoppingBag className="w-3.5 h-3.5" />} onClick={() => setFiltro("pagos")} destaque={filtro === "pagos"} />
        <Kpi rotulo="Faturamento (30 dias)" valor={pedidos ? r.fat : null} formato={brl} tom="sucesso" sub={`${n(r.caixas)} caixas vendidas`} icone={<Wallet className="w-3.5 h-3.5" />} />
        <Kpi rotulo="Ticket médio" valor={pedidos ? r.ticket : null} formato={brl} icone={<Receipt className="w-3.5 h-3.5" />} />
        <Kpi rotulo="Pararam no pagamento" valor={pedidos ? r.aguardando.length : null} formato={n} tom={r.aguardando.length ? "alerta" : "neutro"}
          sub={r.aguardando.length ? `${r.chamar ? `${r.chamar} para chamar agora · ` : ""}${brl(r.aguardando.reduce((s, p) => s + p.total, 0))}` : "ninguém parado"} icone={<Clock className="w-3.5 h-3.5" />}
          onClick={() => setFiltro("aguardando")} destaque={filtro === "aguardando"} />
      </GradeKpis>

      <div className="mt-6 mb-3">
        <Segmentado<Filtro> valor={filtro} onChange={setFiltro}
          opcoes={[{ v: "pagos", nome: "Pagos" }, { v: "arte", nome: `Arte para fazer${r.arte ? ` (${r.arte})` : ""}` }, { v: "aguardando", nome: `Aguardando${r.aguardando.length ? ` (${r.aguardando.length})` : ""}` }, { v: "arquivados", nome: "Desistiram" }, { v: "todos", nome: "Todos" }]} />
      </div>

      <Cartao padding={false}>
        {!pedidos ? <p className="p-5 text-[13px] text-[#8E8E93]">Lendo os pedidos do site</p>
          : lista.length === 0 ? <Vazio icone={<ShoppingBag className="w-9 h-9 text-[#c7c7cc]" />} titulo="Nenhum pedido aqui"
            sub={filtro === "aguardando" ? "Ninguém parou no pagamento." : filtro === "arquivados" ? "Quem desistir aparece aqui, com o motivo." : `Os pedidos de ${DOMINIO_CARTUXO} aparecem aqui.`} />
          : lista.map(p => {
            const s = STATUS[p.status] ?? { tom: "neutro" as Tom, texto: p.status }
            const caixas = p.itens.reduce((a, i) => a + i.qtd, 0)
            return (
              <LinhaLista key={p.id} onClick={() => setAberto(p)}
                titulo={`${p.cliente?.nome ?? "—"} · ${p.numero}`}
                sub={`${p.itens.map(i => i.nome.replace(/^Caixa para /, "")).join(", ")} · ${n(caixas)} un · ${quando(p.criadoEm)}`}
                valor={brl(p.total)} valorSub={p.status === "aguardando_pagamento" ? seloParado(p) : pago(p) ? (() => { const x = resumoArte(p); return <Selo tom={x.tom}>{x.texto}</Selo> })() : <Selo tom={s.tom}>{s.texto}</Selo>} />
            )
          })}
      </Cartao>

      <Gaveta aberta={!!aberto} onFechar={() => setAberto(null)} titulo={aberto ? `${aberto.numero} · ${aberto.cliente?.nome ?? ""}` : ""}
        sub={aberto ? `${quando(aberto.criadoEm)} · ${aberto.forma === "cartao" ? "cartão" : aberto.forma === "pix" ? "Pix" : aberto.forma}${aberto.metodo && !/pix|cart/i.test(aberto.metodo) ? ` (${aberto.metodo})` : ""}` : undefined}
        rodape={aberto && <div className="flex gap-2 justify-end flex-wrap">
          {aberto.status !== "aguardando_pagamento" && <a href={linkWhats(aberto.cliente?.telefone ?? "", "")} target="_blank" rel="noopener"><Botao icone={<MessageCircle className="w-3.5 h-3.5" />}>WhatsApp do cliente</Botao></a>}
          <a href={`${SITE}/pedido/${aberto.numero}`} target="_blank" rel="noopener"><Botao icone={<ExternalLink className="w-3.5 h-3.5" />}>Página do pedido</Botao></a>
          {pago(aberto) && onVerChapas && <Botao variante="primario" onClick={() => { setAberto(null); onVerChapas() }}>Ver nas chapas</Botao>}
        </div>}>
        {aberto && (
          <div className="space-y-5 text-[13px]">
            {aberto.status === "aguardando_pagamento" && (() => {
              const s = sit(aberto), reg = rec[aberto.id], toques = reg?.toques ?? []
              return (
                <div>
                  <p className="text-[11px] uppercase tracking-wide font-bold text-[#8E8E93] mb-2">Recuperar o pagamento</p>
                  <div className="ds-borda rounded-lg p-3 space-y-3">
                    <p className="text-[12.5px]">
                      {s.tipo === "chamar" ? <>Hora do <b>{s.toque}º toque</b>. {aberto.recusado && s.toque === 1 ? "O pagamento foi recusado: nada foi cobrado." : `Pedido feito ${quandoTexto(new Date(aberto.criadoEm).getTime(), agora)}.`}</>
                        : s.tipo === "esperar" ? <>Próximo toque {quandoTexto(s.quando, agora)}. Se quiser, já dá para mandar.</>
                        : s.tipo === "arquivado" ? <>Arquivado: {s.motivo}.</>
                        : <>Os 3 toques foram feitos. {esfriouDeVez(s, agora) ? "Já faz uma semana: vale arquivar com o motivo." : "Espere a resposta."}</>}
                    </p>
                    {s.tipo !== "arquivado" && <>
                      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={6} className="w-full rounded-lg ds-borda px-2.5 py-2 text-[12.5px] leading-relaxed" aria-label="Mensagem" />
                      <div className="flex gap-2 flex-wrap">
                        <a href={linkWhats(aberto.cliente?.telefone ?? "", texto)} target="_blank" rel="noopener"
                          onClick={() => { if (toques.length < 3) agir("toque", aberto) }}>
                          <Botao variante="primario" icone={<MessageCircle className="w-3.5 h-3.5" />}>Mandar no WhatsApp</Botao>
                        </a>
                      </div>
                    </>}
                    {toques.length > 0 && (
                      <div className="text-[12px] text-[#8E8E93] flex items-center gap-2 flex-wrap">
                        <span>{toques.map((t, i) => `${i + 1}º toque ${quandoTexto(new Date(t).getTime(), agora)}`).join(" · ")}</span>
                        <button type="button" onClick={() => agir("desfazer", aberto)} className="inline-flex items-center gap-1 hover:text-[#191625]"><Undo2 className="w-3 h-3" />desfazer o último</button>
                      </div>
                    )}
                    <div className="pt-2 border-t border-[rgba(0,0,0,0.06)]">
                      {s.tipo === "arquivado"
                        ? <Botao icone={<Undo2 className="w-3.5 h-3.5" />} onClick={() => agir("reabrir", aberto)}>Voltar para aguardando</Botao>
                        : <div className="flex gap-2 items-center flex-wrap">
                          <select value={motivo} onChange={e => setMotivo(e.target.value)} className="h-9 rounded-lg ds-borda px-2 text-[12.5px] bg-white" aria-label="Motivo">
                            <option value="">Desistiu? Por quê</option>
                            {MOTIVOS.map(m => <option key={m}>{m}</option>)}
                          </select>
                          <Botao icone={<Archive className="w-3.5 h-3.5" />} disabled={!motivo} onClick={async () => { if (await agir("arquivar", aberto, { motivo })) setAberto(null) }}>Arquivar</Botao>
                        </div>}
                    </div>
                  </div>
                </div>
              )
            })()}
            {pago(aberto) && <ArtePedido p={aberto} onPedidos={l => { const lista = l as Pedido[]; setPedidos(lista); setAberto(lista.find(x => x.id === aberto.id) ?? null) }} />}
            <div>
              <p className="text-[11px] uppercase tracking-wide font-bold text-[#8E8E93] mb-2">Itens</p>
              <div className="ds-borda rounded-lg divide-y divide-[rgba(0,0,0,0.06)]">
                {aberto.itens.map((i, k) => (
                  <div key={k} className="p-3 flex justify-between gap-3">
                    <div>
                      <p className="font-medium">{i.nome} <span className="text-[#8E8E93] font-normal">({i.medida})</span></p>
                      <p className="text-[12px] text-[#8E8E93]">{n(i.qtd)} un · {i.acab} · {i.prazo}{i.marca ? ` · ${i.marca}` : ""}</p>
                      {i.freteIncluso && <p className="text-[12px] text-[#009351] flex items-center gap-1"><Truck className="w-3 h-3" />frete grátis incluso (oferta do Google)</p>}
                    </div>
                    <span className="font-semibold ds-num shrink-0">{brl(i.total)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 px-1"><span className="text-[#8E8E93]">Total · pago</span><span className="font-semibold ds-num">{brl(aberto.total)} · {brl(aberto.pago)}</span></div>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide font-bold text-[#8E8E93] mb-2">Cliente</p>
              <div className="ds-borda rounded-lg p-3 space-y-1">
                <p>{aberto.cliente?.nome}</p>
                <p className="text-[#8E8E93]">{aberto.cliente?.email} · {aberto.cliente?.telefone}</p>
                <p className="text-[#8E8E93]">CPF/CNPJ {aberto.cliente?.documento} · {aberto.cidade}</p>
              </div>
            </div>
          </div>
        )}
      </Gaveta>
    </Pagina>
  )
}
