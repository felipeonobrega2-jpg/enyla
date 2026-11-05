"use client"

// Configurações → Reativação: bons negócios parados (MQL, ICP, lead médio, oportunidade). A IA escreve a retomada
// como você; você envia com um clique ou liga o modo sozinho (poucas por dia, espaçadas, em horário comercial).

import { useEffect, useState } from "react"
import { RotateCcw, Loader2, Power, Send, SkipForward, Sparkles } from "lucide-react"
import { Cartao, TituloCartao, Botao, Selo, Segmentado, Tom } from "./ds"
import type { RegistroAgente } from "../lib/agenteLeads"

type Candidato = { jid: string; nome: string | null; motivo: string; paradoDias: number; ultimaMsg: string | null; ultimaDeQuem: "voce" | "cliente" | null }
type Rascunho = { texto: string; trava: string | null; motivo?: string; carregando?: boolean; enviando?: boolean; erro?: string }

const TOM: Record<string, Tom> = { ICP: "sucesso", "Cliente que já comprou": "sucesso", "Orçamento perdido 5 mil+": "acento", Oportunidade: "info", "Orçamento perdido": "alerta", "Lead médio": "acento", MQL: "neutro" }
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
const post = (corpo: Record<string, unknown>) => fetch("/api/whatsapp/reativacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).then(r => r.json()).catch(() => null)

export default function ReativacaoCard() {
  const [d, setD] = useState<{ auto: { ligado: boolean; porDia?: number }; fila: Candidato[]; hoje: number; registro: RegistroAgente[] } | null>(null)
  const [rasc, setRasc] = useState<Record<string, Rascunho>>({})
  const [mudando, setMudando] = useState(false)
  const [mostrar, setMostrar] = useState(12)

  const carregar = () => fetch("/api/whatsapp/reativacao").then(r => r.json()).then(setD).catch(() => {})
  useEffect(() => { carregar() }, [])
  const muda = (jid: string, r: Partial<Rascunho>) => setRasc(p => ({ ...p, [jid]: { ...(p[jid] ?? { texto: "", trava: null }), ...r } }))

  async function preparar(jid: string) {
    muda(jid, { carregando: true, erro: undefined })
    const r = await post({ preparar: jid })
    if (!r?.ok) return muda(jid, { carregando: false, erro: r?.erro ?? "Sem conexão." })
    muda(jid, { carregando: false, texto: r.texto, trava: r.trava, motivo: r.motivo })
  }
  async function enviar(jid: string) {
    muda(jid, { enviando: true, erro: undefined })
    const r = await post({ enviar: jid, texto: rasc[jid]?.texto })
    if (!r?.ok) return muda(jid, { enviando: false, erro: r?.erro ?? "Sem conexão." })
    setRasc(p => { const n = { ...p }; delete n[jid]; return n })
    carregar()
  }
  async function pularContato(jid: string) {
    setD(x => x && { ...x, fila: x.fila.filter(c => c.jid !== jid) })
    await post({ pular: jid })
  }
  async function configurar(corpo: { ligado?: boolean; porDia?: number }) {
    setMudando(true)
    const r = await post(corpo)
    if (r?.auto) setD(x => x && { ...x, auto: r.auto })
    setMudando(false)
  }

  const ligado = !!d?.auto.ligado
  const porDia = d?.auto.porDia ?? 4
  const enviadas = (d?.registro ?? []).filter(l => l.passo === "Reativação" && l.enviou)
  const responderam = (d?.registro ?? []).filter(l => l.passo === "Respondeu").length

  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Reativação" icone={<RotateCcw className="w-4 h-4" />}
        sub="Bons negócios parados há 10 dias ou mais: ICPs, clientes que já compraram (30 dias sem conversa), orçamentos de 1.000+ que não fecharam, oportunidades e leads médios. A IA escreve a retomada no seu tom, lembrando o que a pessoa queria. Quando ela responde, volta para MQL e você recebe o aviso no WhatsApp." />
      {!d ? <p className="text-[12px] text-[#898892]">Carregando…</p> : (<>
        <div className={`rounded-xl px-4 py-3 flex items-center gap-3 mb-3 flex-wrap ${ligado ? "bg-[rgba(0,147,81,0.08)]" : "bg-[rgba(116,116,128,0.07)]"}`}>
          <Power className={`w-4 h-4 shrink-0 ${ligado ? "text-[#009351]" : "text-[#898892]"}`} />
          <div className="flex-1 min-w-[220px]">
            <p className="text-[13px] font-semibold text-[#191625]">Retomar sozinho {ligado ? "ligado" : "desligado"}</p>
            <p className="text-[11.5px] text-[#5e5c68]">
              {ligado
                ? `Até ${porDia} por dia, de segunda a sexta, 9h–12h e 14h–18h, uma de cada vez com 50 min a 2 h entre elas, quem está mais perto do dinheiro primeiro. Hoje: ${d.hoje} de ${porDia}.`
                : "Desligado, você escolhe quem retomar aqui embaixo. Ligado, ele manda poucas por dia, espaçadas, como você faria no expediente."}
            </p>
          </div>
          <Segmentado valor={String(porDia)} opcoes={[{ v: "2", nome: "2/dia" }, { v: "4", nome: "4/dia" }, { v: "6", nome: "6/dia" }]} onChange={v => configurar({ porDia: Number(v) })} />
          <Botao variante={ligado ? "secundario" : "primario"} disabled={mudando} onClick={() => configurar({ ligado: !ligado })}
            icone={mudando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}>{ligado ? "Desligar" : "Ligar"}</Botao>
        </div>

        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Selo tom="acento">{d.fila.length} na fila</Selo>
          <Selo>{enviadas.length} {enviadas.length === 1 ? "retomada enviada" : "retomadas enviadas"}</Selo>
          {enviadas.length > 0 && <Selo tom="sucesso">{responderam} {responderam === 1 ? "respondeu" : "responderam"}</Selo>}
        </div>

        {d.fila.length === 0
          ? <p className="text-[12px] text-[#898892]">Nenhum bom negócio parado agora.</p>
          : <div className="space-y-2">
            {d.fila.slice(0, mostrar).map(c => {
              const r = rasc[c.jid]
              return (
                <div key={c.jid} className="rounded-lg ds-borda px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-[#191625] truncate">{c.nome || c.jid.split("@")[0]}</p>
                      <p className="text-[11.5px] text-[#898892] truncate">
                        parou há {c.paradoDias} dias · {c.ultimaDeQuem === "cliente" ? "a última foi dele" : "a última foi sua"}{c.ultimaMsg ? `: ${c.ultimaMsg}` : ""}
                      </p>
                    </div>
                    <Selo tom={TOM[c.motivo] ?? "neutro"}>{c.motivo}</Selo>
                  </div>
                  {!r?.texto && (
                    <div className="flex items-center gap-2 mt-2">
                      <Botao onClick={() => preparar(c.jid)} disabled={r?.carregando} className="h-8 px-2.5 text-[11.5px]"
                        icone={r?.carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}>{r?.carregando ? "Escrevendo…" : "Preparar mensagem"}</Botao>
                      <Botao onClick={() => pularContato(c.jid)} className="h-8 px-2.5 text-[11.5px]" icone={<SkipForward className="w-3.5 h-3.5" />}>Pular</Botao>
                      {r?.trava && !r.texto && <span className="text-[11.5px] text-[#c57800]">{r.trava}</span>}
                    </div>
                  )}
                  {r?.texto && (
                    <div className="mt-2">
                      <textarea value={r.texto} onChange={e => muda(c.jid, { texto: e.target.value })} rows={3}
                        className="w-full rounded-lg px-2.5 py-2 text-[12.5px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] ds-borda" />
                      {r.trava && <p className="text-[11.5px] text-[#c57800] mt-1">Atenção: {r.trava}</p>}
                      <div className="flex items-center gap-2 mt-1.5">
                        <Botao variante="primario" onClick={() => enviar(c.jid)} disabled={r.enviando || !r.texto.trim()} className="h-8 px-2.5 text-[11.5px]"
                          icone={r.enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}>Enviar</Botao>
                        <Botao onClick={() => preparar(c.jid)} disabled={r.carregando} className="h-8 px-2.5 text-[11.5px]" icone={<Sparkles className="w-3.5 h-3.5" />}>Outra</Botao>
                        <Botao onClick={() => pularContato(c.jid)} className="h-8 px-2.5 text-[11.5px]" icone={<SkipForward className="w-3.5 h-3.5" />}>Pular</Botao>
                      </div>
                    </div>
                  )}
                  {r?.erro && <p className="text-[11.5px] text-[#d33a3c] mt-1">{r.erro}</p>}
                </div>
              )
            })}
            {d.fila.length > mostrar && <Botao onClick={() => setMostrar(m => m + 12)} className="w-full">Ver mais {d.fila.length - mostrar}</Botao>}
          </div>}

        {d.registro.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#898892] mb-1.5">O que aconteceu</p>
            <div className="space-y-1 max-h-[220px] overflow-y-auto">
              {d.registro.map((l, i) => (
                <div key={i} className="text-[11.5px] flex gap-2">
                  <span className="text-[#898892] shrink-0 tabular-nums">{hora(l.em)}</span>
                  <span className="min-w-0"><span className="font-semibold text-[#191625]">{l.nome || l.jid.split("@")[0]}</span>
                    <span className={l.passo === "Respondeu" ? "text-[#009351]" : l.enviou ? "text-[#5e5c68]" : "text-[#c57800]"}> · {l.motivo}</span></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </>)}
    </Cartao>
  )
}
