"use client"

import { useState } from "react"
import Image from "next/image"
import { Star, Heart, Check, Package, FileImage, Camera, QrCode, CalendarDays, ChevronRight, Truck, RotateCw, X, CircleCheck } from "lucide-react"

type Item = { numero: string; dimensoes: string; material: string; quantidade: number }
type Arquivo = { id: string; nome: string; url: string; tipo: string; quando: string }
type PedidoPortal = {
  key: string; numero: string; coluna: number; dataFechamento: string | null; dataEntregaPrevista: string | null; dataEntregaReal: string | null
  venda: number; recebido: number; aReceber: number; quantidade: number; nota: number | null
  itens: Item[]; etapas: { coluna: number; dataHora: string; tipo: string }[]; arquivos: Arquivo[]
}
export type DadosPortal = { nome: string; pedidos: PedidoPortal[] } | null

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const num = (v: number) => v.toLocaleString("pt-BR")
const curta = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "")
const isoDe = (dataHora: string) => { const [d, m, y] = dataHora.split(",")[0].trim().split("/"); return y ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : null }

// Marcos que o cliente entende (agrupam as colunas do quadro)
const MARCOS = [
  { nome: "Confirmado", de: 1, ate: 1 },
  { nome: "Arte", de: 2, ate: 3 },
  { nome: "Produção", de: 4, ate: 7 },
  { nome: "Pronto", de: 8, ate: 8 },
  { nome: "Entregue", de: 9, ate: 9 },
]

