"use client"

import React from "react"
import { Handshake, Percent, Repeat, Lightbulb, Package, Users, AlertTriangle, ArrowRight, MessageCircle } from "lucide-react"
import { KanbanCard, LancamentoFinanceiro, NegocioParceiro, Parceiro, Cliente } from "../types"
import { montarPedidos, resumoClientes, nomeChave, parseData, isTerceirizado, isGanho } from "../lib/negocio"
import { brl, num } from "../utils"
import { CabecalhoPagina, Segmentado, Kpi, GradeKpis, Cartao, TituloCartao, LinhaLista, Vazio, Selo, Botao } from "./ds"

// Duas relações diferentes com parceiros:
//   Comissão — o parceiro vende e fatura direto ao cliente; você recebe uma comissão.
//   Revenda  — você compra pronto do parceiro e fatura ao seu cliente, como item do pedido.
// "Terceirizados" (itens de pedido marcados como terceirizados) são revendas.

type Aba = "visao" | "comissoes" | "revendas" | "cadastro"

type Revenda = {
  id: string
  origem: "pedido" | "parceiro"
  produto: string
  parceiro: string
  cliente: string
  pedido?: string
  venda: number
  custo: number | null
  data?: string
}

// Linha de produto para sugerir oferta casada
function linhaDe(texto: string, categoriaParceiro?: string): string {
  const t = (texto + " " + (categoriaParceiro ?? "")).toLowerCase()
  if (/adesiv|r[oó]tul|etiq|bopp/.test(t)) return "Adesivos e rótulos"
  if (/sacol/.test(t)) return "Sacolas"
  if (/frasc|vidr/.test(t)) return "Frascos e vidros"
  return "Outros itens de parceiro"
}

const DIAS_ATIVO = 180

