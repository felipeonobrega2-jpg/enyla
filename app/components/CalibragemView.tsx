"use client"

import React from "react"
import { Gauge, ListChecks, Tag, AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight, Sparkles, ArrowRight, RotateCcw, Check, EyeOff, History } from "lucide-react"
import { FormData, KanbanCard, LancamentoFinanceiro } from "../types"
import { Configuracoes } from "../config"
import { montarPedidos } from "../lib/negocio"
import {
  compararPedidos, desviosPorComponente, comparavel, COMPONENTES, SUBCATEGORIA, Componente, Leitura, Comparacao,
} from "../lib/calibragem"
import { brl, num } from "../utils"
import { Kpi, GradeKpis, Cartao, TituloCartao, LinhaLista, Selo, Vazio, Gaveta, Tom, Botao } from "./ds"
import { sugerirAjustes, aplicarSugestao, desfazerAjuste, ignorarSugestao, aprendizadoDe, Sugestao, AMOSTRA_MINIMA } from "../lib/aprendizado"
import { normalizarProducao } from "../lib/producao"

const LEITURA: Record<Leitura, { nome: string; tom: Tom; orientacao: (nome: string) => string }> = {
  calibrado:   { nome: "calibrado", tom: "sucesso", orientacao: () => "O motor está acertando. Nada a fazer." },
  subestima:   { nome: "motor abaixo do real", tom: "perigo", orientacao: n => `Os orçamentos estão saindo com ${n.toLowerCase()} mais barato do que custa. Revise a regra de cobrança desse serviço na aba Cadastro e preços.` },
  superestima: { nome: "motor acima do real", tom: "alerta", orientacao: n => `${n} está pesando mais do que custa e encarecendo os orçamentos. Revise a regra desse serviço na aba Cadastro e preços.` },
  raroLancado: { nome: "quase nunca lançado", tom: "info", orientacao: n => `${n} entra no orçamento, mas quase nunca aparece nos custos. Se é feito por você ou já vem embutido em outra nota, ajuste o orçamento; se é pago à parte, lance o custo no pedido.` },
  naoPrevisto: { nome: "não previsto", tom: "alerta", orientacao: n => `${n} aparece nos custos, mas o motor não prevê. Cadastre o valor em cada fornecedor (campo frete) para entrar no orçamento.` },
}

const nomeComp = (c: Componente) => COMPONENTES.find(x => x.id === c)?.nome ?? c

// Orientação específica quando o motivo é conhecido
const ORIENTACAO_RARO: Partial<Record<Componente, string>> = {
  colagem: "A colagem quase nunca aparece nos custos. Se você cola internamente, escolha \"Colagem manual\" ou \"Sem colagem\" nas escolhas da rota do orçamento; se vem embutida na nota do acabamento, está tudo certo e o orçamento só fica um pouco acima.",
  faca: "Na maioria dos pedidos o cliente já tinha a faca. Registre a faca do cliente (botão no orçamento ou aba Ferramental) para o orçamento não cobrar de novo na repetição.",
  arte: "A arte é trabalho seu: entra no preço, mas não sai do caixa. Pode ficar como está.",
}

const dataBR = (iso?: string) => iso ? iso.slice(0, 10).split("-").reverse().join("/") : ""
const vezes = (n: number) => `${num(n, n < 10 ? 2 : 1)}×`