function LinhaDoTempo({ p }: { p: PedidoPortal }) {
  const quando = (de: number, ate: number) => {
    const ds = p.etapas.filter(e => e.tipo === "coluna" && e.coluna >= de && e.coluna <= ate).map(e => isoDe(e.dataHora)).filter(Boolean) as string[]
    return ds.sort()[0]
  }
  const atual = MARCOS.findIndex(m => p.coluna >= m.de && p.coluna <= m.ate)
  const pct = atual <= 0 ? 0 : atual / (MARCOS.length - 1) * 100
  return (
    <div className="relative pt-1">
      <div className="absolute left-[10%] right-[10%] top-[13px] h-[3px] rounded-full bg-[rgba(116,116,128,0.15)]">
        <div className="h-full rounded-full bg-[#8456e8] transition-[width] duration-1000 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <div className="relative grid grid-cols-5">
        {MARCOS.map((m, i) => {
          const feito = i < atual || (i === atual && m.nome === "Entregue")
          const agora = i === atual && m.nome !== "Entregue"
          const data = m.nome === "Entregue" && p.dataEntregaReal ? p.dataEntregaReal : quando(m.de, m.ate)
          return (
            <div key={m.nome} className="flex flex-col items-center text-center gap-1.5">
              <span className="relative w-6 h-6 grid place-items-center">
                {agora && <span className="absolute inset-0 rounded-full bg-[#8456e8]/30 animate-ping" />}
                <span className={`relative w-6 h-6 rounded-full grid place-items-center ${feito ? "bg-[#8456e8] text-white" : agora ? "bg-[#8456e8] ring-4 ring-[#8456e8]/15" : "bg-white ring-2 ring-[rgba(116,116,128,0.2)]"}`}>
                  {feito && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                  {agora && <span className="w-2 h-2 rounded-full bg-white" />}
                </span>
              </span>
              <span className={`text-[11px] font-medium leading-tight ${i <= atual ? "text-[#191625]" : "text-[#8E8E93]"}`}>{m.nome}</span>
              <span className="text-[10px] text-[#8E8E93] leading-tight h-3">
                {data ? curta(data) : m.nome === "Entregue" && p.dataEntregaPrevista ? `prev. ${curta(p.dataEntregaPrevista)}` : ""}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CartaoPedido({ p, nome }: { p: PedidoPortal; nome: string }) {
  const fotos = p.arquivos.filter(a => a.tipo === "foto")
  const docs = p.arquivos.filter(a => a.tipo !== "foto")
  const item = p.itens[0]
  const pagoPct = p.venda > 0 ? Math.min(100, p.recebido / p.venda * 100) : 0
  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden animate-[apple-slide-up_.35s_ease-out]">
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-mono font-semibold text-[#8456e8]">{p.numero}</p>
            <p className="text-[16px] font-semibold text-[#191625] leading-snug mt-0.5">
              {num(p.quantidade)} {p.itens.length > 1 ? `unidades em ${p.itens.length} itens` : "embalagens"}
            </p>
            {item && <p className="text-[12.5px] text-[#8E8E93] truncate">{[item.dimensoes && item.dimensoes !== "0×0×0" ? `${item.dimensoes} cm` : null, item.material].filter(Boolean).join(" · ")}</p>}
          </div>
          {p.coluna < 9 && p.dataEntregaPrevista && (
            <div className="text-right shrink-0">
              <p className="text-[10.5px] text-[#8E8E93] flex items-center gap-1 justify-end"><Truck className="w-3 h-3" />Entrega prevista</p>
              <p className="text-[14px] font-semibold text-[#191625]">{curta(p.dataEntregaPrevista)}</p>
            </div>
          )}
        </div>

        <LinhaDoTempo p={p} />

        {fotos.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] mb-2 flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" />Da produção</p>
            <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 [&::-webkit-scrollbar]:hidden">
              {fotos.slice().reverse().map(f => (
                <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt="Foto da produção" className="w-28 h-28 rounded-xl object-cover bg-[#f2f2f7]" />
                  <p className="text-[10px] text-[#8E8E93] mt-1">{curta(f.quando)}</p>
                </a>
              ))}
            </div>
          </div>
        )}

        {docs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {docs.map(a => (
              <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
                className="h-8 px-3 rounded-full bg-[rgba(116,116,128,0.08)] text-[12px] text-[#191625] flex items-center gap-1.5 max-w-full">
                <FileImage className="w-3.5 h-3.5 text-[#8456e8] shrink-0" /><span className="truncate">{a.tipo === "mockup" ? "Mockup" : "Arte"} · {a.nome}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 py-4 bg-[#fafafc] border-t border-[rgba(60,60,67,0.06)] space-y-2.5">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="text-[#8E8E93]">Total do pedido</span>
          <span className="font-semibold text-[#191625] ds-num">{brl(p.venda)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-[rgba(116,116,128,0.12)] overflow-hidden">
          <div className="h-full rounded-full bg-[#009351] transition-[width] duration-1000" style={{ width: `${pagoPct}%` }} />
        </div>
        <div className="flex items-baseline justify-between text-[12px]">
          <span className="text-[#009351]">Pago {brl(p.recebido)}</span>
          {p.aReceber > 0.5 ? <span className="text-[#191625]">Falta {brl(p.aReceber)}</span> : <span className="text-[#009351] flex items-center gap-1"><Check className="w-3.5 h-3.5" />Quitado</span>}
        </div>
        {p.aReceber > 0.5 && (
          <a href={`/pix/${encodeURIComponent(p.numero)}?v=${p.aReceber.toFixed(2)}&c=${encodeURIComponent(nome)}`}
            className="h-11 w-full rounded-xl bg-[#8456e8] hover:bg-[#7445d4] text-white font-semibold text-[14px] flex items-center justify-center gap-2 transition-colors">
            <QrCode className="w-4 h-4" /> Pagar {brl(p.aReceber)} via Pix
          </a>
        )}
      </div>
    </div>
  )
}

// "Chegou! Como ficou?": aparece no topo por 30 dias depois da entrega, até o cliente avaliar
function ComoFicou({ p, token }: { p: PedidoPortal; token: string }) {
  const [nota, setNota] = useState(0)
  const [comentario, setComentario] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [feito, setFeito] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const fotos = p.arquivos.filter(a => a.tipo === "foto" || a.tipo === "mockup")
  async function enviar() {
    setEnviando(true); setErro(null)
    try {
      const r = await fetch(`/api/c/${encodeURIComponent(token)}/avaliar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: p.key, nota, comentario }) })
      if (r.ok) setFeito(true); else setErro((await r.json().catch(() => ({}))).erro ?? "Não deu para enviar agora.")
    } catch { setErro("Sem conexão. Tente de novo.") }
    setEnviando(false)
  }
  const rotulos = ["", "Não gostei", "Poderia ser melhor", "Ficou bom", "Ficou ótimo", "Amei!"]
  return (
    <div className="relative overflow-hidden rounded-2xl text-white shadow-[0_8px_24px_rgba(132,86,232,0.25)] animate-[apple-slide-up_.4s_ease-out]" style={{ background: "linear-gradient(135deg,#8456e8,#5b34c2)" }}>
      <div className="relative p-5 space-y-4">
        {feito ? (
          <div className="text-center py-3 space-y-2 animate-[apple-slide-up_.3s_ease-out]">
            <div className="w-14 h-14 rounded-full bg-white/15 grid place-items-center mx-auto"><Heart className="w-7 h-7 fill-white" /></div>
            <p className="text-[18px] font-bold">Obrigado!</p>
            <p className="text-[13.5px] text-white/80">{nota >= 4 ? "Ficamos muito felizes. Quando precisar de mais, é só tocar em Repetir." : "Obrigado pela sinceridade. Vamos olhar com carinho e falar com você."}</p>
          </div>
        ) : <>
          <div>
            <p className="text-[12px] font-semibold text-white/70 uppercase tracking-wide">{p.numero} · entregue{p.dataEntregaReal ? ` em ${curta(p.dataEntregaReal)}` : ""}</p>
            <p className="text-[22px] font-bold tracking-[-0.02em] mt-0.5">Chegou! Como ficou?</p>
            <p className="text-[13px] text-white/80">{num(p.quantidade)} embalagens. Conta pra gente o que achou.</p>
          </div>
          {fotos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto -mx-1 px-1 [&::-webkit-scrollbar]:hidden">
              {fotos.slice(-4).reverse().map(f => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={f.id} src={f.url} alt="" className="w-20 h-20 rounded-xl object-cover bg-white/10 shrink-0" />
              ))}
            </div>
          )}
          <div>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Nota">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setNota(n)} role="radio" aria-checked={nota === n} aria-label={`${n} de 5`}
                  className="w-11 h-11 rounded-xl grid place-items-center bg-white/10 active:scale-90 transition-transform">
                  <Star className={`w-6 h-6 transition-all duration-200 ${n <= nota ? "scale-110" : ""}`} style={n <= nota ? { fill: "#ffd34d", color: "#ffd34d" } : { color: "rgba(255,255,255,0.55)" }} />
                </button>
              ))}
            </div>
            <p className="text-[12.5px] text-white/80 mt-1.5 h-4">{rotulos[nota]}</p>
          </div>
          {nota > 0 && <>
            <textarea value={comentario} onChange={e => setComentario(e.target.value)} rows={2} maxLength={600}
              placeholder={nota >= 4 ? "Quer deixar um recado? (opcional)" : "O que podemos melhorar? (opcional)"}
              className="w-full rounded-xl px-3.5 py-2.5 text-[14px] bg-white text-[#191625] placeholder:text-[#8E8E93] focus:outline-none animate-[apple-slide-up_.25s_ease-out]" />
            {erro && <p className="text-[13px] text-[#ffd0d0]">{erro}</p>}
            <button onClick={enviar} disabled={enviando}
              className="h-11 w-full rounded-xl bg-white font-semibold text-[14.5px] disabled:opacity-60 active:scale-[0.98] transition-transform" style={{ color: "#5b34c2" }}>
              {enviando ? "Enviando…" : "Enviar"}
            </button>
          </>}
        </>}
      </div>
    </div>
  )
}

// Repetir um pedido: mesma quantidade sai pelo mesmo preço; outra quantidade vai para orçamento
function FolhaRepetir({ p, token, onFechar }: { p: PedidoPortal; token: string; onFechar: () => void }) {
  const [outra, setOutra] = useState(false)
  const [qtd, setQtd] = useState(String(p.quantidade))
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<{ tipo: "pedido"; numero: string; total: number; sinal: number; pix: string } | { tipo: "orcamento" } | null>(null)
  const quantidade = outra ? Math.round(Number(qtd.replace(/\D/g, "")) || 0) : p.quantidade
  async function enviar() {
    if (quantidade <= 0) return
    setEnviando(true); setErro(null)
    try {
      const r = await fetch(`/api/c/${encodeURIComponent(token)}/repetir`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: p.key, quantidade }) })
      const d = await r.json()
      if (!r.ok) setErro(d.erro ?? "Não deu para registrar agora.")
      else setFeito(d)
    } catch { setErro("Sem conexão. Tente de novo.") }
    setEnviando(false)
  }
  return (
    <div className="fixed inset-0 z-40">
      <div onClick={onFechar} className="absolute inset-0 bg-black/30 animate-[apple-backdrop-in_.2s_ease-out]" />
      <div className="absolute left-0 right-0 bottom-0 bg-[#F2F2F7] rounded-t-3xl animate-[apple-slide-up_.3s_ease-out]" style={{ paddingBottom: "max(env(safe-area-inset-bottom),16px)" }}>
        <div className="max-w-xl mx-auto px-5 pt-3 space-y-4">
          <div className="flex justify-center"><span className="w-10 h-1.5 rounded-full bg-[rgba(60,60,67,0.2)]" /></div>
          {feito ? (
            <div className="text-center space-y-3 py-2">
              <div className="w-14 h-14 rounded-full bg-[#009351]/10 grid place-items-center mx-auto"><CircleCheck className="w-8 h-8 text-[#009351]" /></div>
              {feito.tipo === "pedido" ? <>
                <p className="text-[18px] font-bold text-[#191625]">Pedido {feito.numero} feito!</p>
                <p className="text-[13.5px] text-[#5e5c68]">{num(p.quantidade)} embalagens por {brl(feito.total)}, o mesmo preço da última vez. Para começar a produção, pague o sinal de {brl(feito.sinal)}.</p>
                <a href={feito.pix} className="h-12 w-full rounded-xl bg-[#8456e8] text-white font-semibold text-[15px] flex items-center justify-center gap-2"><QrCode className="w-5 h-5" />Pagar sinal via Pix</a>
              </> : <>
                <p className="text-[18px] font-bold text-[#191625]">Recebemos seu pedido</p>
                <p className="text-[13.5px] text-[#5e5c68]">Vamos calcular {num(quantidade)} embalagens e te mandar o valor com o link para aprovar.</p>
              </>}
              <button onClick={() => { onFechar(); if (feito.tipo === "pedido") location.reload() }} className="h-11 w-full rounded-xl bg-white text-[#191625] font-medium">Fechar</button>
            </div>
          ) : <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[18px] font-bold text-[#191625]">Repetir {p.numero}</p>
                <p className="text-[12.5px] text-[#8E8E93]">{p.itens.length > 1 ? `${p.itens.length} itens · ` : ""}{p.itens[0]?.dimensoes && p.itens[0].dimensoes !== "0×0×0" ? `${p.itens[0].dimensoes} cm · ` : ""}{p.itens[0]?.material}</p>
              </div>
              <button onClick={onFechar} aria-label="Fechar" className="w-8 h-8 rounded-full grid place-items-center bg-[rgba(116,116,128,0.12)] text-[#5e5c68]"><X className="w-4 h-4" /></button>
            </div>
            <div className="bg-white rounded-2xl divide-y divide-[rgba(60,60,67,0.08)]">
              <button onClick={() => setOutra(false)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
                <span className={`w-5 h-5 rounded-full grid place-items-center shrink-0 ${!outra ? "bg-[#8456e8]" : "ring-2 ring-[rgba(60,60,67,0.25)]"}`}>{!outra && <Check className="w-3 h-3 text-white" strokeWidth={3} />}</span>
                <span className="flex-1"><span className="block text-[15px] font-semibold text-[#191625]">{num(p.quantidade)} embalagens</span><span className="block text-[12px] text-[#8E8E93]">mesmo preço do último pedido</span></span>
                <span className="text-[15px] font-bold text-[#191625] ds-num">{brl(p.venda)}</span>
              </button>
              <div className="px-4 py-3.5">
                <button onClick={() => setOutra(true)} className="w-full flex items-center gap-3 text-left">
                  <span className={`w-5 h-5 rounded-full grid place-items-center shrink-0 ${outra ? "bg-[#8456e8]" : "ring-2 ring-[rgba(60,60,67,0.25)]"}`}>{outra && <Check className="w-3 h-3 text-white" strokeWidth={3} />}</span>
                  <span className="flex-1 text-[15px] font-semibold text-[#191625]">Outra quantidade</span>
                </button>
                {outra && <input autoFocus value={qtd} onChange={e => setQtd(e.target.value)} inputMode="numeric" placeholder="Quantas embalagens?"
                  className="mt-2.5 w-full h-11 rounded-xl px-4 text-[15px] bg-[rgba(116,116,128,0.08)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/30" />}
                {outra && <p className="text-[11.5px] text-[#8E8E93] mt-1.5">Calculamos o valor e te mandamos para aprovar.</p>}
              </div>
            </div>
            <p className="text-[12px] text-[#5e5c68] px-1 flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[#009351]" />Arte e faca já são suas: nada de refazer.</p>
            {erro && <p className="text-[13px] text-[#d33a3c] px-1">{erro}</p>}
            <button onClick={enviar} disabled={enviando || quantidade <= 0}
              className="h-12 w-full rounded-xl bg-[#8456e8] text-white font-semibold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40">
              <RotateCw className="w-4 h-4" />{enviando ? "Enviando…" : outra ? "Pedir orçamento" : `Repetir por ${brl(p.venda)}`}
            </button>
          </>}
        </div>
      </div>
    </div>
  )
}

export default function PortalClient({ dados, token }: { dados: DadosPortal; token: string }) {
  const [repetindo, setRepetindo] = useState<PedidoPortal | null>(null)
  if (!dados) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] grid place-items-center px-6 text-center">
        <div><p className="font-semibold text-[#191625]">Link inválido</p><p className="text-[13px] text-[#8E8E93] mt-1">Peça um novo link para a Enyla.</p></div>
      </div>
    )
  }
  const andamento = dados.pedidos.filter(p => p.coluna >= 1 && p.coluna < 9)
  const hojeMs = Date.now()
  const paraAvaliar = dados.pedidos.filter(p => p.coluna === 9 && p.nota == null && p.dataEntregaReal
    && hojeMs - new Date(p.dataEntregaReal.slice(0, 10) + "T12:00:00").getTime() <= 30 * 86_400_000)
  const entregues = dados.pedidos.filter(p => p.coluna === 9)
  const primeiro = dados.nome.split(" ")[0]
  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <div className="bg-white/90 backdrop-blur-xl border-b border-[rgba(60,60,67,0.1)] sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-5 h-14 flex items-center">
          <Image src="/brand/enyla-wordmark-dark.png" alt="Enyla" width={1335} height={328} className="h-5 w-auto" priority />
        </div>
      </div>
      <div className="max-w-xl mx-auto px-4 py-6 pb-12 space-y-5">
        <div className="px-1">
          <p className="text-[24px] font-bold text-[#191625] tracking-[-0.02em]">Olá, {primeiro}!</p>
          <p className="text-[14px] text-[#8E8E93]">{andamento.length ? `${andamento.length} ${andamento.length === 1 ? "pedido em andamento" : "pedidos em andamento"}` : "Seus pedidos com a Enyla"}</p>
        </div>

        {paraAvaliar.slice(0, 1).map(p => <ComoFicou key={p.key} p={p} token={token} />)}

        {andamento.map(p => <CartaoPedido key={p.key} p={p} nome={dados.nome} />)}

        {entregues.length > 0 && (
          <div>
            <p className="px-1 mb-2 text-[13px] font-semibold text-[#191625]">Pedidos anteriores</p>
            <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] divide-y divide-[rgba(60,60,67,0.08)]">
              {entregues.map(p => (
                <div key={p.key} className="px-5 py-3.5 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-[#009351]/10 text-[#009351] grid place-items-center shrink-0"><Package className="w-4 h-4" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-medium text-[#191625]">{num(p.quantidade)} embalagens · {p.numero}</p>
                    <p className="text-[11.5px] text-[#8E8E93] flex items-center gap-1"><CalendarDays className="w-3 h-3" />{p.dataEntregaReal ? `entregue em ${curta(p.dataEntregaReal)}` : p.dataFechamento ? `pedido em ${curta(p.dataFechamento)}` : "entregue"}</p>
                  </div>
                  {p.aReceber > 0.5
                    ? <a href={`/pix/${encodeURIComponent(p.numero)}?v=${p.aReceber.toFixed(2)}&c=${encodeURIComponent(dados.nome)}`} className="text-[12px] font-semibold text-[#8456e8] flex items-center gap-0.5">Pagar {brl(p.aReceber)}<ChevronRight className="w-3.5 h-3.5" /></a>
                    : <button onClick={() => setRepetindo(p)} className="h-8 px-3 rounded-full bg-[#8456e8]/10 text-[#8456e8] text-[12.5px] font-semibold flex items-center gap-1.5 active:scale-95 transition-transform"><RotateCw className="w-3.5 h-3.5" />Repetir</button>}
                </div>
              ))}
            </div>
          </div>
        )}

        {!dados.pedidos.length && <p className="text-center text-[13px] text-[#8E8E93] py-10">Nenhum pedido ainda.</p>}
      </div>
      {repetindo && <FolhaRepetir p={repetindo} token={token} onFechar={() => setRepetindo(null)} />}
    </div>
  )
}
