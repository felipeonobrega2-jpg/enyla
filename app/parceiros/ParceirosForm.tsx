"use client"

// Parceiros ENYLA: cadastro de quem presta serviço. Em etapas curtas (empresa, contato, serviços, como cobra e
// em quanto tempo entrega, operação), gostoso no celular e no computador. O rascunho fica no aparelho.

import { useEffect, useMemo, useRef, useState } from "react"
import { Printer, Layers, Sparkles, Stamp, Mountain, Scissors, Package, Shapes, FileStack, Palette, FileCheck, Truck, Plus, Check, ChevronLeft, ArrowRight, Paperclip, X, Clock, BarChart3, ShieldCheck, Handshake, Loader2, MessageCircle } from "lucide-react"
import {
  SERVICOS_PARCEIRO, FORMAS_COBRANCA, errosDaEtapa, mascaraDocumento, mascaraTelefone, GERENTE_PADRAO,
  type CadastroParceiro, type ServicoCadastrado, type IdServicoParceiro, type Etapa,
} from "../lib/parceiros"

const ICONE: Record<IdServicoParceiro, typeof Printer> = {
  impressaoOffset: Printer, impressaoDigital: Printer, laminacao: Layers, verniz: Sparkles, hotStamping: Stamp, relevo: Mountain,
  corteVinco: Scissors, colagem: Package, faca: Shapes, papel: FileStack, arte: Palette, fechamento: FileCheck, transporte: Truck, outro: Plus,
}
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ")
const ETAPAS: { id: Etapa; nome: string }[] = [
  { id: "empresa", nome: "Empresa" }, { id: "contato", nome: "Contato" }, { id: "servicos", nome: "Serviços" },
  { id: "detalhes", nome: "Prazos e preços" }, { id: "final", nome: "Operação" },
]
const RASCUNHO = "parceiros:rascunho"
const ROXO = "#7c4ee4"

type Dados = Partial<CadastroParceiro> & { servicos: ServicoCadastrado[] }
const VAZIO: Dados = { tipoDocumento: "cnpj", servicos: [], uf: "" }

function Campo({ rotulo, dica, erro, children, opcional }: { rotulo: string; dica?: string; erro?: string; children: React.ReactNode; opcional?: boolean }) {
  return (
    <label className="block">
      <span className="flex items-baseline gap-2 text-[14px] font-semibold text-[#1d1a29]">{rotulo}{opcional && <span className="text-[12px] font-normal text-[#9a97a5]">opcional</span>}</span>
      {dica && <span className="block text-[12.5px] text-[#6b6878] mt-0.5 leading-snug">{dica}</span>}
      <span className="block mt-2">{children}</span>
      {erro && <span className="block text-[12.5px] text-[#d33a3c] mt-1.5 font-medium">{erro}</span>}
    </label>
  )
}
const inputCls = (erro?: string) => `w-full h-12 rounded-xl px-4 text-[16px] text-[#1d1a29] bg-[#f6f5fa] border ${erro ? "border-[#d33a3c] bg-[#fff6f6]" : "border-transparent"} focus:bg-white focus:border-[${ROXO}] focus:outline-none focus:ring-4 focus:ring-[#7c4ee4]/15 transition placeholder:text-[#b1aebb]`

