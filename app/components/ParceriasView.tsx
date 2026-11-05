"use client"

import React from "react"
import { Handshake, Percent, Repeat, Lightbulb, Package, Users, MessageCircle, Plus, Wallet, ArrowRight, Pencil, Trash2 } from "lucide-react"
import { KanbanCard, LancamentoFinanceiro, NegocioParceiro, Parceiro, Cliente, Lote, TipoNegocio } from "../types"
import { montarPedidos, resumoClientes, nomeChave, parseData, isTerceirizado, isGanho } from "../lib/negocio"
import { brl, num } from "../utils"
import { CabecalhoPagina, Segmentado, Kpi, GradeKpis, Cartao, TituloCartao, LinhaLista, Vazio, Selo, Botao } from "./ds"
import { ModalVenda } from "./parceiros/ModalVenda"
import { ModalParceiro } from "./ParceirosView"

// O que você ganha fora da caixa, em dois jeitos:
//   Ganho em cima — o cliente te paga, você paga o parceiro; você fica com a diferença.
//   Comissão      — o cliente paga direto o parceiro; ele te repassa uma parte.
// Itens terceirizados dentro de pedidos também são ganho em cima (aparecem na lista, editados no pedido).
// O ganho recebido entra no Financeiro como "receita de parceria" (Visão geral, Resultado e DRE).

type Aba = "vendas" | "oferta" | "parceiros" | "pedidos"
type Filtro = "tudo" | "receber" | "ganho" | "comissao"

type Linha = {
  id: string
  origem: "negocio" | "pedido"
  tipo: TipoNegocio
  cliente: string
  produto: string
  detalhe?: string
  parceiro: string
  pedido?: string
  data?: string
  venda: number
  custo: number | null
  ganho: number | null
  perc: number
  quantidade?: number
  status: "recebido" | "receber" | "cancelado"
  negocio?: NegocioParceiro
}

// Linha de produto para sugerir oferta casada
function linhaDe(texto: string, categoriaParceiro?: string): string {
  const t = (texto + " " + (categoriaParceiro ?? "")).toLowerCase()
  if (/adesiv|r[oó]tul|etiq|bopp/.test(t)) return "Adesivos e rótulos"
  if (/sacol/.test(t)) return "Sacolas"
  if (/frasc|vidr/.test(t)) return "Frascos e vidros"
  if (/ess[eê]nc/.test(t)) return "Essências"
  if (/v[aá]lvul/.test(t)) return "Válvulas"
  return "Outros itens de parceiro"
}

const DIAS_ATIVO = 180

