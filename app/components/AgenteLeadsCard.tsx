"use client"

// Configurações → Agente de leads: o filtro (quem é ICP e como responder), o modo automático
// (liga na hora), a simulação nos leads que estão esperando e o registro do que ele fez sozinho.

import { useEffect, useState } from "react"
import { Bot, Loader2, Play, Power } from "lucide-react"
import { Cartao, TituloCartao, Botao, Selo, Tom } from "./ds"
import { AgenteAuto, RegistroAgente, PerfilLead, ROTULO_PERFIL, FILTRO_PADRAO } from "../lib/agenteLeads"

type Simulacao = { jid: string; nome: string | null; ultima: string; perfil: PerfilLead; quantidade: number | null; motivo: string; resposta: string; enviaria: boolean; trava: string | null }

const TOM_PERFIL: Record<PerfilLead, Tom> = { icp: "sucesso", medio: "acento", pequeno: "neutro", indefinido: "info", nao_lead: "alerta" }
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

export default function AgenteLeadsCard({ filtro, onFiltro }: { filtro?: string; onFiltro: (t: string) => void }) {
  const [auto, setAuto] = useState<AgenteAuto | null>(null)
  const [log, setLog] = useState<RegistroAgente[]>([])
  const [sim, setSim] = useState<Simulacao[] | null>(null)
  const [simulando, setSimulando] = useState(false)
  const [mudando, setMudando] = useState(false)

  useEffect(() => {
    fetch("/api/whatsapp/agente").then(r => r.json()).then(d => { setAuto(d.auto); setLog(d.log ?? []) }).catch(() => {})
  }, [])

  async function alternar() {
    if (!auto) return
    setMudando(true)
    const d = await fetch("/api/whatsapp/agente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ligado: !auto.ligado }) }).then(r => r.json()).catch(() => null)
    if (d?.auto) setAuto(d.auto)
    setMudando(false)
  }

  async function simular() {
    setSimulando(true); setSim(null)
    const d = await fetch("/api/whatsapp/agente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ simular: true }) }).then(r => r.json()).catch(() => null)
    setSim(d?.simulacao ?? [])
    setSimulando(false)
  }

  const ligado = !!auto?.ligado
  const texto = filtro ?? FILTRO_PADRAO
  const semContato = /\(preencha aqui/i.test(texto)

  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Agente de leads" icone={<Bot className="w-4 h-4" />}
        sub="Filtra quem chega do anúncio como você faria. O que vale para ele está no filtro abaixo; o guia de atendimento continua valendo para o tom." />

      {/* Modo automático */}
      <div className={`rounded-xl px-4 py-3 flex items-center gap-3 mb-4 ${ligado ? "bg-[rgba(0,147,81,0.08)]" : "bg-[rgba(116,116,128,0.07)]"}`}>
        <Power className={`w-4 h-4 shrink-0 ${ligado ? "text-[#009351]" : "text-[#898892]"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#191625]">Modo automático {ligado ? "ligado" : "desligado"}</p>
          <p className="text-[11.5px] text-[#5e5c68]">
            {ligado
              ? "Responde sozinho só contato novo (até 4 dias), espera 20 s o lead terminar de digitar e segura tudo que é decisão sua."
              : "Desligado, ele só sugere a resposta na conversa. Ligado, responde sozinho os leads novos."}
          </p>
        </div>
        <Botao variante={ligado ? "secundario" : "primario"} disabled={!auto || mudando} onClick={alternar}
          icone={mudando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}>{ligado ? "Desligar" : "Ligar"}</Botao>
      </div>

      {/* Filtro */}
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#898892] mb-1.5">Filtro de leads</p>
      {semContato && (
        <p className="text-[11.5px] text-[#b26a00] mb-1.5">Preencha o contato do parceiro de impressão digital: sem ele, os leads pequenos ficam esperando você em vez de saírem orientados.</p>
      )}
      <textarea value={texto} onChange={e => onFiltro(e.target.value)} rows={16}
        className="w-full rounded-lg px-3 py-2.5 text-[12.5px] leading-relaxed font-mono text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] ds-borda resize-y" />
      <p className="text-[11px] text-[#898892] mt-1.5">Tirado das suas conversas de 04/11. Só os valores em R$ escritos aqui podem sair numa resposta automática. Salva com o botão Salvar da página.</p>

      {/* Simulação */}
      <div className="mt-4 flex items-center gap-2">
        <Botao onClick={simular} disabled={simulando} icone={simulando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}>
          {simulando ? "Lendo as conversas…" : "Simular nos leads esperando resposta"}
        </Botao>
        <span className="text-[11px] text-[#898892]">Não envia nada: mostra o que ele mandaria (usa o filtro salvo).</span>
      </div>
      {sim && (
        <div className="mt-3 space-y-2">
          {!sim.length && <p className="text-[12px] text-[#898892]">Nenhum lead esperando resposta agora.</p>}
          {sim.map(s => (
            <div key={s.jid} className="rounded-xl ds-borda px-3.5 py-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12.5px] font-semibold text-[#191625]">{s.nome ?? s.jid.split("@")[0]}</span>
                <Selo tom={TOM_PERFIL[s.perfil]}>{ROTULO_PERFIL[s.perfil]}{s.quantidade ? ` · ${s.quantidade.toLocaleString("pt-BR")} un` : ""}</Selo>
                <Selo tom={s.enviaria ? "sucesso" : "alerta"}>{s.enviaria ? "Enviaria sozinho" : `Seguraria: ${s.trava}`}</Selo>
              </div>
              <p className="text-[11.5px] text-[#898892] mt-1 truncate">Lead: {s.ultima}</p>
              {s.resposta && <p className="text-[12px] text-[#191625] mt-1 whitespace-pre-wrap">{s.resposta}</p>}
              <p className="text-[11px] text-[#5e5c68] mt-1">{s.motivo}</p>
            </div>
          ))}
        </div>
      )}

      {/* Registro */}
      {!!log.length && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#898892] mb-1.5">O que ele fez sozinho</p>
          <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
            {log.map(l => (
              <div key={l.em + l.jid} className="text-[11.5px] flex items-start gap-2">
                <span className="text-[#898892] shrink-0 w-[78px]">{hora(l.em)}</span>
                <Selo tom={l.enviou ? "sucesso" : "neutro"}>{l.enviou ? "Enviou" : "Segurou"}</Selo>
                <span className="min-w-0">
                  <span className="font-semibold text-[#191625]">{l.nome ?? l.jid.split("@")[0]}</span>
                  <span className="text-[#898892]"> · {ROTULO_PERFIL[l.perfil]} · {l.motivo}</span>
                  {l.texto && <span className="block text-[#5e5c68] truncate">{l.texto}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Cartao>
  )
}
