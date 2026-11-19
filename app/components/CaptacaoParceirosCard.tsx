"use client"

// Fornecedores → Captador de parceiros: quem convidar (fornecedores do WhatsApp e de produção, ou uma lista colada),
// a mensagem (editável) e o funil dos convites. Nada sai sem você aprovar; o envio é espaçado pelo vigia.

import React from "react"
import { Megaphone, Check, Send, ChevronDown, X, Users } from "lucide-react"
import { Segmentado } from "./ds"
import { nomeParaChamar } from "../lib/nomeDePessoa"
import { TEMPLATE_PADRAO, textoConvite, linkConvite, funil, lerListaManual, type Candidato, type Convite } from "../lib/captacao"

const ROTULO: Record<Convite["status"], { t: string; c: string }> = {
  fila: { t: "Na fila", c: "bg-[rgba(116,116,128,0.1)] text-[#5e5c68]" },
  enviado: { t: "Enviado", c: "bg-[#2f7cf6]/10 text-[#2f7cf6]" },
  abriu: { t: "Abriu o link", c: "bg-[#8456e8]/10 text-[#8456e8]" },
  cadastrou: { t: "Cadastrou", c: "bg-[#009351]/10 text-[#009351]" },
  respondeu: { t: "Respondeu", c: "bg-[#e07b1f]/12 text-[#c26a0a]" },
  sem_interesse: { t: "Sem interesse", c: "bg-[rgba(116,116,128,0.1)] text-[#898892]" },
  erro: { t: "Não saiu", c: "bg-[#d33a3c]/10 text-[#d33a3c]" },
}
const dataCurta = (iso?: string) => iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : ""

