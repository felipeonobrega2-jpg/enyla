"use client"

// Entregas: chamar a Lalamove de qualquer lugar para qualquer lugar (fornecedor → gráfica → cliente…), com mapa,
// rota pelas ruas e o motorista ao vivo. Endereços vêm dos fornecedores, dos seus locais e dos clientes; ou digita outro.

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { Truck, Plus, X, Search, MapPin, Factory, Home, User, Loader2, ExternalLink, SendHorizontal, Check, ChevronDown } from "lucide-react"
import type { KanbanCard, LancamentoFinanceiro } from "../types"
import type { Configuracoes } from "../config"
import { Endereco, Frete, LocalRetirada, STATUS_FRETE, statusFinal, textoRastreio, telefoneE164 } from "../lib/frete"
import { normalizarProducao } from "../lib/producao"
import { montarPedidos, nomeChave, pedidoEntregue } from "../lib/negocio"
import { Selo, Botao } from "./ds"
import { BuscaEndereco } from "./FreteLalamove"
import type { PontoMapa } from "./MapaEntregas"

const MapaEntregas = dynamic(() => import("./MapaEntregas").then(m => m.MapaEntregas), { ssr: false })

type TipoLugar = "local" | "fornecedor" | "cliente" | "busca"
type Lugar = { chave: string; tipo: TipoLugar; nome: string; endereco: Endereco; contato?: string; telefone?: string }
type Parada = { lugar: Lugar | null; pessoa: string; telefone: string; obs: string }
type Servico = { key: string; nome: string; descricao: string; carga: string }
type Cotacao = { quotationId: string; expiraEm: string; valor: number; distanciaKm: number | null; paradas: string[] }
export type PrefillEntrega = { pedido: { numero?: string; cardId?: string; loteId?: string; cliente: string } }

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const LETRAS = "ABCDEFGHIJKLMNOP"
const COR_PONTO = (i: number) => i === 0 ? "#009351" : "#f16622"
const vazia = (): Parada => ({ lugar: null, pessoa: "", telefone: "", obs: "" })
const campo = "h-8 rounded-lg px-2.5 text-[12px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] ds-borda w-full"
const ICONE: Record<TipoLugar, React.ReactNode> = {
  local: <Home className="w-3.5 h-3.5" />, fornecedor: <Factory className="w-3.5 h-3.5" />, cliente: <User className="w-3.5 h-3.5" />, busca: <MapPin className="w-3.5 h-3.5" />,
}

