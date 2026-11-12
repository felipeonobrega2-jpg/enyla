"use client"

// Painel Digital → Campanha digital: leads pequenos que nunca receberam a oferta do digital. Liga/desliga, quantos por
// dia, a fila (com "pular") e o placar (enviados → responderam → orçamento → pagaram).

import { useEffect, useState } from "react"
import { Rocket, Power, SkipForward } from "lucide-react"
import { Cartao, TituloCartao, Botao, Selo } from "./ds"

type Painel = {
  ligada: boolean; porDia: number; hoje: number; proximaEm: string | null; agenteLigado: boolean
  fila: { jid: string; nome: string | null; motivo: string; cotavel: boolean; ultima: string | null }[]
  naFila: number; cotaveis: number
  placar: { enviados: number; responderam: number; comOrcamento: number; pagaram: number; faturado: number }
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const haDias = (iso: string | null) => { if (!iso) return ""; const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000); return d < 1 ? "hoje" : `há ${d} d` }

function Numero({ rotulo, valor }: { rotulo: string; valor: string | number }) {
  return (
    <div className="flex-1 min-w-[90px] rounded-xl px-3 py-2 bg-[rgba(116,116,128,0.06)]">
      <p className="text-[10.5px] font-medium text-[#898892] truncate">{rotulo}</p>
      <p className="text-[17px] font-semibold ds-num leading-tight text-[#191625]">{valor}</p>
    </div>
  )
}

export function CampanhaDigitalCard({ inicial }: { inicial?: Painel }) {
  const [p, setP] = useState<Painel | null>(inicial ?? null)
  const [ocupado, setOcupado] = useState(false)
  const [verTodos, setVerTodos] = useState(false)
  useEffect(() => { if (!inicial) fetch("/api/campanha-digital").then(r => r.json()).then(setP).catch(() => null) }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const mudar = async (corpo: Record<string, unknown>) => {
    setOcupado(true)
    const r = await fetch("/api/campanha-digital", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).then(r => r.json()).catch(() => null)
    if (r) setP(r); setOcupado(false)
  }
  if (!p) return null
  const dias = p.porDia > 0 ? Math.ceil(p.naFila / p.porDia) : 0
  const fila = verTodos ? p.fila : p.fila.slice(0, 8)

  return (
    <Cartao>
      <TituloCartao icone={<Rocket size={16} />} titulo="Campanha digital"
        sub={`Leads pequenos que chegaram antes do digital (ou nunca receberam a oferta): uma mensagem cada. Com quantidade e tamanho, vai o orçamento pronto com o link; sem, a pergunta do que falta. Quem responde, o agente atende até o pagamento. Um de cada vez, a cada 20–40 min, seg a sáb das 9h às 19h.`}
        acao={<Botao variante={p.ligada ? "secundario" : "primario"} icone={<Power size={14} />} disabled={ocupado} onClick={() => void mudar({ ligada: !p.ligada })}>{p.ligada ? "Pausar" : "Ligar campanha"}</Botao>} />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {p.ligada ? <Selo tom="sucesso">Ligada · {p.hoje} de {p.porDia} hoje</Selo> : <Selo tom="neutro">Desligada</Selo>}
        {!p.agenteLigado && <Selo tom="alerta">O agente está desligado: a campanha só envia com ele ligado</Selo>}
        <span className="text-[12px] text-[#5e5c68] flex items-center gap-1.5">Por dia:
          {[5, 10, 15, 20].map(n => (
            <button key={n} onClick={() => void mudar({ porDia: n })} disabled={ocupado}
              className={`h-7 px-2.5 rounded-lg text-[12px] font-medium ${p.porDia === n ? "bg-[#8456e8] text-white" : "bg-[rgba(116,116,128,0.08)] hover:bg-[rgba(116,116,128,0.14)]"}`}>{n}</button>
          ))}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Numero rotulo="Na fila" valor={p.naFila} />
        <Numero rotulo="Com orçamento pronto" valor={p.cotaveis} />
        <Numero rotulo="Enviados" valor={p.placar.enviados} />
        <Numero rotulo="Responderam" valor={p.placar.responderam} />
        <Numero rotulo="Pagaram" valor={p.placar.pagaram} />
        <Numero rotulo="Faturado" valor={brl(p.placar.faturado)} />
      </div>

      <p className="text-[11px] font-bold uppercase tracking-wider text-[#898892] mb-1">Próximos da fila {p.naFila ? `· uns ${dias} ${dias === 1 ? "dia" : "dias"} para acabar no ritmo atual` : ""}</p>
      {p.fila.length === 0 ? <p className="text-[12.5px] text-[#898892]">Ninguém na fila.</p> : (
        <div>
          {fila.map(c => (
            <div key={c.jid} className="flex items-center gap-2 py-1.5 border-t border-[rgba(60,60,67,0.07)] first:border-t-0">
              <span className="flex-1 min-w-0 truncate text-[12.5px] text-[#191625]">{c.nome || c.jid.split("@")[0]}</span>
              <span className={`shrink-0 text-[11.5px] ${c.cotavel ? "text-[#009351]" : "text-[#898892]"}`}>{c.motivo}</span>
              <span className="shrink-0 w-[52px] text-right text-[11px] text-[#898892]">{haDias(c.ultima)}</span>
              <button onClick={() => void mudar({ pular: c.jid })} disabled={ocupado} title="Não mandar para este contato"
                className="shrink-0 text-[#898892] hover:text-[#191625] p-1"><SkipForward size={14} /></button>
            </div>
          ))}
          {p.fila.length > 8 && <button onClick={() => setVerTodos(v => !v)} className="mt-1 text-[12px] font-semibold text-[#8456e8]">{verTodos ? "Ver menos" : `Ver mais ${p.fila.length - 8}`}</button>}
        </div>
      )}
    </Cartao>
  )
}
