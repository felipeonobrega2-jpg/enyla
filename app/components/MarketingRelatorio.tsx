"use client"

// Campanhas → Relatório de marketing: o anúncio até o dinheiro (gasto → leads → MQL → orçamento → pedido),
// por campanha, com a leitura da IA. Gerado todo dia de manhã (o de ontem) e mandado em resumo no seu WhatsApp.

import { useEffect, useState } from "react"
import { Sparkles, Loader2, RefreshCw, ArrowRight } from "lucide-react"
import { Cartao, TituloCartao, Botao, Selo, Segmentado, Tom, COR } from "./ds"
import EnsinarIA from "./EnsinarIA"
import { Relatorio, LinhaCampanha, total, custoPor, variacao } from "../lib/marketing"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: n < 100 ? 2 : 0 })
const dm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
const pct = (n: number) => `${Math.round(n * 100)}%`

// Variação contra a semana anterior; para custo, cair é bom
function Var({ agora, antes, custo, neutro }: { agora: number | null; antes: number | null; custo?: boolean; neutro?: boolean }) {
  if (agora == null || antes == null) return null
  const v = variacao(agora, antes)
  if (v == null || Math.abs(v) < 0.05) return null
  const bom = custo ? v < 0 : v > 0
  return <span className="text-[10.5px] font-semibold ml-1.5" style={{ color: neutro ? "#898892" : bom ? COR.sucesso : COR.perigo }}>{v > 0 ? "▲" : "▼"} {pct(Math.abs(v))}</span>
}

function Etapa({ rotulo, valor, sub, tom = "neutro", ultima }: { rotulo: string; valor: string; sub?: React.ReactNode; tom?: Tom; ultima?: boolean }) {
  return (
    <div className="flex items-stretch min-w-0 flex-1">
      <div className="flex-1 min-w-0 rounded-xl px-3 py-2.5 bg-[rgba(116,116,128,0.06)]">
        <p className="text-[10.5px] font-medium text-[#898892] truncate">{rotulo}</p>
        <p className="text-[18px] font-semibold ds-num leading-tight mt-0.5 truncate" style={{ color: tom === "neutro" ? "#191625" : COR[tom] }}>{valor}</p>
        {sub && <p className="text-[10.5px] text-[#898892] mt-0.5 truncate">{sub}</p>}
      </div>
      {!ultima && <ArrowRight className="w-3.5 h-3.5 text-[#c7c7cc] self-center mx-1 shrink-0 hidden md:block" />}
    </div>
  )
}

