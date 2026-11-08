"use client"

// Caixaria · pedidos feitos no site (caixaria.com). Quem pagou, quem ficou no meio do caminho e o que cada um levou.
// Pedido pago entra sozinho na chapa (tela Chapas).

import { useCallback, useEffect, useMemo, useState } from "react"
import { ShoppingBag, Wallet, Clock, Receipt, MessageCircle, ExternalLink, AlertTriangle, RotateCcw, Truck } from "lucide-react"
import { Pagina, CabecalhoPagina, Cartao, Kpi, GradeKpis, Selo, Botao, Segmentado, LinhaLista, Vazio, Gaveta, type Tom } from "@/app/components/ds"

type Item = { nome: string; medida: string; qtd: number; acab: string; prazo: string; marca: string | null; freteIncluso: boolean; total: number }
type Pedido = {
  id: string; numero: string; status: string; forma: string; criadoEm: string; total: number; pago: number
  cliente: { nome: string; email: string; telefone: string; documento: string }; cidade: string
  itens: Item[]; metodo: string | null
}
type Filtro = "pagos" | "aguardando" | "todos"

const SITE = "https://caixaria.com"
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

  const buscar = useCallback(() => fetch("/api/caixaria/pedidos").then(r => r.json())
    .then(j => { if (j.erro) setErro(j.erro); else { setErro(""); setPedidos(j.pedidos ?? []) } })
    .catch(() => setErro("Sem conexão")), [])
  useEffect(() => { buscar() }, [buscar])

  const r = useMemo(() => {
    const t = pedidos ?? []
    const desde = Date.now() - 30 * 86_400_000
    const pagos30 = t.filter(p => pago(p) && new Date(p.criadoEm).getTime() >= desde)
    const fat = pagos30.reduce((s, p) => s + p.pago, 0)
    const caixas = pagos30.reduce((s, p) => s + p.itens.reduce((a, i) => a + i.qtd, 0), 0)
    return {
      pagos: pagos30.length, fat, ticket: pagos30.length ? fat / pagos30.length : 0, caixas,
      aguardando: t.filter(p => p.status === "aguardando_pagamento"),
    }
  }, [pedidos])

  const lista = (pedidos ?? []).filter(p => filtro === "todos" || (filtro === "pagos" ? pago(p) : p.status === "aguardando_pagamento"))

  return (
    <Pagina>
      <CabecalhoPagina titulo="Pedidos do site" sub="Pedidos feitos em caixaria.com nos últimos 90 dias. Pedido pago entra sozinho na chapa."
        acoes={<div className="flex gap-2">
          <Botao icone={<RotateCcw className="w-3.5 h-3.5" />} onClick={buscar}>Atualizar</Botao>
          <a href={SITE} target="_blank" rel="noopener"><Botao icone={<ExternalLink className="w-3.5 h-3.5" />}>Abrir o site</Botao></a>
        </div>} />

      {erro && <Cartao className="mb-4"><p className="text-[13px] text-[#d33a3c] flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{erro}</p></Cartao>}

      <GradeKpis>
        <Kpi rotulo="Pedidos pagos (30 dias)" valor={pedidos ? r.pagos : null} formato={n} icone={<ShoppingBag className="w-3.5 h-3.5" />} onClick={() => setFiltro("pagos")} destaque={filtro === "pagos"} />
        <Kpi rotulo="Faturamento (30 dias)" valor={pedidos ? r.fat : null} formato={brl} tom="sucesso" sub={`${n(r.caixas)} caixas vendidas`} icone={<Wallet className="w-3.5 h-3.5" />} />
        <Kpi rotulo="Ticket médio" valor={pedidos ? r.ticket : null} formato={brl} icone={<Receipt className="w-3.5 h-3.5" />} />
        <Kpi rotulo="Pararam no pagamento" valor={pedidos ? r.aguardando.length : null} formato={n} tom={r.aguardando.length ? "alerta" : "neutro"}
          sub={r.aguardando.length ? `${brl(r.aguardando.reduce((s, p) => s + p.total, 0))} em aberto` : "ninguém parado"} icone={<Clock className="w-3.5 h-3.5" />}
          onClick={() => setFiltro("aguardando")} destaque={filtro === "aguardando"} />
      </GradeKpis>

      <div className="mt-6 mb-3">
        <Segmentado<Filtro> valor={filtro} onChange={setFiltro}
          opcoes={[{ v: "pagos", nome: "Pagos" }, { v: "aguardando", nome: `Aguardando${r.aguardando.length ? ` (${r.aguardando.length})` : ""}` }, { v: "todos", nome: "Todos" }]} />
      </div>

      <Cartao padding={false}>
        {!pedidos ? <p className="p-5 text-[13px] text-[#8E8E93]">Lendo os pedidos do site</p>
          : lista.length === 0 ? <Vazio icone={<ShoppingBag className="w-9 h-9 text-[#c7c7cc]" />} titulo="Nenhum pedido aqui"
            sub={filtro === "aguardando" ? "Ninguém parou no pagamento." : "Os pedidos de caixaria.com aparecem aqui."} />
          : lista.map(p => {
            const s = STATUS[p.status] ?? { tom: "neutro" as Tom, texto: p.status }
            const caixas = p.itens.reduce((a, i) => a + i.qtd, 0)
            return (
              <LinhaLista key={p.id} onClick={() => setAberto(p)}
                titulo={`${p.cliente?.nome ?? "—"} · ${p.numero}`}
                sub={`${p.itens.map(i => i.nome.replace(/^Caixa para /, "")).join(", ")} · ${n(caixas)} un · ${quando(p.criadoEm)}`}
                valor={brl(p.total)} valorSub={<Selo tom={s.tom}>{s.texto}</Selo>} />
            )
          })}
      </Cartao>

      <Gaveta aberta={!!aberto} onFechar={() => setAberto(null)} titulo={aberto ? `${aberto.numero} · ${aberto.cliente?.nome ?? ""}` : ""}
        sub={aberto ? `${quando(aberto.criadoEm)} · ${aberto.forma === "cartao" ? "cartão" : aberto.forma === "pix" ? "Pix" : aberto.forma}${aberto.metodo && !/pix|cart/i.test(aberto.metodo) ? ` (${aberto.metodo})` : ""}` : undefined}
        rodape={aberto && <div className="flex gap-2 justify-end flex-wrap">
          <a href={`https://wa.me/55${aberto.cliente?.telefone}`} target="_blank" rel="noopener"><Botao icone={<MessageCircle className="w-3.5 h-3.5" />}>WhatsApp do cliente</Botao></a>
          <a href={`${SITE}/pedido/${aberto.numero}`} target="_blank" rel="noopener"><Botao icone={<ExternalLink className="w-3.5 h-3.5" />}>Página do pedido</Botao></a>
          {pago(aberto) && onVerChapas && <Botao variante="primario" onClick={() => { setAberto(null); onVerChapas() }}>Ver nas chapas</Botao>}
        </div>}>
        {aberto && (
          <div className="space-y-5 text-[13px]">
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
