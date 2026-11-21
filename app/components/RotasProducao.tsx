"use client"

import React from "react"
import { AlertTriangle, ArrowRight, Check, Printer, Scissors, Layers, Truck, Wrench, Info, Pencil, Plus, RotateCcw, X } from "lucide-react"
import { Calculo, FormData } from "../types"
import { ConfigProducao, OpcoesRota, Rota, ItemCusto, ColagemModo, EtapaCusto, CustoExtra, chaveCavidades, DIVISOES, type Divisao } from "../lib/producao"
import { brl, num } from "../utils"
import type { TipoCorrecao } from "../lib/aprendizado"
import { Section } from "./ui"
import { CaminhoDaFolha } from "./CaminhoDaFolha"

const border = { border: "1px solid rgba(60,60,67,0.08)" }

const ETAPA_NOME: Record<ItemCusto["etapa"], string> = {
  papel: "Papel", impressao: "Impressão", laminacao: "Laminação", verniz: "Verniz",
  hotStamping: "Hot stamping", corteVinco: "Corte e vinco", colagem: "Colagem",
  arte: "Arte", frete: "Frete", faca: "Faca", cliche: "Clichê", fotolito: "Fotolito", extra: "Extra",
}

const inputCls = "h-8 rounded-lg px-2 text-[12px] ds-num text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20"
const inputStyle = { border: "1px solid rgba(60,60,67,0.18)" }
const lerNum = (s: string) => { const n = parseFloat(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : null }
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

function Manual({ motor }: { motor: number }) {
  return (
    <span title={`O motor calculou ${brl(motor)}`} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#8456e8]/10 text-[#8456e8] whitespace-nowrap">
      manual · motor {brl(motor)}
    </span>
  )
}

// Por que você trocou o valor do motor: o que não é exceção ensina a calibragem
const TIPOS_CORRECAO: { v: TipoCorrecao; nome: string; dica: string }[] = [
  { v: "preco", nome: "Preço do fornecedor mudou", dica: "Ensina o motor: o cadastro desse fornecedor está desatualizado" },
  { v: "motor", nome: "O motor erra nisso", dica: "Ensina o motor: a conta não bate com a realidade nesse tipo de serviço" },
  { v: "excecao", nome: "Só neste pedido", dica: "Não ensina: negociação, urgência ou caso especial" },
]

// Valor de um custo: clique para digitar; vale para esta tiragem ou para todas. Diga o porquê e o motor aprende.
// Contexto do papel: a mesma diferença pode ser preço (R$ por 100 folhas) ou quantidade (quantas caixas cabem)
type ContextoPapel = { folhas: number; quantidade: number; perdaPct: number; porFolha: number; pedacosPorFolha: number; cavidades: number[]; porPeca: number[]; onCavidades: (l: number[]) => void }

function ValorEditavel({ item, onSalvar, onRestaurar, papel }: {
  item: ItemCusto
  onSalvar: (v: number, todas: boolean, porque: { tipo: TipoCorrecao; motivo: string }) => void
  onRestaurar: () => void
  papel?: ContextoPapel
}) {
  const [editando, setEditando] = React.useState(false)
  const [txt, setTxt] = React.useState("")
  const [tipo, setTipo] = React.useState<TipoCorrecao>("motor")
  const [motivo, setMotivo] = React.useState("")
  const [modoPapel, setModoPapel] = React.useState<"cabem" | "preco" | "excecao">("cabem")
  const [cavTxt, setCavTxt] = React.useState("")
  const abrir = () => { setTxt(item.valor.toFixed(2).replace(".", ",")); setTipo("motor"); setMotivo(""); setModoPapel("cabem"); setCavTxt(String(papel?.cavidades[0] ?? "")); setEditando(true) }
  const salvar = (todas: boolean) => {
    // Papel com "cabem mais caixas": não grava valor; muda as caixas por pedaço e o motor refaz papel, impressão e corte
    if (papel && modoPapel === "cabem") {
      const n = Math.round(Number(cavTxt))
      if (n >= 1) papel.onCavidades([n, ...papel.cavidades.slice(1)])
      setEditando(false); return
    }
    const v = lerNum(txt)
    if (v != null && v >= 0) onSalvar(v, todas, papel ? { tipo: modoPapel === "preco" ? "preco" : "excecao", motivo: motivo.trim() } : { tipo, motivo: motivo.trim() })
    setEditando(false)
  }
  if (editando && papel) {
    const tecla = (e: React.KeyboardEvent) => { if (e.key === "Enter") salvar(false); if (e.key === "Escape") setEditando(false) }
    const v = lerNum(txt) ?? item.valor
    const precoCadastro = papel.folhas > 0 ? (item.valorMotor ?? item.valor) / papel.folhas * 100 : 0
    const precoDigitado = papel.folhas > 0 ? v / papel.folhas * 100 : 0
    // Com o preço do cadastro, quantas folhas esse valor compra e quantas caixas por folha isso daria
    const folhasPeloValor = precoCadastro > 0 ? v / precoCadastro * 100 : 0
    const caixasPorFolha = folhasPeloValor > 0 ? papel.quantidade * (1 + papel.perdaPct / 100) / folhasPeloValor : 0
    const n = Math.round(Number(cavTxt)) || 0
    const MODOS = [
      { v: "cabem" as const, nome: "Cabem mais caixas" },
      { v: "preco" as const, nome: "Preço do papel" },
      { v: "excecao" as const, nome: "Só neste pedido" },
    ]
    return (
      <div className="flex flex-col items-end gap-1.5 shrink-0 py-1">
        <div className="w-[380px] max-w-[78vw] rounded-lg bg-[#8456e8]/[0.04] border border-[#8456e8]/15 p-2.5 space-y-2">
          <p className="text-[10.5px] font-semibold text-[#8456e8]">O que mudou no papel?</p>
          <div className="flex flex-wrap gap-1">
            {MODOS.map(m => (
              <button key={m.v} type="button" onClick={() => setModoPapel(m.v)}
                className={`h-6 px-2 rounded-full text-[10.5px] font-semibold transition-colors ${modoPapel === m.v ? "bg-[#8456e8] text-white" : "bg-white text-[#5e5c68] border border-[rgba(60,60,67,0.12)] hover:border-[#8456e8]/40"}`}>{m.nome}</button>
            ))}
          </div>
          {modoPapel === "cabem" ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[11.5px] text-[#3c3a45]">
                Caixas em cada pedaço que entra na máquina:
                <input autoFocus value={cavTxt} onChange={e => setCavTxt(e.target.value.replace(/\D/g, ""))} onKeyDown={tecla} inputMode="numeric"
                  className={`${inputCls} w-14 text-right`} style={inputStyle} aria-label="Caixas por pedaço" />
              </div>
              <p className="text-[11px] text-[#5e5c68]">
                Hoje: {papel.cavidades[0]} por pedaço · {papel.porFolha} por folha.{n >= 1 && n !== papel.cavidades[0] ? <> Com {n}: <strong className="text-[#191625]">{(n * (papel.porPeca[0] ?? 1) + papel.cavidades.slice(1).reduce((t, c, k) => t + c * (papel.porPeca[k + 1] ?? 1), 0)) * papel.pedacosPorFolha} por folha</strong>, e o motor refaz papel, impressão e corte.</> : null}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <input autoFocus value={txt} onChange={e => setTxt(e.target.value)} inputMode="decimal" onKeyDown={tecla}
                  className={`${inputCls} w-24 text-right`} style={inputStyle} aria-label="Novo valor do papel" />
                <span className="text-[11px] text-[#5e5c68]">valor do papel</span>
              </div>
              {modoPapel === "preco" && precoDigitado > 0 && <p className="text-[11px] text-[#5e5c68]">Dá <strong className="text-[#191625]">{brl(precoDigitado)} por 100 folhas</strong> (o cadastro está {brl(precoCadastro)}).</p>}
              {precoCadastro > 0 && Math.abs(v - (item.valorMotor ?? item.valor)) > 1 && caixasPorFolha > 0 && (
                <p className="text-[11px] text-[#8a5400]">Se o preço do cadastro estiver certo, esse valor compra ~{num(Math.round(folhasPeloValor))} folhas, ou seja ~{num(Math.round(caixasPorFolha))} caixas por folha (hoje {papel.porFolha}). Se for isso, use "Cabem mais caixas".</p>
              )}
              <input value={motivo} onChange={e => setMotivo(e.target.value)} onKeyDown={tecla}
                placeholder={modoPapel === "excecao" ? "Ex.: papel que já estava em estoque" : "Ex.: o fornecedor baixou o 77×113"}
                className="w-full h-7 rounded-md px-2 text-[11.5px] bg-white border border-[rgba(60,60,67,0.12)] focus:outline-none focus:border-[#8456e8]/50" />
            </div>
          )}
          <div className="flex items-center justify-end gap-1.5">
            <button onClick={() => setEditando(false)} className="h-7 px-2 rounded-lg text-[11px] font-medium text-[#5e5c68] hover:bg-[rgba(116,116,128,0.08)]">Cancelar</button>
            {modoPapel !== "cabem" && <button onClick={() => salvar(true)} className="h-7 px-2 rounded-lg text-[11px] font-medium text-[#5e5c68] hover:bg-[rgba(116,116,128,0.08)]" style={border}>Todas as tiragens</button>}
            <button onClick={() => salvar(false)} className="h-7 px-2.5 rounded-lg text-[11px] font-semibold bg-[#0b0914] text-white">{modoPapel === "cabem" ? "Refazer a conta" : "Esta tiragem"}</button>
          </div>
        </div>
      </div>
    )
  }
  if (editando) {
    const tecla = (e: React.KeyboardEvent) => { if (e.key === "Enter") salvar(false); if (e.key === "Escape") setEditando(false) }
    return (
      <div className="flex flex-col items-end gap-1.5 shrink-0 py-1">
        <div className="flex items-center gap-1.5">
          <input autoFocus value={txt} onChange={e => setTxt(e.target.value)} inputMode="decimal" onKeyDown={tecla}
            className={`${inputCls} w-24 text-right`} style={inputStyle} aria-label="Novo valor" />
          <button onClick={() => salvar(false)} className="h-8 px-2 rounded-lg text-[11px] font-medium bg-[#0b0914] text-white">Esta tiragem</button>
          <button onClick={() => salvar(true)} className="h-8 px-2 rounded-lg text-[11px] font-medium text-[#5e5c68] hover:bg-[rgba(116,116,128,0.08)]" style={border}>Todas</button>
          <button onClick={() => setEditando(false)} aria-label="Cancelar" className="h-8 w-8 grid place-items-center rounded-lg text-[#898892] hover:bg-[rgba(116,116,128,0.08)]"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="w-[340px] max-w-[70vw] rounded-lg bg-[#8456e8]/[0.04] border border-[#8456e8]/15 p-2 space-y-1.5">
          <p className="text-[10.5px] font-semibold text-[#8456e8]">Por que mudou? O motor aprende com isso</p>
          <div className="flex flex-wrap gap-1">
            {TIPOS_CORRECAO.map(t => (
              <button key={t.v} type="button" title={t.dica} onClick={() => setTipo(t.v)}
                className={`h-6 px-2 rounded-full text-[10.5px] font-semibold transition-colors ${tipo === t.v ? "bg-[#8456e8] text-white" : "bg-white text-[#5e5c68] border border-[rgba(60,60,67,0.12)] hover:border-[#8456e8]/40"}`}>{t.nome}</button>
            ))}
          </div>
          <input value={motivo} onChange={e => setMotivo(e.target.value)} onKeyDown={tecla}
            placeholder={tipo === "excecao" ? "Ex.: cliente negociou, urgência…" : "Ex.: o corte e vinco subiu para R$ 120 o milheiro"}
            className="w-full h-7 rounded-md px-2 text-[11.5px] bg-white border border-[rgba(60,60,67,0.12)] focus:outline-none focus:border-[#8456e8]/50" />
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1 shrink-0">
      {item.valorMotor != null && (
        <button onClick={onRestaurar} title="Voltar ao valor do motor" aria-label="Voltar ao valor do motor"
          className="h-6 w-6 grid place-items-center rounded-md text-[#898892] hover:text-[#8456e8] hover:bg-[#8456e8]/10 transition-colors">
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
      <button onClick={abrir} title="Editar valor"
        className={`group ds-num w-[104px] h-7 rounded-md px-1.5 flex items-center justify-end gap-1.5 hover:bg-[rgba(116,116,128,0.08)] transition-colors ${
          item.valorMotor != null ? "text-[#8456e8] font-semibold" : item.valor === 0 ? "text-[#898892]" : "text-[#191625]"}`}>
        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />{brl(item.valor)}
      </button>
    </div>
  )
}

export function margemLiqCls(m: number) {
  if (m >= 40) return "text-[#009351]"
  if (m >= 30) return "text-[#c57800]"
  return "text-[#e5484d]"
}

function Estimado() {
  return (
    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#c57800]/10 text-[#c57800]">
      estimado
    </span>
  )
}

function Seletor<T extends string | number>({ label, valor, opcoes, onChange }: {
  label: string; valor: T; opcoes: { v: T; nome: string }[]; onChange: (v: T) => void
}) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] text-[rgba(60,60,67,0.55)] font-medium">{label}</span>
      <select value={String(valor)}
        onChange={e => {
          const o = opcoes.find(x => String(x.v) === e.target.value)
          if (o) onChange(o.v)
        }}
        className="h-9 rounded-lg px-2.5 text-[12px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20"
        style={{ border: "1px solid rgba(60,60,67,0.18)" }}>
        {opcoes.map(o => <option key={String(o.v)} value={String(o.v)}>{o.nome}</option>)}
      </select>
    </label>
  )
}

// Cavidades de cada passada: dá para digitar (para mais ou para menos). Ao editar, a rota fica travada nesta.
function CampoCavidades({ valor, onSalvar }: { valor: number; onSalvar: (n: number) => void }) {
  const [txt, setTxt] = React.useState(String(valor))
  React.useEffect(() => setTxt(String(valor)), [valor])
  const salvar = () => {
    const n = Math.round(lerNum(txt) ?? 0)
    if (n >= 1 && n !== valor) onSalvar(n)
    else setTxt(String(valor))
  }
  return (
    <input aria-label="Cavidades" inputMode="numeric" value={txt}
      onChange={e => setTxt(e.target.value.replace(/\D/g, ""))}
      onBlur={salvar} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
      className="w-10 h-6 rounded-md px-1 text-center text-[11px] font-semibold ds-num text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20"
      style={inputStyle} />
  )
}

function Passadas({ rota, onCavidades }: { rota: Rota; onCavidades?: (lista: number[] | null) => void }) {
  const editadas = rota.passadas.some(p => p.cavidadesAuto != null)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {rota.passadas.map((p, i) => (
        <span key={i} className="text-[11px] ds-num px-2 py-1 rounded-lg bg-[rgba(116,116,128,0.08)] text-[#5e5c68] inline-flex flex-wrap items-center gap-1">
          Passada {i + 1}:
          {onCavidades
            ? <CampoCavidades valor={p.cavidades} onSalvar={n => onCavidades(rota.passadas.map((x, k) => (k === i ? n : x.cavidades)))} />
            : <strong className="text-[#191625]">{p.cavidades}</strong>}
          <span>cav.</span>
          {p.cavidadesAuto != null && (
            <span title={`O motor calculou ${p.cavidadesAuto} cavidades`} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#8456e8]/10 text-[#8456e8] whitespace-nowrap">
              manual · motor {p.cavidadesAuto}
            </span>
          )}
          <span>em {num(p.largura / 10, 1)}×{num(p.altura / 10, 1)} cm{p.porPeca > 1 ? ` (×${p.porPeca})` : ""} · {num(p.folhas)} folhas</span>
        </span>
      ))}
      {editadas && onCavidades && (
        <button onClick={() => onCavidades(null)} className="text-[11px] text-[#898892] hover:text-[#8456e8] flex items-center gap-1">
          <RotateCcw className="w-3 h-3" /> Cavidades do motor
        </button>
      )}
    </div>
  )
}