export default function MarketingRelatorio() {
  const [lista, setLista] = useState<Relatorio[] | null>(null)
  const [sel, setSel] = useState(0)
  const [janela, setJanela] = useState<"dia" | "semana">("semana")
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { fetch("/api/marketing").then(r => r.json()).then(d => setLista(d.relatorios ?? [])).catch(() => setLista([])) }, [])

  async function gerar() {
    setGerando(true); setErro(null)
    const d = await fetch("/api/marketing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lista?.[sel] ? { dia: lista[sel].dia } : {}) }).then(r => r.json()).catch(() => null)
    if (d?.relatorio) setLista(l => [d.relatorio, ...(l ?? []).filter(x => x.dia !== d.relatorio.dia)].sort((a, b) => b.dia.localeCompare(a.dia)))
    else setErro(d?.erro ?? "Sem conexão.")
    setGerando(false)
  }

  const r = lista?.[sel]
  const linhas: LinhaCampanha[] = r ? (janela === "dia" ? r.dia1 : r.semana) : []
  const t = total(linhas)
  const antes = r ? total(r.semanaAnterior) : null
  const comparar = janela === "semana" && antes
  const cpMql = custoPor(t.gasto, t.mql)

  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Relatório de marketing" icone={<Sparkles className="w-4 h-4" />}
        sub={r ? `Do anúncio ao pedido. Gerado ${new Date(r.geradoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}; todo dia de manhã sai o de ontem, com o resumo no seu WhatsApp.` : "Do anúncio ao pedido: todo dia de manhã sai o de ontem, com o resumo no seu WhatsApp."}
        acao={<Botao onClick={gerar} disabled={gerando} icone={gerando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}>{gerando ? "Lendo…" : r ? "Atualizar" : "Gerar agora"}</Botao>} />

      {erro && <p className="text-[12px] text-[#d33a3c] mb-3">{erro}</p>}
      {!lista ? <p className="text-[12px] text-[#898892]">Carregando…</p>
        : !r ? <p className="text-[12px] text-[#898892]">Ainda sem relatório. Clique em “Gerar agora” para ver o de ontem.</p>
        : (<>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <Segmentado valor={janela} opcoes={[{ v: "dia", nome: `Dia ${dm(r.dia)}` }, { v: "semana", nome: "7 dias" }]} onChange={setJanela} />
            {lista.length > 1 && (
              <div className="flex items-center gap-1 flex-wrap">
                {lista.slice(0, 7).map((x, i) => (
                  <button key={x.dia} onClick={() => setSel(i)}
                    className={`h-7 px-2.5 rounded-md text-[11.5px] font-medium transition-colors ${i === sel ? "bg-[#8456e8]/10 text-[#8456e8]" : "text-[#72707d] hover:bg-[rgba(116,116,128,0.08)]"}`}>{dm(x.dia)}</button>
                ))}
              </div>
            )}
          </div>

          {r.leitura ? (
            <div className="rounded-xl px-4 py-3 mb-4 bg-[rgba(132,86,232,0.06)]">
              <p className="text-[12.5px] text-[#191625] leading-relaxed">{r.leitura.resumo}</p>
              {r.leitura.destaques.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {r.leitura.destaques.map((d, i) => <li key={i} className="text-[12px] text-[#5e5c68] leading-snug flex gap-2"><span className="text-[#8456e8] shrink-0">•</span>{d}</li>)}
                </ul>
              )}
              {r.leitura.acao && <p className="mt-2.5 text-[12.5px] font-semibold text-[#191625] flex gap-2"><ArrowRight className="w-4 h-4 text-[#8456e8] shrink-0 mt-px" />{r.leitura.acao}</p>}
            </div>
          ) : r.erroLeitura ? <p className="text-[11.5px] text-[#c57800] mb-3">Sem a leitura da IA desta vez ({r.erroLeitura}). Os números estão certos.</p> : null}
          <EnsinarIA area="marketing" className="mb-4" />

          {/* Funil */}
          <div className="grid grid-cols-2 md:flex gap-2 mb-2">
            <Etapa rotulo="Gasto" valor={brl(t.gasto)} sub={<>{t.cliques} cliques{comparar && <Var agora={t.gasto} antes={antes!.gasto} neutro />}</>} />
            <Etapa rotulo="Leads no WhatsApp" valor={String(t.leads)} sub={<>{custoPor(t.gasto, t.leads) != null ? `${brl(custoPor(t.gasto, t.leads)!)} cada` : "—"}{comparar && <Var agora={t.leads} antes={antes!.leads} />}</>} />
            <Etapa rotulo="MQL (bons negócios)" valor={String(t.mql)} tom="sucesso" sub={<>{t.leads ? `${pct(t.mql / t.leads)} dos leads` : "—"}{comparar && <Var agora={t.mql} antes={antes!.mql} />}</>} />
            <Etapa rotulo="Custo por MQL" valor={cpMql != null ? brl(cpMql) : "—"} tom="acento" sub={comparar ? <>antes {custoPor(antes!.gasto, antes!.mql) != null ? brl(custoPor(antes!.gasto, antes!.mql)!) : "—"}<Var agora={cpMql} antes={custoPor(antes!.gasto, antes!.mql)} custo /></> : "o número que importa"} />
            <Etapa rotulo="Orçamentos" valor={String(t.orcamentos)} sub={t.mql ? `${pct(t.orcamentos / t.mql)} dos MQL` : "—"} />
            <Etapa rotulo="Pedidos" valor={String(t.pedidos)} tom={t.pedidos ? "sucesso" : "neutro"} sub={t.faturamento ? brl(t.faturamento) : "fecham em semanas"} ultima />
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-4 text-[11px] text-[#898892]">
            <Selo tom="neutro">{t.descartados} descartados (pequenos)</Selo>
            <Selo tom="neutro">{t.sumiram} sumiram (sem resposta)</Selo>
            <Selo tom="alerta">{t.semClassificar} conversando sem dizer volume</Selo>
            <span>A Meta contou {t.conversasMeta} conversas iniciadas.</span>
          </div>

          {/* Por campanha */}
          {linhas.length > 0 && (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[12px] min-w-[640px]">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wider text-[#898892] text-left">
                    <th className="font-semibold px-1 py-1.5">Campanha</th>
                    {["Gasto", "Leads", "MQL", "Custo/MQL", "Descart.", "Orçam.", "Pedidos"].map(h => <th key={h} className="font-semibold px-1 py-1.5 text-right">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(l => (
                    <tr key={l.id} className="border-t border-[rgba(116,116,128,0.14)]">
                      <td className="px-1 py-2 font-medium text-[#191625] max-w-[260px] truncate">{l.nome}</td>
                      <td className="px-1 py-2 text-right ds-num">{brl(l.gasto)}</td>
                      <td className="px-1 py-2 text-right ds-num">{l.leads}</td>
                      <td className="px-1 py-2 text-right ds-num font-semibold" style={{ color: COR.sucesso }}>{l.mql}</td>
                      <td className="px-1 py-2 text-right ds-num">{custoPor(l.gasto, l.mql) != null ? brl(custoPor(l.gasto, l.mql)!) : "—"}</td>
                      <td className="px-1 py-2 text-right ds-num text-[#898892]">{l.descartados}</td>
                      <td className="px-1 py-2 text-right ds-num">{l.orcamentos}</td>
                      <td className="px-1 py-2 text-right ds-num">{l.pedidos}{l.faturamento ? <span className="text-[#898892]"> · {brl(l.faturamento)}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>)}
    </Cartao>
  )
}
