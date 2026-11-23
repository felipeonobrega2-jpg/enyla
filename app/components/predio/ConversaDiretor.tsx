"use client"
// Conversa 1:1 com um diretor: ele pensa, planeja e manda executar. Cada ação vira um cartão: mensagem a cliente
// (editar, aprovar e enviar, ou descartar), vaga no RH (contratar), ferramenta (aprovar), plano e o que ele guardou.
import { useEffect, useRef, useState } from "react"
import { DIRETORES, type IdDiretor } from "../../lib/diretoria"
import type { MsgConversa, AcaoConversa, Ferramenta } from "../../lib/diretoriaServidor"
import type { Funcionario } from "../../lib/rh"

const SUGESTOES: Record<IdDiretor, string[]> = {
  coo: ["Como está a operação hoje?", "O que está travando a produção?", "Qual o seu plano para zerar os atrasos?"],
  cco: ["Como está o funil hoje?", "Onde estamos perdendo venda?", "Qual o seu plano para esta semana?"],
  cmo: ["Como estão os anúncios?", "O que você testaria esta semana?", "O que te falta no sistema para acompanhar a campanha?"],
  cfo: ["Como está o caixa?", "Onde está a nossa margem?", "O que me preocupa para o fim do mês?"],
  cto: ["O que precisamos construir primeiro?", "O sistema está confiável?", "Revise as ferramentas que os diretores pediram"],
}
const hhmm = (s: string) => new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