export function EntregasView({ config, kanban, lancamentos, clientes, isDark, prefill, onLancamentos, onRemoverLancamentos, onSalvarLocais }: {
  config: Configuracoes
  kanban: KanbanCard[]
  lancamentos: LancamentoFinanceiro[]
  clientes: { nome: string; telefone?: string }[]
  isDark?: boolean
  prefill?: PrefillEntrega | null
  onLancamentos: (l: LancamentoFinanceiro[]) => void
  onRemoverLancamentos: (ids: string[]) => void
  onSalvarLocais: (l: LocalRetirada[]) => void
}) {
  // ── Catálogo de endereços ──────────────────────────────────────────────────
  const nomeDoCliente = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of kanban) if (c.nomeCliente) m.set(nomeChave(c.nomeCliente), c.nomeCliente)
    return m
  }, [kanban])
  const catalogo = useMemo<Lugar[]>(() => [
    ...(config.locaisRetirada ?? []).map(l => ({ chave: `l:${l.id}`, tipo: "local" as const, nome: l.nome, endereco: l.endereco, contato: l.contato, telefone: l.telefone })),
    ...normalizarProducao(config.producao).fornecedores.filter(f => f.ativo && f.endereco).map(f => ({ chave: `f:${f.id}`, tipo: "fornecedor" as const, nome: f.nome, endereco: f.endereco!, contato: f.contato, telefone: f.telefone })),
    ...Object.entries(config.enderecosClientes ?? {}).map(([k, e]) => ({ chave: `c:${k}`, tipo: "cliente" as const, nome: nomeDoCliente.get(k) ?? k, endereco: e, contato: e.recebedor, telefone: e.telefone })),
  ], [config.locaisRetirada, config.producao, config.enderecosClientes, nomeDoCliente])

  // ── Pedidos que podem receber o custo ─────────────────────────────────────
  const pedidos = useMemo(() => montarPedidos(kanban, lancamentos)
    .filter(p => p.dataFechamento && !pedidoEntregue(p))
    .sort((a, b) => (b.dataFechamento ?? "").localeCompare(a.dataFechamento ?? "")), [kanban, lancamentos])
  const chavePedido = (p: { cardId?: string; loteId?: string }) => p.loteId ? `lote:${p.loteId}` : p.cardId ? `card:${p.cardId}` : ""
  const [pedidoSel, setPedidoSel] = useState<PrefillEntrega["pedido"] | null>(prefill?.pedido ?? null)

  // ── Corrida em montagem ───────────────────────────────────────────────────
  const telefoneCliente = (nome: string) => clientes.find(c => nomeChave(c.nome) === nomeChave(nome))?.telefone ?? ""
  const paradaDe = (l: Lugar | null): Parada => ({ lugar: l, pessoa: l?.contato ?? (l?.tipo === "cliente" ? l.nome : ""), telefone: l?.telefone ?? (l?.tipo === "cliente" ? telefoneCliente(l.nome) : ""), obs: "" })
  const [paradas, setParadas] = useState<Parada[]>(() => {
    const origem = catalogo.find(l => l.tipo === "local") ?? null
    const cliente = prefill ? catalogo.find(l => l.chave === `c:${nomeChave(prefill.pedido.cliente)}`) ?? null : null
    const destino = cliente ? paradaDe(cliente) : prefill ? { ...vazia(), pessoa: prefill.pedido.cliente, telefone: telefoneCliente(prefill.pedido.cliente) } : vazia()
    return [origem ? paradaDe(origem) : vazia(), destino]
  })
  const [servicos, setServicos] = useState<Servico[] | null>(null)
  const [estado, setEstado] = useState<{ configurada: boolean; ambiente: string; erro?: string } | null>(null)
  const [servico, setServico] = useState("")
  const [cobrar, setCobrar] = useState(false)
  const [cot, setCot] = useState<Cotacao | null>(null)
  const [cotando, setCotando] = useState(false)
  const [chamando, setChamando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    fetch("/api/frete/servicos").then(r => r.json()).then(d => {
      setEstado({ configurada: !!d.configurada, ambiente: d.ambiente, erro: d.erro })
      const l: Servico[] = d.servicos ?? []
      setServicos(l)
      setServico(s => s || (l.find(x => /LALAGO|MOTO/i.test(x.key)) ?? l[0])?.key || "")
    }).catch(() => setServicos([]))
  }, [])
  useEffect(() => { if (!cot) return; const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t) }, [cot])
  const restante = cot ? Math.max(0, Math.round((new Date(cot.expiraEm).getTime() - agora) / 1000)) : 0

  const mudar = (i: number, p: Partial<Parada>) => { setParadas(ps => ps.map((x, j) => j === i ? { ...x, ...p } : x)); setCot(null) }
  const prontas = paradas.every(p => p.lugar)

  async function cotar() {
    setCotando(true); setErro(null); setCot(null)
    const r = await fetch("/api/frete/cotar", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servico, paradas: paradas.map(p => ({ nome: p.lugar!.nome, texto: p.lugar!.endereco.texto, lat: p.lugar!.endereco.lat, lng: p.lugar!.endereco.lng })) }) }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    if (r?.ok) { setCot(d); setAgora(Date.now()) } else setErro(d?.erro ?? "Não cotou.")
    setCotando(false)
  }
  async function chamar() {
    if (!cot) return
    setChamando(true); setErro(null)
    const ultima = paradas[paradas.length - 1]
    const salvarCliente = pedidoSel?.cliente && ultima.lugar?.tipo === "busca"
      ? { cliente: pedidoSel.cliente, endereco: ultima.lugar.endereco, recebedor: ultima.pessoa, telefone: ultima.telefone } : null
    const r = await fetch("/api/frete/chamar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      quotationId: cot.quotationId, stopIds: cot.paradas, valor: cot.valor, veiculo: servico,
      paradas: paradas.map(p => ({ nome: p.lugar!.nome, texto: p.lugar!.endereco.texto, lat: p.lugar!.endereco.lat, lng: p.lugar!.endereco.lng })),
      remetente: { nome: paradas[0].pessoa, telefone: paradas[0].telefone },
      destinatarios: paradas.slice(1).map(p => ({ nome: p.pessoa, telefone: p.telefone, observacao: p.obs })),
      pedido: pedidoSel, cobrarCliente: cobrar, salvarCliente,
    }) }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    setChamando(false)
    if (r?.ok && d?.frete) {
      onLancamentos(d.lancamentos ?? [])
      if (d.avisoLancamento) alert(d.avisoLancamento)
      setCot(null); setSelecionada(d.frete.order_id); carregar()
    } else setErro(d?.erro ?? "Não chamou.")
  }

  // ── Corridas ──────────────────────────────────────────────────────────────
  const [fretes, setFretes] = useState<Frete[]>([])
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [enviado, setEnviado] = useState<string | null>(null)
  const carregar = useCallback(() => { fetch("/api/frete/lista").then(r => r.json()).then(d => setFretes(Array.isArray(d) ? d : [])).catch(() => {}) }, [])
  useEffect(() => { carregar() }, [carregar])
  const andando = fretes.filter(f => !statusFinal(f.status))
  // Com corrida andando, atualiza a cada 10 s (é o ritmo da posição do motorista na Lalamove)
  useEffect(() => { if (!andando.length) return; const t = setInterval(carregar, 10_000); return () => clearInterval(t) }, [andando.length, carregar])
  const sel = fretes.find(f => f.order_id === selecionada) ?? null

  async function cancelar(f: Frete) {
    if (!confirm("Cancelar a corrida? O custo lançado também sai.")) return
    const r = await fetch("/api/frete/cancelar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: f.order_id }) }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    if (r?.ok) { onRemoverLancamentos(d?.lancamentosRemovidos ?? []); carregar() } else alert(d?.erro ?? "Não cancelou.")
  }
  async function mandarLink(f: Frete) {
    if (!f.share_link || !f.cliente) return
    const r = await fetch("/api/whatsapp/enviar-cliente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cliente: f.cliente, texto: textoRastreio(f.share_link) }) }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    if (r?.ok) setEnviado(f.order_id); else alert(d?.erro ?? "Não enviou.")
  }

  // ── Mapa: a corrida selecionada ou a que está sendo montada ──────────────
  const pontos: PontoMapa[] = sel?.paradas?.length
    ? sel.paradas.map((p, i) => ({ lat: p.lat, lng: p.lng, rotulo: LETRAS[i], nome: p.nome, cor: COR_PONTO(i) }))
    : paradas.flatMap((p, i) => p.lugar ? [{ lat: p.lugar.endereco.lat, lng: p.lugar.endereco.lng, rotulo: LETRAS[i], nome: p.lugar.nome, cor: COR_PONTO(i) }] : [])
  const motorista = sel?.motorista?.lat != null && !statusFinal(sel.status) ? { lat: sel.motorista.lat, lng: sel.motorista.lng! } : null

  const [verLocais, setVerLocais] = useState(false)

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row" style={{ background: "var(--bg-page)" }}>
      {/* ── Painel ── */}
      <div className="lg:w-[430px] shrink-0 flex flex-col min-h-0 border-r overflow-y-auto" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
        <div className="px-5 pt-5 pb-3 flex items-center gap-2">
          <Truck className="w-5 h-5 text-[#f16622]" />
          <h1 className="text-[17px] font-semibold" style={{ color: "var(--text-main)" }}>Entregas</h1>
          {estado?.ambiente === "sandbox" && estado.configurada && <Selo tom="alerta">modo teste</Selo>}
        </div>

        {estado && !estado.configurada && (
          <p className="mx-5 mb-3 text-[12px] rounded-xl p-3" style={{ background: "rgba(197,120,0,0.1)", color: "#b26b00" }}>
            Faltam as chaves da Lalamove na Vercel (LALAMOVE_API_KEY e LALAMOVE_API_SECRET). Dá para montar a rota e ver o mapa; cotar e chamar ficam liberados depois do deploy com as chaves.
          </p>
        )}

        <div className="px-5 space-y-3 pb-4">
          {/* Pedido (opcional) */}
          <div>
            <p className="text-[11px] font-semibold mb-1" style={{ color: "var(--text-sub)" }}>Pedido (o custo vai para ele)</p>
            <select value={pedidoSel ? chavePedido(pedidoSel) : ""} className={campo}
              onChange={e => {
                const p = pedidos.find(x => chavePedido(x.tipo === "lote" ? { loteId: x.cards[0].loteId } : { cardId: x.cards[0].id }) === e.target.value)
                setPedidoSel(p ? (p.tipo === "lote" ? { loteId: p.cards[0].loteId, numero: p.numero, cliente: p.nomeCliente } : { cardId: p.cards[0].id, numero: p.numero, cliente: p.nomeCliente }) : null)
                if (!p) setCobrar(false)
              }}>
              <option value="">Sem pedido (custo geral de frete)</option>
              {pedidoSel && !pedidos.some(p => chavePedido(p.tipo === "lote" ? { loteId: p.cards[0].loteId } : { cardId: p.cards[0].id }) === chavePedido(pedidoSel)) &&
                <option value={chavePedido(pedidoSel)}>{pedidoSel.numero} · {pedidoSel.cliente}</option>}
              {pedidos.map(p => {
                const k = chavePedido(p.tipo === "lote" ? { loteId: p.cards[0].loteId } : { cardId: p.cards[0].id })
                return <option key={k} value={k}>{p.numero} · {p.nomeCliente} · {p.etapa}</option>
              })}
            </select>
          </div>

          {/* Paradas */}
          <div className="relative space-y-2">
            <span className="absolute left-[13px] top-6 bottom-6 w-px" style={{ background: "var(--border)" }} />
            {paradas.map((p, i) => (
              <ParadaEditor key={i} i={i} parada={p} catalogo={catalogo} total={paradas.length}
                onLugar={l => mudar(i, paradaDe(l))} onMudar={x => mudar(i, x)}
                onRemover={paradas.length > 2 ? () => { setParadas(ps => ps.filter((_, j) => j !== i)); setCot(null) } : undefined} />
            ))}
            {paradas.length < 16 && (
              <button onClick={() => { setParadas(ps => [...ps, vazia()]); setCot(null) }} className="ml-9 text-[12px] font-semibold text-[#8456e8] flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Adicionar parada</button>
            )}
          </div>

          {/* Veículo */}
          <div>
            <p className="text-[11px] font-semibold mb-1" style={{ color: "var(--text-sub)" }}>Veículo</p>
            <div className="flex gap-1.5 flex-wrap">
              {(servicos ?? []).map(s => (
                <button key={s.key} onClick={() => { setServico(s.key); setCot(null) }} title={[s.descricao, s.carga].filter(Boolean).join(" · ")}
                  className="h-8 px-3 rounded-lg text-[12px] font-medium transition-colors"
                  style={servico === s.key ? { background: "#8456e8", color: "#fff" } : { background: "var(--bg-page)", color: "var(--text-sub)", border: "1px solid var(--border)" }}>{s.nome}</button>
              ))}
              {servicos && !servicos.length && <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>{estado?.erro ?? "Disponível depois das chaves."}</span>}
            </div>
          </div>

          {pedidoSel && (
            <div className="flex items-center gap-4 text-[12.5px]" style={{ color: "var(--text-main)" }}>
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={!cobrar} onChange={() => setCobrar(false)} />Por nossa conta</label>
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={cobrar} onChange={() => setCobrar(true)} />Cobrar de {pedidoSel.cliente.split(" ")[0]}</label>
            </div>
          )}

          {cot && (
            <div className="rounded-xl p-3 ds-entrada" style={{ background: "rgba(241,102,34,0.08)", border: "1px solid rgba(241,102,34,0.25)" }}>
              <p className="text-[20px] font-bold ds-num" style={{ color: "var(--text-main)" }}>{brl(cot.valor)}</p>
              <p className="text-[11.5px]" style={{ color: "var(--text-sub)" }}>
                {cot.distanciaKm != null ? `${cot.distanciaKm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km · ` : ""}
                {restante > 0 ? `cotação vale mais ${Math.floor(restante / 60)}:${String(restante % 60).padStart(2, "0")}` : "cotação expirou, cote de novo"}
              </p>
            </div>
          )}
          {erro && <p className="text-[12px] text-[#d33a3c]">{erro}</p>}
          <div className="flex gap-2">
            <Botao onClick={cotar} disabled={cotando || !prontas || !servico || !estado?.configurada} icone={cotando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}>{cot ? "Cotar de novo" : "Cotar"}</Botao>
            <button onClick={chamar} disabled={!cot || restante <= 0 || chamando}
              className="flex-1 h-9 rounded-lg text-white text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: "#f16622" }}>
              <Truck className="w-4 h-4" />{chamando ? "Chamando…" : "Chamar motorista"}
            </button>
          </div>
        </div>

        {/* Corridas */}
        <div className="border-t" style={{ borderColor: "var(--border)" }}>
          <p className="px-5 pt-3 pb-1 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Corridas</p>
          {!fretes.length && <p className="px-5 pb-4 text-[12px]" style={{ color: "var(--text-faint)" }}>Nenhuma corrida ainda.</p>}
          {fretes.map(f => {
            const st = STATUS_FRETE[f.status] ?? { nome: f.status, tom: "neutro" as const }
            const ativa = selecionada === f.order_id
            return (
              <div key={f.order_id} onClick={() => setSelecionada(ativa ? null : f.order_id)}
                className="px-5 py-2.5 cursor-pointer transition-colors hover:bg-black/[0.02]"
                style={{ background: ativa ? "rgba(132,86,232,0.07)" : undefined, borderLeft: ativa ? "2px solid #8456e8" : "2px solid transparent" }}>
                <div className="flex items-center gap-2">
                  <Selo tom={st.tom}>{st.nome}</Selo>
                  <span className="text-[12.5px] font-semibold ds-num" style={{ color: "var(--text-main)" }}>{brl(Number(f.valor))}</span>
                  <span className="ml-auto text-[10.5px]" style={{ color: "var(--text-faint)" }}>{new Date(f.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="text-[11.5px] mt-0.5 truncate" style={{ color: "var(--text-sub)" }}>{f.descricao ?? `${f.retirada?.nome ?? ""} → ${f.entrega?.texto ?? ""}`}</p>
                <p className="text-[10.5px] truncate" style={{ color: "var(--text-faint)" }}>
                  {f.pedido_numero ? `${f.pedido_numero} · ${f.cliente}` : "sem pedido"}{f.motorista?.nome ? ` · ${f.motorista.nome}${f.motorista.placa ? ` (${f.motorista.placa})` : ""}` : ""}{f.ambiente === "sandbox" ? " · teste" : ""}
                </p>
                {ativa && (
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
                    {f.share_link && <a href={f.share_link} target="_blank" rel="noreferrer" className="h-7 px-2 rounded-lg inline-flex items-center gap-1 hover:bg-black/5 text-[11.5px] font-semibold" style={{ color: "var(--text-sub)" }}><ExternalLink className="w-3.5 h-3.5" />Rastreio</a>}
                    {f.share_link && f.cliente && !statusFinal(f.status) && (
                      <button onClick={() => mandarLink(f)} disabled={enviado === f.order_id} className="h-7 px-2 rounded-lg inline-flex items-center gap-1 hover:bg-[#25a35a]/10 text-[11.5px] font-semibold text-[#1d8a4b] disabled:opacity-60">
                        {enviado === f.order_id ? <><Check className="w-3.5 h-3.5" />Enviado</> : <><SendHorizontal className="w-3.5 h-3.5" />Mandar ao cliente</>}
                      </button>
                    )}
                    {(f.status === "ASSIGNING_DRIVER" || f.status === "ON_GOING") && <button onClick={() => cancelar(f)} className="h-7 px-2 rounded-lg hover:bg-black/5 text-[11.5px] font-semibold" style={{ color: "var(--text-sub)" }}>Cancelar</button>}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Meus locais */}
        <div className="border-t mt-auto" style={{ borderColor: "var(--border)" }}>
          <button onClick={() => setVerLocais(v => !v)} className="w-full px-5 py-3 flex items-center gap-2 text-[12px] font-semibold" style={{ color: "var(--text-sub)" }}>
            <Home className="w-3.5 h-3.5" />Meus locais ({(config.locaisRetirada ?? []).length})
            <span className="text-[11px] font-normal" style={{ color: "var(--text-faint)" }}>· fornecedores têm o endereço na página deles</span>
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${verLocais ? "rotate-180" : ""}`} />
          </button>
          {verLocais && <MeusLocais locais={config.locaisRetirada ?? []} onMudar={onSalvarLocais} />}
        </div>
      </div>

      {/* ── Mapa ── */}
      <div className="flex-1 min-h-[360px] relative">
        <MapaEntregas pontos={pontos} motorista={motorista} escuro={isDark} />
        {sel && (
          <div className="absolute top-4 left-4 right-4 sm:right-auto sm:max-w-sm rounded-2xl px-4 py-3 shadow-xl z-[500] ds-entrada" style={{ background: "var(--bg-surface)" }}>
            <div className="flex items-center gap-2">
              <Selo tom={(STATUS_FRETE[sel.status] ?? { tom: "neutro" as const }).tom}>{STATUS_FRETE[sel.status]?.nome ?? sel.status}</Selo>
              <button onClick={() => setSelecionada(null)} aria-label="Fechar" className="ml-auto w-6 h-6 rounded-md grid place-items-center hover:bg-black/5" style={{ color: "var(--text-faint)" }}><X className="w-3.5 h-3.5" /></button>
            </div>
            <p className="text-[12.5px] font-semibold mt-1.5" style={{ color: "var(--text-main)" }}>{sel.descricao}</p>
            {sel.motorista?.nome && <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-sub)" }}>{sel.motorista.nome}{sel.motorista.placa ? ` · ${sel.motorista.placa}` : ""}{sel.motorista.em ? ` · posição de ${new Date(sel.motorista.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>}
          </div>
        )}
        {!sel && !pontos.length && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none z-[400]">
            <p className="text-[13px] px-4 py-2 rounded-xl shadow" style={{ background: "var(--bg-surface)", color: "var(--text-sub)" }}>Escolha de onde sai e para onde vai</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Uma parada: escolhe do catálogo (fornecedor, meus locais, clientes) ou busca um endereço; e quem entrega/recebe
function ParadaEditor({ i, parada, catalogo, total, onLugar, onMudar, onRemover }: {
  i: number; parada: Parada; catalogo: Lugar[]; total: number
  onLugar: (l: Lugar) => void; onMudar: (p: Partial<Parada>) => void; onRemover?: () => void
}) {
  const [texto, setTexto] = useState("")
  const [aberto, setAberto] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [achados, setAchados] = useState<Lugar[]>([])
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener("mousedown", fora)
    return () => document.removeEventListener("mousedown", fora)
  }, [aberto])
  const filtro = nomeChave(texto)
  const lista = catalogo.filter(l => !filtro || nomeChave(l.nome).includes(filtro) || nomeChave(l.endereco.texto).includes(filtro)).slice(0, 8)
  async function buscar() {
    if (texto.trim().length < 4) return
    setBuscando(true)
    const r = await fetch(`/api/frete/buscar?q=${encodeURIComponent(texto)}`).then(x => x.json()).catch(() => [])
    setAchados((Array.isArray(r) ? r : []).map((e: Endereco, k: number) => ({ chave: `b:${k}:${e.lat}`, tipo: "busca" as const, nome: [e.rua, e.numero].filter(Boolean).join(", ") || e.texto.split(" · ")[0], endereco: e })))
    setBuscando(false)
  }
  const escolher = (l: Lugar) => { onLugar(l); setAberto(false); setTexto(""); setAchados([]) }
  const retirada = i === 0
  return (
    <div className="relative flex gap-2.5" ref={caixa}>
      <span className="relative z-10 w-[27px] h-[27px] rounded-full grid place-items-center text-[11px] font-bold text-white shrink-0 mt-0.5" style={{ background: COR_PONTO(i) }}>{LETRAS[i]}</span>
      <div className="flex-1 min-w-0 rounded-xl p-2.5 ds-borda" style={{ background: "var(--bg-surface)" }}>
        <div className="flex items-center gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: retirada ? "#009351" : "#f16622" }}>{retirada ? "Retirada" : total > 2 ? `Entrega ${i}` : "Entrega"}</span>
          {onRemover && <button onClick={onRemover} aria-label="Remover parada" className="ml-auto" style={{ color: "var(--text-faint)" }}><X className="w-3.5 h-3.5" /></button>}
        </div>
        {parada.lugar && !aberto ? (
          <button onClick={() => setAberto(true)} className="w-full text-left mt-1">
            <p className="text-[12.5px] font-semibold flex items-center gap-1.5" style={{ color: "var(--text-main)" }}><span style={{ color: "var(--text-faint)" }}>{ICONE[parada.lugar.tipo]}</span>{parada.lugar.nome}</p>
            <p className="text-[11px] truncate" style={{ color: "var(--text-faint)" }}>{parada.lugar.endereco.texto}</p>
          </button>
        ) : (
          <div className="relative mt-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-faint)" }} />
            <input autoFocus={aberto} value={texto} onFocus={() => setAberto(true)} onChange={e => { setTexto(e.target.value); setAchados([]) }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); buscar() } if (e.key === "Escape") setAberto(false) }}
              placeholder="Fornecedor, cliente, local ou endereço (Enter busca)" className={`${campo} pl-8`} />
          </div>
        )}
        {aberto && (
          <div className="absolute left-9 right-0 top-full mt-1 z-[600] rounded-xl shadow-xl overflow-hidden ds-entrada" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            {parada.lugar && (
              <div className="p-2 border-b" style={{ borderColor: "var(--border)" }}>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-faint)" }} />
                  <input autoFocus value={texto} onChange={e => { setTexto(e.target.value); setAchados([]) }}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); buscar() } if (e.key === "Escape") setAberto(false) }}
                    placeholder="Trocar: fornecedor, cliente ou endereço" className={`${campo} pl-8`} />
                </div>
              </div>
            )}
            <div className="max-h-72 overflow-y-auto">
              {[...achados, ...lista].map(l => (
                <button key={l.chave} onClick={() => escolher(l)} className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-[#8456e8]/[0.06]">
                  <span className="mt-0.5" style={{ color: l.tipo === "busca" ? "#f16622" : "var(--text-faint)" }}>{ICONE[l.tipo]}</span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium truncate" style={{ color: "var(--text-main)" }}>{l.nome}</span>
                    <span className="block text-[11px] truncate" style={{ color: "var(--text-faint)" }}>{l.endereco.texto}</span>
                  </span>
                </button>
              ))}
              {!lista.length && !achados.length && <p className="px-3 py-2 text-[11.5px]" style={{ color: "var(--text-faint)" }}>Nada no cadastro com esse nome.</p>}
              {texto.trim().length >= 4 && (
                <button onClick={buscar} className="w-full text-left px-3 py-2 flex items-center gap-2 border-t text-[12px] font-semibold text-[#8456e8]" style={{ borderColor: "var(--border)" }}>
                  {buscando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}Buscar “{texto.trim()}” no mapa
                </button>
              )}
            </div>
          </div>
        )}
        {parada.lugar && (
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            <input value={parada.pessoa} onChange={e => onMudar({ pessoa: e.target.value })} placeholder={retirada ? "Quem entrega ao motorista" : "Quem recebe"} className={campo} />
            <input value={parada.telefone} onChange={e => onMudar({ telefone: e.target.value })} placeholder="Telefone"
              className={`${campo} ${parada.telefone && !telefoneE164(parada.telefone) ? "!border-[#d33a3c]" : ""}`} />
            {!retirada && <input value={parada.obs} onChange={e => onMudar({ obs: e.target.value })} placeholder="Observação ao motorista (opcional)" className={`${campo} col-span-2`} />}
          </div>
        )}
      </div>
    </div>
  )
}