function CartaoSugestao({ s, onAplicar, onIgnorar }: { s: Sugestao; onAplicar?: () => void; onIgnorar: () => void }) {
  const acima = s.real > s.previsto
  return (
    <div className="px-5 py-4 ds-entrada">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13.5px] font-semibold text-[#191625]">{s.titulo}</p>
            {s.porFolha ? <Selo tom="info">valor aprendido</Selo> : s.inconsistente ? <Selo tom="alerta">revisar a regra</Selo> : <Selo tom="acento">ajuste sugerido</Selo>}
          </div>
          {s.porFolha ? <p className="text-[12px] text-[#5e5c68] mt-1">Aprendido em {s.pedidos.length} pedidos: {s.pedidos.join(", ")}.</p> :
          <p className="text-[12px] text-[#5e5c68] mt-1 leading-relaxed">
            Em {s.pedidos.length} pedidos{s.periodo.de ? ` (${dataBR(s.periodo.de)} a ${dataBR(s.periodo.ate)})` : ""}, o real ficou{" "}
            <span className={`font-semibold ${acima ? "text-[#d33a3c]" : "text-[#c57800]"}`}>{num(Math.abs(s.desvioPct), 0)}% {acima ? "acima" : "abaixo"}</span>{" "}
            do previsto: <span className="ds-num">{brl(s.previsto)}</span> previsto, <span className="ds-num font-semibold text-[#191625]">{brl(s.real)}</span> real.
          </p>}

          {s.inconsistente ? <>
            <p className="text-[12px] text-[#191625] mt-2 leading-relaxed">{s.inconsistente.motivo}</p>
            {s.inconsistente.porPedido.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">
              {s.inconsistente.porPedido.map(p => (
                <span key={p.numero} className="text-[11px] ds-num px-2 py-1 rounded-lg bg-[rgba(116,116,128,0.08)] text-[#5e5c68]">
                  <strong className="text-[#191625]">{p.numero}</strong> · {num(p.quantidade)} un{p.jogos && p.jogos > 1 ? ` · ${p.jogos} jogos` : ""} · real {vezes(p.razao)} o previsto
                </span>
              ))}
            </div>}
          </> : <>
            <div className="mt-2.5 space-y-1">
              {s.mudancas.map((m, i) => (
                <p key={i} className="text-[12px] ds-num flex items-center gap-2 flex-wrap">
                  <span className="text-[#898892] line-through decoration-[#898892]/40">{m.de}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#8456e8] shrink-0" />
                  <span className="text-[#191625] font-semibold">{m.para}</span>
                </p>
              ))}
            </div>
            <p className="text-[11px] text-[#898892] mt-2">
              Pedidos usados: {s.pedidos.join(", ")}.
              {s.foraDaCurva && <> Fora da conta por destoar dos demais: {s.foraDaCurva.map(f => `${f.numero} (real ${vezes(f.razao)} o previsto)`).join(", ")}; vale conferir os lançamentos.</>}
            </p>
          </>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Botao variante="fantasma" icone={<EyeOff className="w-3.5 h-3.5" />} onClick={onIgnorar} title="Esconder por 30 dias">Ignorar</Botao>
          {onAplicar && <Botao variante="primario" icone={<Check className="w-3.5 h-3.5" />} onClick={onAplicar}>Aplicar ajuste</Botao>}
        </div>
      </div>
    </div>
  )
}

export function CalibragemView({ kanban, lancamentos, historico, config, onCategorizar, onAtualizarConfig }: {
  kanban: KanbanCard[]
  lancamentos: LancamentoFinanceiro[]
  historico: { form: FormData; numero?: string }[]
  config: Configuracoes
  onCategorizar?: (lancamentoId: string, subcategoria: string) => void
  onAtualizarConfig?: (cfg: Configuracoes) => void
}) {
  const [aberto, setAberto] = React.useState<Comparacao | null>(null)
  const pedidos = React.useMemo(() => montarPedidos(kanban, lancamentos), [kanban, lancamentos])
  const comps = React.useMemo(() => compararPedidos(pedidos, historico, config), [pedidos, historico, config])
  const desvios = desviosPorComponente(comps)
  const completos = comps.filter(comparavel)
  const incompletos = comps.filter(c => !comparavel(c))
  const semCategoria = comps.flatMap(c => c.custosReais.filter(x => x.componente === "semCategoria").map(x => ({ ...x, pedido: c.pedido })))
  const prevTotal = completos.reduce((s, c) => s + c.previstoTotal, 0)
  const realTotal = completos.reduce((s, c) => s + c.realTotal, 0)
  const desvioGeral = prevTotal > 0 ? (realTotal - prevTotal) / prevTotal * 100 : null
  const aRevisar = desvios.filter(d => d.leitura !== "calibrado" && d.componente !== "arte")
  const hojeIso = new Date().toLocaleDateString("sv-SE")
  const sugestoes = React.useMemo(() => sugerirAjustes(comps, config), [comps, config])
  const ajustes = aprendizadoDe(normalizarProducao(config.producao)).ajustes
  // Só o ajuste mais recente de cada item pode ser desfeito (os anteriores já foram sobrescritos)
  const desfazivel = new Set(ajustes.filter((a, i) => ajustes.findIndex(b => b.chave === a.chave) === i).map(a => a.id))

  if (comps.length === 0) return <Vazio icone={<Gauge className="w-9 h-9" />} titulo="Nenhum pedido com custo lançado ainda" sub="A calibragem compara o custo previsto no orçamento com os custos lançados em cada pedido." />

  return (
    <div className="space-y-4">
      <GradeKpis>
        <Kpi rotulo="Pedidos comparados" icone={<ListChecks className="w-3.5 h-3.5" />} tom="acento" valor={completos.length} formato={n => num(Math.round(n))}
          sub={`de ${comps.length} com custo lançado`} />
        <Kpi rotulo="Real × previsto" icone={<Gauge className="w-3.5 h-3.5" />}
          tom={desvioGeral == null ? "neutro" : Math.abs(desvioGeral) <= 10 ? "sucesso" : "alerta"}
          valor={desvioGeral} formato={n => `${n > 0 ? "+" : ""}${num(n, 0)}%`}
          sub={`${brl(realTotal)} real · ${brl(prevTotal)} previsto`} />
        <Kpi rotulo="Componentes a revisar" icone={<AlertTriangle className="w-3.5 h-3.5" />} tom={aRevisar.length ? "alerta" : "sucesso"}
          valor={aRevisar.length} formato={n => num(Math.round(n))} sub={aRevisar.length ? aRevisar.map(d => d.nome).slice(0, 3).join(", ") : "tudo calibrado"} />
        <Kpi rotulo="Custos sem categoria" icone={<Tag className="w-3.5 h-3.5" />} tom={semCategoria.length ? "info" : "sucesso"}
          valor={semCategoria.reduce((s, x) => s + x.lancamento.valor, 0)} formato={brl} sub={`${semCategoria.length} lançamentos para classificar`} />
        <Kpi rotulo="Pedidos incompletos" icone={<ListChecks className="w-3.5 h-3.5" />} tom={incompletos.length ? "neutro" : "sucesso"}
          valor={incompletos.length} formato={n => num(Math.round(n))} sub="sem papel ou impressão lançados" />
      </GradeKpis>

      <Cartao padding={false} className="ds-entrada">
        <div className="px-5 pt-5">
          <TituloCartao titulo="O que o motor aprendeu" icone={<Sparkles className="w-4 h-4" />}
            sub={`Comparando o previsto com o real (recalculado com quem fez cada etapa). Precisa de pelo menos ${AMOSTRA_MINIMA} pedidos concordando; nada muda sem você aplicar, e dá para desfazer.`} />
        </div>
        {sugestoes.length === 0
          ? <div className="px-5 pb-5"><p className="text-[12.5px] text-[#5e5c68] flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#009351]" /> Nenhum ajuste a sugerir agora. Os preços cadastrados estão batendo com os custos lançados.</p></div>
          : <div className="divide-y divide-[rgba(60,60,67,0.06)]">
              {sugestoes.map(s => (
                <CartaoSugestao key={s.chave} s={s}
                  onAplicar={onAtualizarConfig && !s.inconsistente ? () => onAtualizarConfig(aplicarSugestao(config, s, hojeIso)) : undefined}
                  onIgnorar={() => onAtualizarConfig?.(ignorarSugestao(config, s.chave, hojeIso))} />
              ))}
            </div>}
        {ajustes.length > 0 && (
          <div className="px-5 py-4" style={{ borderTop: "1px solid rgba(60,60,67,0.06)" }}>
            <p className="text-[11px] font-semibold text-[#898892] flex items-center gap-1.5 mb-2"><History className="w-3.5 h-3.5" /> Ajustes aplicados</p>
            <div className="space-y-1.5">
              {ajustes.slice(0, 8).map(a => (
                <div key={a.id} className="flex items-center gap-3 text-[12px]">
                  <span className="text-[#898892] ds-num w-[72px] shrink-0">{dataBR(a.data)}</span>
                  <span className="text-[#191625] font-medium shrink-0">{a.titulo}</span>
                  <span className="text-[#898892] truncate flex-1 min-w-0 ds-num">{a.mudancas.map(m => `${m.de} → ${m.para}`).join(" · ")}</span>
                  {desfazivel.has(a.id) && onAtualizarConfig && (
                    <button onClick={() => onAtualizarConfig(desfazerAjuste(config, a.id))}
                      className="h-7 px-2 rounded-md text-[11.5px] text-[#5e5c68] hover:text-[#8456e8] hover:bg-[#8456e8]/10 transition-colors flex items-center gap-1 shrink-0">
                      <RotateCcw className="w-3 h-3" /> Desfazer
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Cartao>

      <Cartao padding={false} className="ds-entrada">
        <div className="px-5 pt-5">
          <TituloCartao titulo="Componente por componente" icone={<Gauge className="w-4 h-4" />}
            sub={`Nos ${completos.length} pedidos com papel e impressão lançados. Previsto = o motor de hoje recalculando o orçamento salvo na quantidade vendida.`} />
        </div>
        <div className="divide-y divide-[rgba(60,60,67,0.06)]">
          {desvios.map(d => {
            const l = LEITURA[d.leitura]
            return (
              <div key={d.componente} className="px-5 py-3.5 flex items-start gap-4">
                <div className="w-[170px] shrink-0">
                  <p className="text-[13px] font-semibold text-[#191625]">{d.nome}</p>
                  <p className="text-[11px] text-[#898892] mt-0.5">lançado em {d.lancadoEm} de {d.pedidos} pedidos</p>
                </div>
                <div className="w-[230px] shrink-0 text-[12.5px] ds-num">
                  {d.lancadoEm > 0 ? <>
                    <span className="text-[#5e5c68]">{brl(d.previsto)}</span>
                    <span className="text-[#898892]"> previsto · </span>
                    <span className="text-[#191625] font-semibold">{brl(d.real)}</span>
                    <span className="text-[#898892]"> real</span>
                    {d.desvioPct != null && (
                      <span className={`ml-2 inline-flex items-center font-semibold ${d.desvioPct > 0 ? "text-[#d33a3c]" : "text-[#c57800]"}`}>
                        {d.desvioPct > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}{num(Math.abs(d.desvioPct), 0)}%
                      </span>
                    )}
                  </> : <span className="text-[#898892]">{brl(d.previstoTodos)} previsto, nada lançado</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <Selo tom={d.componente === "arte" && d.leitura === "raroLancado" ? "neutro" : l.tom}>{d.componente === "arte" && d.leitura === "raroLancado" ? "custo interno" : l.nome}</Selo>
                  <p className="text-[11.5px] text-[#5e5c68] mt-1 leading-relaxed">{(d.leitura === "raroLancado" && ORIENTACAO_RARO[d.componente]) || l.orientacao(d.nome)}</p>
                </div>
              </div>
            )
          })}
        </div>
      </Cartao>

      <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-4 items-start">
        <Cartao padding={false} className="ds-entrada">
          <div className="px-5 pt-5">
            <TituloCartao titulo="Pedido a pedido" icone={<ListChecks className="w-4 h-4" />} sub="Clique para ver o custo de cada componente" />
          </div>
          <div className="px-2 pb-2 -mt-1">
            {comps.map(c => {
              const dif = c.previsto ? (c.realTotal - c.previstoTotal) / Math.max(c.previstoTotal, 1) * 100 : null
              return (
                <LinhaLista key={c.pedido.key} titulo={`${c.pedido.numero} · ${c.pedido.nomeCliente}`}
                  sub={!c.previsto ? "orçamento não recalculável (proposta personalizada ou sem orçamento salvo)"
                    : !comparavel(c) ? `custos incompletos · real ${brl(c.realTotal)}`
                    : `previsto ${brl(c.previstoTotal)} · real ${brl(c.realTotal)}`}
                  valor={dif == null || !comparavel(c) ? "—" : `${dif > 0 ? "+" : ""}${num(dif, 0)}%`}
                  tom={dif == null || !comparavel(c) ? undefined : Math.abs(dif) <= 15 ? "sucesso" : dif > 0 ? "perigo" : "alerta"}
                  onClick={() => setAberto(c)} />
              )
            })}
          </div>
        </Cartao>

        <Cartao padding={false} className="ds-entrada">
          <div className="px-5 pt-5">
            <TituloCartao titulo="Custos sem categoria" icone={<Tag className="w-4 h-4" />}
              sub="Escolha o componente de cada um para entrar na calibragem" />
          </div>
          <div className="px-2 pb-2 -mt-1">
            {semCategoria.length === 0 && <Vazio icone={<CheckCircle2 className="w-8 h-8" />} titulo="Todos os custos estão classificados" />}
            {semCategoria.map(x => (
              <LinhaLista key={x.lancamento.id} titulo={x.lancamento.descricao} sub={`${x.pedido.numero} · ${x.pedido.nomeCliente}`}
                valor={brl(x.lancamento.valor)}
                acao={onCategorizar ? (
                  <select defaultValue="" onChange={e => { if (e.target.value) onCategorizar(x.lancamento.id, e.target.value) }}
                    className="h-8 mr-1 rounded-lg px-2 text-[11.5px] text-[#191625] bg-white focus:outline-none ds-borda shrink-0">
                    <option value="" disabled>Classificar…</option>
                    {COMPONENTES.filter(c => c.id !== "semCategoria").map(c => <option key={c.id} value={SUBCATEGORIA[c.id as Exclude<Componente, "semCategoria">]}>{c.nome}</option>)}
                  </select>
                ) : undefined} />
            ))}
          </div>
        </Cartao>
      </div>

      <Gaveta aberta={!!aberto} titulo={aberto ? `${aberto.pedido.numero} · ${aberto.pedido.nomeCliente}` : ""}
        sub={aberto ? `${num(aberto.pedido.quantidade)} un · ${aberto.previsto ? `previsto ${brl(aberto.previstoTotal)} · ` : ""}real ${brl(aberto.realTotal)}` : undefined}
        onFechar={() => setAberto(null)}>
        {aberto && <>
          <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-[#898892]">Por componente (previsto · real)</p>
          {COMPONENTES.filter(c => (aberto.previsto?.[c.id] ?? 0) > 0 || (aberto.real[c.id] ?? 0) > 0).map(c => {
            const p = aberto.previsto?.[c.id] ?? 0, r = aberto.real[c.id] ?? 0
            return <LinhaLista key={c.id} titulo={c.nome} sub={aberto.previsto ? `previsto ${brl(p)}` : undefined}
              valor={brl(r)} valorSub={r === 0 ? "não lançado" : undefined}
              tom={!aberto.previsto || p === 0 ? undefined : Math.abs(r - p) / p <= 0.15 ? "sucesso" : r > p ? "perigo" : "alerta"} />
          })}
          <p className="px-3 pt-4 pb-1 text-[11px] font-semibold text-[#898892]">Lançamentos</p>
          {aberto.custosReais.map(x => (
            <LinhaLista key={x.lancamento.id} titulo={x.lancamento.descricao} sub={nomeComp(x.componente)} valor={brl(x.lancamento.valor)} />
          ))}
        </>}
      </Gaveta>
    </div>
  )
}
