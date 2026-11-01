"use client"

// Conciliação: importa o extrato do banco e casa cada Pix com a cobrança ou o pedido certo.

import React, { useMemo, useRef, useState } from "react"
import { Upload, CircleCheck, HelpCircle, CircleSlash, Check, X, Link2, Sparkles, FileText } from "lucide-react"
import { KanbanCard, LancamentoFinanceiro } from "../types"
import { Configuracoes } from "../config"
import { montarPedidos, nomeChave } from "../lib/negocio"
import { lerExtrato, conciliar, aplicarConciliacao, Resultado, Candidato, Entrada, MARCA } from "../lib/conciliacao"
import { brl } from "../utils"
import { Cartao, TituloCartao, Kpi, GradeKpis, Botao, Selo, Vazio } from "./ds"

const dataBR = (iso: string) => iso.split("-").reverse().join("/")
const descreverCandidato = (c: Candidato) =>
  c.tipo === "cobranca"
    ? `${c.pedido?.numero ?? c.lancamento.loteNumero ?? c.lancamento.cardNumero ?? ""} · ${c.lancamento.nomeCliente ?? c.pedido?.nomeCliente ?? ""} · cobrança de ${brl(c.lancamento.valor)}`
    : `${c.pedido.numero} · ${c.pedido.nomeCliente} · ${c.categoria === "sinal" ? "sinal" : c.categoria === "saldo-final" ? "saldo" : "pagamento"} (falta ${brl(c.pedido.aReceber)})`

async function lerArquivo(f: File) {
  const buf = await f.arrayBuffer()
  const utf = new TextDecoder("utf-8").decode(buf)
  // Extratos de banco costumam vir em Latin-1
  return utf.includes("�") ? new TextDecoder("iso-8859-1").decode(buf) : utf
}

function LinhaEntrada({ r }: { r: Resultado }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-[#191625] truncate">{r.entrada.pagador ?? r.entrada.descricao ?? "Pix recebido"}</p>
      <p className="text-[11.5px] text-[#898892] ds-num">{dataBR(r.entrada.data)}</p>
    </div>
  )
}

