"use client"

// Configurações → Agente de leads: o filtro (quem é ICP e como responder), o modo automático
// (liga na hora), a simulação nos leads que estão esperando e o registro do que ele fez sozinho.

import { useEffect, useState } from "react"
import { Bot, Clock, Loader2, Play, Power, Tag, Sparkles, X } from "lucide-react"
import { Cartao, TituloCartao, Botao, Selo, Tom, Segmentado } from "./ds"
import { AgenteAuto, RegistroAgente, PerfilLead, ROTULO_PERFIL, FILTRO_PADRAO, VITRINE_PADRAO, ROTULO_TEMA, HorarioAgente, HORARIO_PADRAO, dentroDoHorario } from "../lib/agenteLeads"

type Simulacao = { jid: string; nome: string | null; ultima: string; perfil: PerfilLead; quantidade: number | null; motivo: string; resposta: string; enviaria: boolean; trava: string | null }

const TOM_PERFIL: Record<PerfilLead, Tom> = { icp: "sucesso", medio: "acento", oportunidade: "info", pequeno: "neutro", indefinido: "neutro", nao_lead: "alerta" }
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

export default function AgenteLeadsCard({ filtro, onFiltro }: { filtro?: string; onFiltro: (t: string) => void }) {
  const [auto, setAuto] = useState<AgenteAuto | null>(null)
  const [log, setLog] = useState<RegistroAgente[]>([])
  const [taxas, setTaxas] = useState<{ passo: string; enviados: number; responderam: number }[]>([])
  const [sim, setSim] = useState<Simulacao[] | null>(null)
  const [simulando, setSimulando] = useState(false)
  const [mudando, setMudando] = useState(false)
  const [vitrine, setVitrine] = useState<string | null>(null)
  const [vitrineSalva, setVitrineSalva] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [conhecimento, setConhecimento] = useState<{ id: string; tema: string; texto: string; em: string }[]>([])
  const [aprendeuEm, setAprendeuEm] = useState<string | null>(null)
  const [aprendendo, setAprendendo] = useState<string | null>(null)
  const [wa, setWa] = useState<{ rodando: boolean; feitas: number; total: number; msg?: string } | null>(null)

  useEffect(() => {
    fetch("/api/whatsapp/agente").then(r => r.json()).then(d => { setAuto(d.auto); setLog(d.log ?? []); setTaxas(d.taxas ?? []); setConhecimento(d.conhecimento ?? []); setAprendeuEm(d.aprendeuEm ?? null) }).catch(() => {})
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

  async function salvarVitrine() {
    const d = await fetch("/api/whatsapp/agente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vitrine: vitrine ?? "" }) }).then(r => r.json()).catch(() => null)
    if (d?.auto) { setAuto(d.auto); setVitrine(null); setVitrineSalva(true); setTimeout(() => setVitrineSalva(false), 2000) }
  }

  const post = (corpo: Record<string, unknown>) => fetch("/api/whatsapp/agente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).then(r => r.json()).catch(() => null)
  async function modoPequeno(parceiro: boolean) {
    if (!auto) return
    setAuto({ ...auto, pequenoParceiro: parceiro })
    const d = await post({ pequenoParceiro: parceiro })
    if (d?.auto) setAuto(d.auto)
  }
  async function salvarAviso() {
    const d = await post({ avisoNumero: aviso ?? "" })
    if (d?.auto) { setAuto(d.auto); setAviso(null) }
  }
  async function aprenderAgora() {
    setAprendendo("Lendo as suas conversas dos últimos 3 dias…")
    const d = await post({ aprender: 3 })
    if (d?.conhecimento) setConhecimento(d.conhecimento)
    setAprendendo(d ? (d.erro ?? `Leu ${d.conversas} conversas e aprendeu ${d.novos} coisas novas.`) : "Sem conexão.")
  }
  const [ensinar, setEnsinar] = useState("")
  async function ensinarAgora() {
    if (!ensinar.trim()) return
    const d = await post({ ensinar: { texto: ensinar } })
    if (d?.conhecimento) { setConhecimento(d.conhecimento); setEnsinar("") }
  }
  async function tirar(id: string) {
    const d = await post({ tirarConhecimento: id })
    if (d?.conhecimento) setConhecimento(d.conhecimento)
  }

  async function etiquetasParaWhatsapp() {
    setWa({ rodando: true, feitas: 0, total: 0 })
    let feitas = 0
    for (let p = 0; p < 50; p++) {
      const d = await fetch("/api/whatsapp/agente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ etiquetasWhatsapp: p }) }).then(r => r.json()).catch(() => null)
      if (!d || d.erro) return setWa({ rodando: false, feitas, total: d?.total ?? 0, msg: d?.erro ?? "Sem conexão." })
      feitas += d.feitas
      const falta = d.faltando?.length ? ` Faltam no app: ${d.faltando.join(", ")}.` : ""
      setWa({ rodando: d.mais, feitas, total: d.total, msg: d.mais ? undefined : `Pronto: ${feitas} conversas etiquetadas no WhatsApp.${falta}` })
      if (!d.mais) return
    }
  }

  const ligado = !!auto?.ligado
  const textoVitrine = vitrine ?? auto?.vitrine ?? VITRINE_PADRAO
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
              ? "Responde sozinho só contato novo (até 4 dias), responde no ritmo de gente (40 s a 1 min depois da última mensagem, variando), lê, fica “digitando…” e segura tudo que é decisão sua."
              : "Desligado, ele só sugere a resposta na conversa. Ligado, responde sozinho os leads novos e organiza o funil."}
          </p>
        </div>
        <Botao variante={ligado ? "secundario" : "primario"} disabled={!auto || mudando} onClick={alternar}
          icone={mudando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}>{ligado ? "Desligar" : "Ligar"}</Botao>
      </div>

      <HorarioDoAgente auto={auto} onSalvo={setAuto} />

      {/* Como ele organiza */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4 text-[11.5px]">
        <div className="rounded-lg ds-borda px-3 py-2"><p className="font-semibold text-[#009351]">Lead bom → MQL</p><p className="text-[#5e5c68]">1.000+ caixas, ou frasco, essência, válvula e envase em volume (Oportunidade). Etiqueta MQL e vai para a coluna MQL do funil. Assim que vê que é bom negócio ele para de responder: é você, sem o contato perceber a troca.</p></div>
        {auto?.pequenoParceiro === false
          ? <div className="rounded-lg ds-borda px-3 py-2"><p className="font-semibold text-[#c2410c]">Lead pequeno → Digital</p><p className="text-[#5e5c68]">Menos de 1.000 caixas. Ele atende em impressão digital: levanta ml, medidas, quantidade e arte, sem passar preço, e te passa para orçar. Etiqueta Digital; não vai para Descartado.</p></div>
          : <div className="rounded-lg ds-borda px-3 py-2"><p className="font-semibold text-[#5e5c68]">Lead ruim → Descartado</p><p className="text-[#5e5c68]">Menos de 1.000 caixas e nada mais. Uma mensagem orientando, indicando o parceiro e oferecendo frasco/essência; etiqueta Descartado e sai da sua lista de responder.</p></div>}
        <div className="rounded-lg ds-borda px-3 py-2"><p className="font-semibold text-[#c57800]">Sem resposta → F1, F2, F3</p><p className="text-[#5e5c68]">F1 após 3 h, F2 após 1 dia, F3 após 3 dias (8h–20h). 4 dias depois do F3: Sem resposta, vai para Perdido. No MQL só etiqueta, quem cobra é você.</p></div>
      </div>
      <div className="flex items-start gap-3 mb-4">
        <p className="text-[11px] text-[#898892] flex-1">No seu WhatsApp Business: crie no app as etiquetas com estes nomes exatos (MQL, Descartado, Digital, F1, F2, F3, Sem resposta, ICP, Lead médio, Oportunidade, Lead pequeno) e ele marca lá também. Depois de criar, mande as que já existem no sistema:</p>
        <Botao onClick={etiquetasParaWhatsapp} disabled={!!wa?.rodando} icone={wa?.rodando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Tag className="w-3.5 h-3.5" />}>
          {wa?.rodando ? `${wa.feitas}${wa.total ? ` de ${wa.total}` : ""}…` : "Etiquetar no WhatsApp"}
        </Botao>
      </div>
      {wa?.msg && <p className="text-[11.5px] text-[#5e5c68] -mt-2 mb-4">{wa.msg}</p>}

      {/* Lead pequeno: indicar o parceiro ou vender em digital */}
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#898892] mb-1.5">Lead pequeno (menos de 1.000)</p>
      <div className="flex items-center gap-3 flex-wrap mb-1.5">
        <Segmentado valor={auto?.pequenoParceiro === false ? "digital" : "parceiro"} onChange={v => modoPequeno(v === "parceiro")}
          opcoes={[{ v: "parceiro", nome: "Indicar o parceiro" }, { v: "digital", nome: "Eu vendo em digital" }]} />
      </div>
      <p className="text-[11px] text-[#898892] mb-4">{auto?.pequenoParceiro === false
        ? "Ele não passa o contato do parceiro: segue a conversa, levanta os dados e para no preço (o orçamento é seu). A conversa ganha a etiqueta Digital e aparece no Hoje, separada dos bons negócios."
        : "Uma mensagem só: indica o parceiro de impressão digital com o seu cupom, oferece frasco/essência e encerra (Descartado)."}</p>

      {/* Vitrine */}
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#898892] mb-1.5">Instagram para todo lead</p>
      <div className="flex gap-2 mb-1.5">
        <input value={textoVitrine} onChange={e => setVitrine(e.target.value)}
          className="flex-1 h-9 rounded-lg px-3 text-[12.5px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] ds-borda" />
        <Botao disabled={vitrine == null || !auto} onClick={salvarVitrine}>{vitrineSalva ? "Salvo" : "Salvar"}</Botao>
      </div>
      <p className="text-[11px] text-[#898892] mb-4">Vai como segunda mensagem, logo depois da primeira resposta, uma vez por lead. Bom negócio (que é seu) recebe só ela. Se o link já foi na conversa, não repete. Deixe vazio para não mandar.</p>

      {/* Aviso de MQL */}
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#898892] mb-1.5">Aviso de lead bom no seu WhatsApp</p>
      <div className="flex gap-2 mb-1.5">
        <input value={aviso ?? auto?.avisoNumero ?? ""} onChange={e => setAviso(e.target.value)} placeholder="Vazio: vai no seu chat “Você” · ou outro número, ex.: 5511999990000"
          className="flex-1 h-9 rounded-lg px-3 text-[12.5px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] ds-borda" />
        <Botao disabled={aviso == null || !auto} onClick={salvarAviso}>Salvar</Botao>
      </div>
      <p className="text-[11px] text-[#898892] mb-4">Quando um lead vira MQL: chega um resumo com o link da conversa, a conversa fica não lida no seu celular e ganha a etiqueta MQL. Mensagem para você mesmo não toca notificação; para tocar, use outro número (um segundo chip, por exemplo).</p>

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

      {/* O que ele aprendeu do negócio */}
      <div className="mt-4">
        <div className="flex items-center gap-2 mb-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#898892] flex-1">O que ele aprendeu com você ({conhecimento.length})</p>
          <Botao onClick={aprenderAgora} disabled={!!aprendendo && aprendendo.endsWith("…")} icone={aprendendo?.endsWith("…") ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}>Aprender agora</Botao>
        </div>
        <p className="text-[11px] text-[#898892] mb-2">Toda noite ele lê as conversas em que você atendeu (os seus áudios transcritos, MQLs primeiro) e guarda o que vale para o negócio. Apague o que estiver errado.{aprendeuEm ? ` Última vez: ${hora(aprendeuEm)}.` : ""}</p>
        {aprendendo && <p className="text-[11.5px] text-[#5e5c68] mb-2">{aprendendo}</p>}
        <div className="flex gap-2 mb-2">
          <input value={ensinar} onChange={e => setEnsinar(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void ensinarAgora() }} maxLength={400}
            placeholder="Ensinar uma regra: ex.: cigarro não trabalhamos"
            className="flex-1 h-9 rounded-lg px-3 text-[12.5px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] ds-borda" />
          <Botao disabled={!ensinar.trim()} onClick={() => void ensinarAgora()}>Ensinar</Botao>
        </div>
        <div className="space-y-1 max-h-[280px] overflow-y-auto">
          {[...conhecimento].reverse().map(i => (
            <div key={i.id} className="flex items-start gap-2 text-[12px] group">
              <span className="shrink-0 mt-px"><Selo>{ROTULO_TEMA[i.tema] ?? i.tema}</Selo></span>
              <span className="flex-1 text-[#191625]">{i.texto}</span>
              <button onClick={() => tirar(i.id)} className="text-[#898892] hover:text-[#d33a3c] opacity-0 group-hover:opacity-100" aria-label="Apagar"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Taxa de resposta */}
      {!!taxas.length && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#898892] mb-1.5">Taxa de resposta</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {taxas.map(t => (
              <div key={t.passo} className="rounded-lg ds-borda px-3 py-2">
                <p className="text-[11px] text-[#898892]">{t.passo === "Resposta" ? "1ª resposta" : t.passo}</p>
                <p className="text-[16px] font-semibold text-[#191625] tabular-nums">{Math.round(t.responderam / t.enviados * 100)}%</p>
                <p className="text-[10.5px] text-[#898892]">{t.responderam} de {t.enviados} responderam</p>
              </div>
            ))}
          </div>
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
                <Selo tom={l.enviou ? "sucesso" : "neutro"}>{l.passo ? `${l.passo} · ` : ""}{l.enviou ? "Enviou" : "Segurou"}</Selo>
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

// Quando o agente trabalha: dias da semana e faixa de horas (São Paulo). Padrão: todos os dias, 24 h.
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
function HorarioDoAgente({ auto, onSalvo }: { auto: AgenteAuto | null; onSalvo: (a: AgenteAuto) => void }) {
  const salvo = auto?.horario ?? HORARIO_PADRAO
  const [h, setH] = useState<HorarioAgente | null>(null)
  const [salvando, setSalvando] = useState(false)
  const atual = h ?? salvo
  const diaTodo = atual.inicio === "00:00" && atual.fim === "24:00"
  const mudou = !!h && JSON.stringify(h) !== JSON.stringify(salvo)
  const dentro = dentroDoHorario(auto?.horario)
  const mudar = (p: Partial<HorarioAgente>) => setH({ ...atual, ...p })
  async function salvar() {
    if (!h) return
    setSalvando(true)
    const d = await fetch("/api/whatsapp/agente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ horario: h }) }).then(r => r.json()).catch(() => null)
    if (d?.auto) { onSalvo(d.auto); setH(null) }
    setSalvando(false)
  }
  const campo = "h-8 rounded-lg px-2 text-[12px] ds-num text-[#191625] bg-white ds-borda focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20"
  return (
    <div className="rounded-xl ds-borda px-4 py-3 mb-4 space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Clock className="w-4 h-4 text-[#5e5c68]" />
        <p className="text-[13px] font-semibold text-[#191625] flex-1">Horário de trabalho</p>
        {auto?.ligado && <Selo tom={dentro ? "sucesso" : "neutro"}>{dentro ? "Trabalhando agora" : "Fora do horário agora"}</Selo>}
      </div>
      <p className="text-[11.5px] text-[#5e5c68]">Fora do horário ele não responde, não manda follow-up nem retoma. Quando o horário abre, responde quem ficou esperando, um de cada vez.</p>
      <div className="flex flex-wrap gap-1.5">
        {DIAS.map((n, i) => {
          const on = atual.dias.includes(i)
          return (
            <button key={n} onClick={() => mudar({ dias: on ? atual.dias.filter(d => d !== i) : [...atual.dias, i].sort() })}
              className={`h-8 min-w-[44px] px-2.5 rounded-lg text-[12px] font-semibold transition-colors ${on ? "bg-[#191625] text-white" : "bg-white text-[#898892] ds-borda"}`}>{n}</button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#5e5c68]">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={diaTodo} onChange={e => mudar(e.target.checked ? { inicio: "00:00", fim: "24:00" } : { inicio: "08:00", fim: "20:00" })} />
          24 horas
        </label>
        {!diaTodo && (
          <>
            <span>das</span>
            <input type="time" value={atual.inicio} onChange={e => mudar({ inicio: e.target.value || "00:00" })} className={campo} />
            <span>às</span>
            <input type="time" value={atual.fim === "24:00" ? "23:59" : atual.fim} onChange={e => mudar({ fim: e.target.value || "24:00" })} className={campo} />
          </>
        )}
        {!atual.dias.length && <span className="text-[#d33a3c]">Nenhum dia marcado: ele não trabalha.</span>}
        {mudou && (
          <Botao variante="primario" disabled={salvando} onClick={salvar}
            icone={salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}>Salvar horário</Botao>
        )}
      </div>
    </div>
  )
}
