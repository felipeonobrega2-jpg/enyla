"use client"

// Painel → Propostas para aprovar: o agente montou a proposta do lead bom (medida + quantidade, seu markup da faixa).
// Você confere, ajusta o preço se quiser e aprova: o ORC é criado e a proposta com o link de aprovação vai para o
// cliente no WhatsApp. Cada ajuste ensina o markup das próximas.

import { useEffect, useState } from "react"
import { FileCheck2, Send, X, MessageCircle, Pencil, AlertTriangle } from "lucide-react"
import { Cartao, TituloCartao, Selo, Botao } from "./ds"
import type { PropostaPronta } from "../lib/propostaPronta"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 })
const un = (n: number) => n.toLocaleString("pt-BR")
const pct = (n: number) => `${Math.round(n * 100)}%`
const haQuanto = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  return m < 60 ? `há ${Math.max(1, m)} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`
}
const parseValor = (s: string) => { const n = parseFloat(s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0 }

function Proposta({ p, onFeito, onAbrirConversa }: { p: PropostaPronta; onFeito: (msg: string) => void; onAbrirConversa?: (jid: string, nome?: string) => void }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(p.preco.toFixed(2).replace(".", ","))
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(p.erro ?? null)
  const novo = editando ? parseValor(valor) : p.preco
  const margem = novo > 0 ? (novo - p.custo) / novo : 0
  const f = p.form

  async function acao(acao: "aprovar" | "descartar") {
    setOcupado(true); setErro(null)
    const r = await fetch("/api/proposta-pronta", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, acao, ...(acao === "aprovar" && editando ? { preco: novo } : {}) }),
    }).then(r => r.json()).catch(() => ({ ok: false, erro: "Sem conexão" }))
    setOcupado(false)
    if (acao === "descartar") return onFeito("Proposta descartada.")
    if (!r.ok) return setErro(r.erro ?? "Não consegui aprovar.")
    onFeito(r.enviou ? `${r.numero} criado e enviado ao cliente.` : `${r.numero} criado, mas a mensagem não saiu (${r.erro ?? "WhatsApp"}). Mande pelo orçamento.`)
  }

  return (
    <div className="rounded-xl p-3.5" style={{ border: "1px solid rgba(25,22,37,0.1)" }}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5 sm:gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#191625] truncate">{p.nome || "Sem nome"}</p>
          <p className="text-[11.5px] text-[#898892] mt-0.5">
            {un(p.quantidade)} un · {f.frente} × {f.alturaBox} × {f.lateral} cm · {f.materialNome}{f.incluirVerniz && f.vernizTipo ? ` · verniz ${f.vernizTipo}` : ""} · {haQuanto(p.em)}
          </p>
        </div>
        <div className="sm:text-right shrink-0">
          <p className="text-[16px] font-semibold ds-num text-[#191625]">{brl(novo)}</p>
          <p className="text-[11px] ds-num" style={{ color: margem >= 0.4 ? "#009351" : margem >= 0.25 ? "#c57800" : "#d92d20" }}>margem {pct(margem)} · custo {brl(p.custo)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {p.medidaPadrao && <Selo tom="alerta">Medida padrão pelo ml: confirme com o cliente</Selo>}
        <Selo tom={p.origemMarkup === "seus_orcamentos" ? "sucesso" : "neutro"}>
          Markup {p.multiplicador.toLocaleString("pt-BR")}× {p.origemMarkup === "seus_orcamentos" ? "(como você cobra nos pedidos fechados dessa faixa)" : "(padrão das Configurações)"}
        </Selo>
      </div>

      {p.opcoes.length > 1 && (
        <p className="text-[11.5px] text-[#5d5b66] mt-2 ds-num">
          Também vai: {p.opcoes.filter(o => o.quantidade !== p.quantidade).map(o => `${un(o.quantidade)} un ${brl(o.preco * (p.preco > 0 ? novo / p.preco : 1))}`).join(" · ")}
        </p>
      )}
      {p.dados?.resumo && <p className="text-[11.5px] text-[#898892] mt-1.5 line-clamp-2">{p.dados.resumo}</p>}

      {editando && (
        <label className="flex items-center gap-2 mt-3">
          <span className="text-[12px] text-[#5d5b66]">Preço das {un(p.quantidade)} un</span>
          <input value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" autoFocus
            className="h-9 w-32 rounded-lg border border-[rgba(25,22,37,0.15)] px-2.5 text-[13px] ds-num" />
          <span className="text-[11px] text-[#898892]">as outras quantidades acompanham</span>
        </label>
      )}
      {erro && <p className="text-[12px] text-[#d92d20] mt-2 flex items-center gap-1.5"><AlertTriangle size={13} />{erro}</p>}

      <div className="flex flex-wrap gap-2 mt-3">
        <Botao variante="primario" icone={<Send size={14} />} disabled={ocupado || novo <= 0} onClick={() => acao("aprovar")}>
          {ocupado ? "Enviando…" : "Aprovar e enviar"}
        </Botao>
        {!editando && <Botao icone={<Pencil size={14} />} onClick={() => setEditando(true)} disabled={ocupado}>Ajustar preço</Botao>}
        {onAbrirConversa && <Botao variante="fantasma" icone={<MessageCircle size={14} />} onClick={() => onAbrirConversa(p.jid, p.nome ?? undefined)}>Conversa</Botao>}
        <Botao variante="fantasma" icone={<X size={14} />} onClick={() => acao("descartar")} disabled={ocupado}>Descartar</Botao>
      </div>
    </div>
  )
}

export function PropostasProntasCard({ onAbrirConversa, iniciais }: { onAbrirConversa?: (jid: string, nome?: string) => void; iniciais?: PropostaPronta[] }) {
  const [lista, setLista] = useState<PropostaPronta[] | null>(iniciais ?? null)
  const [aviso, setAviso] = useState<string | null>(null)
  const carregar = () => fetch("/api/proposta-pronta").then(r => r.json()).then(d => setLista(d.propostas ?? [])).catch(() => setLista([]))
  useEffect(() => { if (!iniciais) carregar() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const aguardando = (lista ?? []).filter(p => p.status === "aguardando")
  const enviadasSemana = (lista ?? []).filter(p => p.status === "enviada" && Date.now() - new Date(p.enviadaEm ?? p.em).getTime() < 7 * 86_400_000)
  if (!aguardando.length && !aviso) return null

  return (
    <Cartao>
      <TituloCartao icone={<FileCheck2 size={16} />} titulo="Propostas para aprovar"
        sub={`O agente montou com medida, quantidade e o seu markup. Aprovou, vai para o cliente com o link de aprovação.${enviadasSemana.length ? ` ${enviadasSemana.length} enviada${enviadasSemana.length > 1 ? "s" : ""} nesta semana.` : ""}`} />
      {aviso && <p className="text-[12.5px] text-[#009351] mb-3">{aviso}</p>}
      <div className="flex flex-col gap-2.5">
        {aguardando.map(p => (
          <Proposta key={p.id} p={p} onAbrirConversa={onAbrirConversa}
            onFeito={msg => { setAviso(msg); if (iniciais) setLista(l => (l ?? []).filter(x => x.id !== p.id)); else carregar() }} />
        ))}
      </div>
    </Cartao>
  )
}