export function ConciliacaoView({ kanban, lancamentos, config, onAdd, onUpdate, onUpdateConfig }: {
  kanban: KanbanCard[]
  lancamentos: LancamentoFinanceiro[]
  config: Configuracoes
  onAdd: (l: LancamentoFinanceiro) => void
  onUpdate: (id: string, campos: Partial<LancamentoFinanceiro>) => void
  onUpdateConfig: (c: Configuracoes) => void
}) {
  const [entradas, setEntradas] = useState<Entrada[] | null>(null)
  const [arquivo, setArquivo] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [feitos, setFeitos] = useState<Record<string, "baixado" | "ignorado" | "avulso">>({})
  const [escolha, setEscolha] = useState<Record<string, number>>({})
  const input = useRef<HTMLInputElement>(null)
  const memoria = useMemo(() => config.conciliacao ?? {}, [config.conciliacao])

  // Resultado congelado na importação: ao confirmar, a linha só muda de estado (não reembaralha a lista)
  const resultados = useMemo(() => entradas
    ? conciliar({ entradas, pedidos: montarPedidos(kanban, lancamentos), lancamentos, memoria })
    : [], [entradas]) // eslint-disable-line react-hooks/exhaustive-deps

  async function importar(f?: File) {
    if (!f) return
    setErro(null)
    const lidas = lerExtrato(await lerArquivo(f))
    if (!lidas.length) { setErro("Não encontrei entradas nesse arquivo. Exporte o extrato em OFX (ou CSV com colunas de data, descrição e valor)."); return }
    setArquivo(f.name); setEntradas(lidas); setFeitos({}); setEscolha({})
  }

  function lembrar(cfgBase: Configuracoes, r: Resultado, c: Candidato) {
    const cliente = c.tipo === "pedido" ? c.pedido.nomeCliente : c.pedido?.nomeCliente ?? c.lancamento.nomeCliente
    if (!r.entrada.pagador || !cliente) return cfgBase
    return { ...cfgBase, conciliacao: { ...memoria, pagadores: { ...memoria.pagadores, [nomeChave(r.entrada.pagador)]: cliente } } }
  }

  function confirmar(lista: { r: Resultado; c: Candidato }[]) {
    let cfg = config
    for (const { r, c } of lista) {
      const { atualizar, criar } = aplicarConciliacao(r.entrada, c)
      if (atualizar) onUpdate(atualizar.id, atualizar.campos)
      if (criar) onAdd(criar)
      cfg = lembrar(cfg, r, c)
    }
    if (cfg !== config) onUpdateConfig(cfg)
    setFeitos(f => ({ ...f, ...Object.fromEntries(lista.map(({ r }) => [r.entrada.id, "baixado" as const])) }))
  }

  function ignorar(r: Resultado) {
    onUpdateConfig({ ...config, conciliacao: { ...memoria, ignorados: [...(memoria.ignorados ?? []), r.entrada.id] } })
    setFeitos(f => ({ ...f, [r.entrada.id]: "ignorado" }))
  }

  function lancarAvulso(r: Resultado) {
    onAdd({
      id: `${Date.now()}${Math.random().toString(36).slice(2, 6)}`, tipo: "receita", status: "pago", formaPagamento: "pix",
      valor: r.entrada.valor, descricao: r.entrada.pagador ? `Pix de ${r.entrada.pagador}` : r.entrada.descricao || "Pix recebido",
      categoria: "outros", dataVencimento: r.entrada.data, dataPagamento: r.entrada.data, obs: `${MARCA}${r.entrada.id}`,
      criadoEm: new Date().toLocaleString("pt-BR"),
    } as LancamentoFinanceiro)
    setFeitos(f => ({ ...f, [r.entrada.id]: "avulso" }))
  }

  const pendentes = (s: Resultado["status"]) => resultados.filter(r => r.status === s && !feitos[r.entrada.id])
  const auto = pendentes("automatico"), sugestoes = pendentes("sugestao"), semPar = pendentes("sem_par")
  const resolvidos = resultados.filter(r => feitos[r.entrada.id])
  const jaConciliados = resultados.filter(r => r.status === "ja_conciliado")
  const soma = (rs: Resultado[]) => rs.reduce((s, r) => s + r.entrada.valor, 0)

  return (
    <div className="space-y-4 pt-1">
      <Cartao className="ds-entrada">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-[260px]">
            <TituloCartao titulo="Conciliar recebimentos" icone={<Sparkles className="w-4 h-4" />}
              sub="Exporte o extrato do banco (OFX ou CSV) e solte aqui. O sistema casa cada Pix com a cobrança ou o pedido certo, pelo nome de quem pagou e pelo valor." />
            {arquivo && <p className="text-[12px] text-[#5e5c68] -mt-2 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />{arquivo} · {entradas?.length} entradas lidas</p>}
            {erro && <p className="text-[12px] text-[#d33a3c] mt-1">{erro}</p>}
          </div>
          <button onClick={() => input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); importar(e.dataTransfer.files[0]) }}
            className="h-24 w-full sm:w-72 rounded-xl border-2 border-dashed border-[#8456e8]/25 hover:border-[#8456e8]/50 hover:bg-[#8456e8]/[0.03] text-[12.5px] text-[#5e5c68] flex flex-col items-center justify-center gap-1.5 transition-colors">
            <Upload className="w-5 h-5 text-[#8456e8]" /> {entradas ? "Importar outro extrato" : "Soltar extrato ou clicar"}
          </button>
          <input ref={input} type="file" accept=".ofx,.csv,.txt" className="hidden" onChange={e => { importar(e.target.files?.[0]); e.target.value = "" }} />
        </div>
      </Cartao>

      {entradas && <>
        <GradeKpis>
          <Kpi rotulo="Baixa automática" icone={<CircleCheck className="w-3.5 h-3.5" />} tom="sucesso" valor={soma(auto)} formato={brl} sub={`${auto.length} Pix com casamento claro`} />
          <Kpi rotulo="Para confirmar" icone={<HelpCircle className="w-3.5 h-3.5" />} tom="alerta" valor={soma(sugestoes)} formato={brl} sub={`${sugestoes.length} com sugestão`} />
          <Kpi rotulo="Sem par" icone={<CircleSlash className="w-3.5 h-3.5" />} tom="neutro" valor={soma(semPar)} formato={brl} sub={`${semPar.length} sem pedido aparente`} />
          <Kpi rotulo="Resolvidos agora" icone={<Check className="w-3.5 h-3.5" />} tom="acento" valor={resolvidos.length} formato={n => String(Math.round(n))} sub={`${jaConciliados.length} já conciliados antes`} />
        </GradeKpis>

        {auto.length > 0 && (
          <Cartao padding={false} className="ds-entrada">
            <div className="px-5 pt-5 flex items-start justify-between gap-3">
              <TituloCartao titulo="Baixa automática" icone={<CircleCheck className="w-4 h-4" />} sub="Quem pagou é o cliente do pedido e o valor bate. Confira e confirme." />
              <Botao variante="primario" icone={<Check className="w-4 h-4" />} onClick={() => confirmar(auto.map(r => ({ r, c: r.sugestoes[0].candidato })))}>Confirmar {auto.length}</Botao>
            </div>
            <div className="divide-y divide-[rgba(60,60,67,0.06)] pb-1">
              {auto.map(r => (
                <div key={r.entrada.id} className="px-5 py-3 flex items-center gap-4">
                  <LinhaEntrada r={r} />
                  <span className="flex-1 min-w-0 text-[12px] text-[#5e5c68] truncate"><Link2 className="w-3.5 h-3.5 inline -mt-0.5 mr-1 text-[#009351]" />{descreverCandidato(r.sugestoes[0].candidato)}</span>
                  <span className="text-[13.5px] font-semibold text-[#009351] ds-num">{brl(r.entrada.valor)}</span>
                </div>
              ))}
            </div>
          </Cartao>
        )}

        {sugestoes.length > 0 && (
          <Cartao padding={false} className="ds-entrada">
            <div className="px-5 pt-5">
              <TituloCartao titulo="Para confirmar" icone={<HelpCircle className="w-4 h-4" />} sub="Há uma pista (valor ou nome), mas não as duas. Escolha o pedido certo; o sistema aprende quem paga por quem." />
            </div>
            <div className="divide-y divide-[rgba(60,60,67,0.06)] pb-1">
              {sugestoes.map(r => {
                const i = escolha[r.entrada.id] ?? 0
                const s = r.sugestoes[i]
                return (
                  <div key={r.entrada.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                    <div className="w-[200px]"><LinhaEntrada r={r} /></div>
                    <div className="flex-1 min-w-[260px]">
                      <select value={i} onChange={e => setEscolha(x => ({ ...x, [r.entrada.id]: +e.target.value }))}
                        className="w-full h-9 rounded-lg px-2.5 text-[12.5px] text-[#191625] bg-white ds-borda focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20">
                        {r.sugestoes.map((sg, k) => <option key={k} value={k}>{descreverCandidato(sg.candidato)}</option>)}
                      </select>
                      {s && <p className="text-[11px] text-[#898892] mt-1">{s.motivos.join(" · ")}</p>}
                    </div>
                    <span className="text-[13.5px] font-semibold text-[#191625] ds-num w-28 text-right">{brl(r.entrada.valor)}</span>
                    <Botao variante="fantasma" onClick={() => ignorar(r)} title="Não é de cliente">Ignorar</Botao>
                    <Botao variante="primario" onClick={() => s && confirmar([{ r, c: s.candidato }])}>Confirmar</Botao>
                  </div>
                )
              })}
            </div>
          </Cartao>
        )}

        {semPar.length > 0 && (
          <Cartao padding={false} className="ds-entrada">
            <div className="px-5 pt-5">
              <TituloCartao titulo="Sem par" icone={<CircleSlash className="w-4 h-4" />} sub="Nenhum pedido em aberto combina. Pode ser receita avulsa, transferência sua ou pagamento ainda sem pedido no sistema." />
            </div>
            <div className="divide-y divide-[rgba(60,60,67,0.06)] pb-1">
              {semPar.map(r => (
                <div key={r.entrada.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]"><LinhaEntrada r={r} /><p className="text-[11px] text-[#b5b9c0] truncate">{r.entrada.descricao}</p></div>
                  <span className="text-[13.5px] font-semibold text-[#191625] ds-num w-28 text-right">{brl(r.entrada.valor)}</span>
                  <Botao variante="fantasma" icone={<X className="w-3.5 h-3.5" />} onClick={() => ignorar(r)}>Ignorar</Botao>
                  <Botao onClick={() => lancarAvulso(r)}>Lançar como receita</Botao>
                </div>
              ))}
            </div>
          </Cartao>
        )}

        {resolvidos.length > 0 && (
          <Cartao className="ds-entrada">
            <TituloCartao titulo="Resolvidos nesta importação" icone={<Check className="w-4 h-4" />} />
            <div className="flex flex-wrap gap-1.5">
              {resolvidos.map(r => (
                <Selo key={r.entrada.id} tom={feitos[r.entrada.id] === "ignorado" ? "neutro" : "sucesso"}>
                  {r.entrada.pagador ?? "Pix"} · {brl(r.entrada.valor)} · {feitos[r.entrada.id] === "baixado" ? "baixado" : feitos[r.entrada.id] === "avulso" ? "receita avulsa" : "ignorado"}
                </Selo>
              ))}
            </div>
          </Cartao>
        )}

        {!auto.length && !sugestoes.length && !semPar.length && (
          <Vazio icone={<CircleCheck className="w-8 h-8" />} titulo="Tudo conciliado" sub="Nenhum Pix novo nesse extrato." />
        )}
      </>}
    </div>
  )
}
