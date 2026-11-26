"use client"

// Parceiros ENYLA: cadastro de quem presta serviço. Em etapas curtas (empresa, base, contato, serviços, detalhes
// técnicos/preço/prazo, operação), gostoso no celular e no computador. O rascunho fica no aparelho.

import { useEffect, useMemo, useRef, useState } from "react"
import { Printer, Layers, Sparkles, Stamp, Mountain, Scissors, Package, Shapes, FileStack, Palette, FileCheck, Truck, Plus, Check, ChevronLeft, ArrowRight, Paperclip, X, Clock, BarChart3, ShieldCheck, Handshake, Loader2, MessageCircle, MapPin, Zap, Banknote, Wallet, Camera, Globe, Hand, Boxes } from "lucide-react"
import type { CenarioPublico } from "../lib/cenariosParceiros"
import { exemploDaEtapa, EXEMPLO_CADASTRO_TITULO, EXEMPLO_CADASTRO_VAZIO } from "../lib/exemploCadastro"
import {
  SERVICOS_PARCEIRO, GRUPOS_PARCEIRO, GRUPO_DO_SERVICO, servicosDosGrupos, cobraPorUnidadeOuHora, FORMAS_UNIDADE_OU_HORA, type GrupoServico, FORMAS_COBRANCA, PERGUNTAS, ROTULO_PRECO_CENARIO, cobraPorAcertoMilheiro, cenarioAtivo, ETAPAS_IDS, errosDaEtapa, mascaraDocumento, mascaraTelefone, mascaraCep, cnpjValido, EQUIPAMENTOS_PARCEIRO, GERENTE_PADRAO,
  type CadastroParceiro, type ServicoCadastrado, type IdServicoParceiro, type Pergunta, type Resposta, type Formato,
} from "../lib/parceiros"

const ICONE: Record<IdServicoParceiro, typeof Printer> = {
  impressaoOffset: Printer, impressaoDigital: Printer, laminacao: Layers, verniz: Sparkles, hotStamping: Stamp, relevo: Mountain,
  corteVinco: Scissors, colagem: Package, manuseio: Hand, montagem: Boxes, faca: Shapes, papel: FileStack, arte: Palette, fechamento: FileCheck, transporte: Truck, outro: Plus,
}
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ")
const NOMES_ETAPA: Record<(typeof ETAPAS_IDS)[number], string> = { atuacao: "O que vocês fazem", empresa: "Empresa", endereco: "Endereço", contato: "Contato", servicos: "Serviços", detalhes: "Detalhes", final: "Operação" }
const N = ETAPAS_IDS.length
const RASCUNHO = "parceiros:rascunho2"   // 2: a primeira etapa agora é "o que vocês fazem"
const ORIGEM_LINK = "parceiros:origem"
const ROXO = "#7c4ee4"

type Dados = Partial<CadastroParceiro> & { servicos: ServicoCadastrado[] }
const VAZIO: Dados = { tipoDocumento: "cnpj", servicos: [], uf: "" }

function Campo({ rotulo, dica, erro, children, opcional }: { rotulo: string; dica?: React.ReactNode; erro?: string; children: React.ReactNode; opcional?: boolean }) {
  return (
    <div className="block">
      <span className="flex items-baseline gap-2 text-[14px] font-semibold text-[#1d1a29]">{rotulo}{opcional && <span className="text-[12px] font-normal text-[#9a97a5]">opcional</span>}</span>
      {dica && <span className="block text-[12.5px] text-[#6b6878] mt-0.5 leading-snug">{dica}</span>}
      <span className="block mt-2">{children}</span>
      {erro && <span className="block text-[12.5px] text-[#d33a3c] mt-1.5 font-medium par-surge">{erro}</span>}
    </div>
  )
}
const inputCls = (erro?: string) => `w-full h-12 rounded-xl px-4 text-[16px] text-[#1d1a29] bg-[#f6f5fa] border ${erro ? "border-[#d33a3c] bg-[#fff6f6]" : "border-transparent"} focus:bg-white focus:border-[#7c4ee4] focus:outline-none focus:ring-4 focus:ring-[#7c4ee4]/15 transition placeholder:text-[#b1aebb]`
const Chip = ({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button type="button" onClick={onClick} aria-pressed={on}
    className={`h-10 px-3.5 rounded-full text-[13.5px] font-semibold border transition-all duration-200 active:scale-95 ${on ? "text-white" : "bg-white text-[#4a4658] border-[#e3e0ec]"}`} style={on ? { background: ROXO, borderColor: ROXO } : undefined}>{children}</button>
)

// Formato da folha: largura × altura em cm, com o retângulo desenhado em escala
function CampoFormato({ v, onChange }: { v?: Formato; onChange: (f: Formato | undefined) => void }) {
  const [l, setL] = useState(v?.l ? String(v.l).replace(".", ",") : "")
  const [a, setA] = useState(v?.a ? String(v.a).replace(".", ",") : "")
  const num = (s: string) => Number(s.replace(",", "."))
  const mudar = (nl: string, na: string) => { setL(nl); setA(na); const L = num(nl), A = num(na); onChange(L > 0 && A > 0 ? { l: L, a: A } : undefined) }
  const L = num(l), A = num(a), ok = L > 0 && A > 0
  const esc = ok ? 44 / Math.max(L, A) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <input enterKeyHint="next" inputMode="decimal" className={inputCls()} value={l} onChange={e => mudar(e.target.value.replace(/[^\d,.]/g, ""), a)} placeholder="Largura" aria-label="Largura em cm" />
        <span className="text-[#9a97a5] font-semibold">×</span>
        <input enterKeyHint="next" inputMode="decimal" className={inputCls()} value={a} onChange={e => mudar(l, e.target.value.replace(/[^\d,.]/g, ""))} placeholder="Altura" aria-label="Altura em cm" />
        <span className="text-[13px] text-[#6b6878] shrink-0">cm</span>
      </div>
      <span className="w-12 h-12 grid place-items-center shrink-0">
        <span className="rounded-[3px] border-2 transition-all duration-300" style={{ width: ok ? L * esc : 20, height: ok ? A * esc : 28, borderColor: ok ? ROXO : "#d9d4e8", background: ok ? "#7c4ee41a" : "transparent" }} />
      </span>
    </div>
  )
}