function MeusLocais({ locais, onMudar }: { locais: LocalRetirada[]; onMudar: (l: LocalRetirada[]) => void }) {
  const [novo, setNovo] = useState<{ nome: string; contato: string; telefone: string; endereco: Endereco | null } | null>(null)
  return (
    <div className="px-5 pb-4 space-y-2">
      {locais.map(l => (
        <div key={l.id} className="flex items-start gap-2 rounded-lg px-3 py-2 ds-borda">
          <Home className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--text-faint)" }} />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold" style={{ color: "var(--text-main)" }}>{l.nome}{l.contato ? <span className="font-normal" style={{ color: "var(--text-faint)" }}> · {l.contato} {l.telefone}</span> : null}</p>
            <p className="text-[11px] truncate" style={{ color: "var(--text-faint)" }}>{l.endereco.texto}</p>
          </div>
          <button onClick={() => onMudar(locais.filter(x => x.id !== l.id))} aria-label="Remover" style={{ color: "var(--text-faint)" }}><X className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      {novo ? (
        <div className="rounded-lg p-2.5 space-y-2 ds-borda">
          <input value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} placeholder="Nome (ex.: Gráfica, Casa)" className={campo} />
          <div className="grid grid-cols-2 gap-1.5">
            <input value={novo.contato} onChange={e => setNovo({ ...novo, contato: e.target.value })} placeholder="Quem entrega/recebe" className={campo} />
            <input value={novo.telefone} onChange={e => setNovo({ ...novo, telefone: e.target.value })} placeholder="Telefone" className={campo} />
          </div>
          <BuscaEndereco valor={novo.endereco} onMudar={e => setNovo({ ...novo, endereco: e })} />
          <div className="flex gap-2 justify-end">
            <Botao variante="fantasma" onClick={() => setNovo(null)}>Cancelar</Botao>
            <Botao variante="primario" disabled={!novo.nome.trim() || !novo.endereco}
              onClick={() => { onMudar([...locais, { id: `loc-${Date.now()}`, nome: novo.nome.trim(), contato: novo.contato.trim() || undefined, telefone: novo.telefone.trim() || undefined, endereco: novo.endereco! }]); setNovo(null) }}>Salvar local</Botao>
          </div>
        </div>
      ) : <Botao icone={<Plus className="w-3.5 h-3.5" />} onClick={() => setNovo({ nome: "", contato: "", telefone: "", endereco: null })}>Novo local</Botao>}
    </div>
  )
}