export default function ParceirosForm({ whatsappGerente }: { whatsappGerente: string | null }) {
  const [passo, setPasso] = useState(-1)          // -1 = boas-vindas; 0..4 = etapas; 5 = enviado
  const [d, setD] = useState<Dados>(VAZIO)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [arquivos, setArquivos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const site = useRef<HTMLInputElement>(null)
  const topo = useRef<HTMLDivElement>(null)

  // Rascunho no aparelho (volta de onde parou)
  useEffect(() => { try { const r = JSON.parse(localStorage.getItem(RASCUNHO) ?? "null"); if (r?.d) { setD({ ...VAZIO, ...r.d }); if (typeof r.passo === "number" && r.passo >= 0 && r.passo < 5) setPasso(r.passo) } } catch { /* sem rascunho */ } }, [])
  useEffect(() => { if (passo >= 0 && passo < 5) try { localStorage.setItem(RASCUNHO, JSON.stringify({ d, passo })) } catch { /* sem storage */ } }, [d, passo])
  useEffect(() => { topo.current?.scrollIntoView({ behavior: "smooth", block: "start" }) }, [passo])

  const set = <K extends keyof Dados>(k: K, v: Dados[K]) => { setD(x => ({ ...x, [k]: v })); setErros(e => { const n = { ...e }; delete n[k as string]; return n }) }
  const servico = (id: IdServicoParceiro) => d.servicos.find(s => s.id === id)
  const alternarServico = (id: IdServicoParceiro) => set("servicos", servico(id) ? d.servicos.filter(s => s.id !== id) : [...d.servicos, { id, cobranca: null, prazoDias: null, prazoVaria: false }])
  const mudarServico = (id: IdServicoParceiro, m: Partial<ServicoCadastrado>) => {
    setD(x => ({ ...x, servicos: x.servicos.map(s => s.id === id ? { ...s, ...m } : s) }))
    setErros(e => { const n = { ...e }; for (const k of Object.keys(n)) if (k.startsWith(`${id}.`)) delete n[k]; return n })
  }

  function avancar() {
    const et = ETAPAS[passo].id
    const e = errosDaEtapa(d, et)
    setErros(e)
    if (Object.keys(e).length) { setTimeout(() => document.querySelector("[data-erro]")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); return }
    if (passo < 4) setPasso(passo + 1); else void enviar()
  }
  async function enviar() {
    setEnviando(true); setErroEnvio(null)
    const f = new FormData()
    f.set("dados", JSON.stringify(d)); f.set("site", site.current?.value ?? "")
    for (const a of arquivos) f.append("arquivos", a)
    try {
      const r = await fetch("/api/parceiros/cadastro", { method: "POST", body: f }).then(x => x.json())
      if (!r.ok) { setErroEnvio(r.erro ?? "Não deu certo. Tente de novo."); if (r.campos) setErros(r.campos); return }
      try { localStorage.removeItem(RASCUNHO) } catch { /* ok */ }
      setPasso(5)
    } catch { setErroEnvio("Sem conexão. Confira a internet e tente de novo.") }
    finally { setEnviando(false) }
  }

  const progresso = passo < 0 ? 0 : Math.min(100, (passo + (passo === 5 ? 0 : 0.5)) / 5 * 100)
  const escolhidos = useMemo(() => SERVICOS_PARCEIRO.filter(s => servico(s.id)), [d.servicos])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Boas-vindas ──
  if (passo === -1) return (
    <main className="min-h-[100dvh] bg-white">
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(160deg,#2a1a5e 0%,#5b34c8 55%,#7c4ee4 100%)" }}>
        <div className="absolute -right-24 -top-24 w-80 h-80 rounded-full bg-white/10" /><div className="absolute -left-16 bottom-0 w-56 h-56 rounded-full bg-[#2fd39a]/15" />
        <div className="relative max-w-[640px] mx-auto px-5 pt-8 pb-12 sm:pt-12 sm:pb-16">
          <img src="/brand/enyla-wordmark-light.png" alt="ENYLA" className="h-7 mb-10" onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 text-white text-[12.5px] font-semibold px-3 py-1"><Handshake className="w-3.5 h-3.5" />Parceiros ENYLA</span>
          <h1 className="mt-4 text-white text-[36px] sm:text-[46px] leading-[1.05] font-extrabold tracking-tight">Nunca mais fique ocioso.</h1>
          <p className="mt-4 text-white/85 text-[16.5px] leading-relaxed max-w-[520px]">A ENYLA produz embalagens para marcas de todo o Brasil e distribui a produção entre parceiros de confiança. Cadastre o que você faz e receba pedidos com frequência.</p>
        </div>
      </div>
      <div className="max-w-[640px] mx-auto px-5 -mt-6 relative">
        <div className="rounded-3xl bg-white shadow-[0_10px_40px_rgba(40,20,90,0.12)] p-5 sm:p-7 space-y-4">
          {[
            { I: BarChart3, t: "Pedidos frequentes", s: "Mandamos trabalho de forma recorrente, sem você precisar correr atrás." },
            { I: FileCheck, t: "Tudo organizado", s: "Arquivo, medida, quantidade e prazo claros em cada pedido." },
            { I: Clock, t: "Quem entrega bem, recebe mais", s: "Registramos tempo e qualidade de cada trabalho. Parceiro pontual ganha prioridade." },
            { I: MessageCircle, t: `Gerente de contas: ${GERENTE_PADRAO}`, s: "Uma pessoa da ENYLA fala com você sempre que precisar." },
          ].map(({ I, t, s }) => (
            <div key={t} className="flex gap-3.5">
              <span className="w-10 h-10 rounded-2xl grid place-items-center shrink-0" style={{ background: "#7c4ee41a", color: ROXO }}><I className="w-5 h-5" /></span>
              <span><span className="block text-[15px] font-semibold text-[#1d1a29]">{t}</span><span className="block text-[13.5px] text-[#6b6878] leading-snug mt-0.5">{s}</span></span>
            </div>
          ))}
        </div>
        <button onClick={() => setPasso(0)} className="mt-6 w-full h-14 rounded-2xl text-white text-[16.5px] font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition shadow-[0_8px_24px_rgba(124,78,228,0.35)]" style={{ background: ROXO }}>
          Quero ser parceiro<ArrowRight className="w-5 h-5" />
        </button>
        <p className="text-center text-[12.5px] text-[#9a97a5] mt-3 pb-10">Leva uns 5 minutos · você pode parar e voltar depois</p>
      </div>
    </main>
  )

  // ── Enviado ──
  if (passo === 5) return (
    <main className="min-h-[100dvh] bg-white grid place-items-center px-5">
      <div className="max-w-[460px] w-full text-center py-16">
        <span className="mx-auto w-20 h-20 rounded-full grid place-items-center bg-[#2fd39a]/15 text-[#13a06f] ds-pop"><Check className="w-10 h-10" strokeWidth={2.5} /></span>
        <h1 className="mt-6 text-[28px] font-extrabold text-[#1d1a29] tracking-tight">Cadastro recebido!</h1>
        <p className="mt-3 text-[15.5px] text-[#4a4658] leading-relaxed">Obrigado, {d.responsavel?.split(" ")[0] || "parceiro"}. O {GERENTE_PADRAO}, seu gerente de contas na ENYLA, vai olhar o seu cadastro e falar com você pelo WhatsApp.</p>
        <div className="mt-6 rounded-2xl bg-[#f6f5fa] p-4 text-left text-[13.5px] text-[#4a4658] leading-relaxed">
          <p className="font-semibold text-[#1d1a29] mb-1">E depois?</p>
          Os pedidos chegam pelo WhatsApp e no seu e-mail ({d.email}), com arquivo, medida e prazo. A cada entrega, registramos tempo e qualidade, e quem entrega bem passa a receber mais.
        </div>
        {whatsappGerente && <a href={`https://wa.me/${whatsappGerente}?text=${encodeURIComponent(`Oi, ${GERENTE_PADRAO}! Acabei de me cadastrar como parceiro: ${d.nomeFantasia}.`)}`} className="mt-6 inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-[#25d366] text-white font-semibold text-[15px]"><MessageCircle className="w-5 h-5" />Falar com o {GERENTE_PADRAO}</a>}
      </div>
    </main>
  )

  // ── Etapas ──
  const et = ETAPAS[passo].id
  const E = (k: string) => erros[k]
  return (
    <main className="min-h-[100dvh] bg-[#fbfaff]">
      <div ref={topo} className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-[#efedf5]">
        <div className="max-w-[640px] mx-auto px-5 h-14 flex items-center gap-3">
          <button onClick={() => setPasso(passo - 1)} aria-label="Voltar" className="w-9 h-9 -ml-2 rounded-xl grid place-items-center text-[#4a4658] active:bg-[#f1eff7]"><ChevronLeft className="w-5 h-5" /></button>
          <div className="flex-1">
            <p className="text-[12px] font-semibold text-[#9a97a5] leading-none">Etapa {passo + 1} de 5</p>
            <p className="text-[15px] font-bold text-[#1d1a29] leading-tight mt-0.5">{ETAPAS[passo].nome}</p>
          </div>
          <span className="text-[12px] font-semibold" style={{ color: ROXO }}>Parceiros ENYLA</span>
        </div>
        <div className="h-1 bg-[#efedf5]"><div className="h-full transition-all duration-500" style={{ width: `${progresso}%`, background: ROXO }} /></div>
      </div>

      <div className="max-w-[640px] mx-auto px-5 pt-6 pb-36 space-y-6 ds-entrada" key={passo}>
        {et === "empresa" && <>
          <h2 className="text-[24px] font-extrabold text-[#1d1a29] tracking-tight leading-tight">Conta um pouco da sua empresa</h2>
          <div data-erro={E("nomeFantasia") ? "" : undefined}><Campo rotulo="Nome da empresa" dica="Como vocês são conhecidos no mercado" erro={E("nomeFantasia")}>
            <input className={inputCls(E("nomeFantasia"))} value={d.nomeFantasia ?? ""} onChange={e => set("nomeFantasia", e.target.value)} placeholder="Ex.: Gráfica Bom Corte" autoComplete="organization" />
          </Campo></div>
          <div data-erro={E("documento") ? "" : undefined}><Campo rotulo={d.tipoDocumento === "cpf" ? "CPF" : "CNPJ"} erro={E("documento")}>
            <div className="flex p-1 rounded-xl bg-[#f1eff7] w-fit mb-2">
              {(["cnpj", "cpf"] as const).map(t => <button key={t} type="button" onClick={() => { set("tipoDocumento", t); set("documento", "") }} className={`h-9 px-4 rounded-lg text-[13.5px] font-semibold transition ${d.tipoDocumento === t ? "bg-white shadow-sm text-[#1d1a29]" : "text-[#6b6878]"}`}>{t === "cnpj" ? "Tenho CNPJ" : "Ainda não tenho CNPJ"}</button>)}
            </div>
            <input className={inputCls(E("documento"))} inputMode="numeric" value={mascaraDocumento(d.documento ?? "", d.tipoDocumento ?? "cnpj")} onChange={e => set("documento", e.target.value.replace(/\D/g, ""))} placeholder={d.tipoDocumento === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"} />
          </Campo></div>
          {d.tipoDocumento === "cnpj" && <Campo rotulo="Razão social" opcional>
            <input className={inputCls()} value={d.razaoSocial ?? ""} onChange={e => set("razaoSocial", e.target.value)} placeholder="Como está no CNPJ" />
          </Campo>}
          <div className="grid grid-cols-[1fr_96px] gap-3" data-erro={E("cidade") || E("uf") ? "" : undefined}>
            <Campo rotulo="Cidade" erro={E("cidade")}><input className={inputCls(E("cidade"))} value={d.cidade ?? ""} onChange={e => set("cidade", e.target.value)} autoComplete="address-level2" /></Campo>
            <Campo rotulo="UF" erro={E("uf")}>
              <select className={inputCls(E("uf"))} value={d.uf ?? ""} onChange={e => set("uf", e.target.value)}><option value="">—</option>{UFS.map(u => <option key={u}>{u}</option>)}</select>
            </Campo>
          </div>
          <Campo rotulo="Endereço" dica="Para levar e buscar material" opcional>
            <input className={inputCls()} value={d.endereco ?? ""} onChange={e => set("endereco", e.target.value)} placeholder="Rua, número, bairro" autoComplete="street-address" />
          </Campo>
        </>}

        {et === "contato" && <>
          <h2 className="text-[24px] font-extrabold text-[#1d1a29] tracking-tight leading-tight">Como a gente fala com você?</h2>
          <div data-erro={E("responsavel") ? "" : undefined}><Campo rotulo="Seu nome" erro={E("responsavel")}><input className={inputCls(E("responsavel"))} value={d.responsavel ?? ""} onChange={e => set("responsavel", e.target.value)} autoComplete="name" /></Campo></div>
          <div data-erro={E("whatsapp") ? "" : undefined}><Campo rotulo="WhatsApp" dica="É por aqui que os pedidos chegam primeiro" erro={E("whatsapp")}>
            <input className={inputCls(E("whatsapp"))} inputMode="tel" value={mascaraTelefone(d.whatsapp ?? "")} onChange={e => set("whatsapp", e.target.value.replace(/\D/g, ""))} placeholder="(11) 90000-0000" autoComplete="tel" />
          </Campo></div>
          <div data-erro={E("email") ? "" : undefined}><Campo rotulo="Seu melhor e-mail" dica="Você também recebe por lá os pedidos que chegarem pelo WhatsApp, com os arquivos." erro={E("email")}>
            <input className={inputCls(E("email"))} type="email" inputMode="email" value={d.email ?? ""} onChange={e => set("email", e.target.value)} placeholder="voce@empresa.com.br" autoComplete="email" />
          </Campo></div>
          <Campo rotulo="Quem recebe o material na produção" dica="Nome e telefone, se for outra pessoa" opcional>
            <input className={inputCls()} value={d.contatoProducao ?? ""} onChange={e => set("contatoProducao", e.target.value)} placeholder="Ex.: Marcos · (11) 98888-0000" />
          </Campo>
        </>}

        {et === "servicos" && <>
          <div>
            <h2 className="text-[24px] font-extrabold text-[#1d1a29] tracking-tight leading-tight">Vocês prestam qual serviço?</h2>
            <p className="text-[14px] text-[#6b6878] mt-1.5">Marque tudo o que fazem. Na próxima etapa, cada um ganha prazo e preço.</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5" data-erro={E("servicos") ? "" : undefined}>
            {SERVICOS_PARCEIRO.map(s => {
              const on = !!servico(s.id), I = ICONE[s.id]
              return (
                <button key={s.id} type="button" onClick={() => alternarServico(s.id)} aria-pressed={on}
                  className={`relative text-left rounded-2xl p-3.5 border-2 transition active:scale-[0.98] ${on ? "bg-[#7c4ee4]/[0.07]" : "bg-white border-[#ece9f4]"}`} style={on ? { borderColor: ROXO } : undefined}>
                  <span className="w-9 h-9 rounded-xl grid place-items-center mb-2" style={{ background: on ? ROXO : "#f1eff7", color: on ? "#fff" : "#6b6878" }}><I className="w-[18px] h-[18px]" /></span>
                  <span className="block text-[14px] font-semibold text-[#1d1a29] leading-tight">{s.nome}</span>
                  <span className="block text-[12px] text-[#8a8796] leading-snug mt-0.5">{s.dica}</span>
                  {on && <span className="absolute top-3 right-3 w-5 h-5 rounded-full grid place-items-center text-white" style={{ background: ROXO }}><Check className="w-3.5 h-3.5" strokeWidth={3} /></span>}
                </button>
              )
            })}
          </div>
          {E("servicos") && <p className="text-[13px] text-[#d33a3c] font-medium">{E("servicos")}</p>}
        </>}

        {et === "detalhes" && <>
          <div>
            <h2 className="text-[24px] font-extrabold text-[#1d1a29] tracking-tight leading-tight">Prazo e preço de cada serviço</h2>
            <p className="text-[14px] text-[#6b6878] mt-1.5">Seja sincero: é com isso que a gente planeja a produção. Valor é só referência, sem compromisso.</p>
          </div>
          {escolhidos.map(sv => {
            const s = servico(sv.id)!, I = ICONE[sv.id]
            const forma = FORMAS_COBRANCA.find(f => f.id === s.cobranca)
            const temErro = Object.keys(erros).some(k => k.startsWith(`${sv.id}.`))
            return (
              <section key={sv.id} data-erro={temErro ? "" : undefined} className={`rounded-3xl bg-white p-5 border ${temErro ? "border-[#d33a3c]/40" : "border-[#ece9f4]"} shadow-[0_2px_10px_rgba(40,20,90,0.04)] space-y-5`}>
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-2xl grid place-items-center text-white" style={{ background: ROXO }}><I className="w-5 h-5" /></span>
                  <p className="text-[17px] font-bold text-[#1d1a29]">{sv.id === "outro" ? (s.qual || "Outro serviço") : sv.nome}</p>
                </div>
                {sv.id === "outro" && <Campo rotulo="Qual serviço?" erro={E(`${sv.id}.qual`)}><input className={inputCls(E(`${sv.id}.qual`))} value={s.qual ?? ""} onChange={e => mudarServico(sv.id, { qual: e.target.value })} /></Campo>}

                <Campo rotulo="Seja sincero: qual é o tempo de entrega médio?" dica="Em dias úteis, do material chegar até ficar pronto" erro={E(`${sv.id}.prazo`)}>
                  {!s.prazoVaria && (
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => mudarServico(sv.id, { prazoDias: Math.max(1, (s.prazoDias ?? 2) - 1) })} className="w-12 h-12 rounded-xl bg-[#f1eff7] text-[22px] font-bold text-[#4a4658] active:scale-95">−</button>
                      <div className="flex-1 h-12 rounded-xl bg-[#f6f5fa] grid place-items-center">
                        <span className="text-[18px] font-bold text-[#1d1a29]">{s.prazoDias ?? "—"} <span className="text-[13px] font-medium text-[#6b6878]">{s.prazoDias === 1 ? "dia útil" : "dias úteis"}</span></span>
                      </div>
                      <button type="button" onClick={() => mudarServico(sv.id, { prazoDias: Math.min(60, (s.prazoDias ?? 0) + 1) })} className="w-12 h-12 rounded-xl text-white text-[22px] font-bold active:scale-95" style={{ background: ROXO }}>+</button>
                    </div>
                  )}
                  <button type="button" onClick={() => mudarServico(sv.id, { prazoVaria: !s.prazoVaria, prazoDias: s.prazoVaria ? 3 : null })}
                    className={`mt-2.5 w-full text-left rounded-xl px-3.5 py-3 border flex gap-3 items-start transition ${s.prazoVaria ? "bg-[#7c4ee4]/[0.07]" : "bg-white border-[#ece9f4]"}`} style={s.prazoVaria ? { borderColor: ROXO } : undefined}>
                    <span className={`mt-0.5 w-5 h-5 rounded-md border-2 grid place-items-center shrink-0 ${s.prazoVaria ? "text-white" : "border-[#cfcbdb]"}`} style={s.prazoVaria ? { background: ROXO, borderColor: ROXO } : undefined}>{s.prazoVaria && <Check className="w-3.5 h-3.5" strokeWidth={3} />}</span>
                    <span className="text-[13.5px] text-[#4a4658] leading-snug">Não consigo mensurar agora: varia muito de pedido para pedido, a ponto de eu não ter uma média ou tabela.</span>
                  </button>
                </Campo>

                <Campo rotulo="Como você cobra?" erro={E(`${sv.id}.cobranca`)}>
                  <div className="flex flex-wrap gap-2">
                    {FORMAS_COBRANCA.map(f => (
                      <button key={f.id} type="button" onClick={() => mudarServico(sv.id, { cobranca: f.id })}
                        className={`h-10 px-3.5 rounded-full text-[13.5px] font-semibold border transition active:scale-95 ${s.cobranca === f.id ? "text-white" : "bg-white text-[#4a4658] border-[#e3e0ec]"}`} style={s.cobranca === f.id ? { background: ROXO, borderColor: ROXO } : undefined}>{f.nome}</button>
                    ))}
                  </div>
                </Campo>
                {forma?.unidade && (
                  <div className={`grid gap-3 ${s.cobranca === "acertoMilheiro" ? "grid-cols-2" : "grid-cols-1"}`}>
                    {s.cobranca === "acertoMilheiro" && <Campo rotulo="Acerto (R$)" opcional><input className={inputCls()} inputMode="decimal" value={s.acerto ?? ""} onChange={e => mudarServico(sv.id, { acerto: Number(e.target.value.replace(",", ".")) || null })} placeholder="0,00" /></Campo>}
                    <Campo rotulo={`Valor ${forma.unidade} (R$)`} dica={s.cobranca === "acertoMilheiro" ? undefined : "Um valor médio de referência"} opcional>
                      <input className={inputCls()} inputMode="decimal" value={s.valor ?? ""} onChange={e => mudarServico(sv.id, { valor: Number(e.target.value.replace(",", ".")) || null })} placeholder="0,00" />
                    </Campo>
                  </div>
                )}
                {(s.cobranca === "tabela" || s.cobranca === "varia") && <p className="text-[13px] text-[#6b6878] -mt-2">Perfeito. Na última etapa você pode mandar a tabela ou um orçamento que já fez: a gente aprende o seu jeito de cobrar.</p>}
                <Campo rotulo="Pedido mínimo" opcional><input className={inputCls()} value={s.minimo ?? ""} onChange={e => mudarServico(sv.id, { minimo: e.target.value })} placeholder="Ex.: 1.000 folhas, R$ 150, 1 dia de máquina" /></Campo>
                <Campo rotulo="Algo mais sobre esse serviço?" opcional>
                  <textarea className={`${inputCls()} h-24 py-3 resize-none`} value={s.obs ?? ""} onChange={e => mudarServico(sv.id, { obs: e.target.value })} placeholder="Tipos que faz, limitações, formatos, cores…" />
                </Campo>
              </section>
            )
          })}
        </>}

        {et === "final" && <>
          <h2 className="text-[24px] font-extrabold text-[#1d1a29] tracking-tight leading-tight">Sua operação</h2>
          <Campo rotulo="Máquinas e formato máximo" dica="Ex.: Heidelberg 4 cores 66×96; coladeira automática" opcional>
            <textarea className={`${inputCls()} h-24 py-3 resize-none`} value={d.maquinas ?? ""} onChange={e => set("maquinas", e.target.value)} />
          </Campo>
          <Campo rotulo="Capacidade" dica="Quanto vocês conseguem por dia ou semana" opcional>
            <input className={inputCls()} value={d.capacidade ?? ""} onChange={e => set("capacidade", e.target.value)} placeholder="Ex.: 20 mil folhas por dia" />
          </Campo>
          <Campo rotulo="Horário de funcionamento" opcional>
            <input className={inputCls()} value={d.horario ?? ""} onChange={e => set("horario", e.target.value)} placeholder="Ex.: seg a sex, 8h às 18h; sábado até 12h" />
          </Campo>
          <Campo rotulo="Tabela de preços ou orçamento de exemplo" dica="Mande um orçamento que você já fez ou a sua tabela. A gente aprende o seu formato de cobrança. PDF, imagem ou planilha, até 10 MB." opcional>
            <label className="flex items-center justify-center gap-2 h-14 rounded-xl border-2 border-dashed border-[#d9d4e8] bg-white text-[14px] font-semibold cursor-pointer active:scale-[0.99]" style={{ color: ROXO }}>
              <Paperclip className="w-4 h-4" />Escolher arquivos
              <input type="file" multiple className="hidden" accept=".pdf,image/*,.xlsx,.xls,.csv,.docx" onChange={e => { const fs = [...(e.target.files ?? [])]; setArquivos(a => [...a, ...fs].slice(0, 5)); e.target.value = "" }} />
            </label>
            {arquivos.length > 0 && <ul className="mt-2 space-y-1.5">{arquivos.map((a, i) => (
              <li key={i} className="flex items-center gap-2 rounded-xl bg-[#f6f5fa] px-3 py-2 text-[13px] text-[#4a4658]">
                <Paperclip className="w-3.5 h-3.5 shrink-0" /><span className="flex-1 truncate">{a.name}</span>
                {a.size > 10 * 1024 * 1024 && <span className="text-[#d33a3c] text-[12px]">grande demais</span>}
                <button type="button" onClick={() => setArquivos(x => x.filter((_, j) => j !== i))} aria-label="Tirar"><X className="w-4 h-4 text-[#9a97a5]" /></button>
              </li>))}</ul>}
          </Campo>
          <Campo rotulo="Como conheceu a ENYLA?" opcional><input className={inputCls()} value={d.comoConheceu ?? ""} onChange={e => set("comoConheceu", e.target.value)} placeholder="Indicação, Instagram, já trabalhamos juntos…" /></Campo>

          <div className="rounded-3xl p-5 text-white" style={{ background: "linear-gradient(150deg,#2a1a5e,#5b34c8)" }}>
            <p className="flex items-center gap-2 text-[15px] font-bold"><ShieldCheck className="w-5 h-5" />Como a parceria funciona</p>
            <ul className="mt-3 space-y-2 text-[13.5px] text-white/85 leading-snug">
              <li>• Os pedidos chegam pelo WhatsApp e no seu e-mail, com arquivo, medida, quantidade e prazo.</li>
              <li>• Conforme os pedidos forem enviados a você, nosso sistema passa a registrar internamente o tempo de entrega e a qualidade de cada trabalho.</li>
              <li>• É assim que distribuímos os pedidos: quem entrega no prazo e com qualidade passa a receber mais.</li>
              <li>• Seu gerente de contas na ENYLA: <b className="text-white">{GERENTE_PADRAO}</b>.</li>
            </ul>
          </div>
          <button type="button" data-erro={E("aceite") ? "" : undefined} onClick={() => set("aceite", !d.aceite)} className="w-full text-left flex gap-3 items-start">
            <span className={`mt-0.5 w-6 h-6 rounded-lg border-2 grid place-items-center shrink-0 ${d.aceite ? "text-white" : E("aceite") ? "border-[#d33a3c]" : "border-[#cfcbdb]"}`} style={d.aceite ? { background: ROXO, borderColor: ROXO } : undefined}>{d.aceite && <Check className="w-4 h-4" strokeWidth={3} />}</span>
            <span className="text-[14px] text-[#4a4658] leading-snug">Concordo que a ENYLA registre o tempo e a qualidade das entregas, e que as informações deste cadastro estão corretas.</span>
          </button>
          {E("aceite") && <p className="text-[13px] text-[#d33a3c] font-medium -mt-3">{E("aceite")}</p>}
          <input ref={site} name="site" tabIndex={-1} autoComplete="off" className="absolute -left-[9999px] w-px h-px opacity-0" aria-hidden />
          {erroEnvio && <p className="rounded-xl bg-[#fff1f1] text-[#c92f31] text-[13.5px] font-medium px-4 py-3">{erroEnvio}</p>}
        </>}
      </div>

      <div className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-[#efedf5]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-[640px] mx-auto px-5 py-3 flex gap-3">
          {passo > 0 && <button onClick={() => setPasso(passo - 1)} className="h-13 px-5 rounded-2xl bg-[#f1eff7] text-[#4a4658] text-[15px] font-semibold" style={{ height: 52 }}>Voltar</button>}
          <button onClick={avancar} disabled={enviando} className="flex-1 rounded-2xl text-white text-[16px] font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.99] transition shadow-[0_6px_20px_rgba(124,78,228,0.3)]" style={{ background: ROXO, height: 52 }}>
            {enviando ? <><Loader2 className="w-5 h-5 animate-spin" />Enviando…</> : passo === 4 ? <>Enviar cadastro<Check className="w-5 h-5" /></> : <>Continuar<ArrowRight className="w-5 h-5" /></>}
          </button>
        </div>
      </div>
    </main>
  )
}
