"use client"

// Caixaria · custos e regras de preço. O site caixaria.com calcula os preços com estes números.
// Ao lado de cada campo, o que a ENYLA já sabe (configuração da ferramenta de orçamentos e o que foi pago por lote).
// A simulação mostra, antes de salvar, o preço e o que sobra de cada pedido.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Calculator, RotateCcw, AlertTriangle, CheckCircle2, Info } from "lucide-react"
import { Pagina, CabecalhoPagina, Cartao, Selo, Botao, Segmentado } from "@/app/components/ds"
import {
  CUSTOS_PADRAO, REFERENCIA, custoRodada, partesRodada, preco, lucro, multiplicadorParaManter, normalizarCustos, lugaresDa,
  type Custos,
} from "../lib/custos"

type Referencia = { campo: keyof Custos; valor: number; fonte: string; detalhe: string }
type Campo = {
  k: keyof Custos; nome: string; un: string; ajuda?: string
  paraTela?: (v: number) => number; doTela?: (v: number) => number   // % guardado como fração, etc.
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const num = (n: number, d = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: d })
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
const lerNum = (s: string) => Number(String(s).replace(/\./g, "").replace(",", "."))
const fracao = { paraTela: (v: number) => Math.round(v * 1000) / 10, doTela: (v: number) => v / 100 }
const fator = { paraTela: (v: number) => Math.round((v - 1) * 1000) / 10, doTela: (v: number) => 1 + v / 100 }

const GRUPOS: { titulo: string; sub: string; campos: Campo[] }[] = [
  { titulo: "Por rodada", sub: "Uma chapa 66×48 com 1.000 folhas boas. Dividida pelos lugares da chapa.", campos: [
    { k: "impressao", nome: "Impressão", un: "R$ por rodada", ajuda: "Fixo por chapa, não depende da tiragem" },
    { k: "papelPorFolha", nome: "Papel", un: "R$ por folha 66×48" },
    { k: "perdaPct", nome: "Perda", un: "% de folhas a mais", ajuda: "Vale para papel, laminação e corte" },
    { k: "laminacaoPorFolha", nome: "Laminação", un: "R$ por folha" },
    { k: "corteAcerto", nome: "Corte e vinco: acerto", un: "R$ por rodada" },
    { k: "corteMilheiro", nome: "Corte e vinco: milheiro", un: "R$ por mil folhas" },
    { k: "logistica", nome: "Logística entre fornecedores", un: "R$ por rodada", ajuda: "Levar as folhas da impressão à laminação, ao corte e à colagem" },
  ] },
  { titulo: "Por pedido", sub: "Cobrados de cada cliente.", campos: [
    { k: "colagemPorMil", nome: "Colagem", un: "R$ por mil caixas" },
    { k: "arte", nome: "Arte", un: "R$ por pedido", ajuda: "Equipe de design" },
  ] },
  { titulo: "Preço", sub: "Preço no Pix = custo × multiplicador. É o que o cliente vê no site.", campos: [
    { k: "multiplicador", nome: "Multiplicador", un: "× o custo" },
    { k: "acrescimoCartao", nome: "Cartão em até 6x", un: "% sobre o Pix", ...fracao },
    { k: "fatorExpressa", nome: "Produção expressa", un: "% sobre a normal", ...fator },
  ] },
  { titulo: "Para a conta de lucro", sub: "Não mudam o preço: só mostram quanto sobra.", campos: [
    { k: "impostoPct", nome: "Imposto", un: "% do preço" },
    { k: "taxaPixPct", nome: "Taxa do Pix (Mercado Pago)", un: "% do preço" },
    { k: "taxaCartaoPct", nome: "Taxa do cartão em 6x sem juros", un: "% do preço", ajuda: "Veja no painel do Mercado Pago, em custos" },
  ] },
  { titulo: "Frete nas ofertas do Google", sub: "Só nos links do Google Shopping o frete vem embutido.", campos: [
    { k: "freteFixo", nome: "Frete: fixo", un: "R$ por pedido" },
    { k: "fretePorKg", nome: "Frete: por quilo", un: "R$ por kg" },
  ] },
]
const DESCONTOS = ["2000", "3000", "4000"]

