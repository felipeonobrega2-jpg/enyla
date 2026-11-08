"use client"

// Painel de chapas da Caixaria. Cada pedido pago no site entra sozinho numa chapa do mesmo modelo e acabamento.
// Aqui você vê o que está montando, o que precisa fechar (prazo da produção normal), quanto cada chapa deixa e
// preenche lugar vago com pedido da ENYLA ou estoque. O cliente do site nunca vê nada disso.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Layers, Clock, CheckCircle2, Factory, Package, Wallet, AlertTriangle, Plus, X, Palette, Loader2, RotateCcw, Zap } from "lucide-react"
import { Pagina, CabecalhoPagina, Cartao, Kpi, GradeKpis, Selo, Botao, Segmentado, Vazio, Gaveta, type Tom } from "@/app/components/ds"
import { contas, prazo, vagos, ocupados, ROTULO_ACAB, ROTULO_STATUS, PRODUCAO_DU, type Chapa, type Ocupacao, type StatusChapa } from "@/app/caixaria/lib/chapas"

type Filtro = "aberta" | "producao" | "pronta" | "todas"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const dataCurta = (iso?: string | null) => iso ? new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—"
const n = (x: number) => x.toLocaleString("pt-BR")

// Cor de cada pedido nos lugares da chapa
const PALETA = ["#8456e8", "#3a84ca", "#009351", "#c57800", "#d33a3c", "#5e5c68", "#b04fc4", "#2a9d8f"]
const COR_TIPO = { enyla: "#191625", estoque: "#a39fb0" }

function corDe(o: Ocupacao, idx: number) {
  return o.tipo === "cliente" ? PALETA[idx % PALETA.length] : COR_TIPO[o.tipo]
}

// Os lugares da chapa como blocos: cada bloco = 1.000 caixas
function Lugares({ c, grande }: { c: Chapa; grande?: boolean }) {
  const blocos: { cor: string; titulo: string }[] = []
  let k = 0
  c.ocupacao.forEach(o => {
    const cor = corDe(o, o.tipo === "cliente" ? k++ : 0)
    for (let i = 0; i < o.lugares; i++) blocos.push({ cor, titulo: o.tipo === "cliente" ? `${o.pedido} · ${o.cliente}` : o.descricao })
  })
  for (let i = 0; i < vagos(c); i++) blocos.push({ cor: "", titulo: "Vago" })
  return (
    <div className={`grid gap-1 ${grande ? "grid-cols-4" : "grid-cols-8"}`} style={{ gridTemplateColumns: `repeat(${Math.min(c.lugares, grande ? 6 : 12)}, minmax(0, 1fr))` }}>
      {blocos.map((b, i) => (
        <div key={i} title={b.titulo}
          className={`${grande ? "h-12" : "h-5"} rounded-[5px] ${b.cor ? "" : "border border-dashed border-[rgba(0,0,0,0.18)] bg-[rgba(116,116,128,0.04)]"}`}
          style={b.cor ? { background: b.cor } : undefined} />
      ))}
    </div>
  )
}

function seloAcao(c: Chapa): { tom: Tom; texto: string } | null {
  const p = prazo(c)
  if (c.status !== "aberta") return { tom: c.status === "pronta" ? "sucesso" : "info", texto: ROTULO_STATUS[c.status] }
  if (p.acao === "fechar") return { tom: "perigo", texto: p.cheia ? "Cheia: pode fechar" : c.expressa ? "Expressa: fechar já" : "Fechar hoje" }
  if (p.acao === "fechar_logo") return { tom: "alerta", texto: `Fechar em ${p.diasRestantes} d.u.` }
  if (p.acao === "aguardar_arte") return { tom: "alerta", texto: `Esperando ${p.semArte} arte${p.semArte > 1 ? "s" : ""}` }
  return { tom: "neutro", texto: p.diasRestantes !== null ? `Montando · fecha até ${dataCurta(p.fecharAte)}` : "Montando" }
}

