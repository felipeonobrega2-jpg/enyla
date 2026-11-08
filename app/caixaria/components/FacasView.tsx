"use client"

// Caixaria · cadastro de facas. O que a produção tem de verdade: medidas, quantas cabem na chapa 66×48
// e se a caixa pode ser vendida no site. O site caixaria.com lê daqui e atualiza na hora.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Ruler, RotateCcw, Plus, AlertTriangle, CheckCircle2, Upload, ExternalLink, Trash2 } from "lucide-react"
import { Pagina, CabecalhoPagina, Cartao, Kpi, GradeKpis, Selo, Botao, Segmentado, LinhaLista, Vazio, Gaveta } from "@/app/components/ds"
import { parseDXF, caixaDoDxf } from "@/app/lib/dxf"
import {
  TIPOS_FACA, SITUACAO, situacao, medidas, lugaresCalculados, cabemNaChapa, erroFaca,
  type Faca, type ProdutoSite, type TipoFaca, type DadosFaca,
} from "../lib/facas"

const SITE = "https://caixaria.com"
const inteiro = (n: number) => n.toLocaleString("pt-BR")
type Aba = "site" | "facas"
type Form = Omit<DadosFaca, "lugares" | "frente_mm" | "lateral_mm" | "altura_mm"> & { frente_mm: string; lateral_mm: string; altura_mm: string; lugares: string; dxfCabem?: number }

const vazio = (p?: ProdutoSite): Form => ({
  codigo: "", nome: p?.nome.replace(/^Caixa para /, "Caixa ") ?? "", tipo: p?.tipo ?? "simples",
  frente_mm: p ? String(p.frente_mm) : "", lateral_mm: p ? String(p.lateral_mm) : "", altura_mm: p ? String(p.altura_mm) : "",
  lugares: "", planificacao: null, produto_slug: p?.slug ?? null, tem_faca: true, no_site: true, obs: "",
})
const deFaca = (f: Faca): Form => ({
  ...f, frente_mm: String(f.frente_mm), lateral_mm: String(f.lateral_mm), altura_mm: String(f.altura_mm), lugares: f.lugares ? String(f.lugares) : "",
})
const num = (s: string) => Number(s.replace(",", "."))
const paraDados = (f: Form): DadosFaca => {
  const { dxfCabem: _, ...resto } = f
  return { ...resto, frente_mm: num(f.frente_mm), lateral_mm: num(f.lateral_mm), altura_mm: num(f.altura_mm), lugares: f.lugares.trim() ? Math.round(num(f.lugares)) : null }
}