export default function ConversaDiretor({ diretor, onFechar, onFala }: { diretor: IdDiretor; onFechar: () => void; onFala?: (t: string | null) => void }) {
  const info = DIRETORES.find(d => d.id === diretor)!
  const primeiro = info.nome.split(" ")[0]
  const [msgs, setMsgs] = useState<MsgConversa[] | null>(null)
  const [texto, setTexto] = useState("")
  const [pensando, setPensando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [rh, setRh] = useState<Funcionario[]>([])
  const [ferr, setFerr] = useState<Ferramenta[]>([])
  const fim = useRef<HTMLDivElement>(null)
  const carregarLados = () => {
    fetch("/api/rh").then(r => r.ok ? r.json() : null).then(x => x?.quadro && setRh(x.quadro)).catch(() => {})
    fetch("/api/diretoria/ferramentas").then(r => r.ok ? r.json() : null).then(x => x?.ferramentas && setFerr(x.ferramentas)).catch(() => {})
  }
  useEffect(() => {
    fetch(`/api/diretoria/conversa?diretor=${diretor}`).then(r => r.ok ? r.json() : null).then(x => setMsgs(x?.mensagens ?? [])).catch(() => setMsgs([]))
    carregarLados()
  }, [diretor])
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }) }, [msgs, pensando])
  useEffect(() => {
    const ultima = msgs?.filter(m => m.de === "diretor").at(-1)
    onFala?.(pensando ? "…" : ultima ? ultima.texto.slice(0, 150) + (ultima.texto.length > 150 ? "…" : "") : null)
  }, [msgs, pensando])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onFala?.(null), [])   // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (t = texto) => {
    const m = t.trim()
    if (!m || pensando) return
    setTexto(""); setErro(null); setPensando(true)
    setMsgs(atual => [...(atual ?? []), { id: "tmp", de: "felipe", texto: m, em: new Date().toISOString() }])
    const r = await fetch("/api/diretoria/conversa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ diretor, texto: m }) }).catch(() => null)
    const x = r ? await r.json().catch(() => null) : null
    setPensando(false)
    if (!r?.ok || !x?.mensagens) { setErro(x?.erro ?? `${primeiro} não conseguiu responder agora.`); setMsgs(atual => (atual ?? []).filter(y => y.id !== "tmp")); setTexto(m); return }
    setMsgs(x.mensagens); carregarLados()
  }
  const responder = async (acao: string, resposta: "aprovo" | "descartar", textoEditado?: string) => {
    const r = await fetch("/api/diretoria/conversa", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ diretor, acao, resposta, texto: textoEditado }) }).catch(() => null)
    const x = r?.ok ? await r.json().catch(() => null) : null
    if (x?.mensagens) setMsgs(x.mensagens)
  }
  const vaga = async (id: string, acao: "contratar" | "recusar") => {
    const r = await fetch("/api/rh", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, acao }) }).catch(() => null)
    const x = r?.ok ? await r.json().catch(() => null) : null
    if (x?.quadro) setRh(x.quadro)
  }
  const ferramenta = async (id: string, status: Ferramenta["status"]) => {
    const r = await fetch("/api/diretoria/ferramentas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }).catch(() => null)
    const x = r?.ok ? await r.json().catch(() => null) : null
    if (x?.ferramentas) setFerr(x.ferramentas)
  }
  const recomecar = async () => {
    if (!confirm(`Começar uma conversa nova com ${primeiro}? A conversa atual some (planos, vagas e o que ele guardou continuam).`)) return
    await fetch(`/api/diretoria/conversa?diretor=${diretor}`, { method: "DELETE" }).catch(() => null)
    setMsgs([])
  }

  return (
    <div className="absolute top-4 right-4 bottom-4 w-[460px] max-w-[calc(100%-32px)] z-[120] flex flex-col rounded-2xl bg-white/97 backdrop-blur shadow-[0_20px_60px_rgba(20,10,50,0.28)] border border-black/5 overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3 border-b border-black/5">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-bold text-white shrink-0" style={{ background: "linear-gradient(135deg,#8456e8,#5b3bb8)" }}>{primeiro[0]}{info.nome.split(" ")[1]?.[0]}</div>
        <div className="flex-1 min-w-0">
          <p className="text-[14.5px] font-semibold text-[#191625] leading-tight">{info.nome}</p>
          <p className="text-[11.5px] text-[#6b6876] leading-tight">{info.cargo} · {info.area}</p>
        </div>
        {!!msgs?.length && <button onClick={recomecar} className="text-[11px] font-medium text-[#6b6876] hover:text-[#191625] px-2 py-1 rounded-md hover:bg-black/5">Nova conversa</button>}
        <button onClick={onFechar} aria-label="Fechar" className="w-8 h-8 rounded-lg text-[#6b6876] hover:bg-black/5 text-[18px] leading-none">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {msgs && msgs.length === 0 && !pensando && <div className="pt-6 text-center">
          <p className="text-[13px] text-[#3c3a45] font-medium">Reunião com {primeiro}</p>
          <p className="text-[11.5px] text-[#6b6876] mt-1 leading-snug max-w-[340px] mx-auto">{info.jeito} Ele planeja e manda executar; nada vai a cliente sem o seu Aprovo.</p>
          <div className="mt-4 flex flex-col items-center gap-1.5">
            {SUGESTOES[diretor].map(s => <button key={s} onClick={() => enviar(s)} className="text-[12px] text-[#5b3bb8] bg-[#8456e8]/8 hover:bg-[#8456e8]/15 px-3 py-1.5 rounded-full">{s}</button>)}
          </div>
        </div>}
        {msgs === null && <p className="text-[12px] text-[#898892]">Abrindo a conversa…</p>}
        {msgs?.map(m => m.de === "felipe"
          ? <div key={m.id + m.em} className="flex justify-end"><div className="max-w-[82%] rounded-2xl rounded-br-md bg-[#191625] text-white px-3 py-2 text-[12.5px] leading-snug whitespace-pre-line">{m.texto}</div></div>
          : <div key={m.id} className="max-w-[94%]">
            <p className="text-[10.5px] text-[#898892] mb-0.5">{primeiro} · {hhmm(m.em)}</p>
            <div className="rounded-2xl rounded-tl-md bg-[#f4f2f8] px-3 py-2 text-[12.5px] text-[#191625] leading-relaxed whitespace-pre-line">{m.texto}</div>
            {m.acoes?.map(a => <Cartao key={a.id} a={a} primeiro={primeiro} rh={rh} ferr={ferr} onResponder={responder} onVaga={vaga} onFerramenta={ferramenta} />)}
          </div>)}
        {pensando && <div>
          <p className="text-[10.5px] text-[#898892] mb-0.5">{primeiro}</p>
          <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-md bg-[#f4f2f8] px-3 py-2 text-[12px] text-[#6b6876]">
            <span className="flex gap-1">{[0, 1, 2].map(k => <span key={k} className="w-1.5 h-1.5 rounded-full bg-[#8456e8] animate-bounce" style={{ animationDelay: `${k * 0.15}s` }} />)}</span>
            pensando, olhando os números
          </div>
        </div>}
        {erro && <p className="text-[11.5px] text-[#d33a3c]">{erro}</p>}
        <div ref={fim} />
      </div>

      <div className="border-t border-black/5 p-3">
        <div className="flex items-end gap-2">
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} maxLength={4000}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar() } }}
            placeholder={`Fale com ${primeiro}…`} className="flex-1 resize-none rounded-xl bg-[#f6f5f9] px-3 py-2 text-[12.5px] border border-black/5 focus:outline-none focus:ring-2 focus:ring-[#8456e8]/25 max-h-40" />
          <button onClick={() => enviar()} disabled={pensando || !texto.trim()} className="h-9 px-3.5 rounded-xl text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: "#8456e8" }}>Enviar</button>
        </div>
      </div>
    </div>
  )
}

