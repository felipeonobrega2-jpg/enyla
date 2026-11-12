"use client"

// Painel → Propostas para aprovar: o agente montou a proposta do lead bom (medida + quantidade, seu markup da faixa).
// Aprovar: salva o ORC e abre o envio de sempre (PDF + mensagem + link). Ajustar: abre na mesa de orçamento, com o
// destrinche, para você mexer e salvar. O preço que você salvar ensina o markup das próximas.

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

function Proposta({ p, onAbrir, onDescartar, onAbrirConversa }: {
  p: PropostaPronta; onAbrir: (p: PropostaPronta, enviar: boolean) => void; onDescartar: () => void; onAbrirConversa?: (jid: string, nome?: string) => void
}) {
  const margem = p.preco > 0 ? (p.preco - p.custo) / p.preco : 0
  const f = p.form
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
          <p className="text-[16px] font-semibold ds-num text-[#191625]">{brl(p.preco)}</p>
          <p className="text-[11px] ds-num" style={{ color: margem >= 0.4 ? "#009351" : margem >= 0.25 ? "#c57800" : "#d92d20" }}>margem {pct(margem)} · custo {brl(p.custo)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2.5">
        <Selo tom={p.origemMarkup === "seus_orcamentos" ? "sucesso" : "neutro"}>
          Markup {p.multiplicador.toLocaleString("pt-BR")}× {p.origemMarkup === "seus_orcamentos" ? "(como você cobra nos pedidos fechados dessa faixa)" : "(padrão das Configurações)"}
        </Selo>
      </div>

      {p.opcoes.length > 1 && (
        <p className="text-[11.5px] text-[#5d5b66] mt-2 ds-num">
          Também vai: {p.opcoes.filter(o => o.quantidade !== p.quantidade).map(o => `${un(o.quantidade)} un ${brl(o.preco)}`).join(" · ")}
        </p>
      )}
      {p.dados?.resumo && <p className="text-[11.5px] text-[#898892] mt-1.5 line-clamp-2">{p.dados.resumo}</p>}
      {p.erro && <p className="text-[12px] text-[#d92d20] mt-2 flex items-center gap-1.5"><AlertTriangle size={13} />{p.erro}</p>}

      <div className="flex flex-wrap gap-2 mt-3">
        <Botao variante="primario" icone={<Send size={14} />} onClick={() => onAbrir(p, true)}>Aprovar e enviar</Botao>
        <Botao icone={<Pencil size={14} />} onClick={() => onAbrir(p, false)}>Ajustar no orçamento</Botao>
        {onAbrirConversa && <Botao variante="fantasma" icone={<MessageCircle size={14} />} onClick={() => onAbrirConversa(p.jid, p.nome ?? undefined)}>Conversa</Botao>}
        <Botao variante="fantasma" icone={<X size={14} />} onClick={onDescartar}>Descartar</Botao>
      </div>
    </div>
  )
}

export function PropostasProntasCard({ onAbrir, onAbrirConversa, iniciais }: {
  onAbrir: (p: PropostaPronta, enviar: boolean) => void
  onAbrirConversa?: (jid: string, nome?: string) => void
  iniciais?: PropostaPronta[]
}) {
  const [lista, setLista] = useState<PropostaPronta[] | null>(iniciais ?? null)
  const carregar = () => fetch("/api/proposta-pronta").then(r => r.json()).then(d => setLista(d.propostas ?? [])).catch(() => setLista([]))
  useEffect(() => { if (!iniciais) carregar() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const aguardando = (lista ?? []).filter(p => p.status === "aguardando")
  const enviadasSemana = (lista ?? []).filter(p => p.status === "enviada" && Date.now() - new Date(p.enviadaEm ?? p.em).getTime() < 7 * 86_400_000)
  if (!aguardando.length) return null
  const descartar = (id: string) => {
    setLista(l => (l ?? []).map(x => x.id === id ? { ...x, status: "descartada" as const } : x))
    fetch("/api/proposta-pronta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, acao: "descartar" }) }).catch(() => {})
  }
  // Aprovou ou levou para a mesa: some daqui (volta se você não salvar, na próxima vez que abrir o Painel)
  const abrir = (p: PropostaPronta, enviar: boolean) => { setLista(l => (l ?? []).filter(x => x.id !== p.id)); onAbrir(p, enviar) }

  return (
    <Cartao>
      <TituloCartao icone={<FileCheck2 size={16} />} titulo="Propostas para aprovar"
        sub={`O agente montou com a medida, a quantidade e o seu markup. Aprovar salva o orçamento e abre o envio com o PDF; ajustar abre na mesa de orçamento.${enviadasSemana.length ? ` ${enviadasSemana.length} enviada${enviadasSemana.length > 1 ? "s" : ""} nesta semana.` : ""}`} />
      <div className="flex flex-col gap-2.5">
        {aguardando.map(p => <Proposta key={p.id} p={p} onAbrir={abrir} onDescartar={() => descartar(p.id)} onAbrirConversa={onAbrirConversa} />)}
      </div>
    </Cartao>
  )
}