export function CaptacaoParceirosCard() {
  const [d, setD] = React.useState<{ candidatos: Candidato[]; convites: Convite[] } | null>(null)
  const [aba, setAba] = React.useState<"convidar" | "convites">("convidar")
  const [sel, setSel] = React.useState<Set<string>>(new Set())
  const [tpl, setTpl] = React.useState(TEMPLATE_PADRAO)
  const [verOutros, setVerOutros] = React.useState(false)
  const [lista, setLista] = React.useState("")
  const [enviando, setEnviando] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)
  const carregar = React.useCallback(() => fetch("/api/captacao").then(r => r.ok ? r.json() : null).then(x => { if (x) setD(x) }).catch(() => {}), [])
  React.useEffect(() => { carregar() }, [carregar])
  React.useEffect(() => { try { const t = localStorage.getItem("captacao:template"); if (t) setTpl(t) } catch { /* ok */ } }, [])
  const salvarTpl = (t: string) => { setTpl(t); try { localStorage.setItem("captacao:template", t) } catch { /* ok */ } }

  if (!d) return null
  const f = funil(d.convites)
  const relevantes = d.candidatos.filter(c => c.relevante), outros = d.candidatos.filter(c => !c.relevante)
  const escolhidos = d.candidatos.filter(c => sel.has(c.jid))
  const daLista = lerListaManual(lista)
  const exemplo = escolhidos[0] ?? (daLista[0] ? { nome: daLista[0].nome } : null)
  const alternar = (jid: string) => setSel(s => { const n = new Set(s); if (n.has(jid)) n.delete(jid); else n.add(jid); return n })

  async function enviar() {
    if (!escolhidos.length && !daLista.length) return
    setEnviando(true); setMsg(null)
    let n = 0
    if (escolhidos.length) n += (await fetch("/api/captacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "convidar", template: tpl, itens: escolhidos.map(c => ({ jid: c.jid, nome: c.nome, origem: c.origem })) }) }).then(r => r.json()).catch(() => ({ n: 0 }))).n ?? 0
    if (daLista.length) n += (await fetch("/api/captacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "lista", template: tpl, texto: lista }) }).then(r => r.json()).catch(() => ({ n: 0 }))).n ?? 0
    setEnviando(false); setSel(new Set()); setLista("")
    setMsg(n ? `${n} ${n === 1 ? "convite entrou" : "convites entraram"} na fila. Saem aos poucos: até 2 a cada 5 minutos, de seg a sex, das 9h às 18h.` : "Nenhum convite novo (talvez já tenham sido convidados).")
    setAba("convites"); carregar()
  }
  const acao = (id: string, a: "cancelar" | "sem_interesse") => fetch("/api/captacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: a, id }) }).then(carregar).catch(() => {})

  const Linha = ({ c }: { c: Candidato }) => (
    <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[rgba(116,116,128,0.04)] cursor-pointer">
      <input type="checkbox" checked={sel.has(c.jid)} onChange={() => alternar(c.jid)} className="accent-[#8456e8] w-4 h-4" />
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium text-[#191625] truncate">{c.nome || c.jid.split("@")[0]}</span>
        <span className="block text-[11.5px] text-[#898892] truncate">{c.origem === "fornecedor" ? "fornecedor de produção" : `WhatsApp${c.ultimaConversa ? ` · última conversa ${dataCurta(c.ultimaConversa)}` : ""}`}</span>
      </span>
      {c.motivo && <span className="text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-[#8456e8]/10 text-[#8456e8] shrink-0">{c.motivo}</span>}
    </label>
  )

  return (
    <div className="bg-white rounded-2xl ds-borda p-5 mb-4 ds-entrada">
      <div className="flex items-start gap-3 flex-wrap">
        <span className="w-9 h-9 rounded-xl grid place-items-center bg-[#e07b1f]/12 text-[#e07b1f] shrink-0"><Megaphone className="w-4.5 h-4.5" /></span>
        <div className="flex-1 min-w-[200px]">
          <p className="text-[13.5px] font-semibold text-[#191625]">Captador de parceiros</p>
          <p className="text-[12px] text-[#898892] mt-0.5">Convida quem já presta serviço para o cadastro Parceiros ENYLA. Você escolhe e aprova; o envio é espaçado para não arriscar o número.</p>
        </div>
        <Segmentado valor={aba} onChange={setAba} opcoes={[{ v: "convidar" as const, nome: "Convidar" }, { v: "convites" as const, nome: `Convites${d.convites.length ? ` (${d.convites.length})` : ""}` }]} />
      </div>

      {d.convites.length > 0 && (
        <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-2">
          {[["Na fila", f.naFila], ["Enviados", f.enviados], ["Abriram", f.abriram], ["Cadastraram", f.cadastraram], ["Responderam", f.responderam]].map(([r, v]) => (
            <div key={r} className="rounded-xl bg-[rgba(116,116,128,0.05)] px-3 py-2"><p className="text-[10.5px] uppercase tracking-wide font-semibold text-[#898892]">{r}</p><p className="text-[17px] font-bold ds-num text-[#191625]">{v}</p></div>
          ))}
        </div>
      )}
      {msg && <p className="mt-3 text-[12.5px] text-[#009351] font-medium flex items-center gap-1.5 ds-entrada"><Check className="w-4 h-4" />{msg}</p>}

      {aba === "convidar" && (
        <div className="mt-4 grid lg:grid-cols-[1.1fr_1fr] gap-5">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[12.5px] font-semibold text-[#191625] flex items-center gap-1.5"><Users className="w-4 h-4 text-[#8456e8]" />Parecem prestar serviço gráfico ({relevantes.length})</p>
              {relevantes.length > 0 && <button onClick={() => setSel(s => { const n = new Set(s); const todos = relevantes.every(c => n.has(c.jid)); for (const c of relevantes) { if (todos) n.delete(c.jid); else n.add(c.jid) } return n })} className="text-[12px] font-semibold text-[#8456e8]">{relevantes.every(c => sel.has(c.jid)) ? "Desmarcar" : "Marcar todos"}</button>}
            </div>
            <div className="max-h-[320px] overflow-y-auto rounded-xl border border-[rgba(60,60,67,0.10)] p-1">
              {relevantes.length ? relevantes.map(c => <Linha key={c.jid} c={c} />) : <p className="p-3 text-[12px] text-[#898892]">Nenhum por enquanto.</p>}
            </div>
            {outros.length > 0 && <>
              <button onClick={() => setVerOutros(v => !v)} className="mt-2 text-[12px] font-semibold text-[#5e5c68] flex items-center gap-1">Outros fornecedores ({outros.length}) · frasco, essência, etc.<ChevronDown className={`w-3.5 h-3.5 transition-transform ${verOutros ? "rotate-180" : ""}`} /></button>
              {verOutros && <div className="mt-1.5 max-h-[260px] overflow-y-auto rounded-xl border border-[rgba(60,60,67,0.10)] p-1 ds-entrada">{outros.map(c => <Linha key={c.jid} c={c} />)}</div>}
            </>}
            <p className="mt-4 text-[12.5px] font-semibold text-[#191625]">Ou cole contatos novos</p>
            <p className="text-[11.5px] text-[#898892]">Um por linha: nome e telefone (ex.: Gráfica Bom Corte; 11 98888-7777)</p>
            <textarea value={lista} onChange={e => setLista(e.target.value)} rows={3} className="mt-1.5 w-full rounded-xl px-3 py-2 text-[13px] bg-[rgba(116,116,128,0.06)] focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20" placeholder="Nome; telefone" />
            {lista.trim() && <p className="text-[11.5px] text-[#898892] mt-1">{daLista.length} {daLista.length === 1 ? "contato válido" : "contatos válidos"}</p>}
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-[#191625]">Mensagem</p>
            <p className="text-[11.5px] text-[#898892]">{"{, nome}"} vira ", Marcos" (só quando é nome de pessoa) · {"{link}"} vira o link do convite</p>
            <textarea value={tpl} onChange={e => salvarTpl(e.target.value)} rows={9} className="mt-1.5 w-full rounded-xl px-3 py-2 text-[13px] leading-relaxed bg-[rgba(116,116,128,0.06)] focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20" />
            {tpl !== TEMPLATE_PADRAO && <button onClick={() => salvarTpl(TEMPLATE_PADRAO)} className="text-[11.5px] font-semibold text-[#8456e8]">Voltar ao texto padrão</button>}
            {exemplo && <div className="mt-2 rounded-xl bg-[#e7f8ee] px-3 py-2.5 text-[12.5px] text-[#1d3b2a] whitespace-pre-line ds-entrada"><p className="text-[10.5px] font-bold uppercase tracking-wide text-[#2a7a4b] mb-1">Como chega (exemplo)</p>{textoConvite(tpl, nomeParaChamar(exemplo.nome) || null, linkConvite("CVEXEMPLO"))}</div>}
            <button onClick={enviar} disabled={enviando || (!escolhidos.length && !daLista.length)} className="mt-3 w-full h-11 rounded-xl text-[13.5px] font-bold text-white bg-[#8456e8] disabled:opacity-30 flex items-center justify-center gap-2 ds-toque">
              <Send className="w-4 h-4" />{enviando ? "Colocando na fila…" : `Convidar ${escolhidos.length + daLista.length || ""}`.trim()}
            </button>
            <p className="mt-1.5 text-[11.5px] text-[#898892]">Saem aos poucos (até 2 a cada 5 min, seg a sex, 9h às 18h), dentro do limite do número. Um lembrete só, 4 dias depois, para quem não abriu.</p>
          </div>
        </div>
      )}

      {aba === "convites" && (
        <div className="mt-4 space-y-1.5">
          {d.convites.length === 0 && <p className="text-[12.5px] text-[#898892]">Nenhum convite ainda.</p>}
          {d.convites.slice(0, 200).map(c => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[rgba(116,116,128,0.04)]">
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium text-[#191625] truncate">{c.nome || c.jid.split("@")[0]}</span>
                <span className="block text-[11.5px] text-[#898892] truncate">{[c.enviadoEm && `enviado ${dataCurta(c.enviadoEm)}`, c.abriuEm && `abriu ${dataCurta(c.abriuEm)}`, c.lembreteEm && `lembrete ${dataCurta(c.lembreteEm)}`, c.cadastrouEm && `cadastrou ${dataCurta(c.cadastrouEm)}`, c.erro].filter(Boolean).join(" · ") || "aguardando a vez"}</span>
              </span>
              <span className={`text-[10.5px] font-semibold rounded-full px-2 py-0.5 shrink-0 ${ROTULO[c.status].c}`}>{ROTULO[c.status].t}</span>
              {c.status === "fila" && <button onClick={() => acao(c.id, "cancelar")} title="Tirar da fila" className="w-7 h-7 grid place-items-center rounded-lg text-[#898892] hover:bg-[rgba(116,116,128,0.08)]"><X className="w-4 h-4" /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
