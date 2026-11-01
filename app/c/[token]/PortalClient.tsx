"use client"

import Image from "next/image"
import { Check, Package, FileImage, Camera, QrCode, CalendarDays, ChevronRight, Truck } from "lucide-react"

type Item = { numero: string; dimensoes: string; material: string; quantidade: number }
type Arquivo = { id: string; nome: string; url: string; tipo: string; quando: string }
type PedidoPortal = {
  key: string; numero: string; coluna: number; dataFechamento: string | null; dataEntregaPrevista: string | null; dataEntregaReal: string | null
  venda: number; recebido: number; aReceber: number; quantidade: number
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

export default function PortalClient({ dados }: { dados: DadosPortal }) {
  if (!dados) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] grid place-items-center px-6 text-center">
        <div><p className="font-semibold text-[#191625]">Link inválido</p><p className="text-[13px] text-[#8E8E93] mt-1">Peça um novo link para a Enyla.</p></div>
      </div>
    )
  }
  const andamento = dados.pedidos.filter(p => p.coluna >= 1 && p.coluna < 9)
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
                    : <span className="text-[12.5px] font-semibold text-[#191625] ds-num">{brl(p.venda)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {!dados.pedidos.length && <p className="text-center text-[13px] text-[#8E8E93] py-10">Nenhum pedido ainda.</p>}
      </div>
    </div>
  )
}
