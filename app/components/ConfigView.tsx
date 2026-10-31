"use client"

import React, { useState, useRef } from "react"
import { Percent, Layers, Target, Palette, Sparkles, Database, Download, Upload, Plus, X, Check, Save, RotateCcw, Info, KeyRound } from "lucide-react"
import { Configuracoes, Material } from "../config"
import { FORMATOS_PAPEL } from "../dados"
import { normalizarMetas } from "../lib/metas"
import { normalizarProducao } from "../lib/producao"
import { brl, num } from "../utils"
import { useTheme, ThemeChoice } from "./ThemeProvider"
import { Pagina, CabecalhoPagina, Cartao, TituloCartao, Segmentado, Botao } from "./ds"

const inputCls = "h-9 rounded-lg px-2.5 text-[12.5px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] transition-colors ds-borda"

function Campo({ label, dica, children, className = "" }: { label: string; dica?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <span className="text-[11px] text-[#5e5c68] font-medium">{label}</span>
      {children}
      {dica && <span className="text-[11px] text-[#898892] leading-snug">{dica}</span>}
    </label>
  )
}

function Num({ value, onChange, step = 1, prefixo, sufixo, className = "w-full" }: {
  value: number | undefined; onChange: (v: number) => void; step?: number; prefixo?: string; sufixo?: string; className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      {prefixo && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11.5px] text-[#898892] pointer-events-none">{prefixo}</span>}
      <input type="number" step={step} min={0} value={value ?? ""} onChange={e => onChange(Number(e.target.value))}
        className={`${inputCls} w-full text-right ds-num ${prefixo ? "pl-8" : ""} ${sufixo ? "pr-8" : ""}`} />
      {sufixo && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11.5px] text-[#898892] pointer-events-none">{sufixo}</span>}
    </div>
  )
}

export function ConfigView({ config, onSave, onExportar, onImportar }: {
  config: Configuracoes
  onSave: (c: Configuracoes) => void
  onExportar: () => void
  onImportar: (file: File) => void
}) {
  const [draft, setDraft] = useState<Configuracoes>(config)
  const [salvo, setSalvo] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const { theme, setTheme } = useTheme()

  // A configuração chega da API depois da primeira renderização: o rascunho acompanha
  const [base, setBase] = useState(config)
  if (base !== config) { setBase(config); setDraft(config) }

  const sujo = JSON.stringify(draft) !== JSON.stringify(config)
  const metas = normalizarMetas(draft.metas)
  const setMetas = (m: Partial<typeof metas>) => setDraft(d => ({ ...d, metas: { ...normalizarMetas(d.metas), ...m } }))
  const prod = normalizarProducao(draft.producao)
  const fornArte = prod.fornecedores.find(f => f.ativo && f.id === prod.padroes.arte && f.servicos.arte)
  const temTabelaVerniz = prod.fornecedores.some(f => {
    const r = f.ativo ? f.servicos.verniz : undefined
    return !!r && ((r.valor ?? 0) > 0 || Object.values(r.precosPorTipo ?? {}).some(v => v > 0))
  })

  function salvar() {
    onSave(draft)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 1800)
  }

  // Leitura do multiplicador: margem de contribuição antes e depois do imposto
  const mult = draft.multiplicadores.semFaca || 1
  const margemBruta = (1 - 1 / mult) * 100
  const margemLiquida = margemBruta - prod.impostoPct

  return (
    <Pagina>
      <CabecalhoPagina titulo="Configurações" sub="Preço, papel, metas e preferências do sistema. Preços de fornecedores ficam em Fornecedores."
        acoes={<>
          {sujo && <Botao variante="fantasma" icone={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => setDraft(config)}>Descartar</Botao>}
          <Botao variante="primario" onClick={salvar} disabled={!sujo && !salvo}
            className={salvo ? "!bg-[#009351] !shadow-none" : ""}
            icone={salvo ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}>
            {salvo ? "Salvo" : "Salvar alterações"}
          </Botao>
        </>} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <div className="space-y-4">
          {/* Preço */}
          <Cartao className="ds-entrada">
            <TituloCartao titulo="Preço de venda" icone={<Percent className="w-4 h-4" />} sub="Aplicado sobre o custo calculado pelo motor. Dá para mudar em cada orçamento." />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Multiplicador sobre o custo" dica={`Preço = custo × ${num(mult, 2)}`}>
                <Num value={draft.multiplicadores.semFaca} step={0.05} sufixo="×"
                  onChange={v => setDraft(d => ({ ...d, multiplicadores: { ...d.multiplicadores, semFaca: v } }))} />
              </Campo>
              <Campo label="Fator do parcelamento em 12×" dica="Parcela = preço × fator ÷ 12">
                <Num value={draft.multiplicadores.parcelamento12x} step={0.01} sufixo="×"
                  onChange={v => setDraft(d => ({ ...d, multiplicadores: { ...d.multiplicadores, parcelamento12x: v } }))} />
              </Campo>
            </div>
            <div className="mt-4 rounded-xl px-4 py-3 bg-[rgba(116,116,128,0.05)] grid grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] text-[#898892]">Custo de exemplo</p>
                <p className="text-[14px] font-semibold text-[#191625] ds-num mt-0.5">{brl(1000)}</p>
              </div>
              <div>
                <p className="text-[11px] text-[#898892]">Preço</p>
                <p className="text-[14px] font-semibold text-[#8456e8] ds-num mt-0.5">{brl(1000 * mult)}</p>
                <p className="text-[10.5px] text-[#898892] ds-num">12× de {brl(1000 * mult * (draft.multiplicadores.parcelamento12x || 1) / 12)}</p>
              </div>
              <div>
                <p className="text-[11px] text-[#898892]">Margem</p>
                <p className={`text-[14px] font-semibold ds-num mt-0.5 ${margemLiquida >= 40 ? "text-[#009351]" : margemLiquida >= 30 ? "text-[#c57800]" : "text-[#d33a3c]"}`}>{num(margemLiquida, 1)}%</p>
                <p className="text-[10.5px] text-[#898892] ds-num">{num(margemBruta, 1)}% antes de {num(prod.impostoPct, 1)}% de imposto</p>
              </div>
            </div>
          </Cartao>

          {/* Papel */}
          <MateriaisCartao materiais={draft.materiais} onChange={materiais => setDraft(d => ({ ...d, materiais }))} />

          {/* Valores de reserva */}
          <Cartao className="ds-entrada">
            <TituloCartao titulo="Valores de reserva" icone={<Layers className="w-4 h-4" />}
              sub="Usados só quando não há preço de fornecedor cadastrado. Os preços reais ficam em Fornecedores › Cadastro e preços." />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Arte (por trabalho)"
                dica={fornArte ? <span className="text-[#009351]">Não está em uso: o orçamento usa o preço de {fornArte.nome}.</span> : "Em uso: não há fornecedor de arte padrão."}>
                <Num value={draft.custos.arte} prefixo="R$" step={10}
                  onChange={v => setDraft(d => ({ ...d, custos: { ...d.custos, arte: v } }))} />
              </Campo>
              <Campo label="Verniz sem tabela (a cada 2.000 un)"
                dica={temTabelaVerniz ? <span className="text-[#009351]">Não está em uso: há fornecedor com tabela de verniz.</span> : "Em uso quando o verniz não tem tabela nem estimativa por folha."}>
                <Num value={draft.custos.vernizPor2000} prefixo="R$" step={5}
                  onChange={v => setDraft(d => ({ ...d, custos: { ...d.custos, vernizPor2000: v } }))} />
              </Campo>
            </div>
          </Cartao>
        </div>

        <div className="space-y-4">
          {/* Metas */}
          <Cartao className="ds-entrada">
            <TituloCartao titulo="Metas e marcos" icone={<Target className="w-4 h-4" />} sub="A meta aparece no Painel; os marcos são etapas do faturamento acumulado." />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Campo label="Meta mensal">
                <Num value={draft.metaMensal} prefixo="R$" step={1000} onChange={v => setDraft(d => ({ ...d, metaMensal: v }))} />
              </Campo>
              <Campo label="Crescimento para sugerir a meta">
                <Num value={metas.crescimentoPct} sufixo="%" onChange={v => setMetas({ crescimentoPct: v })} />
              </Campo>
              <Campo label="Faturamento antes do sistema">
                <Num value={draft.baselineFaturamento} prefixo="R$" step={1000} onChange={v => setDraft(d => ({ ...d, baselineFaturamento: v }))} />
              </Campo>
            </div>
            <p className="text-[11px] font-medium text-[#5e5c68] mt-5 mb-2">Marcos de faturamento acumulado</p>
            <div className="space-y-2">
              {metas.marcos.map((m, i, lista) => (
                <div key={m.id} className="flex items-center gap-2">
                  <span className="w-5 text-[11px] text-[#898892] ds-num text-right shrink-0">{i + 1}</span>
                  <input value={m.nome} aria-label="Nome do marco"
                    onChange={e => setMetas({ marcos: lista.map((x, j) => j === i ? { ...x, nome: e.target.value } : x) })}
                    className={`${inputCls} flex-1 min-w-0`} />
                  <Num value={m.valor} prefixo="R$" step={1000} className="w-40 shrink-0"
                    onChange={v => setMetas({ marcos: lista.map((x, j) => j === i ? { ...x, valor: v } : x) })} />
                  <button onClick={() => setMetas({ marcos: lista.filter((_, j) => j !== i) })} aria-label="Remover marco"
                    className="w-8 h-8 grid place-items-center rounded-lg text-[#898892] hover:text-[#d33a3c] hover:bg-[#d33a3c]/10 transition-colors shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => { const ultimo = metas.marcos[metas.marcos.length - 1]?.valor ?? 0; setMetas({ marcos: [...metas.marcos, { id: Date.now().toString(36), nome: "Novo marco", valor: ultimo ? ultimo * 2 : 10_000 }] }) }}
              className="mt-3 h-8 px-2.5 rounded-lg text-[12px] font-medium text-[#8456e8] hover:bg-[#8456e8]/10 transition-colors inline-flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Adicionar marco
            </button>
          </Cartao>

          {/* Aparência */}
          <Cartao className="ds-entrada">
            <TituloCartao titulo="Aparência" icone={<Palette className="w-4 h-4" />} sub="“Sistema” acompanha a preferência do seu dispositivo. Vale só para este navegador." />
            <Segmentado<ThemeChoice> valor={theme} onChange={setTheme}
              opcoes={[{ v: "system", nome: "Sistema" }, { v: "light", nome: "Claro" }, { v: "dark", nome: "Escuro" }]} />
          </Cartao>

          {/* IA */}
          <Cartao className="ds-entrada">
            <TituloCartao titulo="Forma IA" icone={<Sparkles className="w-4 h-4" />} sub="Chave da Anthropic usada pela assistente de design de embalagens." />
            <Campo label="Chave da API">
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 text-[#898892] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input type="password" value={draft.apiKey} autoComplete="off" placeholder="sk-ant-…"
                  onChange={e => setDraft(d => ({ ...d, apiKey: e.target.value }))}
                  className={`${inputCls} w-full pl-8 font-mono`} />
              </div>
            </Campo>
          </Cartao>

          {/* Backup */}
          <Cartao className="ds-entrada">
            <TituloCartao titulo="Backup" icone={<Database className="w-4 h-4" />} sub="Histórico, clientes, quadro e configurações em um arquivo JSON." />
            <div className="flex items-center gap-2 flex-wrap">
              <Botao icone={<Download className="w-3.5 h-3.5" />} onClick={onExportar}>Exportar</Botao>
              <Botao variante="fantasma" icone={<Upload className="w-3.5 h-3.5" />} onClick={() => importRef.current?.click()}>Importar…</Botao>
              <input ref={importRef} type="file" accept=".json" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) onImportar(f); e.target.value = "" }} />
            </div>
            <p className="text-[11px] text-[#898892] mt-2.5 flex items-start gap-1.5"><Info className="w-3.5 h-3.5 mt-px shrink-0" /> Importar substitui os dados atuais pelos do arquivo.</p>
          </Cartao>
        </div>
      </div>
    </Pagina>
  )
}

// Linha isolada: o nome usa estado local para o cursor não pular a cada tecla
function MaterialLinha({ m, onNome, onPreco, onRemover }: {
  m: Material
  onNome: (nome: string) => void
  onPreco: (fmtId: string, v: number) => void
  onRemover: () => void
}) {
  const [nome, setNome] = useState(m.nome)
  const [nomeBase, setNomeBase] = useState(m.nome)
  if (nomeBase !== m.nome) { setNomeBase(m.nome); setNome(m.nome) }
  return (
    <div className="flex items-center gap-2 py-1.5">
      <input value={nome} aria-label="Nome do material" onChange={e => setNome(e.target.value)} onBlur={() => nome.trim() && nome !== m.nome && onNome(nome.trim())}
        className={`${inputCls} flex-1 min-w-0`} />
      {FORMATOS_PAPEL.map(f => (
        <Num key={f.id} value={m.precos[f.id] ?? f.precoPor100} prefixo="R$" className="w-[118px] shrink-0" onChange={v => onPreco(f.id, v)} />
      ))}
      <button onClick={onRemover} aria-label={`Remover ${m.nome}`}
        className="w-8 h-8 grid place-items-center rounded-lg text-[#898892] hover:text-[#d33a3c] hover:bg-[#d33a3c]/10 transition-colors shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function MateriaisCartao({ materiais, onChange }: { materiais: Material[]; onChange: (m: Material[]) => void }) {
  const [novo, setNovo] = useState("")
  function adicionar() {
    const nome = novo.trim()
    if (!nome) return
    const id = nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
    if (!id || materiais.some(m => m.id === id)) return
    onChange([...materiais, { id, nome, precos: Object.fromEntries(FORMATOS_PAPEL.map(f => [f.id, f.precoPor100])) }])
    setNovo("")
  }
  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Papel" icone={<Layers className="w-4 h-4" />}
        sub="R$ por 100 folhas, em cada formato. A Calibragem sugere ajustes quando o custo real se afasta destes valores." />
      <div className="flex items-center gap-2 pb-1 text-[10.5px] font-medium text-[#898892]">
        <span className="flex-1">Material</span>
        {FORMATOS_PAPEL.map(f => <span key={f.id} className="w-[118px] text-right pr-1 shrink-0">{f.nome}</span>)}
        <span className="w-8 shrink-0" />
      </div>
      <div className="divide-y divide-[rgba(60,60,67,0.06)]">
        {materiais.map(m => (
          <MaterialLinha key={m.id} m={m}
            onNome={nome => onChange(materiais.map(x => x.id === m.id ? { ...x, nome } : x))}
            onPreco={(fmtId, v) => onChange(materiais.map(x => x.id === m.id ? { ...x, precos: { ...x.precos, [fmtId]: v } } : x))}
            onRemover={() => onChange(materiais.filter(x => x.id !== m.id))} />
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <input value={novo} onChange={e => setNovo(e.target.value)} onKeyDown={e => e.key === "Enter" && adicionar()}
          placeholder="Novo material (ex.: Couchê 170g)" className={`${inputCls} flex-1 min-w-0`} />
        <Botao icone={<Plus className="w-3.5 h-3.5" />} onClick={adicionar} disabled={!novo.trim()}>Adicionar</Botao>
      </div>
    </Cartao>
  )
}
