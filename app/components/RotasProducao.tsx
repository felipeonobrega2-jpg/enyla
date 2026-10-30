"use client"

import React from "react"
import { AlertTriangle, ArrowRight, Check, Printer, Scissors, Layers, Truck, Wrench, Info } from "lucide-react"
import { Calculo, FormData } from "../types"
import { ConfigProducao, OpcoesRota, Rota, ItemCusto, ColagemModo } from "../lib/producao"
import { brl, num } from "../utils"
import { Section } from "./ui"

const border = { border: "1px solid rgba(60,60,67,0.08)" }

const ETAPA_NOME: Record<ItemCusto["etapa"], string> = {
  papel: "Papel", impressao: "Impressão", laminacao: "Laminação", verniz: "Verniz",
  hotStamping: "Hot stamping", corteVinco: "Corte e vinco", colagem: "Colagem",
  arte: "Arte", frete: "Frete", faca: "Faca", cliche: "Clichê", fotolito: "Fotolito",
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

function Passadas({ rota }: { rota: Rota }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {rota.passadas.map((p, i) => (
        <span key={i} className="text-[11px] ds-num px-2 py-1 rounded-lg bg-[rgba(116,116,128,0.08)] text-[#5e5c68]">
          Passada {i + 1}: <strong className="text-[#191625]">{p.cavidades} cav.</strong>
          {" "}em {num(p.largura / 10, 1)}×{num(p.altura / 10, 1)} cm{p.porPeca > 1 ? ` (×${p.porPeca})` : ""}
          {" · "}{num(p.folhas)} folhas
        </span>
      ))}
    </div>
  )
}

export function RotasProducao({ calculo, form, producao, comFaca, onOpcoes, onRegistrarFaca }: {
  calculo: Calculo
  form: FormData
  producao: ConfigProducao
  comFaca: boolean
  onOpcoes: (o: OpcoesRota) => void
  onRegistrarFaca: (rota: Rota) => void
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

  const facasDisponiveis = Array.from(new Set(atual.alternativas
    .filter(a => a.impressorId === melhor.impressorId && a.formatoId === melhor.formatoId && a.divisao === melhor.divisao)
    .map(a => a.facaCavidades))).sort((a, b) => b - a)

  const etapasFornecedor: { etapa: "acabamento" | "corteVinco" | "colagem" | "hotStamping"; nome: string; servico: "laminacao" | "corteVinco" | "colagem" | "hotStamping"; mostrar: boolean }[] = [
    { etapa: "acabamento",  nome: "Laminação / verniz", servico: "laminacao",  mostrar: form.laminacao || form.incluirVerniz },
    { etapa: "hotStamping", nome: "Hot stamping",       servico: "hotStamping", mostrar: form.outrosAcabamentos.includes("Hot Stamping") },
    { etapa: "corteVinco",  nome: "Corte e vinco",      servico: "corteVinco", mostrar: true },
    { etapa: "colagem",     nome: "Colagem",            servico: "colagem",    mostrar: (opcoes.colagemModo ?? (form.tipoCaixa === "aviao" ? "nenhuma" : "fornecedor")) === "fornecedor" },
  ]

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
                <Check className="w-3 h-3" /> {opcoes.impressorId ? "Rota escolhida" : "Rota mais barata"}
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

          <Passadas rota={melhor} />

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
            {melhor.itens.map((i, idx) => (
              <div key={idx} className="flex items-center gap-3 py-2 text-[12.5px]">
                <span className="w-[96px] shrink-0 text-[#5e5c68] font-medium">{ETAPA_NOME[i.etapa]}</span>
                <span className="flex-1 min-w-0 truncate text-[rgba(60,60,67,0.55)] text-[11.5px]">
                  {i.descricao}{i.fornecedor ? ` · ${i.fornecedor}` : ""}
                </span>
                {i.estimado && <Estimado />}
                <span className={`ds-num w-[92px] text-right ${i.valor === 0 ? "text-[#898892]" : "text-[#191625]"}`}>{brl(i.valor)}</span>
              </div>
            ))}
            <div className="flex items-center py-2 text-[12.5px] font-semibold">
              <span className="flex-1 text-[#191625]">Custo total (sem imposto)</span>
              <span className="ds-num text-[#191625]">{brl(melhor.custoTotal)}</span>
            </div>
            <div className="flex items-center py-2 text-[12.5px]">
              <span className="flex-1 text-[#5e5c68]">Preço (custo × {num(melhor.preco / Math.max(melhor.custoTotal, 0.01), 1)})</span>
              <span className="ds-num text-[#8456e8] font-semibold">{brl(melhor.preco)}</span>
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
            <p className="text-[9.5px] font-semibold text-[#898892]">Escolhas da rota</p>
            <div className="grid grid-cols-2 gap-2.5">
              <Seletor label="Impressor" valor={opcoes.impressorId ?? ""}
                opcoes={[{ v: "", nome: "Automático (mais barato)" }, ...impressores.map(f => ({ v: f.id, nome: f.nome }))]}
                onChange={v => set({ impressorId: v || null })} />
              <Seletor label="Faca" valor={opcoes.facaCavidades ?? 0}
                opcoes={[{ v: 0, nome: "Automático" }, ...facasDisponiveis.map(k => ({ v: k, nome: `${k} cavidades` }))]}
                onChange={v => set({ facaCavidades: v || null })} />
              <Seletor<ColagemModo> label="Colagem" valor={opcoes.colagemModo ?? (form.tipoCaixa === "aviao" ? "nenhuma" : "fornecedor")}
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
                        : <span className={`text-[11px] ${diff > 0 ? "text-[#e5484d]" : "text-[#009351]"}`}>{diff > 0 ? "+" : "−"}{brl(Math.abs(diff))}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 text-[10.5px] text-[#898892] flex items-center gap-1.5" style={{ borderTop: "1px solid rgba(60,60,67,0.06)" }}>
          <ArrowRight className="w-3 h-3" /> Faca maior custa mais e reduz batidas; o motor testa as duas. * tem valor estimado.
        </p>
      </div>
    </Section>
  )
}
