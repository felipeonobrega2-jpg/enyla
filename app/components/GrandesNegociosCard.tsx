"use client"

// Painel → Grandes negócios: os peixes grandes num funil próprio, cada um com o próximo passo e a data.
// O que venceu sobe para o topo (e entra no "Para resolver agora").

import { useEffect, useState } from "react"
import { Fish, Plus, MessageCircle, Trash2, Sparkles, X, CalendarClock } from "lucide-react"
import { Cartao, TituloCartao, Botao, Gaveta, Selo, Esqueleto } from "./ds"
import { ETAPAS_GRANDE, ABERTAS, precisaDeVoce, hojeSP, type GrandeNegocio, type SugestaoGrande, type EtapaGrande } from "../lib/grandesNegocios"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const num = (n: number) => n.toLocaleString("pt-BR")
const dm = (d: string) => d.split("-").reverse().slice(0, 2).join("/")
const nomeEtapa = (e: EtapaGrande) => ETAPAS_GRANDE.find(x => x.id === e)?.nome ?? e
const COR_ETAPA: Record<EtapaGrande, string> = { contato: "#5e5c68", amostra: "#2f7bd8", proposta: "#8456e8", negociacao: "#c57800", fechado: "#009351", perdido: "#898892" }
const somarDias = (n: number) => hojeSP(Date.now() + n * 86_400_000)

type Form = { id?: string; nome: string; empresa: string; telefone: string; produto: string; volume: string; valor: string; etapa: EtapaGrande; proximoPasso: string; proximoEm: string; nota: string; jid?: string | null; numeros?: string[]; origem?: GrandeNegocio["origem"] }
const vazio: Form = { nome: "", empresa: "", telefone: "", produto: "", volume: "", valor: "", etapa: "contato", proximoPasso: "", proximoEm: somarDias(1), nota: "" }

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[12px] font-medium text-[#5e5c68]">{rotulo}</span><div className="mt-1">{children}</div></label>
}
const entrada = "w-full h-11 rounded-xl px-3.5 text-[15px] text-[#191625] bg-[rgba(116,116,128,0.06)] outline-none focus:bg-white focus:ring-2 focus:ring-[#8456e8]/25"

