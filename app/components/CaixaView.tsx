"use client"

import React from "react"
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, CalendarDays, Landmark, Plus, X, Check, Pencil, Repeat, CircleCheck } from "lucide-react"
import { KanbanCard, LancamentoFinanceiro, FormData } from "../types"
import { Configuracoes, GastoFixo } from "../config"
import { montarPedidos } from "../lib/negocio"
import { previsaoDeCaixa, Semana, Movimento, PlanoConta } from "../lib/caixa"
import { brl, num } from "../utils"
import { Cartao, TituloCartao, Kpi, GradeKpis, LinhaLista, ColunasDuplas, Gaveta, Selo, Botao } from "./ds"

const inputCls = "h-9 rounded-lg px-2.5 text-[12.5px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] transition-colors ds-borda"
const dataCurta = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7)
const hojeIso = () => new Date().toLocaleDateString("sv-SE")
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const curto = (n: number) => Math.abs(n) >= 10_000 ? `R$ ${num(n / 1000, Math.abs(n) >= 100_000 ? 0 : 1)} mil` : brl(n)

const ORIGEM: Record<Movimento["origem"], string> = {
  cobranca: "cobrança", saldoEntrega: "saldo na entrega", despesa: "despesa", producao: "produção (estimado)", fixo: "custo fixo", planoConta: "pagamento planejado",
}

