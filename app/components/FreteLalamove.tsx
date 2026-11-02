"use client"

// Frete com a Lalamove dentro do pedido: cotar, chamar o motorista, acompanhar, cancelar e mandar o rastreio ao cliente.
// O custo entra sozinho no pedido; "cobrar do cliente" também cria o valor a receber.

import { useEffect, useState, useCallback } from "react"
import { Truck, X, MapPin, Search, ExternalLink, SendHorizontal, Check, Loader2 } from "lucide-react"
import type { LancamentoFinanceiro } from "../types"
import { Endereco, Frete, LocalRetirada, STATUS_FRETE, statusFinal, textoRastreio } from "../lib/frete"
import { nomeChave } from "../lib/negocio"
import { Selo, Botao } from "./ds"

export type PedidoFrete = { numero?: string; cardId?: string; loteId?: string; cliente: string }
type Servico = { key: string; nome: string; descricao: string; carga: string }
type Cotacao = { quotationId: string; expiraEm: string; valor: number; moeda: string; distanciaKm: number | null; paradas: string[]; servico: string }

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

export function ModalFrete({ pedido, telefoneCliente, locais, enderecoSalvo, onFechar, onChamado }: {
  pedido: PedidoFrete
  telefoneCliente?: string
  locais: LocalRetirada[]
  enderecoSalvo?: (Endereco & { recebedor?: string; telefone?: string }) | null
  onFechar: () => void
  onChamado: (f: Frete, lancamentos: LancamentoFinanceiro[]) => void
}) {
  const [servicos, setServicos] = useState<Servico[] | null>(null)
  const [estado, setEstado] = useState<{ configurada: boolean; ambiente: string; erro?: string } | null>(null)
  const [servico, setServico] = useState("")
  const [localId, setLocalId] = useState(locais[0]?.id ?? "")
  const [entrega, setEntrega] = useState<Endereco | null>(enderecoSalvo ?? null)
  const [trocar, setTrocar] = useState(!enderecoSalvo)
  const [recebedor, setRecebedor] = useState(enderecoSalvo?.recebedor ?? pedido.cliente)
  const [telefone, setTelefone] = useState(enderecoSalvo?.telefone ?? telefoneCliente ?? "")
  const [obs, setObs] = useState("")
  const [salvar, setSalvar] = useState(true)
  const [cobrar, setCobrar] = useState(false)
  const [cot, setCot] = useState<Cotacao | null>(null)
  const [cotando, setCotando] = useState(false)
  const [chamando, setChamando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const local = locais.find(l => l.id === localId)

  useEffect(() => {
    fetch("/api/frete/servicos").then(r => r.json()).then(d => {
      setEstado({ configurada: !!d.configurada, ambiente: d.ambiente, erro: d.erro })
      const l: Servico[] = d.servicos ?? []
      setServicos(l)
      setServico(s => s || (l.find(x => /LALAGO|MOTO/i.test(x.key)) ?? l[0])?.key || "")
    }).catch(() => setServicos([]))
  }, [])
  // Cotação vale 5 minutos: relógio para mostrar o tempo e exigir nova cotação
  useEffect(() => { if (!cot) return; const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t) }, [cot])
  const restante = cot ? Math.max(0, Math.round((new Date(cot.expiraEm).getTime() - agora) / 1000)) : 0

  async function cotar() {
    if (!local || !entrega || !servico) return
    setCotando(true); setErro(null); setCot(null)
    const r = await fetch("/api/frete/cotar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ servico, retirada: local.endereco, entrega }) }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    if (r?.ok) { setCot(d); setAgora(Date.now()) } else setErro(d?.erro ?? "Não cotou.")
    setCotando(false)
  }
  async function chamar() {
    if (!cot || !local || !entrega) return
    setChamando(true); setErro(null)
    const r = await fetch("/api/frete/chamar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      quotationId: cot.quotationId, paradas: cot.paradas, valor: cot.valor, veiculo: servico,
      retirada: { nome: local.nome, contato: local.contato, telefone: local.telefone, texto: local.endereco.texto },
      destinatario: { nome: recebedor, telefone, observacao: obs }, entrega, salvarEndereco: salvar, pedido, cobrarCliente: cobrar,
    }) }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    setChamando(false)
    if (r?.ok && d?.frete) { onChamado(d.frete, d.lancamentos ?? []); if (d.avisoLancamento) alert(d.avisoLancamento) } else setErro(d?.erro ?? "Não chamou.")
  }

  const rotulo = (t: string) => <p className="text-[11px] font-semibold mb-1" style={{ color: "var(--text-sub)" }}>{t}</p>
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={e => { if (e.target === e.currentTarget) onFechar() }} style={{ background: "rgba(25,22,37,0.38)" }}>
      <div className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl p-5 space-y-4 shadow-2xl ds-entrada" style={{ background: "var(--bg-surface)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold flex items-center gap-2" style={{ color: "var(--text-main)" }}><Truck className="w-4 h-4 text-[#f16622]" />Chamar Lalamove</p>
            <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>{pedido.numero ? `${pedido.numero} · ` : ""}{pedido.cliente}{estado?.ambiente === "sandbox" ? " · modo teste (sandbox)" : ""}</p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="w-8 h-8 rounded-full grid place-items-center hover:bg-black/5" style={{ color: "var(--text-sub)" }}><X className="w-4 h-4" /></button>
        </div>

        {estado && !estado.configurada ? (
          <p className="text-[12.5px] rounded-xl p-3" style={{ background: "rgba(197,120,0,0.1)", color: "#b26b00" }}>
            Faltam as chaves da Lalamove na Vercel (LALAMOVE_API_KEY e LALAMOVE_API_SECRET). Depois de colar, faça um novo deploy.
          </p>
        ) : <>
          <div>
            {rotulo("Retirada")}
            {locais.length ? (
              <select value={localId} onChange={e => { setLocalId(e.target.value); setCot(null) }} className={campo}>
                {locais.map(l => <option key={l.id} value={l.id}>{l.nome} · {l.endereco.texto}</option>)}
              </select>
            ) : <p className="text-[12px] text-[#b26b00]">Cadastre os locais de retirada em Configurações → Locais de retirada.</p>}
          </div>

          <div>
            {rotulo("Entrega")}
            {entrega && !trocar ? (
              <div className="flex items-start gap-2">
                <p className="text-[12.5px] flex-1 flex items-start gap-1.5" style={{ color: "var(--text-main)" }}><MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#009351]" />{entrega.texto}</p>
                <button onClick={() => setTrocar(true)} className="text-[11.5px] font-semibold text-[#8456e8]">Trocar</button>
              </div>
            ) : <BuscaEndereco valor={entrega} onMudar={e => { setEntrega(e); setCot(null) }} />}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>{rotulo("Quem recebe")}<input value={recebedor} onChange={e => setRecebedor(e.target.value)} className={campo} /></div>
            <div>{rotulo("Telefone de quem recebe")}<input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(11) 9…" className={campo} /></div>
          </div>
          <div>{rotulo("Observação para o motorista (opcional)")}<input value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: 3 caixas, entregar na portaria" className={campo} /></div>

          <div>
            {rotulo("Veículo")}
            {!servicos ? <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>Carregando…</p> : (
              <div className="flex gap-1.5 flex-wrap">
                {servicos.map(s => (
                  <button key={s.key} onClick={() => { setServico(s.key); setCot(null) }} title={[s.descricao, s.carga].filter(Boolean).join(" · ")}
                    className="h-8 px-3 rounded-lg text-[12px] font-medium transition-colors"
                    style={servico === s.key ? { background: "#191625", color: "#fff" } : { background: "var(--bg-page)", color: "var(--text-sub)", border: "1px solid var(--border)" }}>{s.nome}</button>
                ))}
                {estado?.erro && <p className="text-[11.5px] text-[#d33a3c]">{estado.erro}</p>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 flex-wrap text-[12.5px]" style={{ color: "var(--text-main)" }}>
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={!cobrar} onChange={() => setCobrar(false)} />Por nossa conta</label>
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={cobrar} onChange={() => setCobrar(true)} />Cobrar do cliente</label>
            {trocar && entrega && <label className="flex items-center gap-1.5 cursor-pointer ml-auto"><input type="checkbox" checked={salvar} onChange={e => setSalvar(e.target.checked)} />Guardar endereço do cliente</label>}
          </div>

          {cot && (
            <div className="rounded-xl p-3 flex items-center gap-3 ds-entrada" style={{ background: "rgba(241,102,34,0.08)", border: "1px solid rgba(241,102,34,0.25)" }}>
              <div className="flex-1">
                <p className="text-[18px] font-bold ds-num" style={{ color: "var(--text-main)" }}>{brl(cot.valor)}</p>
                <p className="text-[11.5px]" style={{ color: "var(--text-sub)" }}>
                  {cot.distanciaKm != null ? `${cot.distanciaKm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km · ` : ""}
                  {restante > 0 ? `cotação vale mais ${Math.floor(restante / 60)}:${String(restante % 60).padStart(2, "0")}` : "cotação expirou, cote de novo"}
                  {cobrar ? " · vira valor a receber do cliente" : ""}
                </p>
              </div>
            </div>
          )}
          {erro && <p className="text-[12.5px] text-[#d33a3c]">{erro}</p>}

          <div className="flex items-center gap-2 justify-end">
            <Botao onClick={cotar} disabled={cotando || !local || !entrega || !servico} icone={cotando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}>{cot ? "Cotar de novo" : "Cotar"}</Botao>
            <button onClick={chamar} disabled={!cot || restante <= 0 || chamando || !telefone.trim() || !recebedor.trim()}
              className="h-10 px-5 rounded-xl text-white text-[13.5px] font-semibold flex items-center gap-2 disabled:opacity-40" style={{ background: "#f16622" }}>
              <Truck className="w-4 h-4" />{chamando ? "Chamando…" : "Chamar motorista"}
            </button>
          </div>
        </>}
      </div>
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

export const enderecoDoCliente = (enderecos: Record<string, Endereco & { recebedor?: string; telefone?: string }> | undefined, cliente: string) =>
  enderecos?.[nomeChave(cliente)] ?? null