export type CorrecaoDoOrcamento = { etapa: EtapaCusto; fornecedorId?: string; fornecedor?: string; materialId?: string; quantidade: number; motor: number; manual: number; todas: boolean; tipo: TipoCorrecao; motivo: string; cliente: string }

export function RotasProducao({ calculo, form, producao, multiplicadorPadrao, comFaca, onOpcoes, onRegistrarFaca, onCorrecao }: {
  calculo: Calculo
  form: FormData
  producao: ConfigProducao
  multiplicadorPadrao: number
  comFaca: boolean
  onOpcoes: (o: OpcoesRota) => void
  onRegistrarFaca: (rota: Rota) => void
  onCorrecao?: (c: CorrecaoDoOrcamento) => void
}) {
  const rotas = calculo.rotas ?? []
  const [qtdSel, setQtdSel] = React.useState<number | null>(null)
  const atual = rotas.find(r => r.quantidade === qtdSel) ?? rotas.find(r => r.quantidade === calculo.sweetSpotIdealQtd) ?? rotas[0]
  if (!atual) return null
  const melhor = atual.melhor
  const opcoes = form.rota ?? {}
  const set = (patch: Partial<OpcoesRota>) => onOpcoes({ ...opcoes, ...patch })

  const ativos = producao.fornecedores.filter(f => f.ativo)
  const impressores = ativos.filter(f => f.maquina && f.servicos.impressao)
  const comServico = (s: keyof (typeof ativos)[number]["servicos"]) => ativos.filter(f => f.servicos[s])

  // Melhor custo de cada impressor em cada tiragem (mostra onde cada um vale mais a pena)
  const matriz = impressores.map(imp => ({
    imp,
    custos: rotas.map(q => q.alternativas.filter(a => a.impressorId === imp.id).reduce<Rota | null>((b, a) => !b || a.custoTotal < b.custoTotal ? a : b, null)),
  }))

  // Faca: qualquer número de cavidades, do máximo que cabe na folha até 1 (o motor refaz as batidas com a escolhida)
  const kCheio = Math.max(1, ...melhor.passadas.map(ps => ps.cavidades))
  const facasDisponiveis = Array.from({ length: kCheio }, (_, i) => kCheio - i)

  const etapasFornecedor: { etapa: "acabamento" | "corteVinco" | "colagem" | "hotStamping"; nome: string; servico: "laminacao" | "corteVinco" | "colagem" | "hotStamping"; mostrar: boolean }[] = [
    { etapa: "acabamento",  nome: "Laminação / verniz", servico: "laminacao",  mostrar: form.laminacao || form.incluirVerniz },
    { etapa: "hotStamping", nome: "Hot stamping",       servico: "hotStamping", mostrar: form.outrosAcabamentos.includes("Hot Stamping") },
    { etapa: "corteVinco",  nome: "Corte e vinco",      servico: "corteVinco", mostrar: true },
    { etapa: "colagem",     nome: "Colagem",            servico: "colagem",    mostrar: (opcoes.colagemModo ?? (form.pecaPlana || form.tipoCaixa === "aviao" ? "nenhuma" : "fornecedor")) === "fornecedor" },
  ]

  // Decisões manuais
  const definirValor = (etapa: EtapaCusto, v: number | null, todas: boolean) => {
    const valores = { ...(opcoes.valores ?? {}) }
    const chaves = v == null ? [String(atual.quantidade), "*"] : [todas ? "*" : String(atual.quantidade)]
    const sem = (k: string) => { const o = { ...(valores[k] ?? {}) }; delete o[etapa]; return o }
    // "Todas" substitui os valores por tiragem desse custo
    if (v != null && todas) for (const k of Object.keys(valores)) valores[k] = sem(k)
    for (const k of chaves) valores[k] = v == null ? sem(k) : { ...sem(k), [etapa]: v }
    for (const k of Object.keys(valores)) if (!Object.keys(valores[k] ?? {}).length) delete valores[k]
    set({ valores: Object.keys(valores).length ? valores : undefined })
  }
  const extras = opcoes.extras ?? []
  const setExtras = (lista: CustoExtra[]) => set({ extras: lista.length ? lista : undefined })
  const mudarExtra = (id: string, patch: Partial<CustoExtra>) => setExtras(extras.map(x => x.id === id ? { ...x, ...patch } : x))
  const multEfetivo = opcoes.multiplicador || multiplicadorPadrao
  const usarRota = (a: Rota) => set({ impressorId: a.impressorId, formatoId: a.formatoId, divisao: a.divisao, facaCavidades: a.facaCavidades })
  const rotaManual = !!(opcoes.impressorId || opcoes.formatoId || opcoes.divisao || opcoes.facaCavidades)
  const formatosDisponiveis = Array.from(new Map(atual.alternativas.map(a => [a.formatoId, a.formatoNome])).entries())
  const qtdManuais = melhor.itens.filter(i => i.valorMotor != null).length
  // Caixas por pedaço digitadas (encaixe, ou o que você sabe que cabe): fixa a rota e o motor refaz a conta
  const salvarCavidades = (lista: number[] | null) => {
    const chave = chaveCavidades(melhor.impressorId, melhor.formatoId, melhor.divisao)
    const todas = { ...(opcoes.cavidades ?? {}) }
    if (lista) todas[chave] = lista
    else delete todas[chave]
    // O valor do papel digitado à mão sai: com as caixas certas, a conta do motor passa a valer
    const valores = lista ? Object.fromEntries(Object.entries(opcoes.valores ?? {}).map(([k, v]) => { const o = { ...v }; delete o.papel; return [k, o] }).filter(([, v]) => Object.keys(v as object).length)) : opcoes.valores
    set({
      cavidades: Object.keys(todas).length ? todas : undefined,
      impressorId: melhor.impressorId, formatoId: melhor.formatoId, divisao: melhor.divisao,
      facaCavidades: lista ? null : opcoes.facaCavidades,
      valores: valores && Object.keys(valores).length ? valores : undefined,
    })
  }

  const temAcabamentoSemTabela = melhor.itens.some(i => (i.etapa === "laminacao" || i.etapa === "verniz") && i.estimado)

  return (
    <Section title="Rotas de produção">
      {/* Alertas */}
      {(calculo.alertas?.length ?? 0) > 0 && (
        <div className="rounded-xl px-4 py-3 bg-[#c57800]/[0.06] space-y-1" style={{ border: "1px solid rgba(197,120,0,0.18)" }}>
          {calculo.alertas!.map(a => (
            <p key={a} className="text-[12px] text-[#8a5400] flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{a}
            </p>
          ))}
        </div>
      )}

      {/* Tiragem */}
      <div className="flex flex-wrap gap-1.5">
        {rotas.map(q => (
          <button key={q.quantidade} onClick={() => setQtdSel(q.quantidade)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium ds-num transition-all duration-150 ${
              q.quantidade === atual.quantidade ? "bg-[#0b0914] text-white" : "bg-white text-[#5e5c68] hover:bg-[rgba(116,116,128,0.08)]"
            }`} style={q.quantidade === atual.quantidade ? undefined : border}>
            {num(q.quantidade)} un
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[1.25fr_1fr] gap-4">
        {/* Rota escolhida */}
        <div key={melhor.id + atual.quantidade} className="bg-white rounded-xl p-5 animate-[apple-slide-up_.25s_ease-out]" style={border}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="text-[9.5px] font-semibold text-[#009351] flex items-center gap-1.5">
                <Check className="w-3 h-3" /> {rotaManual ? "Rota escolhida por você" : "Rota mais barata"}
              </p>
              <p className="text-[15px] font-semibold text-[#191625] mt-1.5 truncate">{melhor.impressorNome}</p>
              <p className="text-[11.5px] text-[rgba(60,60,67,0.6)]">
                {melhor.maquinaNome} · {melhor.divisaoNome} {melhor.formatoNome} · {melhor.pecasPorFolhaPapel} peças por folha
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[22px] font-semibold text-[#191625] ds-num leading-none">{brl(melhor.preco)}</p>
              <p className="text-[11px] text-[rgba(60,60,67,0.55)] ds-num mt-1">{brl(melhor.precoUnit)}/un</p>
            </div>
          </div>

          <CaminhoDaFolha rota={melhor} alternativas={atual.alternativas} manual={rotaManual} perdaPct={producao.perdaPct} esp={producao.espacoEntrePecas}
            maquina={producao.fornecedores.find(f => f.id === melhor.impressorId)?.maquina ?? null}
            folha={(() => { const m = melhor.formatoId.match(/^(\d+)x(\d+)$/); return m ? { largura: Number(m[1]) * 10, altura: Number(m[2]) * 10 } : null })()}
            blank={{ largura: calculo.dieline.largura, altura: calculo.dieline.altura }} />

          <Passadas rota={melhor} onCavidades={salvarCavidades} />

          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { icon: <Printer className="w-3.5 h-3.5" />, l: "Folhas impressas", v: num(melhor.folhasImpressas) },
              { icon: <Scissors className="w-3.5 h-3.5" />, l: "Batidas", v: num(melhor.batidas), s: `faca de ${melhor.facaCavidades}` },
              { icon: <Layers className="w-3.5 h-3.5" />, l: "Papel comprado", v: `${num(melhor.folhasPapel)} fls`, s: melhor.formatoNome },
            ].map(k => (
              <div key={k.l} className="rounded-lg px-3 py-2 bg-[rgba(116,116,128,0.05)]">
                <p className="text-[9.5px] text-[#898892] font-semibold flex items-center gap-1">{k.icon}{k.l}</p>
                <p className="text-[14px] font-semibold text-[#191625] ds-num mt-0.5">{k.v}</p>
                {k.s && <p className="text-[10px] text-[#898892]">{k.s}</p>}
              </div>
            ))}
          </div>

          {/* Custos */}
          <div className="mt-4 divide-y divide-[rgba(60,60,67,0.06)]">
            {melhor.itens.filter(i => i.etapa !== "extra").map((i, idx) => (
              <div key={idx} className="flex items-center gap-3 py-1 text-[12.5px]">
                <span className="w-[96px] shrink-0 text-[#5e5c68] font-medium">{ETAPA_NOME[i.etapa]}</span>
                <span className="flex-1 min-w-0 truncate text-[rgba(60,60,67,0.55)] text-[11.5px]">
                  {i.descricao}{i.fornecedor ? ` · ${i.fornecedor}` : ""}
                </span>
                {i.valorMotor != null ? <Manual motor={i.valorMotor} /> : i.estimado && <Estimado />}
                <ValorEditavel item={i} onSalvar={(v, todas, porque) => {
                  definirValor(i.etapa, v, todas)
                  const motor = i.valorMotor ?? i.valor
                  if (Math.abs(v - motor) > 0.009) onCorrecao?.({ etapa: i.etapa, fornecedorId: i.fornecedorId, fornecedor: i.fornecedor, materialId: form.materialId, quantidade: atual.quantidade,
                    motor, manual: v, todas, tipo: porque.tipo, motivo: porque.motivo, cliente: form.nomeCliente.trim() })
                }} onRestaurar={() => definirValor(i.etapa, null, false)}
                  papel={i.etapa === "papel" ? { folhas: melhor.folhasPapel, quantidade: atual.quantidade, perdaPct: producao.perdaPct, porFolha: melhor.pecasPorFolhaPapel,
                    pedacosPorFolha: melhor.divisao, cavidades: melhor.passadas.map(p => p.cavidades), porPeca: melhor.passadas.map(p => p.porPeca), onCavidades: salvarCavidades } : undefined} />
              </div>
            ))}

            {/* Custos extras, digitados à mão */}
            {extras.map(x => (
              <div key={x.id} className="flex items-center gap-2 py-1.5 text-[12.5px]">
                <span className="w-[96px] shrink-0 text-[#5e5c68] font-medium">Extra</span>
                <input value={x.descricao} placeholder="Descrição (ex.: berço, embalagem)" onChange={e => mudarExtra(x.id, { descricao: e.target.value })}
                  className={`${inputCls} flex-1 min-w-0`} style={inputStyle} />
                <label className="flex items-center gap-1 text-[11px] text-[#5e5c68] whitespace-nowrap cursor-pointer">
                  <input type="checkbox" checked={!!x.porUnidade} onChange={e => mudarExtra(x.id, { porUnidade: e.target.checked })} /> por unidade
                </label>
                <input defaultValue={x.valor ? String(x.valor).replace(".", ",") : ""} placeholder="0,00" inputMode="decimal"
                  onBlur={e => mudarExtra(x.id, { valor: lerNum(e.target.value) ?? 0 })}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
                  className={`${inputCls} w-24 text-right`} style={inputStyle} />
                <span className="ds-num w-[84px] text-right text-[#191625]">{brl(melhor.itens.find(i => i.extraId === x.id)?.valor ?? 0)}</span>
                <button onClick={() => setExtras(extras.filter(y => y.id !== x.id))} aria-label="Remover custo"
                  className="h-7 w-7 grid place-items-center rounded-md text-[#898892] hover:text-[#d33a3c] hover:bg-[#d33a3c]/10 transition-colors"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <div className="py-1.5 flex items-center gap-3">
              <button onClick={() => setExtras([...extras, { id: novoId(), descricao: "", valor: 0 }])}
                className="h-7 px-2 rounded-md text-[11.5px] font-medium text-[#8456e8] hover:bg-[#8456e8]/10 transition-colors flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Adicionar custo
              </button>
              {qtdManuais > 0 && <span className="text-[11px] text-[#898892]">{qtdManuais} {qtdManuais === 1 ? "valor digitado" : "valores digitados"} nesta tiragem</span>}
              {(opcoes.valores || extras.length > 0) && (
                <button onClick={() => set({ valores: undefined, extras: undefined })}
                  className="ml-auto h-7 px-2 rounded-md text-[11px] text-[#898892] hover:text-[#191625] hover:bg-[rgba(116,116,128,0.08)] transition-colors flex items-center gap-1.5">
                  <RotateCcw className="w-3 h-3" /> Voltar tudo ao motor
                </button>
              )}
            </div>
            <div className="flex items-center py-2 text-[12.5px] font-semibold">
              <span className="flex-1 text-[#191625]">Custo total (sem imposto)</span>
              <span className="ds-num text-[#191625]">{brl(melhor.custoTotal)}</span>
            </div>
            <div className="flex items-center gap-2 py-2 text-[12.5px]">
              <span className="text-[#5e5c68]">Preço = custo ×</span>
              <input key={multEfetivo} defaultValue={String(multEfetivo).replace(".", ",")} inputMode="decimal" aria-label="Multiplicador"
                onBlur={e => { const v = lerNum(e.target.value); set({ multiplicador: v && v > 0 && v !== multiplicadorPadrao ? v : null }) }}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
                className={`${inputCls} w-16 text-center ${opcoes.multiplicador ? "text-[#8456e8] font-semibold" : ""}`} style={inputStyle} />
              {opcoes.multiplicador
                ? <button onClick={() => set({ multiplicador: null })} className="text-[11px] text-[#898892] hover:text-[#8456e8] flex items-center gap-1"><RotateCcw className="w-3 h-3" /> padrão {num(multiplicadorPadrao, 1)}</button>
                : <span className="text-[11px] text-[#898892]">padrão das Configurações</span>}
              <span className="ml-auto ds-num text-[#8456e8] font-semibold">{brl(melhor.preco)}</span>
            </div>
            <div className="flex items-center py-2 text-[12.5px]">
              <span className="flex-1 text-[#5e5c68]">Impostos ({num(producao.impostoPct, 1)}%)</span>
              <span className="ds-num text-[#5e5c68]">− {brl(melhor.imposto)}</span>
            </div>
            <div className="flex items-center py-2 text-[13px] font-semibold">
              <span className="flex-1 text-[#191625]">Lucro líquido estimado</span>
              <span className={`ds-num ${margemLiqCls(melhor.margemLiquidaPct)}`}>
                {brl(melhor.lucroLiquido)} · {num(melhor.margemLiquidaPct, 1)}%
              </span>
            </div>
          </div>

          {comFaca && !calculo.facaRegistrada && form.nomeCliente.trim() && (
            <button onClick={() => onRegistrarFaca(melhor)}
              className="mt-3 w-full h-9 rounded-lg text-[12px] font-medium text-[#5e5c68] hover:bg-[rgba(116,116,128,0.06)] transition-colors flex items-center justify-center gap-2"
              style={border}>
              <Wrench className="w-3.5 h-3.5" /> Registrar faca de {melhor.facaCavidades} como de {form.nomeCliente}
            </button>
          )}
          {calculo.facaRegistrada && (
            <p className="mt-3 text-[11.5px] text-[#009351] flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5" />
              {form.nomeCliente} já tem faca de {calculo.facaRegistrada.cavidades} para esta caixa. Não é cobrada de novo.
            </p>
          )}
        </div>

        {/* Escolhas */}
        <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-1 gap-4 items-start content-start">
          <div className="bg-white rounded-xl p-4 space-y-3" style={border}>
            <div className="flex items-center justify-between">
              <p className="text-[9.5px] font-semibold text-[#898892]">Escolhas da rota</p>
              {rotaManual && (
                <button onClick={() => set({ impressorId: null, formatoId: null, divisao: null, facaCavidades: null, cavidades: undefined })}
                  className="text-[11px] text-[#898892] hover:text-[#8456e8] flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Mais barata</button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Seletor label="Impressor" valor={opcoes.impressorId ?? ""}
                opcoes={[{ v: "", nome: "Automático (mais barato)" }, ...impressores.map(f => ({ v: f.id, nome: f.nome }))]}
                onChange={v => set({ impressorId: v || null })} />
              <Seletor label="Papel" valor={opcoes.formatoId ?? ""}
                opcoes={[{ v: "", nome: "Automático" }, ...formatosDisponiveis.map(([id, nome]) => ({ v: id, nome }))]}
                onChange={v => set({ formatoId: v || null })} />
              <Seletor label="Divisão da folha" valor={opcoes.divisao ?? 0}
                opcoes={[{ v: 0, nome: "Automático" }, ...DIVISOES.map(d => ({ v: d.d, nome: d.nome }))]}
                onChange={v => set({ divisao: (v || null) as Divisao | null })} />
              <Seletor label="Faca" valor={opcoes.facaCavidades ?? 0}
                opcoes={[{ v: 0, nome: "Automático" }, ...facasDisponiveis.map(k => ({ v: k, nome: `${k} ${k === 1 ? "cavidade" : "cavidades"}${k === kCheio ? " (cheia)" : ""}` }))]}
                onChange={v => set({ facaCavidades: v || null })} />
              <Seletor<ColagemModo> label="Colagem" valor={opcoes.colagemModo ?? (form.pecaPlana || form.tipoCaixa === "aviao" ? "nenhuma" : "fornecedor")}
                opcoes={[{ v: "fornecedor", nome: "No fornecedor" }, { v: "manual", nome: "Manual (por unidade)" }, { v: "nenhuma", nome: "Sem colagem" }]}
                onChange={v => set({ colagemModo: v })} />
              {etapasFornecedor.filter(e => e.mostrar).map(e => {
                const lista = e.etapa === "acabamento"
                  ? ativos.filter(f => f.servicos.laminacao || f.servicos.verniz)
                  : comServico(e.servico)
                if (lista.length < 2) return null
                return (
                  <Seletor key={e.etapa} label={e.nome} valor={opcoes.fornecedores?.[e.etapa] ?? producao.padroes[e.etapa] ?? ""}
                    opcoes={lista.map(f => ({ v: f.id, nome: f.nome }))}
                    onChange={v => set({ fornecedores: { ...opcoes.fornecedores, [e.etapa]: v } })} />
                )
              })}
            </div>
            {(temAcabamentoSemTabela || opcoes.estimativaAcabamentoFolha) && (
              <label className="flex items-center gap-2 pt-1">
                <span className="text-[11.5px] text-[#5e5c68] flex-1">Estimativa de laminação/verniz (R$ por folha impressa)</span>
                <input type="number" min={0} step={0.01} value={opcoes.estimativaAcabamentoFolha ?? ""}
                  onChange={e => set({ estimativaAcabamentoFolha: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder="0,00"
                  className="w-24 h-8 rounded-lg px-2 text-[12px] text-right ds-num focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20"
                  style={{ border: "1px solid rgba(60,60,67,0.18)" }} />
              </label>
            )}
          </div>

          {/* Impressor × tiragem */}
          {matriz.length > 1 && (
            <div className="bg-white rounded-xl overflow-hidden" style={border}>
              <p className="px-4 pt-3.5 pb-2 text-[9.5px] font-semibold text-[#898892] flex items-center gap-1.5">
                <Truck className="w-3 h-3" /> Custo por impressor e tiragem
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-[11.5px] ds-num">
                  <thead>
                    <tr className="text-[#898892]">
                      <th className="px-4 py-1.5 text-left font-medium">Impressor</th>
                      {rotas.map(q => <th key={q.quantidade} className="px-2 py-1.5 text-right font-medium">{num(q.quantidade)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {matriz.map(({ imp, custos }) => (
                      <tr key={imp.id} className="border-t border-[rgba(60,60,67,0.06)]">
                        <td className="px-4 py-2 text-[#5e5c68] font-medium whitespace-nowrap">{imp.nome}</td>
                        {custos.map((c, i) => {
                          const vencedor = c && rotas[i].melhor.impressorId === imp.id
                          return (
                            <td key={i} className={`px-2 py-2 text-right whitespace-nowrap ${vencedor ? "text-[#009351] font-semibold" : "text-[#5e5c68]"}`}>
                              {c ? brl(c.custoTotal / c.quantidade) : "—"}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-2.5 text-[10.5px] text-[#898892] flex items-start gap-1.5">
                <Info className="w-3 h-3 mt-0.5 shrink-0" /> Custo por unidade. Em verde, o mais barato em cada tiragem.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Alternativas */}
      <div className="bg-white rounded-xl overflow-hidden" style={border}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] ds-num">
            <thead className="bg-[rgba(116,116,128,0.04)]">
              <tr className="text-[9.5px] text-[#898892]">
                {["Impressor", "Papel", "Passadas", "Faca", "Folhas", "Batidas", "Custo", "Preço", "Margem líq.", ""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(60,60,67,0.05)]">
              {atual.alternativas.map(a => {
                const eMelhor = a.id === melhor.id
                const diff = a.custoTotal - melhor.custoTotal
                return (
                  <tr key={a.id} className={eMelhor ? "bg-[#009351]/[0.04]" : "hover:bg-[rgba(116,116,128,0.04)]"}>
                    <td className="px-3 py-2 whitespace-nowrap text-[#191625] font-medium">{a.impressorNome}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-[#5e5c68]">{a.divisaoNome} {a.formatoNome}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-[#5e5c68]">{a.passadas.map(p => p.cavidades).join(" + ")}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-[#5e5c68]">{a.facaCavidades}{a.facaExistente ? " (cliente)" : ""}</td>
                    <td className="px-3 py-2 text-[#5e5c68]">{num(a.folhasImpressas)}</td>
                    <td className="px-3 py-2 text-[#5e5c68]">{num(a.batidas)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-[#191625]">
                      {brl(a.custoTotal)}
                      {a.estimado && <span className="ml-1 text-[#c57800]" title="Tem valor estimado">*</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[#8456e8] font-semibold">{brl(a.preco)}</td>
                    <td className={`px-3 py-2 ${margemLiqCls(a.margemLiquidaPct)}`}>{num(a.margemLiquidaPct, 1)}%</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      {eMelhor
                        ? <span className="text-[10px] font-semibold text-[#009351]">em uso</span>
                        : <span className="inline-flex items-center gap-2">
                            {Math.abs(diff) < 0.5
                              ? <span className="text-[11px] text-[#898892]">mesmo custo</span>
                              : <span className={`text-[11px] ${diff > 0 ? "text-[#e5484d]" : "text-[#009351]"}`}>{diff > 0 ? "+" : "−"}{brl(Math.abs(diff))}</span>}
                            <button onClick={() => usarRota(a)} className="h-6 px-2 rounded-md text-[11px] font-medium text-[#8456e8] hover:bg-[#8456e8]/10 transition-colors">Usar</button>
                          </span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 text-[10.5px] text-[#898892] flex items-center gap-1.5" style={{ borderTop: "1px solid rgba(60,60,67,0.06)" }}>
          <ArrowRight className="w-3 h-3" /> Faca maior custa mais e reduz batidas; o motor testa as duas. “Usar” fixa a rota da linha. * tem valor estimado.
        </p>
      </div>
    </Section>
  )
}