export default function ChapasView() {
  const [chapas, setChapas] = useState<Chapa[] | null>(null)
  const [semDados, setSemDados] = useState(0)
  const [erro, setErro] = useState("")
  const [filtro, setFiltro] = useState<Filtro>("aberta")
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [preencher, setPreencher] = useState<{ tipo: "enyla" | "estoque"; lugares: number; descricao: string } | null>(null)

  const receber = (j: { chapas?: Chapa[]; semDados?: number; erro?: string }) => {
    if (j.erro) { setErro(j.erro); return }
    setErro(""); setChapas(j.chapas ?? []); setSemDados(j.semDados ?? 0)
  }
  const buscar = useCallback(() => fetch("/api/caixaria/chapas").then(r => r.json()).then(receber).catch(() => setErro("Sem conexão")), [])
  useEffect(() => { buscar() }, [buscar])

  const agir = async (corpo: Record<string, unknown>) => {
    setSalvando(true)
    try {
      const j = await fetch("/api/caixaria/chapas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).then(r => r.json())
      receber(j)
      return !j.erro
    } finally { setSalvando(false) }
  }

  const lista = useMemo(() => (chapas ?? []).filter(c => filtro === "todas" || c.status === filtro)
    .sort((a, b) => {
      const pa = prazo(a), pb = prazo(b)
      const urg = (p: ReturnType<typeof prazo>) => p.acao === "fechar" ? 0 : p.acao === "fechar_logo" ? 1 : p.acao === "aguardar_arte" ? 2 : 3
      return urg(pa) - urg(pb) || b.numero - a.numero
    }), [chapas, filtro])

  const resumo = useMemo(() => {
    const abertas = (chapas ?? []).filter(c => c.status === "aberta")
    return {
      abertas: abertas.length,
      vagos: abertas.reduce((s, c) => s + vagos(c), 0),
      fechar: abertas.filter(c => { const a = prazo(c).acao; return a === "fechar" || a === "fechar_logo" }).length,
      sobra: abertas.reduce((s, c) => s + contas(c).sobra, 0),
      producao: (chapas ?? []).filter(c => c.status === "producao").length,
    }
  }, [chapas])

  const atual = chapas?.find(c => c.id === abertaId) ?? null

  return (
    <Pagina>
      <CabecalhoPagina titulo="Chapas da Caixaria"
        sub="Os pedidos pagos no site entram sozinhos na chapa do mesmo modelo e acabamento. Cada lugar rende 1.000 caixas."
        acoes={<Botao icone={<RotateCcw className="w-3.5 h-3.5" />} onClick={buscar}>Atualizar</Botao>} />

      {erro && <Cartao className="mb-4"><p className="text-[13px] text-[#d33a3c] flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{erro}</p></Cartao>}

      <GradeKpis>
        <Kpi rotulo="Chapas montando" valor={chapas ? resumo.abertas : null} formato={n} icone={<Layers className="w-3.5 h-3.5" />} onClick={() => setFiltro("aberta")} destaque={filtro === "aberta"} />
        <Kpi rotulo="Para fechar" valor={chapas ? resumo.fechar : null} formato={n} tom={resumo.fechar ? "perigo" : "neutro"} sub="cheias, expressas ou no prazo" icone={<Clock className="w-3.5 h-3.5" />} onClick={() => setFiltro("aberta")} />
        <Kpi rotulo="Lugares vagos" valor={chapas ? resumo.vagos : null} formato={n} tom={resumo.vagos ? "alerta" : "neutro"} sub={`${n(resumo.vagos * 1000)} caixas para vender`} icone={<Package className="w-3.5 h-3.5" />} />
        <Kpi rotulo="Sobra das chapas montando" valor={chapas ? resumo.sobra : null} formato={brl} tom={resumo.sobra >= 0 ? "sucesso" : "perigo"} sub="se fechassem hoje, antes de imposto" icone={<Wallet className="w-3.5 h-3.5" />} />
      </GradeKpis>

      <div className="flex items-center justify-between mt-6 mb-3 gap-3 flex-wrap">
        <Segmentado<Filtro> valor={filtro} onChange={setFiltro}
          opcoes={[{ v: "aberta", nome: "Montando" }, { v: "producao", nome: `Em produção${resumo.producao ? ` (${resumo.producao})` : ""}` }, { v: "pronta", nome: "Prontas" }, { v: "todas", nome: "Todas" }]} />
        {semDados > 0 && <span className="text-[12px] text-[#8E8E93]">{semDados} item(ns) de pedidos antigos sem dados de chapa ficaram de fora</span>}
      </div>

      {!chapas ? (
        <Cartao><p className="text-[13px] text-[#8E8E93] flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Lendo os pedidos do site</p></Cartao>
      ) : lista.length === 0 ? (
        <Cartao><Vazio icone={<Layers className="w-9 h-9 text-[#c7c7cc]" />} titulo={filtro === "aberta" ? "Nenhuma chapa montando" : "Nada aqui"}
          sub="Quando um pedido for pago no site da Caixaria, ele aparece aqui na chapa do modelo." /></Cartao>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {lista.map(c => {
            const k = contas(c), s = seloAcao(c)
            return (
              <Cartao key={c.id} onClick={() => { setAbertaId(c.id); setPreencher(null) }}>
                <div className="flex flex-col-reverse items-start gap-1.5 sm:flex-row sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[#191625] flex items-center gap-1.5">
                      Chapa {c.numero} · {c.modeloNome}
                      {c.expressa && <Zap className="w-3.5 h-3.5 text-[#c57800]" />}
                    </p>
                    <p className="text-[12px] text-[#8E8E93] mt-0.5">{ROTULO_ACAB[c.acabamento] ?? c.acabamento} · {ocupados(c)}/{c.lugares} lugares · {n(k.unidades)} caixas</p>
                  </div>
                  {s && <Selo tom={s.tom}>{s.texto}</Selo>}
                </div>
                <div className="mt-3"><Lugares c={c} /></div>
                <div className="mt-3 flex items-center justify-between text-[12px]">
                  <span className="text-[#8E8E93]">receita {brl(k.receita)} · custo {brl(k.custo)}</span>
                  <span className="font-semibold ds-num" style={{ color: k.sobra >= 0 ? "#009351" : "#d33a3c" }}>{k.sobra >= 0 ? "sobra " : ""}{brl(k.sobra)}</span>
                </div>
              </Cartao>
            )
          })}
        </div>
      )}

      <Gaveta aberta={!!atual} onFechar={() => setAbertaId(null)}
        titulo={atual ? `Chapa ${atual.numero} · ${atual.modeloNome}` : ""}
        sub={atual ? `${ROTULO_ACAB[atual.acabamento] ?? atual.acabamento} · formato ${atual.formato} · ${atual.expressa ? "expressa (exclusiva)" : "produção normal"}` : undefined}
        rodape={atual && (
          <div className="flex gap-2 justify-end flex-wrap">
            {atual.status === "aberta" && (
              <Botao variante="primario" icone={<Factory className="w-3.5 h-3.5" />} disabled={salvando || !prazo(atual).podeFechar}
                title={prazo(atual).podeFechar ? undefined : "Aprove a arte de todos os pedidos antes"}
                onClick={() => agir({ acao: "status", chapa: atual.id, status: "producao" satisfies StatusChapa })}>Fechar e mandar para produção</Botao>
            )}
            {atual.status === "producao" && (
              <>
                <Botao variante="fantasma" disabled={salvando} onClick={() => agir({ acao: "status", chapa: atual.id, status: "aberta" })}>Reabrir</Botao>
                <Botao variante="primario" icone={<CheckCircle2 className="w-3.5 h-3.5" />} disabled={salvando} onClick={() => agir({ acao: "status", chapa: atual.id, status: "pronta" })}>Marcar como pronta</Botao>
              </>
            )}
          </div>
        )}>
        {atual && (() => {
          const k = contas(atual), p = prazo(atual)
          let idx = 0
          return (
            <div className="space-y-5">
              <Lugares c={atual} grande />

              <div className="grid grid-cols-2 gap-2 text-[12.5px]">
                <div className="rounded-lg ds-borda p-3"><p className="text-[#8E8E93]">Fecha até</p><p className="font-semibold mt-0.5">{p.fecharAte ? `${dataCurta(p.fecharAte)}${p.diasRestantes !== null ? ` (${p.diasRestantes} d.u.)` : ""}` : "quando a 1ª arte for aprovada"}</p></div>
                <div className="rounded-lg ds-borda p-3"><p className="text-[#8E8E93]">Produção</p><p className="font-semibold mt-0.5">{PRODUCAO_DU} dias úteis</p></div>
                <div className="rounded-lg ds-borda p-3"><p className="text-[#8E8E93]">Sobra agora</p><p className="font-semibold mt-0.5 ds-num" style={{ color: k.sobra >= 0 ? "#009351" : "#d33a3c" }}>{brl(k.sobra)}</p></div>
                <div className="rounded-lg ds-borda p-3"><p className="text-[#8E8E93]">Se encher com pedidos do site</p><p className="font-semibold mt-0.5 ds-num">{k.sobraCheia !== null ? brl(k.sobraCheia) : "—"}</p></div>
              </div>
              <p className="text-[12px] text-[#8E8E93] -mt-2">
                Custo: chapa {brl(atual.rodada)} + colagem {brl(k.colagem)} + arte {brl(k.arte)}{k.frete ? ` + frete incluso ${brl(k.frete)}` : ""}.
                {k.equilibrio ? ` Com o preço médio desta chapa, ${k.equilibrio} lugar${k.equilibrio > 1 ? "es" : ""} de cliente já paga${k.equilibrio > 1 ? "m" : ""} a chapa.` : ""}
                {atual.expressa && vagos(atual) > 0 ? " Expressa sozinha mal paga a chapa: vale preencher os vagos com ENYLA ou estoque." : ""}
              </p>

              <div>
                <p className="text-[11px] uppercase tracking-wide font-bold text-[#8E8E93] mb-2">Na chapa</p>
                <div className="divide-y divide-[rgba(0,0,0,0.06)] ds-borda rounded-lg">
                  {atual.ocupacao.map(o => {
                    const cor = corDe(o, o.tipo === "cliente" ? idx++ : 0)
                    return (
                      <div key={o.id} className="p-3 flex items-start gap-3">
                        <span className="w-3 h-3 rounded-[3px] mt-1 shrink-0" style={{ background: cor }} />
                        <div className="flex-1 min-w-0 text-[13px]">
                          <p className="font-medium text-[#191625]">{o.tipo === "cliente" ? `${o.pedido} · ${o.cliente}` : o.tipo === "enyla" ? "ENYLA" : "Estoque"}</p>
                          <p className="text-[12px] text-[#8E8E93]">{o.lugares} lugar{o.lugares > 1 ? "es" : ""} · {n(o.lugares * 1000)} caixas · {o.descricao}</p>
                          {o.tipo === "cliente" && <p className="text-[12px] text-[#8E8E93]">pago em {dataCurta(o.pagoEm)} · {brl(o.receita ?? 0)}{o.frete ? ` (frete incluso ${brl(o.frete)})` : ""}</p>}
                        </div>
                        {o.tipo === "cliente" ? (
                          <button disabled={salvando || atual.status !== "aberta"} onClick={() => agir({ acao: "arte", chapa: atual.id, ocupacao: o.id, aprovada: !o.arteAprovadaEm })}
                            className={`shrink-0 text-[12px] font-medium rounded-full px-2.5 py-1 flex items-center gap-1 ${o.arteAprovadaEm ? "bg-[#009351]/10 text-[#009351]" : "bg-[#c57800]/10 text-[#c57800]"}`}>
                            <Palette className="w-3 h-3" />{o.arteAprovadaEm ? `arte aprovada ${dataCurta(o.arteAprovadaEm)}` : "aprovar arte"}
                          </button>
                        ) : atual.status === "aberta" && (
                          <button disabled={salvando} onClick={() => agir({ acao: "liberar", chapa: atual.id, ocupacao: o.id })} className="shrink-0 text-[#8E8E93] hover:text-[#d33a3c]" title="Liberar lugar"><X className="w-4 h-4" /></button>
                        )}
                      </div>
                    )
                  })}
                  {vagos(atual) > 0 && (
                    <div className="p-3 text-[13px] text-[#8E8E93] flex items-center justify-between gap-3">
                      <span>{vagos(atual)} lugar{vagos(atual) > 1 ? "es" : ""} vago{vagos(atual) > 1 ? "s" : ""} ({n(vagos(atual) * 1000)} caixas)</span>
                      {atual.status === "aberta" && !preencher && (
                        <Botao icone={<Plus className="w-3.5 h-3.5" />} onClick={() => setPreencher({ tipo: "enyla", lugares: 1, descricao: "" })}>Preencher</Botao>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {preencher && atual.status === "aberta" && (
                <Cartao>
                  <p className="text-[13px] font-semibold mb-3">Preencher lugar vago</p>
                  <Segmentado<"enyla" | "estoque"> valor={preencher.tipo} onChange={t => setPreencher({ ...preencher, tipo: t })}
                    opcoes={[{ v: "enyla", nome: "Pedido ENYLA" }, { v: "estoque", nome: "Estoque (similares)" }]} />
                  <div className="grid grid-cols-[90px_1fr] gap-2 mt-3">
                    <input type="number" min={1} max={vagos(atual)} value={preencher.lugares} onChange={e => setPreencher({ ...preencher, lugares: Number(e.target.value) })}
                      className="h-9 rounded-lg ds-borda px-2.5 text-[13px] ds-num" aria-label="Lugares" />
                    <input value={preencher.descricao} onChange={e => setPreencher({ ...preencher, descricao: e.target.value })}
                      placeholder={preencher.tipo === "enyla" ? "cliente / pedido da ENYLA" : "qual arte de similar"} className="h-9 rounded-lg ds-borda px-2.5 text-[13px]" />
                  </div>
                  <div className="flex justify-end gap-2 mt-3">
                    <Botao variante="fantasma" onClick={() => setPreencher(null)}>Cancelar</Botao>
                    <Botao variante="primario" disabled={salvando} onClick={async () => { if (await agir({ acao: "preencher", chapa: atual.id, ...preencher })) setPreencher(null) }}>Colocar na chapa</Botao>
                  </div>
                </Cartao>
              )}
            </div>
          )
        })()}
      </Gaveta>
    </Pagina>
  )
}