export function CaixaView({ kanban, lancamentos, historico, config, onUpdateConfig, onAddLancamento, onAbrirCard }: {
  kanban: KanbanCard[]
  lancamentos: LancamentoFinanceiro[]
  historico: { form: FormData; numero?: string }[]
  config: Configuracoes
  onUpdateConfig: (cfg: Configuracoes) => void
  onAddLancamento: (l: LancamentoFinanceiro) => void
  onAbrirCard?: (card: KanbanCard) => void
}) {
  const pedidos = React.useMemo(() => montarPedidos(kanban, lancamentos), [kanban, lancamentos])
  const prev = React.useMemo(() => previsaoDeCaixa({ pedidos, lancamentos, historico, config }), [pedidos, lancamentos, historico, config])
  const [semanaAberta, setSemanaAberta] = React.useState<number | null>(null)

  const entra = prev.semanas.reduce((s, w) => s + w.totalEntradas, 0)
  const sai = prev.semanas.reduce((s, w) => s + w.totalSaidas, 0)
  const atrasado = prev.semanas[0]?.entradas.filter(m => m.atrasado).reduce((s, m) => s + m.valor, 0) ?? 0
  const dividaContas = prev.contas.reduce((s, c) => s + Math.max(0, c.saldo + c.aVir) - c.planos.reduce((a, p) => a + p.valor, 0), 0)
  const saldoFinal = prev.semanas[prev.semanas.length - 1]?.saldoFinal ?? null
  const livre = saldoFinal == null ? null : saldoFinal - Math.max(0, dividaContas)
  const semana = prev.semanas[semanaAberta ?? -1]

  return (
    <div className="space-y-4 pt-1">
      <GradeKpis>
        <SaldoHoje config={config} saldo={prev.saldoInicial} onUpdateConfig={onUpdateConfig} />
        <Kpi rotulo="Entra em 8 semanas" icone={<TrendingUp className="w-3.5 h-3.5" />} tom="sucesso" valor={entra} formato={curto}
          sub={atrasado > 0.5 ? `${curto(atrasado)} já deveria ter entrado` : "cobranças e saldos na entrega"} />
        <Kpi rotulo="Sai em 8 semanas" icone={<TrendingDown className="w-3.5 h-3.5" />} tom="perigo" valor={sai} formato={curto} sub="despesas, produção e fixos" />
        <Kpi rotulo="Menor saldo" icone={<CalendarDays className="w-3.5 h-3.5" />} tom={prev.menor && prev.menor.saldo < 0 ? "perigo" : "neutro"}
          valor={prev.menor?.saldo ?? null} formato={curto}
          sub={prev.menor ? `semana de ${dataCurta(prev.semanas[prev.menor.semana].inicio)}` : "informe o saldo de hoje"} />
        <Kpi rotulo="Livre após fornecedores" icone={<Landmark className="w-3.5 h-3.5" />} tom={livre != null && livre < 0 ? "perigo" : "acento"}
          valor={livre} formato={curto} sub={dividaContas > 0.5 ? `descontando ${curto(dividaContas)} de conta corrente` : "sem conta corrente em aberto"} />
      </GradeKpis>

      {(prev.primeiroNegativo != null || atrasado > 0.5) && (
        <Cartao className="ds-entrada !py-3.5">
          <div className="flex items-start gap-3">
            <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${prev.primeiroNegativo != null ? "text-[#d33a3c]" : "text-[#c57800]"}`} />
            <p className="text-[12.5px] text-[#191625] leading-relaxed">
              {prev.primeiroNegativo != null && <>O saldo fica negativo na semana de <strong>{dataCurta(prev.semanas[prev.primeiroNegativo].inicio)}</strong> ({brl(prev.semanas[prev.primeiroNegativo].saldoFinal ?? 0)}). </>}
              {atrasado > 0.5 && <>A previsão conta com <strong>{brl(atrasado)}</strong> que já deveriam ter entrado (pedidos entregues ou com entrega vencida). Se não forem cobrados agora, o caixa da semana cai para {brl((prev.semanas[0]?.saldoFinal ?? 0) - atrasado)}.</>}
            </p>
          </div>
        </Cartao>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_1fr] gap-4 items-start">
        <Cartao padding={false} className="ds-entrada">
          <div className="px-5 pt-5">
            <TituloCartao titulo="Semana a semana" icone={<Wallet className="w-4 h-4" />}
              sub={prev.saldoInicial == null ? "Informe o saldo de hoje para ver o saldo de cada semana" : `Partindo de ${brl(prev.saldoInicial)} hoje`} />
            <ColunasDuplas formato={curto} nomes={["Entra", "Sai"]}
              itens={prev.semanas.map((w, i) => ({ rotulo: dataCurta(w.inicio), a: w.totalEntradas, b: w.totalSaidas, destaque: i === 0 }))} />
          </div>
          <div className="px-2 pb-2 mt-2">
            {prev.semanas.map((w, i) => (
              <LinhaLista key={w.inicio} titulo={`${dataCurta(w.inicio)} a ${dataCurta(w.fim)}`}
                sub={w.entradas.length + w.saidas.length === 0 ? "sem movimento previsto" : `+${brl(w.totalEntradas)} · −${brl(w.totalSaidas)}`}
                valor={w.saldoFinal == null ? "—" : brl(w.saldoFinal)} valorSub="saldo no fim"
                tom={w.saldoFinal != null && w.saldoFinal < 0 ? "perigo" : undefined}
                onClick={w.entradas.length + w.saidas.length ? () => setSemanaAberta(i) : undefined} />
            ))}
            {prev.semData.length > 0 && (
              <LinhaLista titulo="Sem data provável" sub="pedidos sem entrega prevista: defina a entrega para entrarem na semana certa"
                valor={brl(prev.semData.reduce((s, m) => s + m.valor, 0))} tom="info"
                onClick={() => setSemanaAberta(-2)} />
            )}
          </div>
        </Cartao>

        <div className="space-y-4">
          {prev.contas.map(c => (
            <ContaCorrente key={c.fornecedorId} conta={c} config={config} onUpdateConfig={onUpdateConfig} onAddLancamento={onAddLancamento} />
          ))}
          <CustosFixos config={config} onUpdateConfig={onUpdateConfig} />
        </div>
      </div>

      <Gaveta aberta={semanaAberta != null} onFechar={() => setSemanaAberta(null)}
        titulo={semanaAberta === -2 ? "Sem data provável" : semana ? `Semana de ${dataCurta(semana.inicio)} a ${dataCurta(semana.fim)}` : ""}
        sub={semana ? `+${brl(semana.totalEntradas)} · −${brl(semana.totalSaidas)}${semana.saldoFinal != null ? ` · saldo ${brl(semana.saldoFinal)}` : ""}` : undefined}>
        {semanaAberta === -2
          ? prev.semData.map(m => <LinhaMov key={m.id} m={m} onAbrirCard={onAbrirCard} />)
          : semana && <DetalheSemana semana={semana} onAbrirCard={onAbrirCard} />}
      </Gaveta>
    </div>
  )
}

function LinhaMov({ m, onAbrirCard }: { m: Movimento; onAbrirCard?: (c: KanbanCard) => void }) {
  return (
    <LinhaLista titulo={m.descricao}
      sub={`${ORIGEM[m.origem]}${m.atrasado ? " · atrasado" : ` · ${dataCurta(m.data)}`}`}
      valor={`${m.tipo === "entrada" ? "+" : "−"}${brl(m.valor)}`} tom={m.tipo === "entrada" ? "sucesso" : "perigo"}
      onClick={m.card && onAbrirCard ? () => onAbrirCard(m.card!) : undefined} />
  )
}

function DetalheSemana({ semana, onAbrirCard }: { semana: Semana; onAbrirCard?: (c: KanbanCard) => void }) {
  return <>
    {semana.entradas.length > 0 && <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-[#898892]">Entra</p>}
    {semana.entradas.map(m => <LinhaMov key={m.id} m={m} onAbrirCard={onAbrirCard} />)}
    {semana.saidas.length > 0 && <p className="px-3 pt-4 pb-1 text-[11px] font-semibold text-[#898892]">Sai</p>}
    {semana.saidas.map(m => <LinhaMov key={m.id} m={m} onAbrirCard={onAbrirCard} />)}
  </>
}

// Saldo de hoje: com uma conta só, edita direto; com várias, soma as contas (edição na aba Contas)
function SaldoHoje({ config, saldo, onUpdateConfig }: { config: Configuracoes; saldo: number | null; onUpdateConfig: (c: Configuracoes) => void }) {
  const contas = (config.contas ?? []).filter(c => c.ativa && c.tipo !== "credito")
  const [editando, setEditando] = React.useState(false)
  const [txt, setTxt] = React.useState("")
  const salvar = () => {
    const v = parseFloat(txt.replace(/\./g, "").replace(",", "."))
    if (Number.isFinite(v) && contas.length === 1) onUpdateConfig({ ...config, contas: (config.contas ?? []).map(c => c.id === contas[0].id ? { ...c, saldo: v } : c) })
    setEditando(false)
  }
  if (editando) {
    return (
      <Cartao>
        <p className="text-[11px] font-medium text-[#898892] mb-2.5">Saldo em {contas[0]?.nome}</p>
        <div className="flex gap-1.5">
          <input autoFocus value={txt} onChange={e => setTxt(e.target.value)} inputMode="decimal" placeholder="0,00"
            onKeyDown={e => { if (e.key === "Enter") salvar(); if (e.key === "Escape") setEditando(false) }} className={`${inputCls} flex-1 min-w-0 text-right ds-num`} />
          <button onClick={salvar} aria-label="Salvar saldo" className="h-9 w-9 grid place-items-center rounded-lg bg-[#8456e8] text-white shrink-0"><Check className="w-4 h-4" /></button>
        </div>
      </Cartao>
    )
  }
  return (
    <Kpi rotulo="Saldo hoje" icone={<Wallet className="w-3.5 h-3.5" />} tom="acento" valor={saldo} formato={curto}
      sub={contas.length === 1 ? <span className="inline-flex items-center gap-1"><Pencil className="w-3 h-3" /> toque para atualizar</span> : contas.length ? `${contas.length} contas · atualize na aba Contas` : "cadastre uma conta na aba Contas"}
      onClick={contas.length === 1 ? () => { setTxt(saldo != null ? String(saldo).replace(".", ",") : ""); setEditando(true) } : undefined} />
  )
}

function ContaCorrente({ conta, config, onUpdateConfig, onAddLancamento }: {
  conta: ReturnType<typeof previsaoDeCaixa>["contas"][number]
  config: Configuracoes
  onUpdateConfig: (c: Configuracoes) => void
  onAddLancamento: (l: LancamentoFinanceiro) => void
}) {
  const [modo, setModo] = React.useState<"abater" | "planejar" | null>(null)
  const [valor, setValor] = React.useState("")
  const [data, setData] = React.useState(hojeIso())
  const planos = config.caixa?.planos ?? []
  const v = parseFloat(valor.replace(/\./g, "").replace(",", ".")) || 0

  function confirmar() {
    if (v <= 0) return
    if (modo === "abater") {
      // Mesmo formato do ajuste da conta corrente: crédito na conta do fornecedor
      onAddLancamento({
        id: Date.now().toString(), tipo: "receita", descricao: `Abatimento — ${conta.nome}`, valor: v,
        dataVencimento: data, dataPagamento: data, status: "pago", fornecedorId: conta.fornecedorId, formaPagamento: "conta",
        criadoEm: new Date().toLocaleString("pt-BR"),
      } as LancamentoFinanceiro)
    } else {
      const plano: PlanoConta = { id: novoId(), fornecedorId: conta.fornecedorId, data, valor: v }
      onUpdateConfig({ ...config, caixa: { ...config.caixa, planos: [...planos, plano] } })
    }
    setModo(null); setValor("")
  }

  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo={`Conta ${conta.nome}`} icone={<Landmark className="w-4 h-4" />} sub="Conta corrente: os serviços acumulam e você vai abatendo." />
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] text-[#898892]">Você deve hoje</p>
          <p className={`text-[24px] font-semibold ds-num leading-tight ${conta.saldo > 0.5 ? "text-[#d33a3c]" : "text-[#009351]"}`}>{brl(Math.max(0, conta.saldo))}</p>
          {conta.aVir > 1 && <p className="text-[11px] text-[#898892] mt-0.5">+ {brl(conta.aVir)} previstos dos pedidos em produção</p>}
        </div>
        {conta.saldo <= 0.5 && <Selo tom="sucesso"><CircleCheck className="w-3 h-3" /> quitada</Selo>}
      </div>

      {conta.planos.length > 0 && (
        <div className="mt-3 space-y-1">
          {conta.planos.map(p => (
            <div key={p.id} className="flex items-center gap-2 text-[12px]">
              <CalendarDays className="w-3.5 h-3.5 text-[#8456e8] shrink-0" />
              <span className="flex-1 text-[#191625]">Pagar {brl(p.valor)} em {dataCurta(p.data)}</span>
              <button onClick={() => onUpdateConfig({ ...config, caixa: { ...config.caixa, planos: planos.filter(x => x.id !== p.id) } })} aria-label="Remover plano"
                className="h-6 w-6 grid place-items-center rounded-md text-[#898892] hover:text-[#d33a3c] hover:bg-[#d33a3c]/10"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}

      {modo ? (
        <div className="mt-4 space-y-2">
          <p className="text-[11.5px] text-[#5e5c68]">{modo === "abater" ? "Quanto você pagou (pode ser uma conta paga por eles)?" : "Quanto e quando pretende pagar?"}</p>
          <div className="flex gap-1.5">
            <input autoFocus value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" placeholder="0,00"
              onKeyDown={e => e.key === "Enter" && confirmar()} className={`${inputCls} flex-1 min-w-0 text-right ds-num`} />
            <input type="date" value={data} onChange={e => setData(e.target.value)} className={`${inputCls} w-[140px]`} />
          </div>
          <div className="flex gap-2 justify-end">
            <Botao variante="fantasma" onClick={() => setModo(null)}>Cancelar</Botao>
            <Botao variante="primario" disabled={v <= 0} onClick={confirmar}>{modo === "abater" ? "Abater" : "Planejar"}</Botao>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2 flex-wrap">
          <Botao variante="primario" onClick={() => { setModo("abater"); setData(hojeIso()); setValor("") }}>Abater</Botao>
          <Botao onClick={() => { setModo("planejar"); setData(hojeIso()); setValor("") }}>Planejar pagamento</Botao>
          {conta.saldo > 0.5 && <Botao variante="fantasma" onClick={() => { setModo("abater"); setData(hojeIso()); setValor(conta.saldo.toFixed(2).replace(".", ",")) }}>Quitar tudo</Botao>}
        </div>
      )}
      <p className="text-[11px] text-[#898892] mt-3 leading-snug">Sem pagamento planejado, a conta não entra na previsão semana a semana. Ela aparece em “Livre após fornecedores”.</p>
    </Cartao>
  )
}

function CustosFixos({ config, onUpdateConfig }: { config: Configuracoes; onUpdateConfig: (c: Configuracoes) => void }) {
  const fixos = (config.gastosFixos ?? []).filter(g => g.ativa)
  const [nome, setNome] = React.useState("")
  const [valor, setValor] = React.useState("")
  const [dia, setDia] = React.useState("")
  const total = fixos.reduce((s, g) => s + g.valor, 0)

  function adicionar(g?: { nome: string; valor: number; dia: number }) {
    const n = g?.nome ?? nome.trim()
    const v = g?.valor ?? (parseFloat(valor.replace(/\./g, "").replace(",", ".")) || 0)
    const d = g?.dia ?? Math.min(31, Math.max(1, parseInt(dia) || 1))
    if (!n || v <= 0) return
    const cats = config.categoriasDespesa ?? []
    const categoriaId = cats.find(c => /aluguel/i.test(c.nome) && /escrit|aluguel|sala/i.test(n))?.id ?? cats.find(c => c.id === "outros")?.id ?? cats[0]?.id ?? "outros"
    const novo: GastoFixo = { id: novoId(), nome: n, categoriaId, valor: v, diaVencimento: d, ativa: true }
    onUpdateConfig({ ...config, gastosFixos: [...(config.gastosFixos ?? []), novo] })
    setNome(""); setValor(""); setDia("")
  }

  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Custos fixos" icone={<Repeat className="w-4 h-4" />}
        sub={fixos.length ? `${brl(total)} por mês · entram na previsão no dia de cada um` : "Aluguel, internet, salários: entram na previsão todo mês"} />
      <div className="divide-y divide-[rgba(60,60,67,0.06)]">
        {fixos.map(g => (
          <div key={g.id} className="flex items-center gap-2 py-2 text-[12.5px]">
            <span className="flex-1 text-[#191625]">{g.nome}</span>
            <span className="text-[#898892]">dia {g.diaVencimento}</span>
            <span className="ds-num font-medium text-[#191625] w-[90px] text-right">{brl(g.valor)}</span>
          </div>
        ))}
      </div>
      {fixos.length === 0 && (
        <button onClick={() => adicionar({ nome: "Escritório", valor: 799.9, dia: 3 })}
          className="mb-3 w-full h-9 rounded-lg text-[12px] font-medium text-[#8456e8] bg-[#8456e8]/[0.06] hover:bg-[#8456e8]/10 transition-colors flex items-center justify-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Adicionar Escritório · R$ 799,90 · dia 3
        </button>
      )}
      <div className="flex gap-1.5 mt-2">
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome" className={`${inputCls} flex-1 min-w-0`} />
        <input value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" placeholder="R$" className={`${inputCls} w-[90px] text-right ds-num`} />
        <input value={dia} onChange={e => setDia(e.target.value)} inputMode="numeric" placeholder="dia" className={`${inputCls} w-[56px] text-center ds-num`} />
        <button onClick={() => adicionar()} aria-label="Adicionar custo fixo" disabled={!nome.trim() || !valor}
          className="h-9 w-9 grid place-items-center rounded-lg bg-[#8456e8] text-white shrink-0 disabled:opacity-35"><Plus className="w-4 h-4" /></button>
      </div>
      <p className="text-[11px] text-[#898892] mt-2">Para editar ou desativar, use a aba Gastos fixos.</p>
    </Cartao>
  )
}