export function ParceriasView({
  parceiros, negocios, kanban, lancamentos, clientes, abaInicial = "visao", cadastro, itensRevenda, onAbrirCliente,
}: {
  parceiros: Parceiro[]
  negocios: NegocioParceiro[]
  kanban: KanbanCard[]
  lancamentos: LancamentoFinanceiro[]
  clientes: Cliente[]
  abaInicial?: Aba
  cadastro: React.ReactNode      // cadastro de parceiros e lançamento de negócios (tela existente)
  itensRevenda: React.ReactNode  // itens revendidos dentro dos pedidos (antiga tela Terceirizados)
  onAbrirCliente: (nome: string) => void
}) {
  const [aba, setAba] = React.useState<Aba>(abaInicial)

  const pedidos = React.useMemo(() => montarPedidos(kanban, lancamentos), [kanban, lancamentos])
  const clienteDoLote = React.useMemo(() => new Map(kanban.filter(c => c.loteNumero).map(c => [c.loteNumero!, c.nomeCliente])), [kanban])
  const parceiroPorId = new Map(parceiros.map(p => [p.id, p]))

  const validos = negocios.filter(n => n.status !== "cancelado")
  const comissoes = validos.filter(n => n.tipo === "comissao")

  // Revendas: itens terceirizados dentro de pedidos + revendas lançadas como "ganho" em parceiros
  const revendas: Revenda[] = [
    ...kanban.filter(c => isTerceirizado(c) && isGanho(c)).map(c => ({
      id: `card-${c.id}`, origem: "pedido" as const, produto: c.dimensoes || "Item terceirizado",
      parceiro: c.fornecedor || "Fornecedor não informado", cliente: c.nomeCliente, pedido: c.loteNumero ?? c.numero,
      venda: c.preco, custo: c.custoTerceiro ?? null, data: c.dataFechamento,
    })),
    ...validos.filter(n => n.tipo === "ganho").map(n => ({
      id: `neg-${n.id}`, origem: "parceiro" as const, produto: n.descricao, parceiro: n.parceiroNome,
      cliente: (n.loteNumero && clienteDoLote.get(n.loteNumero)) || n.descricao,
      pedido: n.loteNumero, venda: n.valorVenda, custo: n.valorCusto ?? null, data: n.dataOrcamento,
    })),
  ].sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""))

  const comissaoRecebida = comissoes.filter(n => n.status === "pago").reduce((s, n) => s + n.comissaoValor, 0)
  const comissaoPendente = comissoes.filter(n => n.status === "pendente").reduce((s, n) => s + n.comissaoValor, 0)
  const vendaRevendas = revendas.reduce((s, r) => s + r.venda, 0)
  const comCusto = revendas.filter(r => r.custo != null && r.custo > 0)
  const margemRevendas = comCusto.reduce((s, r) => s + r.venda - (r.custo ?? 0), 0)
  const semCusto = revendas.filter(r => r.custo == null || r.custo <= 0)

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
    const add = (linha: string, cliente: string, parceiro: string) => {
      if (!compradores.has(linha)) { compradores.set(linha, new Set()); fonte.set(linha, new Set()) }
      compradores.get(linha)!.add(canonico(cliente))
      if (parceiro && !/não informado/.test(parceiro)) fonte.get(linha)!.add(parceiro)
    }
    for (const r of revendas) add(linhaDe(r.produto), r.cliente, r.parceiro)
    for (const n of comissoes) {
      const p = parceiroPorId.get(n.parceiroId)
      const cliente = (n.loteNumero && clienteDoLote.get(n.loteNumero)) || n.descricao.replace(/^pedido\s+/i, "")
      add(linhaDe(`${n.descricao} ${n.parceiroNome}`, p?.categoria), cliente, n.parceiroNome)
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
  }, [kanban, pedidos, negocios])

  const telefone = (nome: string) => clientes.find(c => nomeChave(c.nome) === nomeChave(nome))?.telefone?.replace(/\D/g, "")
  const totalOportunidades = sugestoes.reduce((s, x) => s + x.oferecerPara.length, 0)

  // Resumo por parceiro
  const porParceiro = parceiros.map(p => {
    const ns = validos.filter(n => n.parceiroId === p.id)
    const com = ns.filter(n => n.tipo === "comissao").reduce((s, n) => s + n.comissaoValor, 0)
    const rev = ns.filter(n => n.tipo === "ganho")
    const ultimo = ns.map(n => n.dataOrcamento).filter(Boolean).sort().pop()
    return { p, com, revVenda: rev.reduce((s, n) => s + n.valorVenda, 0), revGanho: rev.reduce((s, n) => s + n.comissaoValor, 0), qtd: ns.length, ultimo }
  }).sort((a, b) => (b.com + b.revGanho) - (a.com + a.revGanho))

  const dataCurta = (iso?: string) => parseData(iso)?.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "") ?? "—"

  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--bg-page)" }}>
      <div className="max-w-[1320px] mx-auto px-6 pt-6 pb-10 space-y-4">
        <CabecalhoPagina
          titulo="Parceiros"
          sub="Comissão: o parceiro vende ao cliente e te paga uma parte. Revenda: você compra pronto e fatura ao cliente."
          acoes={<Segmentado<Aba> valor={aba} onChange={setAba} opcoes={[
            { v: "visao", nome: "Visão geral" },
            { v: "comissoes", nome: `Comissões ${comissoes.length}` },
            { v: "revendas", nome: `Revendas ${revendas.length}` },
            { v: "cadastro", nome: "Cadastro e lançamentos" },
          ]} />}
        />

        {aba !== "cadastro" && (
          <GradeKpis>
            <Kpi rotulo="Comissões recebidas" icone={<Percent className="w-3.5 h-3.5" />} tom="sucesso" valor={comissaoRecebida} formato={brl}
              sub={comissaoPendente > 0 ? `${brl(comissaoPendente)} a receber` : `${comissoes.length} indicações`} onClick={() => setAba("comissoes")} />
            <Kpi rotulo="Vendido em revendas" icone={<Repeat className="w-3.5 h-3.5" />} tom="acento" valor={vendaRevendas} formato={brl}
              sub={`${revendas.length} itens revendidos`} onClick={() => setAba("revendas")} />
            <Kpi rotulo="Margem nas revendas" icone={<Package className="w-3.5 h-3.5" />} tom={semCusto.length ? "alerta" : "sucesso"}
              valor={comCusto.length ? margemRevendas : null} formato={brl}
              sub={semCusto.length ? `${semCusto.length} sem custo lançado` : "todas com custo"} onClick={() => setAba("revendas")} />
            <Kpi rotulo="Parceiros ativos" icone={<Handshake className="w-3.5 h-3.5" />} valor={porParceiro.filter(x => x.qtd > 0).length} formato={n => num(Math.round(n))}
              sub={`${parceiros.length} cadastrados`} onClick={() => setAba("cadastro")} />
            <Kpi rotulo="Oportunidades" icone={<Lightbulb className="w-3.5 h-3.5" />} tom={totalOportunidades ? "info" : "neutro"} valor={totalOportunidades} formato={n => num(Math.round(n))}
              sub="ofertas casadas sugeridas" />
          </GradeKpis>
        )}

        {aba === "visao" && (
          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4 items-start ds-escalonado">
            <Cartao padding={false}>
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
                    {s.oferecerPara.slice(0, 6).map(c => {
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
                    {s.oferecerPara.length > 6 && <p className="px-3 text-[11px] text-[#898892]">e mais {s.oferecerPara.length - 6} clientes</p>}
                  </div>
                ))}
              </div>
            </Cartao>

            <div className="space-y-4">
              <Cartao padding={false}>
                <div className="px-5 pt-5">
                  <TituloCartao titulo="Por parceiro" icone={<Users className="w-4 h-4" />} sub="O que cada um gerou para você"
                    acao={<Botao variante="fantasma" className="h-7 px-2 text-[11.5px]" onClick={() => setAba("cadastro")}>Cadastro <ArrowRight className="w-3.5 h-3.5" /></Botao>} />
                </div>
                <div className="px-2 pb-2 -mt-1">
                  {porParceiro.length === 0 && <Vazio icone={<Handshake className="w-8 h-8" />} titulo="Nenhum parceiro cadastrado" />}
                  {porParceiro.map(x => (
                    <LinhaLista key={x.p.id} titulo={x.p.nome}
                      sub={[
                        x.com > 0 ? `${brl(x.com)} em comissões` : null,
                        x.revVenda > 0 ? `${brl(x.revVenda)} revendidos` : null,
                        x.ultimo ? `último ${dataCurta(x.ultimo)}` : "sem negócios ainda",
                      ].filter(Boolean).join(" · ")}
                      valor={brl(x.com + x.revGanho)} valorSub="ganho" tom={x.com + x.revGanho > 0 ? "sucesso" : undefined}
                      icone={<Handshake className="w-4 h-4" />} />
                  ))}
                </div>
              </Cartao>

              {semCusto.length > 0 && (
                <Cartao>
                  <TituloCartao titulo={`${semCusto.length} ${semCusto.length === 1 ? "revenda" : "revendas"} sem custo lançado`} icone={<AlertTriangle className="w-4 h-4" />}
                    sub="Sem o custo do parceiro não dá para saber quanto você ganhou. Preencha na aba Revendas." />
                  <Botao variante="secundario" onClick={() => setAba("revendas")}>Ver revendas <ArrowRight className="w-3.5 h-3.5" /></Botao>
                </Cartao>
              )}
            </div>
          </div>
        )}

        {aba === "comissoes" && (
          <Cartao padding={false} className="ds-entrada">
            <div className="px-5 pt-5">
              <TituloCartao titulo="Comissões" icone={<Percent className="w-4 h-4" />}
                sub="Indicações em que o parceiro vendeu e faturou direto ao cliente"
                acao={<Botao variante="secundario" onClick={() => setAba("cadastro")}>Registrar comissão</Botao>} />
            </div>
            <div className="px-2 pb-2 -mt-1">
              {comissoes.length === 0 && <Vazio icone={<Percent className="w-8 h-8" />} titulo="Nenhuma comissão registrada" />}
              {comissoes.map(n => (
                <LinhaLista key={n.id} titulo={`${n.parceiroNome} · ${n.descricao}`}
                  sub={`venda do parceiro ${brl(n.valorVenda)} · ${num(n.comissaoPerc, 1)}% · ${dataCurta(n.dataOrcamento)}`}
                  valor={brl(n.comissaoValor)} valorSub={n.status === "pago" ? "recebida" : "a receber"}
                  tom={n.status === "pago" ? "sucesso" : "alerta"} />
              ))}
            </div>
          </Cartao>
        )}

        {aba === "revendas" && (
          <div className="space-y-4 ds-entrada">
            <Cartao padding={false}>
              <div className="px-5 pt-5">
                <TituloCartao titulo="Todas as revendas" icone={<Repeat className="w-4 h-4" />}
                  sub="Itens comprados prontos de parceiros e faturados por você" />
              </div>
              <div className="px-2 pb-2 -mt-1">
                {revendas.length === 0 && <Vazio icone={<Repeat className="w-8 h-8" />} titulo="Nenhuma revenda registrada" />}
                {revendas.map(r => {
                  const margem = r.custo != null && r.custo > 0 ? r.venda - r.custo : null
                  return (
                    <LinhaLista key={r.id} titulo={`${r.cliente}${r.pedido ? ` · ${r.pedido}` : ""}`}
                      sub={`${r.produto} · ${r.parceiro}${r.origem === "pedido" ? " · item do pedido" : ""}`}
                      valor={brl(r.venda)}
                      valorSub={margem != null ? `ganho ${brl(margem)} (${num(margem / r.venda * 100, 0)}%)` : "sem custo lançado"}
                      tom={margem == null ? "alerta" : undefined} />
                  )
                })}
              </div>
            </Cartao>
            <div>
              <p className="text-[13.5px] font-semibold text-[#191625] mb-1">Itens revendidos dentro dos pedidos</p>
              <p className="text-[11.5px] text-[#898892] mb-3">Acompanhe a chegada do fornecedor e preencha quem forneceu e quanto custou.</p>
              {itensRevenda}
            </div>
          </div>
        )}

        {aba === "cadastro" && <div className="ds-entrada">{cadastro}</div>}
      </div>
    </div>
  )
}
