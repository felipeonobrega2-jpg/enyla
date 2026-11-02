"use client"

// Frete com a Lalamove: busca de endereço por CEP e as corridas de um pedido (dentro da linha aberta em Pedidos).
// Chamar e acompanhar no mapa fica na página Entregas.

import { useEffect, useState, useCallback } from "react"
import { Truck, MapPin, Search, ExternalLink, SendHorizontal, Check, Loader2 } from "lucide-react"
import { Endereco, Frete, STATUS_FRETE, statusFinal, textoRastreio } from "../lib/frete"
import { Selo, Botao } from "./ds"

export type PedidoFrete = { numero?: string; cardId?: string; loteId?: string; cliente: string }

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const campo = "h-9 rounded-lg px-2.5 text-[12.5px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] ds-borda w-full"

// CEP + número → endereço (reaproveitado em Configurações → Locais de retirada)
export function BuscaEndereco({ valor, onMudar }: { valor: Endereco | null; onMudar: (e: Endereco | null) => void }) {
  const [cep, setCep] = useState(valor?.cep ?? "")
  const [numero, setNumero] = useState(valor?.numero ?? "")
  const [compl, setCompl] = useState(valor?.complemento ?? "")
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  async function buscar() {
    setBuscando(true); setErro(null)
    const q = new URLSearchParams({ cep, numero, complemento: compl })
    const r = await fetch(`/api/frete/endereco?${q}`).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    if (r?.ok && d?.lat) onMudar(d); else { setErro(d?.erro ?? "Não achei."); onMudar(null) }
    setBuscando(false)
  }
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[110px_80px_1fr_auto] gap-1.5">
        <input value={cep} onChange={e => setCep(e.target.value)} placeholder="CEP" inputMode="numeric" className={campo} />
        <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Nº" className={campo} />
        <input value={compl} onChange={e => setCompl(e.target.value)} placeholder="Complemento (opcional)" className={campo} />
        <Botao onClick={buscar} disabled={buscando || cep.replace(/\D/g, "").length !== 8} icone={buscando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}>Buscar</Botao>
      </div>
      {valor && <p className="text-[11.5px] flex items-start gap-1.5" style={{ color: "var(--text-sub)" }}><MapPin className="w-3.5 h-3.5 shrink-0 mt-px text-[#009351]" />{valor.texto}</p>}
      {erro && <p className="text-[11.5px] text-[#d33a3c]">{erro}</p>}
    </div>
  )
}

// Corridas do pedido, dentro da linha aberta em Pedidos
export function FretesDoPedido({ pedido, entregue, versao, onMarcarEntregue, onLancamentosRemovidos }: {
  pedido: PedidoFrete
  entregue: boolean
  versao?: number                      // muda quando uma corrida nova é chamada: recarrega
  onMarcarEntregue?: () => void
  onLancamentosRemovidos?: (ids: string[]) => void
}) {
  const [lista, setLista] = useState<Frete[]>([])
  const [enviado, setEnviado] = useState<string | null>(null)
  const carregar = useCallback(() => {
    const q = new URLSearchParams(pedido.loteId ? { loteId: pedido.loteId } : pedido.cardId ? { cardId: pedido.cardId } : { numero: pedido.numero ?? "" })
    fetch(`/api/frete/pedido?${q}`).then(r => r.json()).then(d => setLista(Array.isArray(d) ? d : [])).catch(() => {})
  }, [pedido.loteId, pedido.cardId, pedido.numero])
  useEffect(() => { carregar() }, [carregar, versao])
  // Enquanto alguma corrida anda, confere a cada 30 s
  useEffect(() => {
    if (!lista.some(f => !statusFinal(f.status))) return
    const t = setInterval(carregar, 30_000)
    return () => clearInterval(t)
  }, [lista, carregar])

  async function cancelar(f: Frete) {
    if (!confirm("Cancelar a corrida? O custo lançado também sai do pedido.")) return
    const r = await fetch("/api/frete/cancelar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: f.order_id }) }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    if (r?.ok) { onLancamentosRemovidos?.(d?.lancamentosRemovidos ?? []); carregar() } else alert(d?.erro ?? "Não cancelou.")
  }
  async function mandarLink(f: Frete) {
    if (!f.share_link) return
    const r = await fetch("/api/whatsapp/enviar-cliente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cliente: pedido.cliente, texto: textoRastreio(f.share_link) }) }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    if (r?.ok) setEnviado(f.order_id); else alert(d?.erro ?? "Não enviou.")
  }

  if (!lista.length) return null
  return (
    <div className="px-5 pt-3 pb-3 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#f16622]">Frete Lalamove</p>
      {lista.map(f => {
        const st = STATUS_FRETE[f.status] ?? { nome: f.status, tom: "neutro" as const }
        return (
          <div key={f.order_id} className="flex items-center gap-2 flex-wrap text-[12px]">
            <Truck className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-faint)" }} />
            <Selo tom={st.tom}>{st.nome}</Selo>
            <span className="font-semibold ds-num" style={{ color: "var(--text-main)" }}>{brl(Number(f.valor))}</span>
            <span style={{ color: "var(--text-faint)" }}>{f.cobrar_cliente ? "cobrado do cliente" : "por nossa conta"}{f.motorista?.nome ? ` · ${f.motorista.nome}${f.motorista.placa ? ` (${f.motorista.placa})` : ""}` : ""}{f.ambiente === "sandbox" ? " · teste" : ""}</span>
            <span className="ml-auto flex items-center gap-1">
              {f.share_link && !statusFinal(f.status) && <>
                <a href={f.share_link} target="_blank" rel="noreferrer" className="h-7 px-2 rounded-lg inline-flex items-center gap-1 hover:bg-black/5 font-semibold" style={{ color: "var(--text-sub)" }}><ExternalLink className="w-3.5 h-3.5" />Rastreio</a>
                <button onClick={() => mandarLink(f)} disabled={enviado === f.order_id} className="h-7 px-2 rounded-lg inline-flex items-center gap-1 hover:bg-[#25a35a]/10 font-semibold text-[#1d8a4b] disabled:opacity-60">
                  {enviado === f.order_id ? <><Check className="w-3.5 h-3.5" />Enviado</> : <><SendHorizontal className="w-3.5 h-3.5" />Mandar ao cliente</>}
                </button>
              </>}
              {(f.status === "ASSIGNING_DRIVER" || f.status === "ON_GOING") && <button onClick={() => cancelar(f)} className="h-7 px-2 rounded-lg hover:bg-black/5 font-semibold" style={{ color: "var(--text-sub)" }}>Cancelar</button>}
              {f.status === "COMPLETED" && !entregue && onMarcarEntregue && <button onClick={onMarcarEntregue} className="h-7 px-2.5 rounded-lg font-semibold text-white bg-[#009351]">Marcar como entregue</button>}
            </span>
          </div>
        )
      })}
    </div>
  )
}
