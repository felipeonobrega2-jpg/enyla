"use client"

import { FormData, Calculo, PropostaCustom, KanbanCard, COL_HOT } from "../types"
import { brl, num } from "../utils"
import { isGanho, isPerdido, isExpirado, parseData } from "../lib/negocio"
import { Copy, Sparkles, MessageCircle, FileDown, FileText, Trash2, PencilLine, Search } from "lucide-react"
import { Selo, Tom, Vazio } from "./ds"

export type OrdemHistorico = "recente" | "antigo" | "maior" | "menor" | "nome"
export type SituacaoOrc = "todos" | "aberto" | "fechado" | "recusado" | "semResposta"

export type HistItem = { form: FormData; calculo: Calculo; data: string; numero?: string }

// Situação de um orçamento pelo card do quadro (mesmas regras de lib/negocio)
export function situacaoDoCard(card?: KanbanCard): { id: Exclude<SituacaoOrc, "todos">; nome: string; tom: Tom } {
  if (!card) return { id: "aberto", nome: "Sem card", tom: "neutro" }
  if (isGanho(card)) return { id: "fechado", nome: "Fechado", tom: "sucesso" }
  if (isPerdido(card)) return { id: "recusado", nome: "Recusado", tom: "perigo" }
  if (isExpirado(card)) return { id: "semResposta", nome: "Sem resposta", tom: "alerta" }
  if (card.coluna === COL_HOT) return { id: "aberto", nome: "Lead quente", tom: "acento" }
  return { id: "aberto", nome: "Em aberto", tom: "info" }
}

type ListItem =
  | { tipo: "hist"; item: HistItem; originalIndex: number; data: string; numero: string; preco: number; qtd: number; nome: string; card?: KanbanCard }
  | { tipo: "proposta"; item: PropostaCustom; data: string; numero: string; preco: number; qtd: number; nome: string; card?: KanbanCard }