function Campo({ rotulo, children, dica }: { rotulo: string; children: React.ReactNode; dica?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide font-bold text-[#8E8E93] mb-1.5">{rotulo}</span>
      {children}
      {dica && <span className="block text-[11.5px] text-[#8E8E93] mt-1">{dica}</span>}
    </label>
  )
}
const entrada = "h-9 w-full rounded-lg ds-borda px-2.5 text-[13px] bg-white"

function Chave({ ligada, onChange, titulo, sub }: { ligada: boolean; onChange: (v: boolean) => void; titulo: string; sub: string }) {
  return (
    <button type="button" onClick={() => onChange(!ligada)} className="w-full flex items-center gap-3 text-left ds-borda rounded-lg p-3">
      <span className="flex-1"><span className="block text-[13px] font-medium">{titulo}</span><span className="block text-[11.5px] text-[#8E8E93]">{sub}</span></span>
      <span className={`w-9 h-5 rounded-full relative transition-colors ${ligada ? "bg-[#34c759]" : "bg-[rgba(120,120,128,0.24)]"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${ligada ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  )
}

export default function FacasView() {
  const [facas, setFacas] = useState<Faca[] | null>(null)
  const [produtos, setProdutos] = useState<ProdutoSite[]>([])
  const [erro, setErro] = useState("")
  const [erroSite, setErroSite] = useState("")
  const [aviso, setAviso] = useState("")
  const [aba, setAba] = useState<Aba>("site")
  const [form, setForm] = useState<Form | null>(null)
  const [erroForm, setErroForm] = useState("")
  const [salvando, setSalvando] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)

  const receber = (j: { erro?: string; facas?: Faca[]; produtos?: ProdutoSite[]; erroSite?: string }) => {
    if (j.erro) { setErro(j.erro); return false }
    setErro(""); setFacas(j.facas ?? []); setProdutos(j.produtos ?? []); setErroSite(j.erroSite ?? "")
    return true
  }
  const buscar = useCallback(() => fetch("/api/caixaria/facas").then(r => r.json()).then(receber).catch(() => setErro("Sem conexão")), [])
  useEffect(() => { buscar() }, [buscar])

  const porSlug = useMemo(() => new Map((facas ?? []).filter(f => f.produto_slug).map(f => [f.produto_slug!, f])), [facas])
  const r = useMemo(() => {
    const sits = produtos.map(p => situacao(porSlug.get(p.slug)))
    return {
      venda: sits.filter(s => s !== "fora").length,
      confirmadas: sits.filter(s => s === "confirmada").length,
      aConfirmar: sits.filter(s => s === "a-confirmar").length,
      fora: sits.filter(s => s === "fora").length,
    }
  }, [produtos, porSlug])

  const abrir = (f: Form) => { setErroForm(""); setForm(f) }
  const mudar = (m: Partial<Form>) => setForm(f => f && { ...f, ...m })

  async function enviar(corpo: object, msg: string) {
    setSalvando(true); setErroForm("")
    try {
      const j = await fetch("/api/caixaria/facas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).then(x => x.json())
      if (j.erro) { setErroForm(j.erro); return }
      receber(j); setForm(null)
      setAviso(j.siteAtualizado ? `${msg} O site já está com a mudança.` : `${msg} O site atualiza em até 5 minutos.`)
    } catch { setErroForm("Sem conexão") } finally { setSalvando(false) }
  }

  function salvar(extra?: Partial<Form>) {
    if (!form) return
    const d = paraDados({ ...form, ...extra })
    const e = erroFaca(d)
    if (e) { setErroForm(e); return }
    enviar({ acao: "salvar", faca: d }, "Faca salva.")
  }

  function lerDxf(file: File) {
    const leitor = new FileReader()
    leitor.onload = ev => {
      const res = parseDXF(String(ev.target?.result ?? ""))
      if (!res) { setErroForm("Não consegui ler esse DXF"); return }
      const m = caixaDoDxf(file.name, res)
      const cabem = cabemNaChapa(res.largura, res.altura)
      mudar({
        planificacao: `${Math.round(res.largura)} × ${Math.round(res.altura)} mm`, dxfCabem: cabem,
        ...(m ? { frente_mm: String(m.largura), lateral_mm: String(m.profundidade), altura_mm: String(m.altura) } : {}),
        ...(cabem ? { lugares: String(cabem) } : {}),
      })
      setErroForm(m ? "" : "Li a planificação, mas não as medidas da caixa montada: confira frente, lateral e altura.")
    }
    leitor.readAsText(file)
  }

  const calc = form ? lugaresCalculados(form.tipo, num(form.frente_mm), num(form.lateral_mm), num(form.altura_mm)) : 0
  const produtoDoForm = form?.produto_slug ? produtos.find(p => p.slug === form.produto_slug) : undefined
  const internas = (facas ?? []).filter(f => !f.produto_slug)

  return (
    <Pagina>
      <CabecalhoPagina titulo="Facas" sub="As facas que a produção tem. O site usa estas medidas e os lugares por chapa; caixa sem faca confirmada segue à venda como “a confirmar”."
        acoes={<div className="flex gap-2">
          <Botao icone={<RotateCcw className="w-3.5 h-3.5" />} onClick={buscar}>Atualizar</Botao>
          <Botao variante="primario" icone={<Plus className="w-3.5 h-3.5" />} onClick={() => abrir(vazio())}>Nova faca</Botao>
        </div>} />

      {erro && <Cartao className="mb-4"><p className="text-[13px] text-[#d33a3c] flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{erro}</p></Cartao>}
      {erroSite && <Cartao className="mb-4"><p className="text-[13px] text-[#c27c0e] flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{erroSite}</p></Cartao>}
      {aviso && <Cartao className="mb-4"><p className="text-[13px] text-[#009351] flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" />{aviso}</p></Cartao>}

      <GradeKpis>
        <Kpi formato={inteiro} rotulo="À venda no site" valor={facas ? r.venda : null} sub={r.fora ? `${r.fora} fora do site` : `de ${produtos.length} modelos`} icone={<ExternalLink className="w-3.5 h-3.5" />} />
        <Kpi formato={inteiro} rotulo="Confirmadas" valor={facas ? r.confirmadas : null} tom="sucesso" sub="medidas reais" icone={<CheckCircle2 className="w-3.5 h-3.5" />} />
        <Kpi formato={inteiro} rotulo="A confirmar" valor={facas ? r.aConfirmar : null} tom={r.aConfirmar ? "alerta" : "neutro"} sub={r.aConfirmar ? "medida estimada" : "tudo conferido"}
          icone={<AlertTriangle className="w-3.5 h-3.5" />} onClick={() => setAba("site")} />
        <Kpi formato={inteiro} rotulo="Cadastradas" valor={facas ? facas.filter(f => f.tem_faca).length : null} sub={internas.length ? `${internas.length} só internas` : "todas ligadas ao site"}
          icone={<Ruler className="w-3.5 h-3.5" />} onClick={() => setAba("facas")} destaque={aba === "facas"} />
      </GradeKpis>

      <div className="mt-6 mb-3">
        <Segmentado<Aba> valor={aba} onChange={setAba} opcoes={[{ v: "site", nome: "Caixas do site" }, { v: "facas", nome: "Todas as facas" }]} />
      </div>

      <Cartao padding={false}>
        {!facas ? <p className="p-5 text-[13px] text-[#8E8E93]">Lendo as facas</p>
          : aba === "site" ? (
            produtos.length === 0 ? <Vazio icone={<Ruler className="w-9 h-9 text-[#c7c7cc]" />} titulo="Sem a lista do site" sub="Não deu para ler as caixas de caixaria.com agora." />
              : produtos.map(p => {
                const f = porSlug.get(p.slug), s = situacao(f), base = f ?? p
                const lug = f?.lugares ?? lugaresCalculados(base.tipo, base.frente_mm, base.lateral_mm, base.altura_mm)
                return (
                  <LinhaLista key={p.slug} onClick={() => abrir(f ? deFaca(f) : vazio(p))}
                    icone={<img src={`${SITE}${p.foto}`} alt="" className="w-8 h-8 rounded-lg object-cover" />}
                    titulo={p.nome.replace(/^Caixa para (.)/, (_, c: string) => c.toUpperCase())}
                    sub={`${medidas(base)} · ${lug} por chapa${f?.lugares ? "" : " (cálculo)"} · ${TIPOS_FACA[base.tipo]} · ${p.codigo}`}
                    valor={<Selo tom={SITUACAO[s].tom}>{SITUACAO[s].texto}</Selo>} valorSub={f?.codigo} />
                )
              })
          ) : (
            facas.length === 0 ? <Vazio icone={<Ruler className="w-9 h-9 text-[#c7c7cc]" />} titulo="Nenhuma faca cadastrada" sub="Comece pelas caixas do site: abra cada uma e confirme a faca." />
              : facas.map(f => {
                const p = f.produto_slug ? produtos.find(x => x.slug === f.produto_slug) : undefined
                return (
                  <LinhaLista key={f.id} onClick={() => abrir(deFaca(f))} icone={<Ruler className="w-4 h-4" />} tom={f.tem_faca ? "acento" : "neutro"}
                    titulo={`${f.codigo} · ${f.nome}`}
                    sub={`${medidas(f)} · ${f.lugares ?? lugaresCalculados(f.tipo, f.frente_mm, f.lateral_mm, f.altura_mm)} por chapa · ${p ? p.nome : "só interna"}`}
                    valor={<Selo tom={SITUACAO[situacao(f)].tom}>{f.produto_slug ? SITUACAO[situacao(f)].texto : f.tem_faca ? "Interna" : "Sem faca"}</Selo>} />
                )
              })
          )}
      </Cartao>

      <Gaveta aberta={!!form} onFechar={() => setForm(null)}
        titulo={form?.id ? `Faca ${form.codigo}` : produtoDoForm ? `Confirmar faca · ${produtoDoForm.nome}` : "Nova faca"}
        sub={produtoDoForm ? `Medidas de partida do site: ${medidas(produtoDoForm)}` : "Faca só interna (similares, ENYLA) ou para uma caixa nova"}
        rodape={form && <div className="flex gap-2 justify-end flex-wrap w-full">
          {form.id && <Botao variante="fantasma" icone={<Trash2 className="w-3.5 h-3.5" />} disabled={salvando}
            onClick={() => { if (confirm("Apagar esta faca? A caixa do site volta a ficar “a confirmar”.")) enviar({ acao: "apagar", id: form.id }, "Faca apagada.") }}>Apagar</Botao>}
          {!form.id && produtoDoForm && <Botao disabled={salvando}
            onClick={() => salvar({ tem_faca: false, no_site: false, codigo: form.codigo.trim() || `SEM-${produtoDoForm.codigo}` })}>Não temos essa faca</Botao>}
          <Botao variante="primario" disabled={salvando} onClick={() => salvar()}>{salvando ? "Salvando" : form.id ? "Salvar" : "Confirmar faca"}</Botao>
        </div>}>
        {form && (
          <div className="space-y-4 text-[13px] px-3 py-2">
            {erroForm && <p className="text-[12.5px] text-[#d33a3c] flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{erroForm}</p>}

            <div className="grid grid-cols-[120px_1fr] gap-3">
              <Campo rotulo="Código"><input value={form.codigo} onChange={e => mudar({ codigo: e.target.value })} placeholder="F-012" className={entrada} /></Campo>
              <Campo rotulo="Nome"><input value={form.nome} onChange={e => mudar({ nome: e.target.value })} placeholder="Caixa perfume 100 ml" className={entrada} /></Campo>
            </div>

            <Campo rotulo="Modelo">
              <Segmentado<TipoFaca> valor={form.tipo} onChange={t => mudar({ tipo: t })} opcoes={(Object.keys(TIPOS_FACA) as TipoFaca[]).map(t => ({ v: t, nome: TIPOS_FACA[t] }))} />
            </Campo>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] uppercase tracking-wide font-bold text-[#8E8E93]">Medidas internas (mm)</span>
                <button type="button" onClick={() => arquivo.current?.click()} className="text-[12px] font-semibold text-[#8456e8] flex items-center gap-1"><Upload className="w-3.5 h-3.5" />Ler do DXF</button>
                <input ref={arquivo} type="file" accept=".dxf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) lerDxf(f); e.target.value = "" }} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([["frente_mm", "Frente"], ["lateral_mm", "Lateral"], ["altura_mm", "Altura"]] as const).map(([k, n]) => (
                  <label key={k} className="block">
                    <input inputMode="decimal" value={form[k]} onChange={e => mudar({ [k]: e.target.value })} className={`${entrada} ds-num`} aria-label={n} />
                    <span className="block text-[11px] text-[#8E8E93] mt-1">{n}</span>
                  </label>
                ))}
              </div>
              {form.planificacao && <p className="text-[11.5px] text-[#8E8E93] mt-1">Planificação do DXF: {form.planificacao}</p>}
            </div>

            <Campo rotulo="Caixas por chapa 66×48"
              dica={form.dxfCabem ? `Pelo DXF cabem ${form.dxfCabem}. Pelo cálculo das medidas, ${calc}.` : `Vazio = usar o cálculo pelas medidas (${calc} por chapa). Preencha com o que a faca real tem.`}>
              <input inputMode="numeric" value={form.lugares} onChange={e => mudar({ lugares: e.target.value.replace(/\D/g, "") })} placeholder={String(calc)} className={`${entrada} ds-num w-[120px]`} />
            </Campo>

            <Campo rotulo="Caixa do site">
              <select value={form.produto_slug ?? ""} onChange={e => mudar({ produto_slug: e.target.value || null })} className={entrada}>
                <option value="">Nenhuma (faca só interna)</option>
                {produtos.map(p => {
                  const dona = porSlug.get(p.slug)
                  return <option key={p.slug} value={p.slug} disabled={!!dona && dona.id !== form.id}>{p.nome}{dona && dona.id !== form.id ? ` (já usa ${dona.codigo})` : ""}</option>
                })}
              </select>
            </Campo>

            {form.produto_slug && <>
              <Chave ligada={form.tem_faca} onChange={v => mudar({ tem_faca: v, ...(v ? {} : { no_site: false }) })} titulo="Temos essa faca" sub="Desligado: a caixa sai do site até a faca existir" />
              <Chave ligada={form.no_site && form.tem_faca} onChange={v => mudar({ no_site: v, ...(v ? { tem_faca: true } : {}) })} titulo="À venda no site" sub="Desligado: some da loja, do Google Shopping e do mapa do site" />
            </>}

            <Campo rotulo="Observação"><textarea value={form.obs} onChange={e => mudar({ obs: e.target.value })} rows={2} placeholder="onde fica, fornecedor da faca, cuidado na montagem" className="w-full rounded-lg ds-borda px-2.5 py-2 text-[13px]" /></Campo>
          </div>
        )}
      </Gaveta>
    </Pagina>
  )
}
