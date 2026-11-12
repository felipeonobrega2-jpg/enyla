"use client"

// Painel → Negociações do digital: cliente pediu desconto num orçamento esperando o sinal. Você vê o que ele pediu e
// quanto sobra de margem nesse valor, e decide: aprovar (o pedido muda e ele recebe o valor novo pelo mesmo link),
// outro valor, recusar (ele recebe que esse é o melhor valor) ou responder você mesmo.

import { useEffect, useState } from "react"
import { Handshake, Check, X, MessageCircle, AlertTriangle } from "lucide-react"
import { Cartao, TituloCartao, Botao } from "./ds"
import type { Negociacao } from "../lib/digital"

type Pedido = { id: string; jid: string; nome: string | null; quantidade: number; total: number; custo: number; arte: number; status: string; negociacao: Negociacao | null }

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const parseValor = (s: string) => { const n = parseFloat(s.replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0 }
const haQuanto = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  return m < 60 ? `há ${Math.max(1, m)} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`
}

function Item({ p, onFeito, onAbrirConversa }: { p: Pedido; onFeito: () => void; onAbrirConversa?: (jid: string, nome?: string) => void }) {
  const n = p.negociacao!
  const [outro, setOutro] = useState(false)
  const [valor, setValor] = useState(n.pedidoTotal ? n.pedidoTotal.toFixed(2).replace(".", ",") : "")
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const custo = p.custo + (p.arte ?? 0)
  const margemEm = (t: number) => t - custo

  async function decidir(decisao: "aprovar" | "recusar" | "eu", total?: number) {
    setOcupado(decisao); setErro(null)
    const r = await fetch("/api/digital", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, acao: "negociacao", decisao, total }) })
      .then(r => r.json()).catch(() => ({ erro: "Sem conexão" }))
    setOcupado(null)
    if (r.erro) return setErro(r.erro)
    onFeito()
  }

  const novo = outro ? parseValor(valor) : n.pedidoTotal ?? 0
  return (
    <div className="rounded-xl p-3.5" style={{ border: "1px solid rgba(25,22,37,0.1)" }}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5 sm:gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#191625] truncate">{p.nome || "Cliente"} <span className="font-normal text-[#898892]">· {p.id}</span></p>
          <p className="text-[11.5px] text-[#898892] mt-0.5">{p.quantidade.toLocaleString("pt-BR")} caixinhas · está {brl(p.total)} ({brl(p.total / p.quantidade)}/un) · {haQuanto(n.em)}</p>
        </div>
        {n.pedidoTotal != null && (
          <div className="sm:text-right shrink-0">
            <p className="text-[11px] text-[#898892]">pediu</p>
            <p className="text-[16px] font-semibold ds-num text-[#191625]">{brl(n.pedidoTotal)}</p>
            <p className="text-[11px] ds-num" style={{ color: margemEm(n.pedidoTotal) > 0 ? "#009351" : "#d92d20" }}>
              {brl(n.pedidoTotal / p.quantidade)}/un · sua margem {brl(margemEm(n.pedidoTotal))}
            </p>
          </div>
        )}
      </div>
      {n.texto && <p className="text-[12.5px] text-[#5d5b66] mt-2 rounded-lg bg-[rgba(116,116,128,0.06)] px-3 py-2">“{n.texto}”</p>}
      <p className="text-[11.5px] text-[#898892] mt-2 ds-num">No valor de hoje sua margem é {brl(margemEm(p.total))} (custo {brl(custo)}).</p>

      {outro && (
        <label className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-[12px] text-[#5e5c68]">Total para as {p.quantidade.toLocaleString("pt-BR")}</span>
          <input value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" autoFocus
            className="h-9 w-32 rounded-lg px-2.5 text-[13px] ds-num" style={{ border: "1px solid rgba(25,22,37,0.15)" }} />
          {novo > 0 && <span className="text-[11.5px] ds-num" style={{ color: margemEm(novo) > 0 ? "#009351" : "#d92d20" }}>{brl(novo / p.quantidade)}/un · margem {brl(margemEm(novo))}</span>}
        </label>
      )}
      {erro && <p className="text-[12px] text-[#d92d20] mt-2 flex items-center gap-1.5"><AlertTriangle size={13} />{erro}</p>}

      <div className="flex flex-wrap gap-2 mt-3">
        {(outro || n.pedidoTotal != null) && (
          <Botao variante="primario" icone={<Check size={14} />} disabled={!!ocupado || !(novo > 0)} onClick={() => decidir("aprovar", novo)}>
            {ocupado === "aprovar" ? "Enviando…" : `Aprovar ${novo > 0 ? brl(novo) : ""}`}
          </Botao>
        )}
        {!outro && <Botao onClick={() => setOutro(true)} disabled={!!ocupado}>Outro valor</Botao>}
        <Botao icone={<X size={14} />} onClick={() => decidir("recusar")} disabled={!!ocupado}>{ocupado === "recusar" ? "Enviando…" : "Recusar"}</Botao>
        {onAbrirConversa && <Botao variante="fantasma" icone={<MessageCircle size={14} />} onClick={() => onAbrirConversa(p.jid, p.nome ?? undefined)}>Conversa</Botao>}
        <Botao variante="fantasma" onClick={() => decidir("eu")} disabled={!!ocupado}>Eu respondo</Botao>
      </div>
    </div>
  )
}

export function NegociacoesDigitalCard({ onAbrirConversa, iniciais }: { onAbrirConversa?: (jid: string, nome?: string) => void; iniciais?: Pedido[] }) {
  const [lista, setLista] = useState<Pedido[] | null>(iniciais ?? null)
  const carregar = () => fetch("/api/digital").then(r => r.json()).then(d => setLista(d.pedidos ?? [])).catch(() => setLista([]))
  useEffect(() => { if (!iniciais) carregar() }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const abertas = (lista ?? []).filter(p => p.status === "aguardando_sinal" && p.negociacao?.status === "aguardando")
  if (!abertas.length) return null
  return (
    <Cartao>
      <TituloCartao icone={<Handshake size={16} />} titulo="Negociações do digital"
        sub="Cliente pediu desconto num orçamento esperando o sinal. Aprovado, o pedido muda e ele recebe o valor novo pelo mesmo link; recusado, ele recebe que esse já é o melhor valor." />
      <div className="flex flex-col gap-2.5">
        {abertas.map(p => <Item key={p.id} p={p} onAbrirConversa={onAbrirConversa} onFeito={() => iniciais ? setLista(l => (l ?? []).filter(x => x.id !== p.id)) : carregar()} />)}
      </div>
    </Cartao>
  )
}