export function GrandesNegociosCard({ onAbrirConversa }: { onAbrirConversa?: (jid: string, nome?: string) => void }) {
  const [d, setD] = useState<{ grandes: GrandeNegocio[]; sugestoes: SugestaoGrande[] } | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [verFechados, setVerFechados] = useState(false)

  const carregar = () => fetch("/api/grandes").then(r => r.ok ? r.json() : null).then(x => { if (x) setD(x) }).catch(() => {})
  useEffect(() => { carregar() }, [])
  if (!d) return <Esqueleto linhas={3} />

  const abertos = d.grandes.filter(g => ABERTAS.includes(g.etapa))
  const fechados = d.grandes.filter(g => !ABERTAS.includes(g.etapa))
  const emAberto = abertos.reduce((t, g) => t + (g.valor ?? 0), 0)
  const atrasados = abertos.filter(g => precisaDeVoce(g)).length

  const abrir = (g?: GrandeNegocio, s?: SugestaoGrande) => {
    setErro(null)
    if (g) setForm({ id: g.id, nome: g.nome, empresa: g.empresa ?? "", telefone: g.telefone ?? "", produto: g.produto ?? "", volume: g.volume ? String(g.volume) : "", valor: g.valor ? String(g.valor) : "", etapa: g.etapa, proximoPasso: g.proximoPasso ?? "", proximoEm: g.proximoEm ?? "", nota: "", jid: g.jid, numeros: g.numeros, origem: g.origem })
    else if (s) setForm({ ...vazio, nome: s.nome, volume: s.volume ? String(s.volume) : "", valor: s.valor ? String(Math.round(s.valor)) : "", etapa: s.numero ? "proposta" : "contato", jid: s.jid ?? null, numeros: s.numero ? [s.numero] : [], origem: "whatsapp" })
    else setForm({ ...vazio })
  }
  const salvar = async () => {
    if (!form || salvando) return
    if (!form.nome.trim()) { setErro("Informe o nome."); return }
    setSalvando(true); setErro(null)
    const r = await fetch("/api/grandes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).catch(() => null)
    setSalvando(false)
    if (!r?.ok) { setErro("Não salvou. Tente de novo."); return }
    setForm(null); carregar()
  }
  const apagar = async () => {
    if (!form?.id || !confirm(`Apagar ${form.nome} dos grandes negócios?`)) return
    await fetch("/api/grandes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "apagar", id: form.id }) }).catch(() => null)
    setForm(null); carregar()
  }
  const dispensar = async (s: SugestaoGrande) => {
    setD(x => x ? { ...x, sugestoes: x.sugestoes.filter(y => y !== s) } : x)
    await fetch("/api/grandes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "dispensar", chave: s.numero ?? s.jid }) }).catch(() => null)
  }
  const atual = form?.id ? d.grandes.find(g => g.id === form.id) : undefined

  const linha = (g: GrandeNegocio) => {
    const p = precisaDeVoce(g)
    const corPasso = p === "vencido" || p === "sem_passo" ? "#d33a3c" : p === "hoje" ? "#c57800" : "#898892"
    return (
      <button key={g.id} onClick={() => abrir(g)} className="w-full text-left px-2 py-3 rounded-xl hover:bg-[rgba(116,116,128,0.06)] transition-colors">
        <span className="flex items-baseline gap-2">
          <span className="flex-1 min-w-0 text-[14.5px] font-semibold text-[#191625] truncate">{g.nome}{g.empresa ? <span className="font-normal text-[#898892]"> · {g.empresa}</span> : null}</span>
          {g.valor ? <span className="text-[14px] font-bold ds-num text-[#191625] shrink-0">{brl(g.valor)}</span> : null}
        </span>
        <span className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: COR_ETAPA[g.etapa], background: `${COR_ETAPA[g.etapa]}14` }}>{nomeEtapa(g.etapa)}</span>
          {(g.produto || g.volume) && <span className="text-[12.5px] text-[#5e5c68]">{[g.produto, g.volume ? `${num(g.volume)} un` : ""].filter(Boolean).join(" · ")}</span>}
        </span>
        {ABERTAS.includes(g.etapa) && (
          <span className="flex items-start gap-1.5 mt-1.5 text-[12.5px] leading-snug" style={{ color: corPasso }}>
            <CalendarClock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {p === "sem_passo" ? "Sem próximo passo: defina o que fazer e quando" : <>{p === "vencido" ? `Venceu ${dm(g.proximoEm!)}: ` : p === "hoje" ? "Hoje: " : `${dm(g.proximoEm!)}: `}{g.proximoPasso}</>}
          </span>
        )}
      </button>
    )
  }

  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Grandes negócios" icone={<Fish className="w-4 h-4" />}
        sub={abertos.length ? `${abertos.length} em aberto${emAberto ? ` · ${brl(emAberto)}` : ""}${atrasados ? ` · ${atrasados} precisando de você` : ""}` : "Os peixes grandes, com o próximo passo de cada um"}
        acao={<Botao variante="primario" icone={<Plus className="w-4 h-4" />} onClick={() => abrir()}>Novo</Botao>} />

      {abertos.length > 0 && (
        <div className="flex gap-1.5 mt-3 overflow-x-auto -mx-1 px-1 pb-1">
          {ETAPAS_GRANDE.filter(e => ABERTAS.includes(e.id)).map(e => {
            const n = abertos.filter(g => g.etapa === e.id)
            return (
              <div key={e.id} className="shrink-0 rounded-xl px-3 py-2 bg-[rgba(116,116,128,0.06)] min-w-[104px]">
                <p className="text-[10.5px] font-semibold text-[#898892] whitespace-nowrap">{e.nome}</p>
                <p className="text-[15px] font-bold ds-num" style={{ color: n.length ? COR_ETAPA[e.id] : "#c7c7cc" }}>{n.length}<span className="text-[11px] font-medium text-[#898892]">{n.reduce((t, g) => t + (g.valor ?? 0), 0) ? ` · ${brl(n.reduce((t, g) => t + (g.valor ?? 0), 0))}` : ""}</span></p>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-2 -mx-2 ds-escalonado">
        {abertos.map(linha)}
        {!abertos.length && <p className="px-2 py-4 text-[13px] text-[#898892]">Nenhum grande negócio ainda. Toque em <strong>Novo</strong> para o primeiro (a fábrica de 350 mil, por exemplo).</p>}
      </div>

      {d.sugestoes.length > 0 && (
        <div className="mt-3 rounded-xl bg-[#8456e8]/[0.05] px-3 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#8456e8] flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />Parecem grandes</p>
          {d.sugestoes.map(s => (
            <div key={s.numero ?? s.jid ?? s.nome} className="flex items-center gap-2 py-2">
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-semibold text-[#191625] truncate">{s.nome}</span>
                <span className="block text-[12px] text-[#5e5c68]">{s.motivo}</span>
              </span>
              <button onClick={() => abrir(undefined, s)} className="h-9 px-3 rounded-lg text-[12.5px] font-semibold text-white bg-[#8456e8] shrink-0">Adicionar</button>
              <button onClick={() => dispensar(s)} title="Não é grande" className="w-9 h-9 rounded-lg flex items-center justify-center text-[#898892] hover:bg-black/5 shrink-0"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      {fechados.length > 0 && (
        <button onClick={() => setVerFechados(v => !v)} className="mt-2 text-[12px] font-semibold text-[#8456e8]">{verFechados ? "Esconder fechados e perdidos" : `Ver fechados e perdidos (${fechados.length})`}</button>
      )}
      {verFechados && <div className="-mx-2">{fechados.map(linha)}</div>}

      <Gaveta aberta={!!form} titulo={form?.id ? form.nome || "Grande negócio" : "Novo grande negócio"} sub={atual ? `desde ${dm(atual.criadoEm.slice(0, 10))}` : undefined} onFechar={() => setForm(null)}
        rodape={form && <>
          {form.id && <Botao icone={<Trash2 className="w-4 h-4" />} onClick={apagar}>Apagar</Botao>}
          <Botao variante="primario" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Botao>
        </>}>
        {form && (
          <div className="px-3 py-2 space-y-3.5">
            {form.jid && onAbrirConversa && (
              <button onClick={() => onAbrirConversa(form.jid!, form.nome)} className="w-full h-10 rounded-xl text-[13.5px] font-semibold text-[#8456e8] bg-[#8456e8]/[0.07] flex items-center justify-center gap-2"><MessageCircle className="w-4 h-4" />Abrir a conversa</button>
            )}
            <Campo rotulo="Quem"><input className={entrada} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome da pessoa" autoFocus={!form.id} /></Campo>
            <div className="grid grid-cols-2 gap-2.5">
              <Campo rotulo="Empresa"><input className={entrada} value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })} placeholder="Opcional" /></Campo>
              <Campo rotulo="Telefone"><input className={entrada} value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} inputMode="tel" placeholder="Opcional" /></Campo>
            </div>
            <Campo rotulo="O que é"><input className={entrada} value={form.produto} onChange={e => setForm({ ...form, produto: e.target.value })} placeholder="Ex.: embalagem de chocolate" /></Campo>
            <div className="grid grid-cols-2 gap-2.5">
              <Campo rotulo="Volume (un)"><input className={entrada} value={form.volume} onChange={e => setForm({ ...form, volume: e.target.value })} inputMode="numeric" placeholder="350000" /></Campo>
              <Campo rotulo="Valor estimado (R$)"><input className={entrada} value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} inputMode="decimal" placeholder="Opcional" /></Campo>
            </div>
            <Campo rotulo="Etapa">
              <div className="grid grid-cols-2 gap-1.5">
                {ETAPAS_GRANDE.map(e => (
                  <button key={e.id} type="button" onClick={() => setForm({ ...form, etapa: e.id })}
                    className="h-10 rounded-xl text-[13px] font-semibold transition-colors"
                    style={form.etapa === e.id ? { background: COR_ETAPA[e.id], color: "#fff" } : { background: "rgba(116,116,128,0.06)", color: "#5e5c68" }}>{e.nome}</button>
                ))}
              </div>
            </Campo>
            {ABERTAS.includes(form.etapa) && (<>
              <Campo rotulo="Próximo passo"><input className={entrada} value={form.proximoPasso} onChange={e => setForm({ ...form, proximoPasso: e.target.value })} placeholder="Ex.: ligar para saber da amostra" /></Campo>
              <Campo rotulo="Quando">
                <div className="flex gap-1.5 flex-wrap">
                  {[["Hoje", 0], ["Amanhã", 1], ["Em 3 dias", 3], ["Em 1 semana", 7]].map(([t, n]) => (
                    <button key={t} type="button" onClick={() => setForm({ ...form, proximoEm: somarDias(n as number) })}
                      className={`h-9 px-3 rounded-lg text-[12.5px] font-semibold ${form.proximoEm === somarDias(n as number) ? "bg-[#8456e8] text-white" : "bg-[rgba(116,116,128,0.06)] text-[#5e5c68]"}`}>{t}</button>
                  ))}
                  <input type="date" className="h-9 rounded-lg px-2 text-[13px] text-[#191625] bg-[rgba(116,116,128,0.06)]" value={form.proximoEm} onChange={e => setForm({ ...form, proximoEm: e.target.value })} />
                </div>
              </Campo>
            </>)}
            <Campo rotulo="Anotação">
              <textarea className={`${entrada} h-auto py-2.5 min-h-[76px] resize-y`} value={form.nota} onChange={e => setForm({ ...form, nota: e.target.value })} placeholder="Ex.: me ligou, mostrou a fábrica, volume de 350 mil por mês" />
            </Campo>
            {erro && <p className="text-[13px] text-[#d33a3c]">{erro}</p>}
            {atual && atual.notas.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#898892] mb-1.5">Histórico</p>
                <ul className="space-y-2">
                  {atual.notas.map(n => (
                    <li key={n.em} className="text-[13px] text-[#191625] leading-snug rounded-xl bg-[rgba(116,116,128,0.05)] px-3 py-2">
                      <span className="block text-[11px] text-[#898892] mb-0.5">{new Date(n.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</span>
                      {n.texto}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(form.numeros?.length ?? 0) > 0 && <p className="text-[12px] text-[#898892]">Orçamentos: <Selo tom="acento">{form.numeros!.join(", ")}</Selo></p>}
          </div>
        )}
      </Gaveta>
    </Cartao>
  )
}