type Form = Record<string, string>
const paraForm = (c: Custos): Form => {
  const f: Form = {}
  for (const g of GRUPOS) for (const k of g.campos) f[k.k] = num(k.paraTela ? k.paraTela(c[k.k] as number) : (c[k.k] as number), 4)
  for (const q of DESCONTOS) f[`d${q}`] = num((c.descontos[q] ?? 0) * 100, 1)
  return f
}
const doForm = (f: Form, base: Custos): Custos => {
  const c: Custos = { ...base, descontos: { ...base.descontos } }
  for (const g of GRUPOS) for (const k of g.campos) {
    const v = lerNum(f[k.k]); if (Number.isFinite(v)) (c[k.k] as number) = k.doTela ? k.doTela(v) : v
  }
  for (const q of DESCONTOS) { const v = lerNum(f[`d${q}`]); if (Number.isFinite(v)) c.descontos[q] = v / 100 }
  return normalizarCustos(c)
}

export default function CustosView() {
  const [salvo, setSalvo] = useState<Custos | null>(null)
  const [salvoEm, setSalvoEm] = useState<string | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [refs, setRefs] = useState<Referencia[]>([])
  const [avisos, setAvisos] = useState<string[]>([])
  const [erro, setErro] = useState("")
  const [aviso, setAviso] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [qtd, setQtd] = useState<"1000" | "2000" | "4000">("1000")

  const buscar = useCallback(() => fetch("/api/caixaria/custos").then(r => r.json()).then(j => {
    setErro(j.erro ?? "")
    const c = normalizarCustos(j.custos); setSalvo(c); setSalvoEm(j.salvoEm ?? null); setForm(paraForm(c))
    setRefs(j.referencias ?? []); setAvisos(j.avisos ?? [])
  }).catch(() => setErro("Sem conexão")), [])
  useEffect(() => { buscar() }, [buscar])

  const atual = useMemo(() => (form && salvo ? doForm(form, salvo) : null), [form, salvo])
  const mudou = !!(atual && salvo && JSON.stringify(atual) !== JSON.stringify(salvo))
  const set = (k: string, v: string) => setForm(f => f && { ...f, [k]: v })

  async function salvar() {
    if (!atual || !salvo) return
    const antes = preco(salvo, REFERENCIA, 1000)!.pix, depois = preco(atual, REFERENCIA, 1000)!.pix
    if (antes !== depois && !confirm(`Os preços do site vão mudar. A caixa de 100 ml (1.000 un, Pix) passa de ${brl(antes)} para ${brl(depois)}. Salvar?`)) return
    setSalvando(true)
    try {
      const j = await fetch("/api/caixaria/custos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ custos: atual }) }).then(r => r.json())
      if (j.erro) { setErro(j.erro); return }
      const c = normalizarCustos(j.custos); setSalvo(c); setSalvoEm(j.salvoEm); setForm(paraForm(c)); setErro("")
      setAviso(j.siteAtualizado ? "Custos salvos. O site já está com os preços novos." : "Custos salvos. O site atualiza em até 5 minutos.")
    } catch { setErro("Sem conexão") } finally { setSalvando(false) }
  }

  function manterPreco() {
    if (!atual || !salvo) return
    const m = multiplicadorParaManter(atual, REFERENCIA, preco(salvo, REFERENCIA, 1000)!.pix)
    set("multiplicador", num(m, 4))
  }

  if (!form || !atual || !salvo) return (
    <Pagina><CabecalhoPagina titulo="Custos" />
      {erro ? <Cartao><p className="text-[13px] text-[#d33a3c] flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{erro}</p></Cartao>
        : <p className="text-[13px] text-[#8E8E93]">Lendo os custos</p>}
    </Pagina>
  )

  const q = Number(qtd)
  const ref = { antes: preco(salvo, REFERENCIA, 1000)!, depois: preco(atual, REFERENCIA, 1000)! }
  const linhas = [
    { nome: `${num(q, 0)} un · normal · Pix`, l: lucro(atual, REFERENCIA, q)! },
    { nome: `${num(q, 0)} un · normal · cartão`, l: lucro(atual, REFERENCIA, q, false, true)! },
    { nome: `${num(q, 0)} un · expressa · Pix`, l: lucro(atual, REFERENCIA, q, true)!, nota: "chapa só do cliente" },
  ]
  const porChapa = lugaresDa(REFERENCIA)

  return (
    <Pagina>
      <CabecalhoPagina titulo="Custos" sub={<>Os preços de caixaria.com saem destes números. Ao lado de cada campo, o que a ENYLA já sabe.{salvoEm ? ` Salvo em ${new Date(salvoEm).toLocaleDateString("pt-BR")}.` : " Ainda no padrão da conversa de 08/11."}</>}
        acoes={<div className="flex gap-2">
          <Botao icone={<RotateCcw className="w-3.5 h-3.5" />} disabled={!mudou} onClick={() => setForm(paraForm(salvo))}>Desfazer</Botao>
          <Botao variante="primario" disabled={!mudou || salvando} onClick={salvar}>{salvando ? "Salvando" : "Salvar e atualizar o site"}</Botao>
        </div>} />

      {erro && <Cartao className="mb-4"><p className="text-[13px] text-[#d33a3c] flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{erro}</p></Cartao>}
      {aviso && <Cartao className="mb-4"><p className="text-[13px] text-[#009351] flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" />{aviso}</p></Cartao>}
      {avisos.map(a => <Cartao key={a} className="mb-4"><p className="text-[13px] text-[#c27c0e] flex items-center gap-2"><Info className="w-4 h-4 shrink-0" />{a}</p></Cartao>)}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        <div className="space-y-4">
          {GRUPOS.map(g => (
            <Cartao key={g.titulo}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <p className="text-[14px] font-semibold text-[#191625]">{g.titulo}</p>
                {g.titulo === "Por rodada" && <span className="text-[13px] font-semibold ds-num">{brl(custoRodada(atual))}</span>}
              </div>
              <p className="text-[12px] text-[#8E8E93] mb-3">{g.sub}</p>
              <div className="divide-y divide-[rgba(0,0,0,0.06)]">
                {g.campos.map(c => {
                  const rs = refs.filter(r => r.campo === c.k)
                  return (
                    <div key={c.k} className="py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_150px] gap-2 sm:gap-4 items-start">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[#191625]">{c.nome}</p>
                        <p className="text-[11.5px] text-[#8E8E93]">{c.un}{c.ajuda ? ` · ${c.ajuda}` : ""}</p>
                        {rs.length > 0 && <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {rs.map(r => {
                            const tela = c.paraTela ? c.paraTela(r.valor) : r.valor
                            const igual = Math.abs(lerNum(form[c.k]) - tela) < 0.005
                            return (
                              <button key={r.fonte + r.detalhe} type="button" title={r.detalhe} onClick={() => set(c.k, num(tela, 4))}
                                className={`text-left text-[11px] leading-tight rounded-md px-2 py-1 transition-colors ${igual ? "bg-[#009351]/10 text-[#00753f]" : "bg-[#8456e8]/[0.08] text-[#5b37b8] hover:bg-[#8456e8]/[0.15]"}`}>
                                <span className="font-semibold ds-num">{num(tela, 2)}</span> · {r.fonte}
                                <span className="block text-[10.5px] opacity-75">{r.detalhe}</span>
                              </button>
                            )
                          })}
                        </div>}
                      </div>
                      <div className="flex items-center gap-2 sm:justify-end">
                        <input inputMode="decimal" value={form[c.k]} onChange={e => set(c.k, e.target.value)} aria-label={c.nome}
                          className="h-9 w-full sm:w-[110px] rounded-lg ds-borda px-2.5 text-[13px] ds-num text-right bg-white" />
                        {c.k === "multiplicador" && <Botao variante="fantasma" onClick={manterPreco} title="Ajusta o multiplicador para a caixa de 100 ml continuar com o preço de hoje">Manter preço</Botao>}
                      </div>
                    </div>
                  )
                })}
                {g.titulo === "Preço" && (
                  <div className="py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 sm:gap-4 items-center">
                    <div><p className="text-[13px] font-medium">Desconto por quantidade</p><p className="text-[11.5px] text-[#8E8E93]">% sobre o preço de 1.000</p></div>
                    <div className="flex gap-2">
                      {DESCONTOS.map(d => (
                        <label key={d} className="block">
                          <input inputMode="decimal" value={form[`d${d}`]} onChange={e => set(`d${d}`, e.target.value)} aria-label={`Desconto ${d}`}
                            className="h-9 w-[64px] rounded-lg ds-borda px-2 text-[13px] ds-num text-right bg-white" />
                          <span className="block text-[10.5px] text-[#8E8E93] text-center mt-0.5">{num(Number(d), 0)} un</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Cartao>
          ))}
        </div>

        <div className="lg:sticky lg:top-4 space-y-4">
          <Cartao>
            <div className="flex items-center gap-2 mb-1"><Calculator className="w-4 h-4 text-[#8456e8]" /><p className="text-[14px] font-semibold">Simulação</p></div>
            <p className="text-[12px] text-[#8E8E93] mb-3">{REFERENCIA.nome}, {porChapa} por chapa</p>

            <div className="rounded-lg bg-[rgba(116,116,128,0.06)] p-3 mb-3">
              <p className="text-[11px] uppercase tracking-wide font-bold text-[#8E8E93]">Preço no site · 1.000 un · Pix</p>
              <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                <span className="text-[22px] font-semibold ds-num">{brl(ref.depois.pix)}</span>
                <span className="text-[12px] text-[#8E8E93] ds-num">{brl(ref.depois.pix / 1000)}/un</span>
                {ref.depois.pix !== ref.antes.pix && <Selo tom={ref.depois.pix > ref.antes.pix ? "alerta" : "sucesso"}>hoje {brl(ref.antes.pix)}</Selo>}
              </div>
              <p className="text-[11.5px] text-[#8E8E93] mt-1">Multicaixas: R$ 1,34/un no Pix e R$ 1,49 no cartão</p>
            </div>

            <div className="mb-3"><Segmentado<"1000" | "2000" | "4000"> valor={qtd} onChange={setQtd} opcoes={[{ v: "1000", nome: "1.000" }, { v: "2000", nome: "2.000" }, { v: "4000", nome: "4.000" }]} /></div>

            <div className="space-y-3">
              {linhas.map(({ nome, l, nota }) => (
                <div key={nome} className="ds-borda rounded-lg p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[12.5px] font-semibold">{nome}</p>
                    <Selo tom={l.sobra <= 0 ? "perigo" : l.margem < 0.25 ? "alerta" : "sucesso"}>{l.sobra <= 0 ? "prejuízo" : `${pct(l.margem)} sobra`}</Selo>
                  </div>
                  {nota && <p className="text-[11px] text-[#8E8E93]">{nota}</p>}
                  <dl className="mt-2 text-[12px] space-y-0.5 ds-num">
                    <div className="flex justify-between"><dt className="text-[#8E8E93]">Recebe</dt><dd>{brl(l.receita)}</dd></div>
                    <div className="flex justify-between"><dt className="text-[#8E8E93]">Produção (chapa, colagem, arte)</dt><dd>− {brl(l.producao)}</dd></div>
                    <div className="flex justify-between"><dt className="text-[#8E8E93]">Imposto e taxa</dt><dd>− {brl(l.imposto + l.taxa)}</dd></div>
                    <div className="flex justify-between font-semibold pt-1 border-t border-[rgba(0,0,0,0.06)]"><dt>Sobra</dt><dd style={{ color: l.sobra <= 0 ? "#d33a3c" : "#009351" }}>{brl(l.sobra)}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
          </Cartao>

          <Cartao>
            <p className="text-[13px] font-semibold mb-2">De onde vem a rodada</p>
            <dl className="text-[12px] space-y-1 ds-num">
              {partesRodada(atual).map(p => (
                <div key={p.nome} className="flex justify-between"><dt className="text-[#8E8E93]">{p.nome}</dt><dd>{brl(p.valor)}</dd></div>
              ))}
              <div className="flex justify-between font-semibold pt-1 border-t border-[rgba(0,0,0,0.06)]"><dt>Rodada</dt><dd>{brl(custoRodada(atual))}</dd></div>
              <div className="flex justify-between text-[#8E8E93]"><dt>Por lugar ({porChapa} na chapa)</dt><dd>{brl(custoRodada(atual) / porChapa)}</dd></div>
            </dl>
            <button type="button" onClick={() => setForm(paraForm(CUSTOS_PADRAO))} className="text-[11.5px] text-[#8E8E93] hover:text-[#191625] mt-3">Voltar aos valores da conversa de 08/11</button>
          </Cartao>
        </div>
      </div>
    </Pagina>
  )
}