function PerguntaTecnica({ p, v, onChange }: { p: Pergunta; v: Resposta | undefined; onChange: (v: Resposta | undefined) => void }) {
  if (p.tipo === "multi") {
    const xs = (Array.isArray(v) ? v : []) as string[]
    return <Campo rotulo={p.rotulo} dica={p.dica ?? "Pode marcar mais de um"}><div className="flex flex-wrap gap-2">{p.opcoes!.map(o => <Chip key={o} on={xs.includes(o)} onClick={() => { const n = xs.includes(o) ? xs.filter(x => x !== o) : [...xs, o]; onChange(n.length ? n : undefined) }}>{o}</Chip>)}</div></Campo>
  }
  if (p.tipo === "um") return <Campo rotulo={p.rotulo} dica={p.dica}><div className="flex flex-wrap gap-2">{p.opcoes!.map(o => <Chip key={o} on={v === o} onClick={() => onChange(v === o ? undefined : o)}>{o}</Chip>)}</div></Campo>
  if (p.tipo === "simnao") return <Campo rotulo={p.rotulo} dica={p.dica}><div className="flex gap-2"><Chip on={v === true} onClick={() => onChange(v === true ? undefined : true)}>Sim</Chip><Chip on={v === false} onClick={() => onChange(v === false ? undefined : false)}>Não</Chip></div></Campo>
  if (p.tipo === "numero") return (
    <Campo rotulo={p.rotulo} dica={p.dica}>
      <div className="relative"><input enterKeyHint="next" inputMode="numeric" className={`${inputCls()} pr-28`} value={typeof v === "number" ? String(v) : ""} onChange={e => { const n = Number(e.target.value.replace(/\D/g, "")); onChange(n > 0 ? n : undefined) }} />
        {p.unidade && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-[#9a97a5] pointer-events-none">{p.unidade}</span>}</div>
    </Campo>
  )
  return <Campo rotulo={p.rotulo} dica={p.dica}><CampoFormato v={v as Formato | undefined} onChange={onChange} /></Campo>
}

// Rodapé da LP e do final
function Rodape({ whatsappGerente }: { whatsappGerente: string | null }) {
  return (
    <footer className="mt-14 text-white/75" style={{ background: "#140c33" }}>
      <div className="max-w-[1040px] mx-auto px-5 pt-10 pb-8 grid sm:grid-cols-[1.4fr_1fr_1fr] gap-8">
        <div>
          <img src="/brand/enyla-wordmark-light.png" alt="ENYLA" className="h-6" onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
          <p className="mt-3 text-[13.5px] leading-relaxed max-w-[320px]">Pedidos de impressão de todo o Brasil, produzidos com uma rede de parceiras de confiança.</p>
        </div>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-white/50">Fale com a gente</p>
          <ul className="mt-3 space-y-2 text-[14px]">
            {whatsappGerente && <li><a className="hover:text-white inline-flex items-center gap-2" href={`https://wa.me/${whatsappGerente}`} target="_blank" rel="noreferrer"><MessageCircle className="w-4 h-4" />Gerente de contas · {GERENTE_PADRAO}</a></li>}
            <li><a className="hover:text-white inline-flex items-center gap-2" href="https://instagram.com/enyla.embalagens" target="_blank" rel="noreferrer"><Camera className="w-4 h-4" />@enyla.embalagens</a></li>
            <li><a className="hover:text-white inline-flex items-center gap-2" href="https://enyla.com.br" target="_blank" rel="noreferrer"><Globe className="w-4 h-4" />enyla.com.br</a></li>
          </ul>
        </div>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-white/50">Parceiros ENYLA</p>
          <p className="mt-3 text-[13.5px] leading-relaxed">Gráficas, acabamentos, corte e vinco, colagem, faca, papel e transporte. Cadastro gratuito.</p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="max-w-[1040px] mx-auto px-5 py-4 text-[12px] text-white/45">© {new Date().getFullYear()} ENYLA Embalagens. Seus dados ficam só com a gente e são usados para enviar pedidos.</p>
      </div>
    </footer>
  )
}

export default function ParceirosForm({ whatsappGerente, cenarios = [] }: { whatsappGerente: string | null; cenarios?: CenarioPublico[] }) {
  const [passo, setPasso] = useState(-1)          // -1 = boas-vindas; 0..N-1 = etapas; N = enviado
  const [d, setD] = useState<Dados>(VAZIO)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [arquivos, setArquivos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [cepAchado, setCepAchado] = useState<boolean | null>(null)
  const [cnpjInfo, setCnpjInfo] = useState<{ situacao: string; ativa: boolean } | "nao_achou" | "buscando" | null>(null)
  const site = useRef<HTMLInputElement>(null)
  const conteudo = useRef<HTMLDivElement>(null)
  const numeroRef = useRef<HTMLInputElement>(null)
  const [anim, setAnim] = useState<"in-fwd" | "in-back" | "out-fwd" | "out-back">("in-fwd")
  const [sub, setSub] = useState(0)                // Detalhes: um serviço por vez
  const trocando = useRef(false)

  // Link da prospecção (?o=prospector&p=id): guarda a origem no aparelho para o envio, mesmo se a pessoa sair e voltar
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search), o = (q.get("o") ?? "").slice(0, 20)
      if (o) localStorage.setItem(ORIGEM_LINK, JSON.stringify({ o, p: (q.get("p") ?? "").replace(/\D/g, "").slice(0, 12) }))
    } catch { /* sem a origem: cadastro direto */ }
  }, [])
  const origemDoLink = (): { o: string; p: string } => { try { const v = JSON.parse(localStorage.getItem(ORIGEM_LINK) ?? "null"); return { o: String(v?.o ?? ""), p: String(v?.p ?? "") } } catch { return { o: "", p: "" } } }

  // Rascunho no aparelho (volta de onde parou)
  useEffect(() => { try { const r = JSON.parse(localStorage.getItem(RASCUNHO) ?? "null"); if (r?.d) { setD({ ...VAZIO, ...r.d }); if (typeof r.passo === "number" && r.passo >= 0 && r.passo < N) { setPasso(r.passo); if (typeof r.sub === "number") setSub(r.sub) } } } catch { /* sem rascunho */ } }, [])
  useEffect(() => { if (passo >= 0 && passo < N) try { localStorage.setItem(RASCUNHO, JSON.stringify({ d, passo, sub })) } catch { /* sem storage */ } }, [d, passo, sub])

  // Troca de etapa: a atual sai (160 ms), a página volta ao topo e a próxima entra pelo lado certo
  function irPara(n: number, novoSub?: number) {
    if (trocando.current || (n === passo && (novoSub ?? sub) === sub)) return
    const frente = n > passo || (n === passo && (novoSub ?? 0) > sub)
    const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const alvoSub = novoSub ?? (ETAPAS_IDS[n] === "detalhes" ? (frente ? 0 : Math.max(0, d.servicos.length - 1)) : 0)
    const trocar = () => { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); setPasso(n); setSub(alvoSub); setAnim(frente ? "in-fwd" : "in-back"); trocando.current = false }
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    if (semMovimento || passo < 0 || n >= N) { trocar(); return }
    trocando.current = true
    setAnim(frente ? "out-fwd" : "out-back")
    setTimeout(trocar, 160)
  }
  function mostrarErro() {
    setTimeout(() => {
      const el = document.querySelector("[data-erro]") as HTMLElement | null
      if (!el) return
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      el.classList.remove("par-shake"); void el.offsetWidth; el.classList.add("par-shake")
      setTimeout(() => el.classList.remove("par-shake"), 450)
    }, 30)
  }
  function aoTeclar(e: React.KeyboardEvent<HTMLDivElement>) {
    const alvo = e.target as HTMLElement
    if (e.key !== "Enter" || alvo.tagName !== "INPUT") return
    e.preventDefault()
    const campos = [...(conteudo.current?.querySelectorAll<HTMLElement>("input:not([type=file]):not([tabindex='-1']), select, textarea") ?? [])].filter(x => x.offsetParent)
    const i = campos.indexOf(alvo)
    if (i >= 0 && i < campos.length - 1) campos[i + 1].focus(); else avancar()
  }

  const set = <K extends keyof Dados>(k: K, v: Dados[K]) => { setD(x => ({ ...x, [k]: v })); setErros(e => { const n = { ...e }; delete n[k as string]; return n }) }
  const servico = (id: IdServicoParceiro) => d.servicos.find(s => s.id === id)
  const alternarServico = (id: IdServicoParceiro) => set("servicos", servico(id) ? d.servicos.filter(s => s.id !== id) : [...d.servicos, { id, cobranca: null, prazoDias: null, prazoVaria: false }])
  const mudarServico = (id: IdServicoParceiro, m: Partial<ServicoCadastrado>) => {
    setD(x => ({ ...x, servicos: x.servicos.map(s => s.id === id ? { ...s, ...m } : s) }))
    setErros(e => { const n = { ...e }; for (const k of Object.keys(n)) if (k.startsWith(`${id}.`)) delete n[k]; return n })
  }
  const atuacao = d.atuacao ?? []
  const alternarGrupo = (g: GrupoServico) => {
    const sai = atuacao.includes(g)
    setD(x => ({ ...x, atuacao: sai ? atuacao.filter(a => a !== g) : [...atuacao, g], servicos: sai ? x.servicos.filter(s => GRUPO_DO_SERVICO[s.id] !== g) : x.servicos }))
    setErros(e => { const n = { ...e }; delete n.atuacao; return n })
  }
  const mudarTecnico = (id: IdServicoParceiro, pid: string, v: Resposta | undefined) => (setErros(e => { const n = { ...e }; delete n[`${id}.${pid}`]; return n }), setD(x => ({ ...x, servicos: x.servicos.map(s => {
    if (s.id !== id) return s
    const t = { ...(s.tecnico ?? {}) }
    if (v === undefined) delete t[pid]; else t[pid] = v
    return { ...s, tecnico: t }
  }) })))

  // CEP: busca rua, bairro, cidade e UF (ViaCEP) e leva o cursor para o número
  async function buscarCep(cep: string) {
    const c = cep.replace(/\D/g, "")
    if (c.length !== 8) return
    setBuscandoCep(true); setCepAchado(null)
    try {
      const v = await fetch(`https://viacep.com.br/ws/${c}/json/`).then(r => r.json()) as { logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean }
      if (v.erro) { setCepAchado(false); return }
      setD(x => ({ ...x, rua: v.logradouro || x.rua, bairro: v.bairro || x.bairro, cidade: v.localidade || x.cidade, uf: v.uf || x.uf }))
      setErros(e => { const n = { ...e }; for (const k of ["cep", "rua", "bairro", "cidade", "uf"]) delete n[k]; return n })
      setCepAchado(true)
      setTimeout(() => numeroRef.current?.focus(), 80)
    } catch { setCepAchado(null) }
    finally { setBuscandoCep(false) }
  }

  // CNPJ: confere na Receita (BrasilAPI) e preenche razão social, nome e endereço que ainda estão vazios
  async function buscarCnpj(doc: string) {
    setCnpjInfo("buscando")
    try {
      const r = await fetch(`/api/parceiros/cnpj?c=${doc}`).then(x => x.json()) as { ok: boolean; dados?: { razaoSocial: string; nomeFantasia: string; situacao: string; ativa: boolean; cep: string; rua: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string } }
      if (!r.ok || !r.dados) { setCnpjInfo("nao_achou"); return }
      const x = r.dados
      setD(a => ({ ...a, razaoSocial: a.razaoSocial || x.razaoSocial, nomeFantasia: a.nomeFantasia || x.nomeFantasia || x.razaoSocial,
        cep: a.cep || x.cep, rua: a.rua || x.rua, numero: a.numero || x.numero, complemento: a.complemento || x.complemento, bairro: a.bairro || x.bairro, cidade: a.cidade || x.cidade, uf: a.uf || x.uf }))
      setErros(e => { const n = { ...e }; for (const k of ["nomeFantasia", "documento"]) delete n[k]; return n })
      setCnpjInfo({ situacao: x.situacao, ativa: x.ativa })
    } catch { setCnpjInfo(null) }   // sem consulta: o cadastro segue, a validação do dígito é local
  }

  function avancar() {
    const et = ETAPAS_IDS[passo]
    let e = errosDaEtapa(d, et)
    // Detalhes: confere só o serviço da tela e vai para o próximo
    if (et === "detalhes") { const atual = escolhidos[sub]?.id; e = Object.fromEntries(Object.entries(e).filter(([k]) => k.startsWith(`${atual}.`))) }
    setErros(e)
    if (Object.keys(e).length) { mostrarErro(); return }
    if (et === "detalhes" && sub < escolhidos.length - 1) { irPara(passo, sub + 1); return }
    if (passo < N - 1) irPara(passo + 1); else void enviar()
  }
  function voltar() {
    if (ETAPAS_IDS[passo] === "detalhes" && sub > 0) irPara(passo, sub - 1); else irPara(passo - 1)
  }
  async function enviar() {
    setEnviando(true); setErroEnvio(null)
    const f = new FormData()
    f.set("dados", JSON.stringify(d)); f.set("site", site.current?.value ?? "")
    const origem = origemDoLink(); f.set("o", origem.o); f.set("p", origem.p)
    for (const a of arquivos) f.append("arquivos", a)
    try {
      const r = await fetch("/api/parceiros/cadastro", { method: "POST", body: f }).then(x => x.json())
      if (!r.ok) { setErroEnvio(r.erro ?? "Não deu certo. Tente de novo."); if (r.campos) { setErros(r.campos); mostrarErro() } return }
      try { localStorage.removeItem(RASCUNHO); localStorage.removeItem(ORIGEM_LINK) } catch { /* ok */ }
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
      setPasso(N)
    } catch { setErroEnvio("Sem conexão. Confira a internet e tente de novo.") }
    finally { setEnviando(false) }
  }

  const escolhidos = useMemo(() => SERVICOS_PARCEIRO.filter(s => d.servicos.some(x => x.id === s.id)), [d.servicos])
  const fracaoSub = ETAPAS_IDS[passo] === "detalhes" && escolhidos.length ? (sub + 1) / (escolhidos.length + 1) : 0.5
  const progresso = passo < 0 ? 0 : Math.min(100, (passo + fracaoSub) / N * 100)

  // ── Boas-vindas (LP) ──
  const comecar = () => { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); setAnim("in-fwd"); setPasso(0) }
  if (passo === -1) return (
    <main className="min-h-[100dvh] bg-white">
      {/* Topo: foto de gráfica com o véu da marca, a promessa e os "pedidos pagos" chegando */}
      <section className="relative overflow-hidden">
        <picture>
          <source media="(min-width: 640px)" srcSet="/parceiros/grafica.jpg" />
          <img src="/parceiros/grafica-m.jpg" alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-105 lp-zoom" />
        </picture>
        <div className="absolute inset-0" style={{ background: "linear-gradient(165deg, rgba(26,14,64,0.92) 0%, rgba(58,30,140,0.80) 45%, rgba(124,78,228,0.52) 100%)" }} />
        <div className="absolute -right-32 -bottom-40 w-[420px] h-[420px] rounded-full bg-[#2fd39a]/10 blur-2xl" />
        <div className="relative max-w-[1040px] mx-auto px-5 pt-7 pb-14 sm:pt-10 sm:pb-20 grid lg:grid-cols-[1.15fr_1fr] gap-10 items-center">
          <div className="par-in-fwd">
            <img src="/brand/enyla-wordmark-light.png" alt="ENYLA" className="h-7 mb-10" onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur text-white text-[12.5px] font-semibold px-3 py-1"><Handshake className="w-3.5 h-3.5" />Parceiros ENYLA</span>
            <h1 className="mt-4 text-white text-[38px] sm:text-[52px] leading-[1.03] font-extrabold tracking-tight">Sua gráfica na rede de parceiras da ENYLA</h1>
            <p className="mt-4 text-white/85 text-[16.5px] sm:text-[18px] leading-relaxed max-w-[520px]">A ENYLA recebe pedidos de impressão do Brasil todo. Quando entra um pedido do que a sua gráfica faz, a gente passa pra você. Cadastre seus serviços e suas máquinas. Leva uns 5 minutos.</p>
            <button onClick={comecar} className="mt-7 w-full sm:w-auto inline-flex justify-center h-14 px-8 rounded-2xl bg-white text-[16.5px] font-bold items-center gap-2 active:scale-[0.99] transition shadow-[0_10px_30px_rgba(0,0,0,0.25)]" style={{ color: ROXO }}>
              Cadastrar minha gráfica<ArrowRight className="w-5 h-5" />
            </button>
          </div>
          {/* Notificações de pedido (ilustração de como os pedidos e pagamentos chegam) */}
          <div className="relative h-[196px] sm:h-[230px] lg:h-[300px]" aria-hidden>
            <div className="absolute left-0 right-6 sm:right-16 top-0 lp-flutua" style={{ animationDelay: "0s" }}>
              <div className="rounded-2xl bg-white/95 backdrop-blur shadow-[0_14px_40px_rgba(10,5,40,0.35)] p-3.5 flex items-center gap-3 par-in-fwd" style={{ animationDelay: ".15s" }}>
                <span className="w-11 h-11 rounded-xl grid place-items-center shrink-0 bg-[#13a06f] text-white"><Banknote className="w-5 h-5" /></span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-2"><span className="text-[12px] font-semibold text-[#13a06f]">Pagamento recebido</span><span className="text-[11px] text-[#9a97a5]">agora</span></span>
                  <span className="block text-[19px] font-extrabold text-[#1d1a29] leading-tight lp-num">R$ 2.480,00</span>
                  <span className="block text-[12px] text-[#6b6878] truncate">Corte e vinco · 12.000 caixas</span>
                </span>
              </div>
            </div>
            <div className="absolute right-0 left-10 sm:left-20 top-[92px] sm:top-[108px] lg:top-[128px] lp-flutua" style={{ animationDelay: "1.2s" }}>
              <div className="rounded-2xl bg-white/95 backdrop-blur shadow-[0_14px_40px_rgba(10,5,40,0.35)] p-3.5 flex items-center gap-3 par-in-fwd" style={{ animationDelay: ".35s" }}>
                <span className="w-11 h-11 rounded-xl grid place-items-center shrink-0 text-white" style={{ background: ROXO }}><Package className="w-5 h-5" /></span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-2"><span className="text-[12px] font-semibold" style={{ color: ROXO }}>Novo pedido para você</span><span className="text-[11px] text-[#9a97a5]">2 min</span></span>
                  <span className="block text-[15px] font-bold text-[#1d1a29] leading-tight">Colagem · fundo automático</span>
                  <span className="block text-[12px] text-[#6b6878] whitespace-nowrap">8.000 un · 4 dias úteis · <b className="text-[#13a06f]">R$ 1.150</b></span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Vantagens */}
      <section className="max-w-[1040px] mx-auto px-5 -mt-7 relative">
        <div className="rounded-3xl bg-white shadow-[0_10px_40px_rgba(40,20,90,0.12)] p-5 sm:p-7 grid sm:grid-cols-2 gap-5 ds-escalonado">
          {[
            { I: BarChart3, t: "Pedidos frequentes", s: "Trabalho recorrente para encher a sua agenda, sem você precisar correr atrás." },
            { I: Banknote, t: "Pagamento sem surpresa", s: "Valor e forma de pagamento combinados antes de começar cada pedido." },
            { I: Clock, t: "Quem entrega bem, recebe mais", s: "Registramos tempo e qualidade de cada trabalho. Parceiro pontual ganha prioridade." },
            { I: MessageCircle, t: `Gerente de contas: ${GERENTE_PADRAO}`, s: "Uma pessoa da ENYLA fala com você sempre que precisar." },
          ].map(({ I, t, s }) => (
            <div key={t} className="flex gap-3.5">
              <span className="w-11 h-11 rounded-2xl grid place-items-center shrink-0" style={{ background: "#7c4ee41a", color: ROXO }}><I className="w-5 h-5" /></span>
              <span><span className="block text-[15.5px] font-semibold text-[#1d1a29]">{t}</span><span className="block text-[13.5px] text-[#6b6878] leading-snug mt-0.5">{s}</span></span>
            </div>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section className="max-w-[1040px] mx-auto px-5 pt-12 pb-4">
        <p className="text-[12.5px] font-bold uppercase tracking-[0.14em]" style={{ color: ROXO }}>Como funciona</p>
        <h2 className="mt-1.5 text-[26px] sm:text-[30px] font-extrabold text-[#1d1a29] tracking-tight leading-tight">Do cadastro ao dinheiro na conta</h2>
        <ol className="mt-6 grid sm:grid-cols-3 gap-3">
          {[
            { n: "1", I: FileCheck, t: "Cadastre o que você faz", s: "Serviços, máquina, prazo e como você cobra. Uns 5 minutos." },
            { n: "2", I: Package, t: "Receba os pedidos", s: "Arquivo, medida, quantidade e prazo chegam pelo WhatsApp." },
            { n: "3", I: Banknote, t: "Entregue e receba", s: "Pagamento como combinado. Quem entrega bem recebe mais pedidos." },
          ].map(({ n, I, t, s }) => (
            <li key={n} className="relative rounded-2xl bg-[#f8f7fc] p-5 overflow-hidden">
              <span className="absolute -right-2 -top-4 text-[86px] font-black text-[#7c4ee4]/[0.07] leading-none select-none">{n}</span>
              <span className="w-10 h-10 rounded-xl grid place-items-center text-white" style={{ background: n === "3" ? "#13a06f" : ROXO }}><I className="w-5 h-5" /></span>
              <p className="mt-3 text-[15.5px] font-bold text-[#1d1a29]">{t}</p>
              <p className="mt-1 text-[13.5px] text-[#6b6878] leading-snug">{s}</p>
            </li>
          ))}
        </ol>
        <button onClick={comecar} className="mt-8 w-full sm:w-auto sm:px-10 h-14 rounded-2xl text-white text-[16.5px] font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition shadow-[0_8px_24px_rgba(124,78,228,0.35)]" style={{ background: ROXO }}>
          Quero ser parceiro<ArrowRight className="w-5 h-5" />
        </button>
        <p className="text-[12.5px] text-[#9a97a5] mt-3">Leva uns 5 minutos · você pode parar e voltar depois · sem custo</p>
      </section>
      <Rodape whatsappGerente={whatsappGerente} />
    </main>
  )

  // ── Enviado ──
  if (passo === N) return (
    <main className="min-h-[100dvh] bg-white flex flex-col">
      <div className="flex-1 grid place-items-center px-5">
      <div className="max-w-[460px] w-full text-center py-16 par-in-fwd">
        <span className="mx-auto w-20 h-20 rounded-full grid place-items-center bg-[#2fd39a]/15 text-[#13a06f] ds-pop"><Check className="w-10 h-10" strokeWidth={2.5} /></span>
        <h1 className="mt-6 text-[28px] font-extrabold text-[#1d1a29] tracking-tight">Cadastro recebido!</h1>
        <p className="mt-3 text-[15.5px] text-[#4a4658] leading-relaxed">Obrigado, {d.responsavel?.split(" ")[0] || "parceiro"}. O {GERENTE_PADRAO}, seu gerente de contas na ENYLA, vai olhar o seu cadastro e falar com você pelo WhatsApp.</p>
        <div className="mt-6 rounded-2xl bg-[#f6f5fa] p-4 text-left text-[13.5px] text-[#4a4658] leading-relaxed">
          <p className="font-semibold text-[#1d1a29] mb-1">E depois?</p>
          Os pedidos chegam pelo WhatsApp e no seu e-mail ({d.email}), com arquivo, medida e prazo. A cada entrega, registramos tempo e qualidade, e quem entrega bem passa a receber mais.
        </div>
        {whatsappGerente && <a href={`https://wa.me/${whatsappGerente}?text=${encodeURIComponent(`Oi, ${GERENTE_PADRAO}! Acabei de me cadastrar como parceiro: ${d.nomeFantasia}.`)}`} className="mt-6 inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-[#25d366] text-white font-semibold text-[15px]"><MessageCircle className="w-5 h-5" />Falar com o {GERENTE_PADRAO}</a>}
      </div>
      </div>
      <Rodape whatsappGerente={whatsappGerente} />
    </main>
  )

  // ── Etapas ──
  const et = ETAPAS_IDS[passo]
  const E = (k: string) => erros[k]
  const marca = (k: string | string[]) => ([] as string[]).concat(k).some(x => erros[x]) ? "" : undefined
  return (
    <main className="min-h-[100dvh] bg-[#fbfaff]">
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-[#efedf5]">
        <div className="max-w-[640px] mx-auto px-5 h-14 flex items-center gap-3">
          <button onClick={voltar} aria-label="Voltar" className="w-9 h-9 -ml-2 rounded-xl grid place-items-center text-[#4a4658] active:bg-[#f1eff7]"><ChevronLeft className="w-5 h-5" /></button>
          <div className="flex-1">
            <p className="text-[12px] font-semibold text-[#9a97a5] leading-none">Etapa {passo + 1} de {N}</p>
            <p key={`${passo}-${sub}`} className="text-[15px] font-bold text-[#1d1a29] leading-tight mt-0.5 par-surge truncate">{et === "detalhes" && escolhidos[sub] ? `${escolhidos[sub].nome}${escolhidos.length > 1 ? ` · ${sub + 1} de ${escolhidos.length}` : ""}` : NOMES_ETAPA[et]}</p>
          </div>
          <span className="text-[12px] font-semibold" style={{ color: ROXO }}>Parceiros ENYLA</span>
        </div>
        <div className="h-1 bg-[#efedf5]"><div className="h-full transition-all duration-500" style={{ width: `${progresso}%`, background: ROXO }} /></div>
      </div>

      <div className="max-w-[640px] lg:max-w-[1000px] mx-auto lg:grid lg:grid-cols-[minmax(0,640px)_1fr] lg:gap-8 lg:items-start">
      <div ref={conteudo} onKeyDown={aoTeclar} className={`px-5 pt-6 pb-36 space-y-6 par-${anim}`} key={`${passo}-${sub}`}>
        {et === "atuacao" && <>
          <div>
            <h2 className="text-[24px] font-extrabold text-[#1d1a29] tracking-tight leading-tight">O que vocês fazem?</h2>
            <p className="text-[14px] text-[#6b6878] mt-1.5">Marque tudo o que a sua empresa faz. Com isso a gente só pergunta o que importa para o seu tipo de serviço.</p>
          </div>
          <div className="grid gap-2.5" data-erro={marca("atuacao")}>
            {GRUPOS_PARCEIRO.map(g => {
              const on = atuacao.includes(g.id)
              return (
                <button key={g.id} type="button" onClick={() => alternarGrupo(g.id)} aria-pressed={on}
                  className={`relative text-left rounded-2xl p-4 pr-12 border-2 transition-all duration-200 active:scale-[0.98] ${on ? "bg-[#7c4ee4]/[0.07]" : "bg-white border-[#ece9f4]"}`} style={on ? { borderColor: ROXO } : undefined}>
                  <span className="block text-[16px] font-semibold text-[#1d1a29] leading-tight">{g.nome}</span>
                  <span className="block text-[13px] text-[#8a8796] leading-snug mt-0.5">{g.dica}</span>
                  {on && <span className="absolute top-1/2 -translate-y-1/2 right-4 w-6 h-6 rounded-full grid place-items-center text-white ds-pop" style={{ background: ROXO }}><Check className="w-4 h-4" strokeWidth={3} /></span>}
                </button>
              )
            })}
          </div>
          {E("atuacao") && <p className="text-[13px] text-[#d33a3c] font-medium">{E("atuacao")}</p>}
        </>}

        {et === "empresa" && <>
          <h2 className="text-[24px] font-extrabold text-[#1d1a29] tracking-tight leading-tight">Conta um pouco da sua empresa</h2>
          <div data-erro={marca("nomeFantasia")}><Campo rotulo="Nome da empresa" dica="Como vocês são conhecidos no mercado" erro={E("nomeFantasia")}>
            <input enterKeyHint="next" className={inputCls(E("nomeFantasia"))} value={d.nomeFantasia ?? ""} onChange={e => set("nomeFantasia", e.target.value)} placeholder="Ex.: Gráfica Bom Corte" autoComplete="organization" />
          </Campo></div>
          <div data-erro={marca("documento")}><Campo rotulo={d.tipoDocumento === "cpf" ? "CPF" : "CNPJ"} erro={E("documento")}>
            <div className="flex p-1 rounded-xl bg-[#f1eff7] w-fit mb-2">
              {(["cnpj", "cpf"] as const).map(t => <button key={t} type="button" onClick={() => { set("tipoDocumento", t); set("documento", "") }} className={`h-9 px-4 rounded-lg text-[13.5px] font-semibold transition ${d.tipoDocumento === t ? "bg-white shadow-sm text-[#1d1a29]" : "text-[#6b6878]"}`}>{t === "cnpj" ? "Tenho CNPJ" : "Ainda não tenho CNPJ"}</button>)}
            </div>
            <input enterKeyHint="next" className={inputCls(E("documento"))} inputMode="numeric" value={mascaraDocumento(d.documento ?? "", d.tipoDocumento ?? "cnpj")} onChange={e => { const v = e.target.value.replace(/\D/g, ""); set("documento", v); setCnpjInfo(null); if (d.tipoDocumento === "cnpj" && v.length === 14 && cnpjValido(v)) void buscarCnpj(v) }} placeholder={d.tipoDocumento === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"} />
            {d.tipoDocumento === "cnpj" && cnpjInfo === "buscando" && <span className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-[#6b6878]"><Loader2 className="w-3.5 h-3.5 animate-spin" />Conferindo o CNPJ…</span>}
            {d.tipoDocumento === "cnpj" && cnpjInfo && typeof cnpjInfo === "object" && <span className={`mt-2 flex items-center gap-1.5 text-[12.5px] font-medium par-surge ${cnpjInfo.ativa ? "text-[#13a06f]" : "text-[#b26a00]"}`}>{cnpjInfo.ativa ? <Check className="w-3.5 h-3.5" /> : null}CNPJ encontrado · situação {cnpjInfo.situacao.toLowerCase() || "não informada"}{cnpjInfo.ativa ? "" : ". Confira se é o CNPJ certo."}</span>}
          </Campo></div>
          {d.tipoDocumento === "cnpj" && <Campo rotulo="Razão social" opcional>
            <input enterKeyHint="next" className={inputCls()} value={d.razaoSocial ?? ""} onChange={e => set("razaoSocial", e.target.value)} placeholder="Como está no CNPJ" />
          </Campo>}
        </>}

        {et === "endereco" && <>
          <div>
            <h2 className="text-[24px] font-extrabold text-[#1d1a29] tracking-tight leading-tight">Onde fica a sua base?</h2>
            <p className="text-[14px] text-[#6b6878] mt-1.5">É daqui que a gente leva e busca o material. Com o endereço certinho, o motorista chega direto e o frete sai mais barato.</p>
          </div>
          <div data-erro={marca("cep")}><Campo rotulo="CEP" erro={E("cep")} dica={buscandoCep ? <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Buscando o endereço…</span> : cepAchado === false ? "Não achamos esse CEP. Preencha o endereço abaixo." : cepAchado ? <span className="inline-flex items-center gap-1.5 text-[#13a06f] font-medium par-surge"><Check className="w-3.5 h-3.5" />Endereço encontrado. Confira e complete o número.</span> : "A gente preenche o resto para você"}>
            <input enterKeyHint="next" className={`${inputCls(E("cep"))} max-w-[200px]`} inputMode="numeric" autoComplete="postal-code" value={mascaraCep(d.cep ?? "")} placeholder="00000-000"
              onChange={e => { const v = e.target.value.replace(/\D/g, "").slice(0, 8); set("cep", v); if (v.length === 8) void buscarCep(v); else setCepAchado(null) }} />
          </Campo></div>
          <div data-erro={marca("rua")}><Campo rotulo="Rua" erro={E("rua")}><input enterKeyHint="next" className={inputCls(E("rua"))} value={d.rua ?? ""} onChange={e => set("rua", e.target.value)} autoComplete="address-line1" /></Campo></div>
          <div className="grid grid-cols-[120px_1fr] gap-3" data-erro={marca("numero")}>
            <Campo rotulo="Número" erro={E("numero")}><input ref={numeroRef} enterKeyHint="next" className={inputCls(E("numero"))} value={d.numero ?? ""} onChange={e => set("numero", e.target.value)} placeholder="123 ou s/n" /></Campo>
            <Campo rotulo="Complemento" opcional><input enterKeyHint="next" className={inputCls()} value={d.complemento ?? ""} onChange={e => set("complemento", e.target.value)} placeholder="Galpão 2, fundos…" autoComplete="address-line2" /></Campo>
          </div>
          <div data-erro={marca("bairro")}><Campo rotulo="Bairro" erro={E("bairro")}><input enterKeyHint="next" className={inputCls(E("bairro"))} value={d.bairro ?? ""} onChange={e => set("bairro", e.target.value)} /></Campo></div>
          <div className="grid grid-cols-[1fr_96px] gap-3" data-erro={marca(["cidade", "uf"])}>
            <Campo rotulo="Cidade" erro={E("cidade")}><input enterKeyHint="next" className={inputCls(E("cidade"))} value={d.cidade ?? ""} onChange={e => set("cidade", e.target.value)} autoComplete="address-level2" /></Campo>
            <Campo rotulo="UF" erro={E("uf")}>
              <select className={inputCls(E("uf"))} value={d.uf ?? ""} onChange={e => set("uf", e.target.value)}><option value="">—</option>{UFS.map(u => <option key={u}>{u}</option>)}</select>
            </Campo>
          </div>
          <Campo rotulo="Ponto de referência ou como chegar" dica="Portão de carga, horário de recebimento, interfone…" opcional>
            <input enterKeyHint="next" className={inputCls()} value={d.referencia ?? ""} onChange={e => set("referencia", e.target.value)} />
          </Campo>
          <p className="flex items-start gap-2 text-[12.5px] text-[#6b6878]"><MapPin className="w-4 h-4 shrink-0 mt-px" style={{ color: ROXO }} />Usamos o endereço só para levar e buscar material e calcular o frete.</p>
        </>}

        {et === "contato" && <>
          <h2 className="text-[24px] font-extrabold text-[#1d1a29] tracking-tight leading-tight">Como a gente fala com você?</h2>
          <div data-erro={marca("responsavel")}><Campo rotulo="Seu nome" erro={E("responsavel")}><input enterKeyHint="next" className={inputCls(E("responsavel"))} value={d.responsavel ?? ""} onChange={e => set("responsavel", e.target.value)} autoComplete="name" /></Campo></div>
          <div data-erro={marca("whatsapp")}><Campo rotulo="WhatsApp" dica="É por aqui que os pedidos chegam primeiro" erro={E("whatsapp")}>
            <input enterKeyHint="next" className={inputCls(E("whatsapp"))} inputMode="tel" value={mascaraTelefone(d.whatsapp ?? "")} onChange={e => set("whatsapp", e.target.value.replace(/\D/g, ""))} placeholder="(11) 90000-0000" autoComplete="tel" />
          </Campo></div>
          <div data-erro={marca("email")}><Campo rotulo="Seu melhor e-mail" dica="Você também recebe por lá os pedidos que chegarem pelo WhatsApp, com os arquivos." erro={E("email")}>
            <input enterKeyHint="next" className={inputCls(E("email"))} type="email" inputMode="email" value={d.email ?? ""} onChange={e => set("email", e.target.value)} placeholder="voce@empresa.com.br" autoComplete="email" />
          </Campo></div>
          <Campo rotulo="Quem recebe o material na produção" dica="Nome e telefone, se for outra pessoa" opcional>
            <input enterKeyHint="next" className={inputCls()} value={d.contatoProducao ?? ""} onChange={e => set("contatoProducao", e.target.value)} placeholder="Ex.: Marcos · (11) 98888-0000" />
          </Campo>
        </>}

        {et === "servicos" && <>
          <div>
            <h2 className="text-[24px] font-extrabold text-[#1d1a29] tracking-tight leading-tight">Vocês prestam qual serviço?</h2>
            <p className="text-[14px] text-[#6b6878] mt-1.5">Dentro do que você marcou, escolha tudo o que fazem. Na próxima etapa a gente entende cada um.</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5" data-erro={marca("servicos")}>
            {servicosDosGrupos(atuacao).map(s => {
              const on = !!servico(s.id), I = ICONE[s.id]
              return (
                <button key={s.id} type="button" onClick={() => alternarServico(s.id)} aria-pressed={on}
                  className={`relative text-left rounded-2xl p-3.5 border-2 transition-all duration-200 active:scale-[0.97] ${on ? "bg-[#7c4ee4]/[0.07]" : "bg-white border-[#ece9f4]"}`} style={on ? { borderColor: ROXO } : undefined}>
                  <span className="w-9 h-9 rounded-xl grid place-items-center mb-2 transition-colors duration-200" style={{ background: on ? ROXO : "#f1eff7", color: on ? "#fff" : "#6b6878" }}><I className="w-[18px] h-[18px]" /></span>
                  <span className="block text-[14px] font-semibold text-[#1d1a29] leading-tight">{s.nome}</span>
                  <span className="block text-[12px] text-[#8a8796] leading-snug mt-0.5">{s.dica}</span>
                  {on && <span className="absolute top-3 right-3 w-5 h-5 rounded-full grid place-items-center text-white ds-pop" style={{ background: ROXO }}><Check className="w-3.5 h-3.5" strokeWidth={3} /></span>}
                </button>
              )
            })}
          </div>
          {E("servicos") && <p className="text-[13px] text-[#d33a3c] font-medium">{E("servicos")}</p>}
        </>}

        {et === "detalhes" && <>
          {sub === 0 && <div className="par-surge">
            <h2 className="text-[24px] font-extrabold text-[#1d1a29] tracking-tight leading-tight">Conta como cada serviço funciona</h2>
            <p className="text-[14px] text-[#6b6878] mt-1.5">Um serviço por vez. Com isso a gente manda para você só o que cabe na sua máquina. Marque o que você faz: só o que você marcar pede preço de exemplo. O resto é opcional, menos como você cobra e o prazo.</p>
          </div>}
          {escolhidos.length > 1 && <div className="flex gap-1.5" aria-hidden>{escolhidos.map((x, i) => <span key={x.id} className="h-1.5 flex-1 rounded-full transition-colors duration-300" style={{ background: i <= sub ? ROXO : "#e6e2f0" }} />)}</div>}
          {escolhidos.filter((_, i) => i === sub).map(sv => {
            const s = servico(sv.id)!, I = ICONE[sv.id]
            const forma = FORMAS_COBRANCA.find(f => f.id === s.cobranca)
            const temErro = Object.keys(erros).some(k => k.startsWith(`${sv.id}.`))
            const perguntas = PERGUNTAS[sv.id] ?? []
            const simples = cobraPorUnidadeOuHora(sv.id), porAcerto = cobraPorAcertoMilheiro(sv.id)
            const cenariosDoServico = cenarios.filter(x => x.servicoId === sv.id && cenarioAtivo(x.id, s.tecnico))
            return (
              <section key={sv.id} className={`rounded-3xl bg-white p-5 border ${temErro ? "border-[#d33a3c]/40" : "border-[#ece9f4]"} shadow-[0_2px_10px_rgba(40,20,90,0.04)] space-y-5`}>
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-2xl grid place-items-center text-white" style={{ background: ROXO }}><I className="w-5 h-5" /></span>
                  <p className="text-[17px] font-bold text-[#1d1a29]">{sv.id === "outro" ? (s.qual || "Outro serviço") : sv.nome}</p>
                </div>
                {sv.id === "outro" && <div data-erro={marca(`${sv.id}.qual`)}><Campo rotulo="Qual serviço?" erro={E(`${sv.id}.qual`)}><input enterKeyHint="next" className={inputCls(E(`${sv.id}.qual`))} value={s.qual ?? ""} onChange={e => mudarServico(sv.id, { qual: e.target.value })} /></Campo></div>}

                {perguntas.filter(p => porAcerto || p.id !== "formatoMax").map(p => porAcerto && p.id === "formatoMax"
                  ? <div key={p.id} data-erro={marca(`${sv.id}.formatoMax`)}><Campo rotulo="Formato da máquina" dica="A maior folha que a máquina aceita, em cm" erro={E(`${sv.id}.formatoMax`)}><CampoFormato v={s.tecnico?.formatoMax as Formato | undefined} onChange={v => mudarTecnico(sv.id, p.id, v)} /></Campo></div>
                  : p.id === "buscaEntrega"
                    ? <div key={p.id} data-erro={marca(`${sv.id}.buscaEntrega`)}><PerguntaTecnica p={p} v={s.tecnico?.[p.id]} onChange={v => mudarTecnico(sv.id, p.id, v)} />{E(`${sv.id}.buscaEntrega`) && <p className="text-[12.5px] text-[#d33a3c] mt-1.5 font-medium par-surge">{E(`${sv.id}.buscaEntrega`)}</p>}</div>
                    : <PerguntaTecnica key={p.id} p={p} v={s.tecnico?.[p.id]} onChange={v => mudarTecnico(sv.id, p.id, v)} />)}

                {perguntas.length > 0 && <div className="h-px bg-[#efedf5]" />}
                {cenariosDoServico.map(cenario => {
                  const k = `${sv.id}.preco.${cenario.id}`
                  return (
                    <div key={cenario.id} data-erro={marca(k)} className={`rounded-2xl p-4 bg-[#7c4ee4]/[0.05] border ${E(k) ? "border-[#d33a3c]/50" : "border-[#7c4ee4]/15"}`}>
                      <Campo rotulo={ROTULO_PRECO_CENARIO[cenario.id] ?? "Preço para este exemplo (R$)"} erro={E(k)}
                        dica={<span><b className="text-[#4a4658]">Exemplo:</b> {cenario.enunciado} Quanto você cobraria por este trabalho? É só uma referência, cada pedido a gente combina com você.</span>}>
                        <input enterKeyHint="next" className={inputCls(E(k))} inputMode="decimal" value={s.precosExemplo?.[cenario.id] ?? ""} placeholder="0,00"
                          onChange={e => {
                            const n = Number(e.target.value.replace(",", "."))
                            const precos = { ...s.precosExemplo }; if (n > 0) precos[cenario.id] = n; else delete precos[cenario.id]
                            mudarServico(sv.id, { precosExemplo: precos, cenarioVersoes: { ...s.cenarioVersoes, [cenario.id]: cenario.versao } })
                          }} />
                      </Campo>
                    </div>
                  )
                })}
                {porAcerto && (
                  <div className="grid grid-cols-2 gap-3">
                    <div data-erro={marca(`${sv.id}.acerto`)}><Campo rotulo="Acerto (R$)" erro={E(`${sv.id}.acerto`)}><input enterKeyHint="next" className={inputCls(E(`${sv.id}.acerto`))} inputMode="decimal" value={s.acerto ?? ""} onChange={e => mudarServico(sv.id, { cobranca: "acertoMilheiro", acerto: Number(e.target.value.replace(",", ".")) || null })} placeholder="0,00" /></Campo></div>
                    <div data-erro={marca(`${sv.id}.valor`)}><Campo rotulo="Valor do milheiro (R$)" erro={E(`${sv.id}.valor`)}><input enterKeyHint="next" className={inputCls(E(`${sv.id}.valor`))} inputMode="decimal" value={s.valor ?? ""} onChange={e => mudarServico(sv.id, { cobranca: "acertoMilheiro", valor: Number(e.target.value.replace(",", ".")) || null })} placeholder="0,00" /></Campo></div>
                  </div>
                )}
                {!porAcerto && <div data-erro={marca(`${sv.id}.cobranca`)}><Campo rotulo="Como você cobra?" erro={E(`${sv.id}.cobranca`)}>
                  <div className="flex flex-wrap gap-2">{FORMAS_COBRANCA.filter(f => !simples || (FORMAS_UNIDADE_OU_HORA as readonly string[]).includes(f.id)).map(f => <Chip key={f.id} on={s.cobranca === f.id} onClick={() => mudarServico(sv.id, { cobranca: f.id })}>{f.nome}</Chip>)}</div>
                </Campo></div>}
                {!porAcerto && forma?.unidade && (
                  <div key={s.cobranca} data-erro={marca(`${sv.id}.valor`)} className={`grid gap-3 par-surge ${s.cobranca === "acertoMilheiro" ? "grid-cols-2" : "grid-cols-1"}`}>
                    {s.cobranca === "acertoMilheiro" && <Campo rotulo="Acerto (R$)" opcional><input enterKeyHint="next" className={inputCls()} inputMode="decimal" value={s.acerto ?? ""} onChange={e => mudarServico(sv.id, { acerto: Number(e.target.value.replace(",", ".")) || null })} placeholder="0,00" /></Campo>}
                    <Campo rotulo={`Valor ${forma.unidade} (R$)`} dica={s.cobranca === "acertoMilheiro" ? undefined : "Um valor médio de referência"} opcional={!simples} erro={E(`${sv.id}.valor`)}>
                      <input enterKeyHint="next" className={inputCls(E(`${sv.id}.valor`))} inputMode="decimal" value={s.valor ?? ""} onChange={e => mudarServico(sv.id, { valor: Number(e.target.value.replace(",", ".")) || null })} placeholder="0,00" />
                    </Campo>
                  </div>
                )}
                {(s.cobranca === "tabela" || s.cobranca === "varia") && <p key={s.cobranca} className="text-[13px] text-[#6b6878] -mt-2 par-surge">Perfeito. Na última etapa você pode mandar a tabela ou um orçamento que já fez: a gente aprende o seu jeito de cobrar.</p>}
                <Campo rotulo="Pedido mínimo" opcional><input enterKeyHint="next" className={inputCls()} value={s.minimo ?? ""} onChange={e => mudarServico(sv.id, { minimo: e.target.value })} placeholder="Ex.: 1.000 folhas, R$ 150" /></Campo>
                <Campo rotulo="Algo mais sobre esse serviço?" opcional>
                  <textarea className={`${inputCls()} h-24 py-3 resize-none`} value={s.obs ?? ""} onChange={e => mudarServico(sv.id, { obs: e.target.value })} placeholder="Limitações, especialidades, o que faz melhor…" />
                </Campo>

                {/* Prazo por último, com o porquê vale a pena informar */}
                <div data-erro={marca(`${sv.id}.prazo`)} className={`rounded-2xl p-4 bg-[#7c4ee4]/[0.05] border ${E(`${sv.id}.prazo`) ? "border-[#d33a3c]/50" : "border-[#7c4ee4]/15"}`}>
                  <Campo rotulo="Qual o seu prazo médio?" erro={E(`${sv.id}.prazo`)}
                    dica={<span className="flex items-start gap-1.5"><Zap className="w-3.5 h-3.5 shrink-0 mt-[2px]" style={{ color: ROXO }} /><span>Quem informa o prazo médio <b className="text-[#4a4658]">recebe primeiro</b> os pedidos com data marcada. É uma média em dias úteis, não um compromisso: cada pedido a gente combina com você.</span></span>}>
                    <div className={`par-colapsa ${s.prazoVaria ? "fechado" : ""}`} aria-hidden={s.prazoVaria}><div>
                      <div className="flex items-center gap-3 pb-0.5">
                        <button type="button" onClick={() => mudarServico(sv.id, { prazoDias: Math.max(1, (s.prazoDias ?? 2) - 1) })} className="w-12 h-12 rounded-xl bg-white text-[22px] font-bold text-[#4a4658] active:scale-95 border border-[#e3e0ec]">−</button>
                        <div className="flex-1 h-12 rounded-xl bg-white grid place-items-center border border-[#e3e0ec]">
                          <span className="text-[18px] font-bold text-[#1d1a29]"><span key={s.prazoDias ?? 0} className="par-bump">{s.prazoDias ?? "—"}</span> <span className="text-[13px] font-medium text-[#6b6878]">{s.prazoDias === 1 ? "dia útil" : "dias úteis"}</span></span>
                        </div>
                        <button type="button" onClick={() => mudarServico(sv.id, { prazoDias: Math.min(60, (s.prazoDias ?? 0) + 1) })} className="w-12 h-12 rounded-xl text-white text-[22px] font-bold active:scale-95" style={{ background: ROXO }}>+</button>
                      </div>
                    </div></div>
                    <button type="button" onClick={() => mudarServico(sv.id, { prazoVaria: !s.prazoVaria, prazoDias: s.prazoVaria ? 3 : null })}
                      className={`${s.prazoVaria ? "mt-0" : "mt-2.5"} w-full text-left rounded-xl px-3.5 py-3 border flex gap-3 items-start transition-all duration-300 bg-white ${s.prazoVaria ? "" : "border-[#ece9f4]"}`} style={s.prazoVaria ? { borderColor: ROXO } : undefined}>
                      <span className={`mt-0.5 w-5 h-5 rounded-md border-2 grid place-items-center shrink-0 transition ${s.prazoVaria ? "text-white" : "border-[#cfcbdb]"}`} style={s.prazoVaria ? { background: ROXO, borderColor: ROXO } : undefined}>{s.prazoVaria && <Check className="w-3.5 h-3.5 ds-pop" strokeWidth={3} />}</span>
                      <span className="text-[13.5px] text-[#4a4658] leading-snug">Não consigo mensurar agora: varia muito de pedido para pedido, a ponto de eu não ter uma média ou tabela.</span>
                    </button>
                    {s.prazoVaria && <p className="mt-2 text-[12.5px] text-[#6b6878] par-surge">Tudo bem! Você continua recebendo pedidos; o prazo a gente combina em cada um.</p>}
                  </Campo>
                </div>
              </section>
            )
          })}
        </>}

        {et === "final" && <>
          <h2 className="text-[24px] font-extrabold text-[#1d1a29] tracking-tight leading-tight">Sua operação</h2>
          <Campo rotulo="Equipamentos" dica="Marque o que vocês têm. Pode marcar mais de um">
            <div className="flex flex-wrap gap-2">{EQUIPAMENTOS_PARCEIRO.map(q => { const xs = d.equipamentos ?? []; return <Chip key={q} on={xs.includes(q)} onClick={() => set("equipamentos", xs.includes(q) ? xs.filter(x => x !== q) : [...xs, q])}>{q}</Chip> })}</div>
          </Campo>
          <Campo rotulo="Outros equipamentos" dica="Só se não estiver na lista. Marca e modelo ajudam (ex.: Heidelberg Speedmaster, Bobst SP 102)" opcional>
            <textarea className={`${inputCls()} h-24 py-3 resize-none`} value={d.maquinas ?? ""} onChange={e => set("maquinas", e.target.value)} />
          </Campo>
          <Campo rotulo="Capacidade" dica="Quanto vocês conseguem por dia ou semana" opcional>
            <input enterKeyHint="next" className={inputCls()} value={d.capacidade ?? ""} onChange={e => set("capacidade", e.target.value)} placeholder="Ex.: 20 mil folhas por dia" />
          </Campo>
          <Campo rotulo="Horário de funcionamento" opcional>
            <input enterKeyHint="next" className={inputCls()} value={d.horario ?? ""} onChange={e => set("horario", e.target.value)} placeholder="Ex.: seg a sex, 8h às 18h; sábado até 12h" />
          </Campo>
          <Campo rotulo="Tabela de preços ou orçamento de exemplo" dica="Mande um orçamento que você já fez ou a sua tabela. A gente aprende o seu formato de cobrança. PDF, imagem ou planilha, até 10 MB." opcional>
            <label className="flex items-center justify-center gap-2 h-14 rounded-xl border-2 border-dashed border-[#d9d4e8] bg-white text-[14px] font-semibold cursor-pointer active:scale-[0.99]" style={{ color: ROXO }}>
              <Paperclip className="w-4 h-4" />Escolher arquivos
              <input type="file" multiple className="hidden" accept=".pdf,image/*,.xlsx,.xls,.csv,.docx" onChange={e => { const fs = [...(e.target.files ?? [])]; setArquivos(a => [...a, ...fs].slice(0, 5)); e.target.value = "" }} />
            </label>
            {arquivos.length > 0 && <ul className="mt-2 space-y-1.5">{arquivos.map((a, i) => (
              <li key={i} className="flex items-center gap-2 rounded-xl bg-[#f6f5fa] px-3 py-2 text-[13px] text-[#4a4658] par-surge">
                <Paperclip className="w-3.5 h-3.5 shrink-0" /><span className="flex-1 truncate">{a.name}</span>
                {a.size > 10 * 1024 * 1024 && <span className="text-[#d33a3c] text-[12px]">grande demais</span>}
                <button type="button" onClick={() => setArquivos(x => x.filter((_, j) => j !== i))} aria-label="Tirar"><X className="w-4 h-4 text-[#9a97a5]" /></button>
              </li>))}</ul>}
          </Campo>
          <Campo rotulo="Como conheceu a ENYLA?" opcional><input enterKeyHint="done" className={inputCls()} value={d.comoConheceu ?? ""} onChange={e => set("comoConheceu", e.target.value)} placeholder="Indicação, Instagram, já trabalhamos juntos…" /></Campo>

          <div className="rounded-3xl p-5 text-white" style={{ background: "linear-gradient(150deg,#2a1a5e,#5b34c8)" }}>
            <p className="flex items-center gap-2 text-[15px] font-bold"><ShieldCheck className="w-5 h-5" />Como a parceria funciona</p>
            <ul className="mt-3 space-y-2 text-[13.5px] text-white/85 leading-snug">
              <li>• Os pedidos chegam pelo WhatsApp e no seu e-mail, com arquivo, medida, quantidade e prazo.</li>
              <li>• Conforme os pedidos forem enviados a você, nosso sistema passa a registrar internamente o tempo de entrega e a qualidade de cada trabalho.</li>
              <li>• É assim que distribuímos os pedidos: quem entrega no prazo e com qualidade passa a receber mais.</li>
              <li>• Seu gerente de contas na ENYLA: <b className="text-white">{GERENTE_PADRAO}</b>.</li>
            </ul>
          </div>
          <button type="button" data-erro={marca("aceite")} onClick={() => set("aceite", !d.aceite)} className="w-full text-left flex gap-3 items-start">
            <span className={`mt-0.5 w-6 h-6 rounded-lg border-2 grid place-items-center shrink-0 transition ${d.aceite ? "text-white" : E("aceite") ? "border-[#d33a3c]" : "border-[#cfcbdb]"}`} style={d.aceite ? { background: ROXO, borderColor: ROXO } : undefined}>{d.aceite && <Check className="w-4 h-4 ds-pop" strokeWidth={3} />}</span>
            <span className="text-[14px] text-[#4a4658] leading-snug">Concordo que a ENYLA registre o tempo e a qualidade das entregas, e que as informações deste cadastro estão corretas.</span>
          </button>
          {E("aceite") && <p className="text-[13px] text-[#d33a3c] font-medium -mt-3 par-surge">{E("aceite")}</p>}
          <input ref={site} name="site" tabIndex={-1} autoComplete="off" className="absolute -left-[9999px] w-px h-px opacity-0" aria-hidden />
          {erroEnvio && <p className="rounded-xl bg-[#fff1f1] text-[#c92f31] text-[13.5px] font-medium px-4 py-3 par-surge">{erroEnvio}</p>}
        </>}
      </div>
      {/* Espaço do exemplo de cadastro bem preenchido (o texto vem do marketing, ver exemploCadastro.ts) */}
      <aside className="hidden lg:block sticky top-[88px] mt-6 rounded-3xl border border-dashed border-[#d9d4e8] bg-white p-5" aria-label={EXEMPLO_CADASTRO_TITULO}>
        <p className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: ROXO }}>{EXEMPLO_CADASTRO_TITULO}</p>
        <p className="mt-2 text-[13.5px] text-[#4a4658] leading-relaxed whitespace-pre-line">{exemploDaEtapa(et) ?? EXEMPLO_CADASTRO_VAZIO}</p>
      </aside>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-[#efedf5]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-[640px] mx-auto px-5 py-3 flex gap-3">
          {passo > 0 && <button onClick={voltar} className="px-5 rounded-2xl bg-[#f1eff7] text-[#4a4658] text-[15px] font-semibold active:scale-[0.98] transition" style={{ height: 52 }}>Voltar</button>}
          <button onClick={avancar} disabled={enviando} className="flex-1 rounded-2xl text-white text-[16px] font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.99] transition shadow-[0_6px_20px_rgba(124,78,228,0.3)]" style={{ background: ROXO, height: 52 }}>
            {enviando ? <><Loader2 className="w-5 h-5 animate-spin" />Enviando…</> : passo === N - 1 ? <>Enviar cadastro<Check className="w-5 h-5" /></> : <>Continuar<ArrowRight className="w-5 h-5" /></>}
          </button>
        </div>
      </div>
    </main>
  )
}
