"use client"

// Gastos da operação: IA (tokens) e anúncios da Meta por dia, quantos dias o saldo aguenta e quanto o braço digital
// (margem dos pedidos pagos) cobre. O aviso de saldo acabando chega no seu WhatsApp.

import { useCallback, useEffect, useState } from "react"
import { Bot, Megaphone, Printer, Wallet, RefreshCw, AlertTriangle, ExternalLink, Check } from "lucide-react"
import { Pagina, CabecalhoPagina, Cartao, TituloCartao, Kpi, GradeKpis, Selo, Botao, Colunas, Vazio } from "./ds"
import type { Gastos } from "@/app/lib/gastos"

type Resposta = Gastos & { alertaDias: number; erro?: string }

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const dias = (n: number | null) => n == null ? "—" : n < 1 ? "menos de 1 dia" : n >= 99 ? "99+ dias" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${n === 1 ? "dia" : "dias"}`
const tomDias = (n: number | null, limite: number) => n == null ? "neutro" : n < 1 ? "perigo" : n < limite ? "alerta" : "sucesso"
const rotuloDia = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)

export default function GastosView() {
  const [g, setG] = useState<Resposta | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [saldoIa, setSaldoIa] = useState("")
  const [salvo, setSalvo] = useState(false)

  const carregar = useCallback(async (atualizar = false) => {
    setCarregando(true); setErro(null)
    try {
      const r = await fetch(`/api/gastos${atualizar ? "?atualizar=1" : ""}`)
      const j = await r.json() as Resposta
      if (!r.ok) throw new Error(j.erro ?? `erro ${r.status}`)
      setG(j)
    } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }, [])
  useEffect(() => {
    let vivo = true
    fetch("/api/gastos").then(async r => { const j = await r.json() as Resposta; if (!vivo) return; if (r.ok) setG(j); else setErro(j.erro ?? `erro ${r.status}`) })
      .catch(e => { if (vivo) setErro(String(e)) })
    return () => { vivo = false }
  }, [])

  const post = async (corpo: Record<string, unknown>) => {
    const r = await fetch("/api/gastos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
    if (r.ok) { setG(await r.json()); setSalvo(true); setTimeout(() => setSalvo(false), 1800) }
  }
  const salvarSaldo = () => {
    const v = Number(saldoIa.replace(/[^\d,.]/g, "").replace(",", "."))
    if (!(v >= 0)) return
    void post({ recargaIA: v }); setSaldoIa("")
  }

  if (!g) return (
    <Pagina>
      <CabecalhoPagina titulo="Gastos" sub="IA, anúncios e quanto o braço digital paga" />
      {erro ? <Vazio icone={<AlertTriangle className="w-5 h-5" />} titulo="Não deu para carregar" sub={erro} /> : <Cartao><p className="text-[12.5px] text-[#898892]">Carregando…</p></Cartao>}
    </Pagina>
  )

  const { ia, meta, digital } = g
  return (
    <Pagina>
      <CabecalhoPagina titulo="Gastos" sub="IA, anúncios e quanto o braço digital paga"
        acoes={<Botao icone={<RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} />} onClick={() => void carregar(true)} disabled={carregando}>Atualizar</Botao>} />

      {g.alertas.length > 0 && (
        <div className="space-y-2 mb-4">
          {g.alertas.map((a, i) => (
            <div key={i} className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[12.5px] ${a.nivel === "perigo" ? "bg-[#d33a3c]/8 text-[#b42d2f]" : "bg-[#c57800]/8 text-[#9a5e00]"}`}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
              <span className="leading-snug">{a.texto}</span>
            </div>
          ))}
        </div>
      )}

      <GradeKpis>
        <Kpi rotulo="Gasto por dia" valor={g.totalDia} formato={brl} icone={<Wallet className="w-3.5 h-3.5" />} sub="IA + anúncios" destaque />
        {ia.autoRecarga
          ? <Kpi rotulo="IA · por dia" valor={ia.media} formato={brl} tom={ia.semCredito ? "perigo" : "neutro"} icone={<Bot className="w-3.5 h-3.5" />}
              sub={ia.semCredito ? "Anthropic recusou: veja o cartão" : "recarga automática ligada"} />
          : <Kpi rotulo="IA · saldo" valor={ia.restante} formato={brl} tom={tomDias(ia.diasRestantes, g.alertaDias)} icone={<Bot className="w-3.5 h-3.5" />}
              sub={ia.restante == null ? "informe o saldo abaixo" : `dá para ${dias(ia.diasRestantes)}`} />}
        <Kpi rotulo="Anúncios · saldo" valor={meta?.restante ?? null} formato={brl} tom={tomDias(meta?.diasRestantes ?? null, g.alertaDias)} icone={<Megaphone className="w-3.5 h-3.5" />}
          sub={!meta ? "Meta não conectada" : meta.restante == null ? "sem saldo informado pela Meta" : `dá para ${dias(meta.diasRestantes)}`} />
        <Kpi rotulo="Digital cobre" valor={digital.cobertura} formato={n => `${n}%`} tom={digital.cobertura == null ? "neutro" : digital.cobertura >= 100 ? "sucesso" : "alerta"} icone={<Printer className="w-3.5 h-3.5" />}
          sub={`${digital.pedidosPagos} ${digital.pedidosPagos === 1 ? "pedido pago" : "pedidos pagos"} em 30 dias`} />
      </GradeKpis>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
        <Cartao className="min-w-0">
          <TituloCartao titulo="IA (tokens da Anthropic)" icone={<Bot className="w-4 h-4" />}
            sub={`Custo real de cada resposta · dólar a ${ia.cotacao.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            acao={ia.semCredito ? <Selo tom="perigo">Sem crédito</Selo> : undefined} />
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Mini rotulo="Hoje" valor={brl(ia.hoje)} />
            <Mini rotulo="Ontem" valor={brl(ia.ontem)} />
            <Mini rotulo="Média/dia" valor={brl(ia.media)} />
          </div>
          <Serie serie={ia.serie} />
          <div className="mt-4 pt-4 border-t border-[rgba(116,116,128,0.12)]">
            <label className="flex items-start gap-2.5 cursor-pointer select-none mb-2">
              <input type="checkbox" checked={ia.autoRecarga} onChange={e => void post({ autoRecargaIA: e.target.checked })} className="mt-0.5 accent-[#8456e8]" />
              <span className="text-[12px] text-[#5e5c68] leading-snug">
                <b className="text-[#191625]">Recarga automática ligada na Anthropic.</b> O saldo não precisa ser digitado: o sistema mostra o gasto e só avisa se ela recusar por falta de crédito (cartão recusado, limite).
              </span>
            </label>
            {!ia.autoRecarga && <>
            <p className="text-[11.5px] text-[#898892] mb-2 leading-snug">
              A Anthropic não informa o saldo pela API. Quando recarregar, digite aqui o saldo que aparece no painel dela; o sistema desconta o gasto daí em diante.
              {ia.recarga && <> Último: <b className="text-[#5e5c68]">US$ {ia.recarga.valor.toLocaleString("pt-BR")}</b> em {new Date(ia.recarga.em).toLocaleDateString("pt-BR")}.</>}
            </p>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0 flex items-center h-9 rounded-lg border border-[rgba(116,116,128,0.2)] px-2.5 focus-within:border-[#8456e8]">
                <span className="text-[12px] text-[#898892] mr-1.5">US$</span>
                <input value={saldoIa} onChange={e => setSaldoIa(e.target.value)} onKeyDown={e => e.key === "Enter" && salvarSaldo()} inputMode="decimal" placeholder="saldo atual"
                  className="flex-1 min-w-0 bg-transparent outline-none text-[13px] ds-num" />
              </div>
              <Botao variante="primario" onClick={salvarSaldo} disabled={!saldoIa.trim()} icone={salvo ? <Check className="w-3.5 h-3.5" /> : undefined}>Salvar</Botao>
            </div>
            </>}
            <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-2 text-[11.5px] text-[#8456e8] hover:underline">
              Abrir o painel da Anthropic <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </Cartao>

        <Cartao className="min-w-0">
          <TituloCartao titulo="Anúncios da Meta" icone={<Megaphone className="w-4 h-4" />}
            sub={meta?.em ? `Saldo e gasto lidos da conta · ${new Date(meta.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Conecte a Meta em Configurações"}
            acao={meta?.erro ? <Selo tom="alerta">Erro na leitura</Selo> : undefined} />
          {meta ? <>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <Mini rotulo="Hoje" valor={brl(meta.hoje)} />
              <Mini rotulo="Ontem" valor={brl(meta.ontem)} />
              <Mini rotulo="Média/dia" valor={brl(meta.media)} />
            </div>
            <Serie serie={meta.serie} />
            {meta.erro && <p className="text-[11.5px] text-[#9a5e00] mt-3">{meta.erro}</p>}
            <a href="https://business.facebook.com/billing_hub/payment_settings" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-4 text-[11.5px] text-[#8456e8] hover:underline">
              Adicionar saldo na Meta <ExternalLink className="w-3 h-3" />
            </a>
          </> : <p className="text-[12.5px] text-[#898892]">Sem a conta de anúncios conectada.</p>}
        </Cartao>
      </div>

      <Cartao className="mt-3">
        <TituloCartao titulo="O braço digital paga a operação?" icone={<Printer className="w-4 h-4" />}
          sub="Margem dos pedidos digitais com sinal pago nos últimos 30 dias, contra IA + anúncios do mesmo período" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Mini rotulo="Margem (30 dias)" valor={brl(digital.margem)} />
          <Mini rotulo="Gasto (30 dias)" valor={brl(digital.gasto30)} />
          <Mini rotulo="Faturado (30 dias)" valor={brl(digital.faturado)} />
          <Mini rotulo="Pedidos por dia" valor={digital.porDiaFalta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} />
        </div>
        <p className="text-[11.5px] text-[#898892] mt-3 leading-snug">
          Com o gasto de {brl(g.totalDia)} por dia, {digital.porDiaFalta <= 1 ? "1 pedido digital pago por dia cobre" : `${digital.porDiaFalta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pedidos digitais pagos por dia cobrem`} IA e anúncios.
        </p>
      </Cartao>

      <Cartao className="mt-3">
        <TituloCartao titulo="Aviso no WhatsApp" sub="Você recebe quando o saldo da IA ou dos anúncios estiver para acabar" />
        <div className="flex items-center gap-2 text-[12.5px] text-[#5e5c68] flex-wrap">
          <span>Avisar com</span>
          {[2, 3, 5, 7].map(n => (
            <button key={n} onClick={() => void post({ alertaDias: n })}
              className={`h-8 px-3 rounded-lg text-[12px] font-medium transition-colors ${g.alertaDias === n ? "bg-[#8456e8] text-white" : "bg-[rgba(116,116,128,0.08)] hover:bg-[rgba(116,116,128,0.14)]"}`}>
              {n} dias
            </button>
          ))}
          <span>de saldo</span>
        </div>
      </Cartao>
    </Pagina>
  )
}

// 14 dias na tela grande, 7 no celular (cabe sem rolar de lado)
function Serie({ serie }: { serie: { dia: string; valor: number }[] }) {
  const itens = (s: typeof serie) => s.map(x => ({ rotulo: rotuloDia(x.dia), valor: x.valor, chave: x.dia }))
  return <>
    <div className="hidden sm:block"><Colunas itens={itens(serie)} formato={brl} altura={90} /></div>
    <div className="sm:hidden"><Colunas itens={itens(serie.slice(-7))} formato={brl} altura={80} /></div>
  </>
}

function Mini({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-[rgba(116,116,128,0.06)] px-2.5 sm:px-3 py-2.5 min-w-0">
      <p className="text-[10.5px] text-[#898892] truncate">{rotulo}</p>
      <p className="text-[12.5px] sm:text-[14px] font-semibold text-[#191625] ds-num truncate mt-0.5">{valor}</p>
    </div>
  )
}