function Cartao({ a, primeiro, rh, ferr, onResponder, onVaga, onFerramenta }: {
  a: AcaoConversa; primeiro: string; rh: Funcionario[]; ferr: Ferramenta[]
  onResponder: (id: string, r: "aprovo" | "descartar", t?: string) => Promise<void>; onVaga: (id: string, a: "contratar" | "recusar") => void; onFerramenta: (id: string, s: Ferramenta["status"]) => void
}) {
  const [edit, setEdit] = useState(a.tipo === "mensagem" ? a.texto : "")
  const [indo, setIndo] = useState(false)
  const caixa = "mt-1.5 rounded-xl border px-3 py-2"
  const rotulo = "text-[9.5px] font-semibold uppercase tracking-wide"
  if (a.tipo === "mensagem") {
    const aberto = a.status === "aguardando" || a.status === "erro"
    return <div className={`${caixa} border-[#009351]/25 bg-[#009351]/[0.04]`}>
      <p className={`${rotulo} text-[#007a43]`}>{a.funcionario} vai enviar para {a.cliente}</p>
      {aberto ? <textarea value={edit} onChange={e => setEdit(e.target.value)} rows={Math.min(8, Math.ceil(edit.length / 52) + 1)} className="mt-1 w-full resize-none rounded-lg bg-white px-2 py-1.5 text-[12px] text-[#3c3a45] leading-snug border border-black/10 focus:outline-none focus:ring-2 focus:ring-[#009351]/25" />
        : <p className="mt-0.5 text-[12px] text-[#3c3a45] leading-snug whitespace-pre-line">{a.texto}</p>}
      {a.status === "enviado" && <p className="text-[11px] font-semibold text-[#009351] mt-1">Enviado{a.em ? ` às ${hhmm(a.em)}` : ""}</p>}
      {a.status === "descartado" && <p className="text-[11px] text-[#6b6876] mt-1">Descartada</p>}
      {a.status === "erro" && <p className="text-[11px] text-[#d33a3c] mt-1">Não enviou: {a.erro}</p>}
      {aberto && <div className="flex gap-1.5 mt-1.5">
        <button disabled={indo || !edit.trim()} onClick={async () => { setIndo(true); await onResponder(a.id, "aprovo", edit !== a.texto ? edit : undefined); setIndo(false) }} className="text-[11.5px] font-semibold px-2.5 py-1 rounded-lg bg-[#009351] text-white disabled:opacity-50">{indo ? "Enviando…" : a.status === "erro" ? "Tentar de novo" : "Aprovo e envio"}</button>
        <button disabled={indo} onClick={() => onResponder(a.id, "descartar")} className="text-[11.5px] font-semibold px-2 py-1 rounded-lg text-[#6b6876] hover:bg-black/5">Descartar</button>
      </div>}
    </div>
  }
  if (a.tipo === "vaga") {
    const v = rh.find(f => f.id === a.vagaId)
    return <div className={`${caixa} border-[#8456e8]/25 bg-[#8456e8]/[0.04]`}>
      <p className={`${rotulo} text-[#5b3bb8]`}>Pedido ao RH</p>
      <p className="text-[12.5px] font-semibold text-[#191625]">{a.nome}</p>
      <p className="text-[11.5px] text-[#3c3a45] leading-snug">{a.resumo}</p>
      {v?.capacidade === "sem_ferramenta" && <p className="text-[11px] text-[#c57800] mt-0.5 leading-snug">Ainda não consegue executar: falta {v.ferramentaQueFalta}.</p>}
      {v?.status === "solicitado" ? <div className="flex gap-1.5 mt-1.5">
        <button onClick={() => onVaga(v.id, "contratar")} className="text-[11.5px] font-semibold px-2.5 py-1 rounded-lg bg-[#8456e8] text-white">Contratar</button>
        <button onClick={() => onVaga(v.id, "recusar")} className="text-[11.5px] font-semibold px-2 py-1 rounded-lg text-[#6b6876] hover:bg-black/5">Não agora</button>
        <span className="text-[10.5px] text-[#898892] self-center">Onboarding no RH (1º andar)</span>
      </div> : v && <p className={`text-[11px] font-semibold mt-1 ${v.status === "contratado" ? "text-[#009351]" : "text-[#6b6876]"}`}>{v.status === "contratado" ? "Contratado" : "Não contratado"}</p>}
    </div>
  }
  if (a.tipo === "ferramenta") {
    const f = ferr.find(x => x.id === a.ferramentaId)
    return <div className={`${caixa} border-[#2f6fd6]/25 bg-[#2f6fd6]/[0.04]`}>
      <p className={`${rotulo} text-[#2459ad]`}>Ferramenta pedida ao sistema</p>
      <p className="text-[12.5px] font-semibold text-[#191625]">{a.nome}</p>
      <p className="text-[11.5px] text-[#3c3a45] leading-snug">{a.resumo}</p>
      {f?.status === "pedida" ? <div className="flex gap-1.5 mt-1.5">
        <button onClick={() => onFerramenta(f.id, "aprovada")} className="text-[11.5px] font-semibold px-2.5 py-1 rounded-lg bg-[#2f6fd6] text-white">Aprovar</button>
        <button onClick={() => onFerramenta(f.id, "recusada")} className="text-[11.5px] font-semibold px-2 py-1 rounded-lg text-[#6b6876] hover:bg-black/5">Não agora</button>
      </div> : f && <p className="text-[11px] font-semibold mt-1 text-[#2459ad]">{f.status === "aprovada" ? "Aprovada: entra na fila de construção" : f.status === "pronta" ? "Pronta" : "Não aprovada"}</p>}
    </div>
  }
  if (a.tipo === "plano") return <div className={`${caixa} border-black/10 bg-white`}>
    <p className={`${rotulo} text-[#6b6876]`}>Plano registrado · {primeiro} cobra nas reuniões</p>
    <p className="text-[12.5px] font-semibold text-[#191625] leading-snug">{a.objetivo}</p>
    <p className="text-[11px] text-[#6b6876] leading-snug mt-0.5">Indicador: {a.indicador}</p>
    <ol className="mt-1 space-y-0.5 list-decimal pl-4">{a.passos.map((p, k) => <li key={k} className="text-[11.5px] text-[#3c3a45] leading-snug">{p}</li>)}</ol>
  </div>
  if (a.tipo === "aprendi") return <p className="mt-1.5 text-[11px] text-[#6b6876]"><span className="font-semibold text-[#3c3a45]">{primeiro} guardou:</span> {a.texto}</p>
  return <p className="mt-1.5 text-[11px] text-[#c57800]">{a.texto}</p>
}
