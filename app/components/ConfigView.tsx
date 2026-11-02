"use client"

import { VARIAVEIS, Rapida } from "../lib/mensagensRapidas"
import React, { useState, useRef } from "react"
import { Percent, Layers, Target, Palette, Sparkles, Database, Download, Upload, Plus, X, Check, Save, RotateCcw, Info, KeyRound, CalendarOff, Handshake, Mic, Zap, BookOpen } from "lucide-react"
import { Configuracoes, Material, CONFIG_PADRAO } from "../config"
import { FERIADOS_SP } from "../lib/diasUteis"
import { nomeChave } from "../lib/negocio"
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

export function ConfigView({ config, onSave, onExportar, onImportar, clientes = [] }: {
  config: Configuracoes
  clientes?: string[]
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
              <Campo label="Sinal na aprovação online" dica="Pedido ao cliente ao aprovar pelo link (Pix na hora)">
                <Num value={draft.sinalPct ?? CONFIG_PADRAO.sinalPct} step={5} sufixo="%"
                  onChange={v => setDraft(d => ({ ...d, sinalPct: Math.min(100, Math.max(0, v)) }))} />
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

          <FeriadosCartao config={draft} onChange={feriados => setDraft(d => ({ ...d, feriados }))} />
          <RelacionamentoCartao config={draft} clientes={clientes} onChange={lista => setDraft(d => ({ ...d, clientesRelacionamento: lista }))} />

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

          <ChaveGroq configurada={!!draft.groqConfigurado} />

          <MensagensRapidas />

          {/* Guia de atendimento: a IA lê antes de sugerir qualquer mensagem */}
          <Cartao className="ds-entrada">
            <TituloCartao titulo="Guia de atendimento" icone={<BookOpen className="w-4 h-4" />}
              sub="Como você conversa: tom, frases, etapas e regras. A IA lê antes de escrever na fila de mensagens. Edite à vontade." />
            <textarea value={draft.guiaAtendimento ?? ""} onChange={e => setDraft(d => ({ ...d, guiaAtendimento: e.target.value }))}
              rows={18} placeholder="Ainda sem guia."
              className="w-full rounded-lg px-3 py-2.5 text-[12.5px] leading-relaxed font-mono text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] ds-borda resize-y" />
            <p className="text-[11px] text-[#898892] mt-1.5">{(draft.guiaAtendimento ?? "").split(/\s+/).filter(Boolean).length} palavras · salva com o botão Salvar da página</p>
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

const dataBR = (e: string) => e.length === 5 ? `${e.slice(3)}/${e.slice(0, 2)} (todo ano)` : e.split("-").reverse().join("/")

// Feriados locais: entram em todos os prazos (fornecedores, entrega, meta por dia útil)
function FeriadosCartao({ config, onChange }: { config: Configuracoes; onChange: (f: NonNullable<Configuracoes["feriados"]>) => void }) {
  const f = config.feriados ?? CONFIG_PADRAO.feriados!
  const [data, setData] = useState("")
  const [todoAno, setTodoAno] = useState(true)
  const extras = f.extras ?? []
  const adicionar = () => {
    if (!data) return
    const valor = todoAno ? data.slice(5) : data
    if (!extras.includes(valor)) onChange({ ...f, extras: [...extras, valor].sort() })
    setData("")
  }
  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Feriados e dias sem expediente" icone={<CalendarOff className="w-4 h-4" />}
        sub="Além dos nacionais, estes dias não contam nos prazos em dias úteis." />
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input type="checkbox" className="mt-0.5" checked={f.cidade === "sp"} onChange={e => onChange({ ...f, cidade: e.target.checked ? "sp" : null })} />
        <span className="text-[12.5px] text-[#191625]">São Paulo (cidade e estado)
          <span className="block text-[11px] text-[#898892]">{FERIADOS_SP.map(x => `${x.md.slice(3)}/${x.md.slice(0, 2)} ${x.nome}`).join(" · ")}</span>
        </span>
      </label>
      {extras.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {extras.map(e => (
            <span key={e} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-lg bg-[rgba(116,116,128,0.08)] text-[11.5px] text-[#191625] ds-num">
              {dataBR(e)}
              <button onClick={() => onChange({ ...f, extras: extras.filter(x => x !== e) })} aria-label="Remover dia"
                className="w-5 h-5 grid place-items-center rounded text-[#898892] hover:text-[#d33a3c]"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <input type="date" value={data} onChange={e => setData(e.target.value)} className={`${inputCls} w-[150px]`} />
        <label className="flex items-center gap-1.5 text-[11.5px] text-[#5e5c68] cursor-pointer">
          <input type="checkbox" checked={todoAno} onChange={e => setTodoAno(e.target.checked)} /> todo ano
        </label>
        <Botao icone={<Plus className="w-3.5 h-3.5" />} onClick={adicionar} disabled={!data}>Adicionar dia</Botao>
      </div>
      <p className="text-[11px] text-[#898892] mt-2">Ex.: recesso de fim de ano (desmarque “todo ano”) ou feriado do município do fornecedor.</p>
    </Cartao>
  )
}

// Clientes que recebem antes de quitar: o saldo é esperado alguns dias depois da entrega
function RelacionamentoCartao({ config, clientes, onChange }: {
  config: Configuracoes; clientes: string[]; onChange: (l: NonNullable<Configuracoes["clientesRelacionamento"]>) => void
}) {
  const lista = config.clientesRelacionamento ?? []
  const [nome, setNome] = useState("")
  const [dias, setDias] = useState("30")
  const adicionar = (n = nome.trim(), d = parseInt(dias) || 30) => {
    if (!n || lista.some(r => nomeChave(r.nome) === nomeChave(n))) return
    onChange([...lista, { nome: n, diasAposEntrega: d }])
    setNome("")
  }
  const sugestao = clientes.find(c => /maur[ií]cio/i.test(c))
  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Clientes de relacionamento" icone={<Handshake className="w-4 h-4" />}
        sub="Recebem o pedido antes de quitar. A previsão de caixa espera o pagamento depois da entrega, e o Painel só cobra depois desse prazo." />
      <div className="divide-y divide-[rgba(60,60,67,0.06)]">
        {lista.map((r, i) => (
          <div key={r.nome} className="flex items-center gap-2 py-2">
            <span className="flex-1 text-[12.5px] text-[#191625] truncate">{r.nome}</span>
            <Num value={r.diasAposEntrega} sufixo="d" className="w-[84px] shrink-0"
              onChange={v => onChange(lista.map((x, j) => j === i ? { ...x, diasAposEntrega: Math.max(0, v) } : x))} />
            <span className="text-[11px] text-[#898892] w-[92px]">após a entrega</span>
            <button onClick={() => onChange(lista.filter((_, j) => j !== i))} aria-label={`Remover ${r.nome}`}
              className="w-8 h-8 grid place-items-center rounded-lg text-[#898892] hover:text-[#d33a3c] hover:bg-[#d33a3c]/10 shrink-0"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
      {lista.length === 0 && sugestao && (
        <button onClick={() => adicionar(sugestao, 30)}
          className="mb-1 w-full h-9 rounded-lg text-[12px] font-medium text-[#8456e8] bg-[#8456e8]/[0.06] hover:bg-[#8456e8]/10 transition-colors flex items-center justify-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Adicionar {sugestao} · 30 dias após a entrega
        </button>
      )}
      <div className="flex items-center gap-2 mt-2">
        <input value={nome} onChange={e => setNome(e.target.value)} list="clientes-relacionamento" placeholder="Cliente"
          onKeyDown={e => e.key === "Enter" && adicionar()} className={`${inputCls} flex-1 min-w-0`} />
        <datalist id="clientes-relacionamento">{clientes.map(c => <option key={c} value={c} />)}</datalist>
        <input value={dias} onChange={e => setDias(e.target.value)} inputMode="numeric" className={`${inputCls} w-[64px] text-center ds-num`} aria-label="Dias após a entrega" />
        <Botao icone={<Plus className="w-3.5 h-3.5" />} onClick={() => adicionar()} disabled={!nome.trim()}>Adicionar</Botao>
      </div>
    </Cartao>
  )
}

// Chave do Groq (transcrição dos áudios do WhatsApp): enviada direto ao servidor, que confere e guarda; nunca volta para a tela
function ChaveGroq({ configurada }: { configurada: boolean }) {
  const [ok, setOk] = useState(configurada)
  const [chave, setChave] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    setSalvando(true); setMsg(null)
    const r = await fetch("/api/config/groq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave }) }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    if (r?.ok) { setOk(true); setChave(""); setMsg("Chave conferida e guardada.") } else setMsg(d?.erro ?? "Sem conexão.")
    setSalvando(false)
  }
  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Transcrição de áudios" icone={<Mic className="w-4 h-4" />}
        sub="Chave do Groq: transcreve os áudios do WhatsApp. Fica guardada só no servidor; aqui aparece apenas se está configurada." />
      <p className="text-[12.5px] mb-2 font-medium" style={{ color: ok ? "#009351" : "#c57800" }}>{ok ? "Configurada" : "Não configurada"}</p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <KeyRound className="w-3.5 h-3.5 text-[#898892] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input type="password" value={chave} autoComplete="off" placeholder={ok ? "Colar uma chave nova para trocar" : "gsk_…"}
            onChange={e => setChave(e.target.value)} className={`${inputCls} w-full pl-8 font-mono`} />
        </div>
        <Botao onClick={salvar} disabled={salvando || !chave.trim()}>{salvando ? "Conferindo…" : "Salvar"}</Botao>
      </div>
      {msg && <p className="text-[12px] mt-2" style={{ color: msg.startsWith("Chave conferida") ? "#009351" : "#d33a3c" }}>{msg}</p>}
    </Cartao>
  )
}

// Mensagens rápidas do WhatsApp ("/" na caixa de mensagem). Salvas direto no banco (tabela quick_replies).
function MensagensRapidas() {
  const [lista, setLista] = useState<Rapida[]>([])
  const [editando, setEditando] = useState<Partial<Rapida> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const textoRef = useRef<HTMLTextAreaElement>(null)
  const carregar = () => fetch("/api/whatsapp/rapidas").then(r => r.json()).then(d => setLista(Array.isArray(d) ? d : [])).catch(() => {})
  React.useEffect(() => { carregar() }, [])
  async function salvar() {
    if (!editando) return
    setErro(null)
    const r = await fetch("/api/whatsapp/rapidas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editando) }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    if (r?.ok) { setEditando(null); carregar() } else setErro(d?.erro ?? "Sem conexão.")
  }
  async function apagar(id: string) {
    await fetch(`/api/whatsapp/rapidas?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {})
    carregar()
  }
  function variavel(chave: string) {
    const el = textoRef.current, v = `{{${chave}}}`
    const t = editando?.corpo ?? "", i = el?.selectionStart ?? t.length
    setEditando(e => ({ ...e, corpo: t.slice(0, i) + v + t.slice(i) }))
  }
  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Mensagens rápidas" icone={<Zap className="w-4 h-4" />}
        sub="No WhatsApp do sistema, digite / na caixa de mensagem para escolher uma. As variáveis são preenchidas com os dados do contato."
        acao={!editando ? <Botao icone={<Plus className="w-3.5 h-3.5" />} onClick={() => setEditando({ atalho: "", corpo: "", quando_usar: "", ativa: true })}>Nova</Botao> : undefined} />
      {editando && (
        <div className="rounded-xl p-3 mb-3 space-y-2" style={{ background: "rgba(116,116,128,0.06)" }}>
          <div className="flex gap-2">
            <input value={editando.atalho ?? ""} onChange={e => setEditando(x => ({ ...x, atalho: e.target.value }))} placeholder="/atalho" className={`${inputCls} w-32 font-mono`} />
            <input value={editando.quando_usar === "—" ? "" : editando.quando_usar ?? ""} onChange={e => setEditando(x => ({ ...x, quando_usar: e.target.value }))} placeholder="Quando usar (também orienta o agente)" className={`${inputCls} flex-1`} />
          </div>
          <textarea ref={textoRef} value={editando.corpo ?? ""} onChange={e => setEditando(x => ({ ...x, corpo: e.target.value }))} rows={3}
            placeholder="Texto da mensagem" className={`${inputCls} w-full h-auto py-2 resize-y`} />
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-[#898892]">Inserir:</span>
            {VARIAVEIS.map(v => (
              <button key={v.chave} onClick={() => variavel(v.chave)} title={v.descricao}
                className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-white ds-borda text-[#8456e8]">{`{{${v.chave}}}`}</button>
            ))}
            <div className="ml-auto flex gap-2">
              <Botao variante="fantasma" onClick={() => { setEditando(null); setErro(null) }}>Cancelar</Botao>
              <Botao variante="primario" onClick={salvar}>Salvar</Botao>
            </div>
          </div>
          {erro && <p className="text-[12px] text-[#d33a3c]">{erro}</p>}
        </div>
      )}
      <div className="divide-y divide-[rgba(60,60,67,0.08)]">
        {lista.map(r => (
          <div key={r.id} className="py-2.5 flex items-start gap-3">
            <span className="text-[12px] font-mono font-semibold text-[#8456e8] w-24 shrink-0 pt-px">{r.atalho}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-[12.5px] whitespace-pre-wrap ${r.ativa ? "text-[#191625]" : "text-[#898892] line-through"}`}>{r.corpo}</p>
              {r.quando_usar && r.quando_usar !== "—" && <p className="text-[11px] text-[#898892] mt-0.5">{r.quando_usar}</p>}
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => setEditando(r)} className="text-[11.5px] font-semibold text-[#8456e8] px-1.5">Editar</button>
              <button onClick={async () => { await fetch("/api/whatsapp/rapidas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...r, ativa: !r.ativa }) }); carregar() }}
                className="text-[11.5px] text-[#898892] px-1.5">{r.ativa ? "Desativar" : "Ativar"}</button>
              <button onClick={() => apagar(r.id)} aria-label="Apagar" className="text-[#898892] hover:text-[#d33a3c] px-1"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
        {!lista.length && <p className="text-[12px] text-[#898892] py-3">Nenhuma mensagem rápida ainda.</p>}
      </div>
    </Cartao>
  )
}