export function HistoricoView({
  historico, propostasCustom, kanban, busca, ordem, situacao,
  onReplicar, onDownloadPdf, onDownloadPdfCliente, onExcluir, onWhatsApp,
  onPdfCustom, onWhatsAppCustom, onExcluirCustom, onEditarCustom, onPersonalizar, onDetalhes,
}: {
  historico: HistItem[]
  propostasCustom: PropostaCustom[]
  kanban: KanbanCard[]
  busca: string
  ordem: OrdemHistorico
  situacao: SituacaoOrc
  onReplicar: (item: HistItem) => void
  onDownloadPdf: (item: HistItem) => void
  onDownloadPdfCliente: (item: HistItem) => void
  onExcluir: (index: number) => void
  onWhatsApp: (item: HistItem) => void
  onPdfCustom: (p: PropostaCustom) => void
  onWhatsAppCustom: (p: PropostaCustom) => void
  onExcluirCustom: (id: string) => void
  onEditarCustom: (p: PropostaCustom) => void
  onPersonalizar?: (item: HistItem) => void
  onDetalhes?: (item: HistItem | PropostaCustom) => void
}) {
  const porNumero = new Map(kanban.map(c => [c.numero, c]))
  const porId = new Map(kanban.map(c => [c.id, c]))
  const tempo = (d: string) => parseData(d)?.getTime() ?? 0
  const numeroInt = (n?: string) => parseInt(n?.replace(/\D/g, "") ?? "0", 10)

  const precoItem = (item: HistItem) => {
    const ideal = item.calculo.tabela.find(l => l.quantidade === item.calculo.sweetSpotIdealQtd) ?? item.calculo.tabela[0]
    return { preco: item.form.comFaca ? (ideal?.precoComFaca ?? 0) : (ideal?.precoSemFaca ?? 0), qtd: ideal?.quantidade ?? 0 }
  }
  const precoProposta = (p: PropostaCustom) => {
    const ativas = p.linhas.filter(l => l.ativa && l.quantidade > 0)
    const ideal = ativas.find(l => l.isIdeal) ?? ativas[ativas.length - 1]
    return { preco: ideal ? ideal.unitario * ideal.quantidade : 0, qtd: ideal?.quantidade ?? 0 }
  }

  const q = busca.trim().toLowerCase()
  const todos: ListItem[] = [
    ...historico.map((item, idx) => ({
      tipo: "hist" as const, item, originalIndex: idx, data: item.data, numero: item.numero ?? "",
      ...precoItem(item), nome: item.form.nomeCliente || "", card: porNumero.get(item.numero ?? ""),
    })),
    ...propostasCustom.map(p => ({
      tipo: "proposta" as const, item: p, data: p.data, numero: p.numero,
      ...precoProposta(p), nome: p.nomeCliente || "", card: porId.get(p.cardId) ?? porNumero.get(p.numero),
    })),
  ]

  const lista = todos
    .filter(e => !q || e.nome.toLowerCase().includes(q) || e.numero.toLowerCase().includes(q) || e.data.includes(q))
    .filter(e => situacao === "todos" || situacaoDoCard(e.card).id === situacao)
    .sort((a, b) => {
      if (ordem === "recente") return (tempo(b.data) - tempo(a.data)) || (numeroInt(b.numero) - numeroInt(a.numero))
      if (ordem === "antigo")  return (tempo(a.data) - tempo(b.data)) || (numeroInt(a.numero) - numeroInt(b.numero))
      if (ordem === "maior")   return b.preco - a.preco
      if (ordem === "menor")   return a.preco - b.preco
      return a.nome.localeCompare(b.nome, "pt-BR")
    })

  if (!historico.length && !propostasCustom.length) return (
    <Vazio icone={<FileText className="w-9 h-9" />} titulo="Nenhum orçamento ainda" sub="Os orçamentos calculados e as propostas personalizadas aparecem aqui." />
  )
  if (!lista.length) return (
    <Vazio icone={<Search className="w-8 h-8" />} titulo={busca ? `Nenhum resultado para "${busca}"` : "Nenhum orçamento nesta situação"}
      sub={busca ? undefined : "Clique de novo no número do topo para ver todos."} />
  )

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-[#898892] px-1 pb-1">
        {lista.length} {lista.length === 1 ? "orçamento salvo" : "orçamentos salvos"}
        {(() => { const sem = lista.filter(e => !e.card).length; return sem > 0 ? ` · ${sem} sem card no quadro (não entram na conversão)` : "" })()}
      </p>
      <div className="space-y-2 ds-escalonado">
        {lista.map(entry => {
          const sit = situacaoDoCard(entry.card)
          const sub = entry.tipo === "hist"
            ? [entry.item.form.frente > 0 ? `${entry.item.form.frente}×${entry.item.form.alturaBox}×${entry.item.form.lateral} cm` : "Dieline importado", entry.item.form.materialNome]
            : [entry.item.descricao, entry.item.dimensoes, entry.item.material]
          const data = parseData(entry.data)?.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "")
          return (
            <div key={entry.tipo === "hist" ? `h-${entry.originalIndex}` : `p-${entry.item.id}`}
              className="group bg-white rounded-xl ds-cartao hover:shadow-[0_4px_14px_rgba(25,22,37,0.06)]">
              <div className="flex items-center gap-4 px-5 py-3.5">
                <button onClick={() => onDetalhes?.(entry.item)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-[13.5px] text-[#191625] leading-snug">{entry.nome || "Sem nome"}</span>
                    {entry.numero && <Selo tom="acento">{entry.numero}</Selo>}
                    {entry.tipo === "proposta" && <Selo tom="neutro">Personalizada</Selo>}
                    <Selo tom={sit.tom}>{sit.nome}</Selo>
                  </div>
                  <p className="text-[11px] text-[#898892] mt-1 truncate">
                    {[...sub.filter(Boolean), data].join(" · ")}
                  </p>
                </button>
                <div className="relative shrink-0 flex items-center justify-end" style={{ minWidth: 210 }}>
                  <div className="text-right transition-opacity duration-150 group-hover:opacity-0 group-hover:pointer-events-none">
                    <p className="font-semibold text-[13.5px] text-[#191625] ds-num">{entry.preco > 0 ? brl(entry.preco) : entry.card?.preco ? brl(entry.card.preco) : "—"}</p>
                    {entry.qtd > 0 && <p className="text-[10.5px] text-[#898892] ds-num mt-0.5">{num(entry.qtd)} un</p>}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    {entry.tipo === "hist" ? <>
                      <Acao titulo="Replicar" onClick={() => onReplicar(entry.item)}><Copy className="w-3.5 h-3.5" /></Acao>
                      {onPersonalizar && <Acao titulo="Personalizar proposta" onClick={() => onPersonalizar(entry.item)} tom="acento"><Sparkles className="w-3.5 h-3.5" /></Acao>}
                      <Acao titulo="Enviar no WhatsApp" onClick={() => onWhatsApp(entry.item)} tom="sucesso"><MessageCircle className="w-3.5 h-3.5" /></Acao>
                      <Acao titulo="PDF para o cliente" onClick={() => onDownloadPdfCliente(entry.item)} tom="acento"><FileDown className="w-3.5 h-3.5" /></Acao>
                      <Acao titulo="PDF interno (gráfica)" onClick={() => onDownloadPdf(entry.item)}><FileText className="w-3.5 h-3.5" /></Acao>
                      <Acao titulo="Excluir" onClick={() => { if (confirm("Excluir este orçamento?")) onExcluir(entry.originalIndex) }} tom="perigo"><Trash2 className="w-3.5 h-3.5" /></Acao>
                    </> : <>
                      <Acao titulo="Editar proposta" onClick={() => onEditarCustom(entry.item)} tom="acento"><PencilLine className="w-3.5 h-3.5" /></Acao>
                      <Acao titulo="Enviar no WhatsApp" onClick={() => onWhatsAppCustom(entry.item)} tom="sucesso"><MessageCircle className="w-3.5 h-3.5" /></Acao>
                      <Acao titulo="PDF para o cliente" onClick={() => onPdfCustom(entry.item)} tom="acento"><FileDown className="w-3.5 h-3.5" /></Acao>
                      <Acao titulo="Excluir" onClick={() => { if (confirm("Excluir esta proposta?")) onExcluirCustom(entry.item.id) }} tom="perigo"><Trash2 className="w-3.5 h-3.5" /></Acao>
                    </>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Acao({ titulo, onClick, children, tom }: { titulo: string; onClick: () => void; children: React.ReactNode; tom?: "acento" | "sucesso" | "perigo" }) {
  const cor = tom === "acento" ? "text-[#8456e8] hover:bg-[#8456e8]/[0.08]"
    : tom === "sucesso" ? "text-[#009351] hover:bg-[#009351]/[0.08]"
    : tom === "perigo" ? "text-[#d33a3c] hover:bg-[#d33a3c]/[0.08]"
    : "text-[#5e5c68] hover:bg-[rgba(116,116,128,0.1)]"
  return (
    <button title={titulo} onClick={e => { e.stopPropagation(); onClick() }}
      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${cor}`}>
      {children}
    </button>
  )
}