export function ParceriasView({
  parceiros, negocios, kanban, lancamentos, clientes, lotes, abaInicial = "vendas", itensRevenda, onAbrirCliente,
  onAddParceiro, onUpdateParceiro, onDeleteParceiro, onAddNegocio, onUpdateNegocio, onDeleteNegocio,
}: {
  parceiros: Parceiro[]
  negocios: NegocioParceiro[]
  kanban: KanbanCard[]
  lancamentos: LancamentoFinanceiro[]
  clientes: Cliente[]
  lotes?: Lote[]
  abaInicial?: Aba
  itensRevenda: React.ReactNode  // itens revendidos dentro dos pedidos (antiga tela Terceirizados)
  onAbrirCliente: (nome: string) => void
  onAddParceiro: (p: Parceiro) => void
  onUpdateParceiro: (p: Parceiro) => void
  onDeleteParceiro: (id: string) => void
  onAddNegocio: (n: NegocioParceiro) => void
  onUpdateNegocio: (n: NegocioParceiro) => void
  onDeleteNegocio: (id: string) => void
}) {
  const [aba, setAba] = React.useState<Aba>(abaInicial)
  const [filtro, setFiltro] = React.useState<Filtro>("tudo")
  const [modal, setModal] = React.useState<{ inicial?: NegocioParceiro; tipo?: TipoNegocio } | null>(null)
  const [modalParceiro, setModalParceiro] = React.useState<Parceiro | true | null>(null)

  const pedidos = React.useMemo(() => montarPedidos(kanban, lancamentos), [kanban, lancamentos])
  const clienteDoLote = React.useMemo(() => new Map(kanban.filter(c => c.loteNumero).map(c => [c.loteNumero!, c.nomeCliente])), [kanban])
  const nomesClientes = React.useMemo(() => [...new Set([...clientes.map(c => c.nome), ...kanban.map(k => k.nomeCliente)].filter(Boolean))].sort(), [clientes, kanban])

  // ── Tudo numa lista: o que você registrou + itens terceirizados dentro dos pedidos ──
  const linhas: Linha[] = React.useMemo(() => [
    ...negocios.map(n => ({
      id: `neg-${n.id}`, origem: "negocio" as const, tipo: n.tipo,
      cliente: n.nomeCliente || (n.loteNumero && clienteDoLote.get(n.loteNumero)) || "",
      produto: n.produto || n.descricao, detalhe: n.produto && n.descricao !== n.produto ? n.descricao : undefined,
      parceiro: n.parceiroNome, pedido: n.loteNumero, data: n.dataOrcamento,
      venda: n.valorVenda, custo: n.tipo === "ganho" ? n.valorCusto ?? null : null, ganho: n.comissaoValor, perc: n.comissaoPerc, quantidade: n.quantidade,
      status: n.status === "cancelado" ? "cancelado" as const : n.status === "pago" ? "recebido" as const : "receber" as const,
      negocio: n,
    })),
    ...kanban.filter(c => isTerceirizado(c) && isGanho(c)).map(c => {
      const custo = c.custoTerceiro && c.custoTerceiro > 0 ? c.custoTerceiro : null
      return {
        id: `card-${c.id}`, origem: "pedido" as const, tipo: "ganho" as const, cliente: c.nomeCliente,
        produto: c.dimensoes || "Item terceirizado", parceiro: c.fornecedor || "Fornecedor não informado", pedido: c.loteNumero ?? c.numero,
        data: c.dataFechamento, venda: c.preco, custo, ganho: custo != null ? c.preco - custo : null, perc: custo ? (c.preco - custo) / custo * 100 : 0,
        status: "recebido" as const,
      }
    }),
  ].sort((a, b) => (parseData(b.data)?.getTime() ?? 0) - (parseData(a.data)?.getTime() ?? 0)), [negocios, kanban, clienteDoLote])

  const validas = linhas.filter(l => l.status !== "cancelado")
  const recebido = validas.filter(l => l.status === "recebido" && l.ganho != null).reduce((s, l) => s + (l.ganho ?? 0), 0)
  const aReceber = validas.filter(l => l.status === "receber").reduce((s, l) => s + (l.ganho ?? 0), 0)
  const mesAtual = new Date().toISOString().slice(0, 7)
  const ganhoMes = validas.filter(l => l.status === "recebido" && (parseData(l.data)?.toISOString().slice(0, 7) === mesAtual)).reduce((s, l) => s + (l.ganho ?? 0), 0)
  const vendidoFora = validas.filter(l => l.tipo === "ganho").reduce((s, l) => s + l.venda, 0)
  const semCusto = validas.filter(l => l.tipo === "ganho" && l.custo == null)

  const visiveis = linhas.filter(l => filtro === "tudo" ? true : filtro === "receber" ? l.status === "receber" : l.tipo === filtro)

  // ── Oferta casada: quem já compra caixa e ainda não comprou a linha do parceiro ──
  const sugestoes = React.useMemo(() => {
    const resumo = resumoClientes(kanban, pedidos)
    const hoje = Date.now()
    const ativos = resumo.filter(r => {
      if (!r.ehCliente) return false
      const ultimo = r.pedidos.map(p => parseData(p.dataFechamento)?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0)
      return hoje - ultimo <= DIAS_ATIVO * 86_400_000
    })
    // Nomes digitados à mão ("Raniere") apontam para o cliente cadastrado ("Raniere Pericles")
    const canonico = (nome: string) => {
      const k = nomeChave(nome)
      return resumo.find(r => r.chave === k)?.chave
        ?? resumo.find(r => r.ehCliente && (r.chave.startsWith(k) || k.includes(r.chave)))?.chave
        ?? k
    }
    const compradores = new Map<string, Set<string>>()
    const fonte = new Map<string, Set<string>>()
    for (const l of validas) {
      if (!l.cliente) continue
      const linha = linhaDe(`${l.produto} ${l.detalhe ?? ""}`, parceiros.find(p => p.nome === l.parceiro)?.categoria)
      if (!compradores.has(linha)) { compradores.set(linha, new Set()); fonte.set(linha, new Set()) }
      compradores.get(linha)!.add(canonico(l.cliente))
      if (l.parceiro && !/não informado/.test(l.parceiro)) fonte.get(linha)!.add(l.parceiro)
    }
    return [...compradores.entries()]
      .filter(([linha]) => linha !== "Outros itens de parceiro")
      .map(([linha, ja]) => ({
        linha,
        parceiros: [...(fonte.get(linha) ?? [])],
        jaCompraram: ja.size,
        oferecerPara: ativos.filter(a => !ja.has(a.chave)).sort((a, b) => b.ltv - a.ltv),
      }))
      .filter(s => s.oferecerPara.length > 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kanban, pedidos, linhas])

  const telefone = (nome: string) => clientes.find(c => nomeChave(c.nome) === nomeChave(nome))?.telefone?.replace(/\D/g, "")
  const totalOportunidades = sugestoes.reduce((s, x) => s + x.oferecerPara.length, 0)

  // Resumo por parceiro
  const porParceiro = parceiros.map(p => {
    const ls = validas.filter(l => l.origem === "negocio" && l.negocio?.parceiroId === p.id)
    const ultimo = ls.map(l => l.data).filter(Boolean).sort().pop()
    return { p, ganho: ls.reduce((s, l) => s + (l.ganho ?? 0), 0), qtd: ls.length, ultimo }
  }).sort((a, b) => b.ganho - a.ganho)

  const dataCurta = (iso?: string) => parseData(iso)?.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "") ?? "—"

  const descreve = (l: Linha) => l.tipo === "ganho"
    ? l.custo != null
      ? `Ganho em cima · cliente pagou ${brl(l.venda)}, você pagou ${brl(l.custo)} a ${l.parceiro}`
      : `Ganho em cima · vendido ${brl(l.venda)} · falta o custo de ${l.parceiro}`
    : `Comissão ${num(l.perc, 1)}% sobre ${brl(l.venda)} vendidos por ${l.parceiro}`

  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--bg-page)" }}>
      <div className="max-w-[1320px] mx-auto px-6 pt-6 pb-10 space-y-4">
        <CabecalhoPagina
          titulo="Parceiros"
          sub="O que você ganha fora da caixa: frasco, essência, válvula, envase, adesivo…"
          acoes={<div className="flex items-center gap-2 flex-wrap">
            <Segmentado<Aba> valor={aba} onChange={setAba} opcoes={[
              { v: "vendas", nome: `Vendas e comissões ${validas.length}` },
              { v: "oferta", nome: `Oferta casada${totalOportunidades ? ` ${totalOportunidades}` : ""}` },
              { v: "parceiros", nome: `Parceiros ${parceiros.length}` },
              { v: "pedidos", nome: "Itens nos pedidos" },
            ]} />
            <Botao variante="primario" icone={<Plus className="w-3.5 h-3.5" />} onClick={() => setModal({})}>Registrar venda ou comissão</Botao>
          </div>}
        />

        <GradeKpis>
          <Kpi rotulo="Ganho recebido" icone={<Wallet className="w-3.5 h-3.5" />} tom="sucesso" valor={recebido} formato={brl}
            sub={`${brl(ganhoMes)} este mês`} onClick={() => { setAba("vendas"); setFiltro("tudo") }} />
          <Kpi rotulo="A receber" icone={<Percent className="w-3.5 h-3.5" />} tom={aReceber > 0 ? "alerta" : "neutro"} valor={aReceber} formato={brl}
            sub={`${validas.filter(l => l.status === "receber").length} pendentes`} onClick={() => { setAba("vendas"); setFiltro("receber") }} />
          <Kpi rotulo="Vendido fora da caixa" icone={<Repeat className="w-3.5 h-3.5" />} tom="acento" valor={vendidoFora} formato={brl}
            sub={semCusto.length ? `${semCusto.length} sem custo lançado` : "ganho em cima"} onClick={() => { setAba("vendas"); setFiltro("ganho") }} />
          <Kpi rotulo="Oportunidades" icone={<Lightbulb className="w-3.5 h-3.5" />} tom={totalOportunidades ? "info" : "neutro"} valor={totalOportunidades} formato={n => num(Math.round(n))}
            sub="clientes para oferecer" onClick={() => setAba("oferta")} />
        </GradeKpis>

        {aba === "vendas" && (
          <div className="space-y-4 ds-entrada">
            {/* Como registrar: os dois jeitos, com exemplo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button onClick={() => setModal({ tipo: "ganho" })} className="text-left rounded-xl bg-white ds-cartao px-4 py-3.5 hover:ring-2 hover:ring-[#8456e8]/20 transition-shadow">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-[#191625]"><Repeat className="w-4 h-4 text-[#8456e8]" />Ganho em cima<ArrowRight className="w-3.5 h-3.5 ml-auto text-[#898892]" /></span>
                <span className="block text-[11.5px] text-[#5e5c68] mt-1">O cliente te pagou e você pagou o parceiro. Você fica com a diferença.</span>
                <span className="block text-[11px] text-[#898892] mt-1">Ex.: 3.000 frascos, cliente pagou R$ 7.800, você pagou R$ 7.200 → ganho de R$ 600.</span>
              </button>
              <button onClick={() => setModal({ tipo: "comissao" })} className="text-left rounded-xl bg-white ds-cartao px-4 py-3.5 hover:ring-2 hover:ring-[#8456e8]/20 transition-shadow">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-[#191625]"><Percent className="w-4 h-4 text-[#8456e8]" />Comissão<ArrowRight className="w-3.5 h-3.5 ml-auto text-[#898892]" /></span>
                <span className="block text-[11.5px] text-[#5e5c68] mt-1">O cliente pagou direto o parceiro e ele te repassa uma parte (em % ou valor fixo).</span>
                <span className="block text-[11px] text-[#898892] mt-1">Ex.: indicou a essência, venda de R$ 8.000 do parceiro, 3% → comissão de R$ 240.</span>
              </button>
            </div>

            <Cartao padding={false}>
              <div className="px-5 pt-5">
                <TituloCartao titulo="Vendas e comissões" icone={<Handshake className="w-4 h-4" />}
                  sub="Clique para editar. O ganho recebido entra no Financeiro como receita de parceria (Visão geral, Resultado e DRE)."
                  acao={<Segmentado<Filtro> valor={filtro} onChange={setFiltro} opcoes={[
                    { v: "tudo", nome: "Tudo" }, { v: "receber", nome: "A receber" }, { v: "ganho", nome: "Ganho em cima" }, { v: "comissao", nome: "Comissões" },
                  ]} />} />
              </div>
              <div className="px-2 pb-2 -mt-1">
                {visiveis.length === 0 && <Vazio icone={<Handshake className="w-8 h-8" />} titulo="Nada aqui ainda" sub="Use “Registrar venda ou comissão” para lançar o que você ganhou com frasco, essência, válvula, envase…" />}
                {visiveis.map(l => (
                  <LinhaLista key={l.id}
                    titulo={`${l.cliente || "Sem cliente"} · ${l.produto}${l.quantidade ? ` · ${num(l.quantidade)} un` : ""}${l.pedido ? ` · ${l.pedido}` : ""}`}
                    sub={`${descreve(l)} · ${dataCurta(l.data)}${l.origem === "pedido" ? " · item do pedido" : ""}${l.detalhe ? ` · ${l.detalhe}` : ""}`}
                    valor={l.ganho != null ? brl(l.ganho) : "—"}
                    valorSub={l.status === "cancelado" ? "cancelado" : l.status === "recebido" ? "recebido" : "a receber"}
                    tom={l.status === "cancelado" ? undefined : l.ganho == null ? "alerta" : l.status === "recebido" ? "sucesso" : "alerta"}
                    icone={l.tipo === "ganho" ? <Repeat className="w-4 h-4" /> : <Percent className="w-4 h-4" />}
                    onClick={() => l.negocio ? setModal({ inicial: l.negocio }) : setAba("pedidos")}
                    acao={l.negocio && l.status === "receber" ? (
                      <Botao className="h-7 px-2.5 text-[11.5px] mr-1" onClick={() => onUpdateNegocio({ ...l.negocio!, status: "pago" })}>Recebi</Botao>
                    ) : undefined} />
                ))}
              </div>
            </Cartao>
          </div>
        )}

        {aba === "oferta" && (
          <Cartao padding={false} className="ds-entrada">
            <div className="px-5 pt-5">
              <TituloCartao titulo="Oferta casada" icone={<Lightbulb className="w-4 h-4" />}
                sub={`Clientes que compraram caixa nos últimos ${DIAS_ATIVO} dias e ainda não compraram estes itens`} />
            </div>
            <div className="px-2 pb-3 space-y-3">
              {sugestoes.length === 0 && <Vazio icone={<Lightbulb className="w-8 h-8" />} titulo="Nenhuma sugestão agora" sub="Aparecem quando algum cliente compra um item de parceiro que outros ainda não compraram." />}
              {sugestoes.map(s => (
                <div key={s.linha}>
                  <div className="px-3 pb-1 flex items-center gap-2 flex-wrap">
                    <p className="text-[12.5px] font-semibold text-[#191625]">{s.linha}</p>
                    <Selo tom="neutro">{s.jaCompraram} {s.jaCompraram === 1 ? "cliente já compra" : "clientes já compram"}</Selo>
                    {s.parceiros.length > 0 && <span className="text-[11px] text-[#898892]">via {s.parceiros.join(", ")}</span>}
                  </div>
                  {s.oferecerPara.slice(0, 8).map(c => {
                    const tel = telefone(c.nome)
                    return (
                      <LinhaLista key={s.linha + c.chave} titulo={c.nome}
                        sub={`${c.pedidos.length} ${c.pedidos.length === 1 ? "pedido" : "pedidos"} de caixa · ${brl(c.ltv)}`}
                        onClick={() => onAbrirCliente(c.nome)}
                        acao={tel ? (
                          <a href={`https://wa.me/${tel.length <= 11 ? "55" + tel : tel}?text=${encodeURIComponent(`Olá! Além das caixas, também fornecemos ${s.linha.toLowerCase()}. Quer que eu mande um orçamento junto com o próximo pedido?`)}`}
                            target="_blank" rel="noreferrer" title="Oferecer no WhatsApp"
                            className="w-8 h-8 mr-1 rounded-lg flex items-center justify-center text-[#25a35a] hover:bg-[#25a35a]/10 transition-colors shrink-0">
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        ) : undefined} />
                    )
                  })}
                  {s.oferecerPara.length > 8 && <p className="px-3 text-[11px] text-[#898892]">e mais {s.oferecerPara.length - 8} clientes</p>}
                </div>
              ))}
            </div>
          </Cartao>
        )}

        {aba === "parceiros" && (
          <Cartao padding={false} className="ds-entrada">
            <div className="px-5 pt-5">
              <TituloCartao titulo="Parceiros" icone={<Users className="w-4 h-4" />} sub="Quem fornece o que você vende fora da caixa e o que cada um já te gerou"
                acao={<Botao icone={<Plus className="w-3.5 h-3.5" />} onClick={() => setModalParceiro(true)}>Novo parceiro</Botao>} />
            </div>
            <div className="px-2 pb-2 -mt-1">
              {porParceiro.length === 0 && <Vazio icone={<Handshake className="w-8 h-8" />} titulo="Nenhum parceiro cadastrado" sub="Também dá para cadastrar direto ao registrar uma venda." />}
              {porParceiro.map(x => (
                <LinhaLista key={x.p.id} titulo={x.p.nome}
                  sub={[x.p.categoria, x.p.contato, x.p.comissaoDefault ? `comissão padrão ${num(x.p.comissaoDefault, 1)}%` : null,
                    x.qtd ? `${x.qtd} ${x.qtd === 1 ? "registro" : "registros"} · último ${dataCurta(x.ultimo)}` : "sem registros ainda"].filter(Boolean).join(" · ")}
                  valor={brl(x.ganho)} valorSub="ganho" tom={x.ganho > 0 ? "sucesso" : undefined}
                  icone={<Package className="w-4 h-4" />}
                  onClick={() => setModalParceiro(x.p)}
                  acao={<span className="flex items-center mr-1">
                    <button onClick={e => { e.stopPropagation(); setModalParceiro(x.p) }} className="w-8 h-8 rounded-lg grid place-items-center text-[#898892] hover:bg-black/5" aria-label="Editar"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={e => { e.stopPropagation(); if (x.qtd ? confirm(`${x.p.nome} tem ${x.qtd} registros. Excluir mesmo assim? (os registros ficam)`) : confirm(`Excluir ${x.p.nome}?`)) onDeleteParceiro(x.p.id) }}
                      className="w-8 h-8 rounded-lg grid place-items-center text-[#898892] hover:text-[#d33a3c] hover:bg-[#d33a3c]/[0.06]" aria-label="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                  </span>} />
              ))}
            </div>
          </Cartao>
        )}

        {aba === "pedidos" && (
          <div className="ds-entrada">
            <p className="text-[13.5px] font-semibold text-[#191625] mb-1">Itens revendidos dentro dos pedidos</p>
            <p className="text-[11.5px] text-[#898892] mb-3">Itens de parceiro que entraram num pedido de caixa (marcados como terceirizados). Preencha quem forneceu e quanto custou para o ganho aparecer.</p>
            {itensRevenda}
          </div>
        )}
      </div>

      {modal && (
        <ModalVenda inicial={modal.inicial} tipoInicial={modal.tipo} parceiros={parceiros} clientes={nomesClientes} lotes={lotes}
          onSalvar={n => modal.inicial ? onUpdateNegocio(n) : onAddNegocio(n)}
          onNovoParceiro={onAddParceiro} onExcluir={onDeleteNegocio} onFechar={() => setModal(null)} />
      )}
      {modalParceiro && (
        <ModalParceiro inicial={modalParceiro === true ? undefined : modalParceiro}
          onSave={p => modalParceiro === true ? onAddParceiro(p) : onUpdateParceiro(p)} onClose={() => setModalParceiro(null)} />
      )}
    </div>
  )
}
