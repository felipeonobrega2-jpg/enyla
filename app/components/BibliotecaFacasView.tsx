"use client"

// Produção → Facas: a biblioteca de desenhos (DXF do Pacdora) e as facas físicas de cada um (o desenho em X cavidades).
// Todo DXF importado no orçamento entra aqui sozinho; dá para subir vários de uma vez (os antigos).

import { useEffect, useMemo, useRef, useState } from "react"
import { Upload, Search, Box, Download, Trash2, Plus, Scissors, FileText, Loader2, Pencil } from "lucide-react"
import { Pagina, CabecalhoPagina, Cartao, Selo, Botao, Vazio } from "./ds"
import { parseDXF, caixaDoDxf, type DXFResult } from "../lib/dxf"
import { Desenho, nomeBonito, ondeCabe, frascoQueServe, servemParaFrasco, facasDoDesenho, descricaoCaixa, cm, nomeDoDesenho, buscarDesenhos, tagsMaisUsadas, lerTags, normalizarBusca } from "../lib/biblioteca"
import type { Ferramental } from "../lib/producao"

type Uso = { numero: string; cliente: string; desenhoId?: string | null }

function Previa({ id, nome }: { id: string; nome: string }) {
  const [r, setR] = useState<DXFResult | null | "erro">(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Só baixa o desenho quando o card aparece na tela
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      fetch(`/api/biblioteca/${id}`).then(x => x.ok ? x.text() : Promise.reject()).then(t => setR(parseDXF(t) ?? "erro")).catch(() => setR("erro"))
    }, { rootMargin: "200px" })
    io.observe(el)
    return () => io.disconnect()
  }, [id])
  const W = 320, H = 200, P = 14
  return (
    <div ref={ref} className="rounded-xl bg-[#f2f2f7] overflow-hidden" style={{ aspectRatio: `${W} / ${H}` }}>
      {r && r !== "erro" ? (() => {
        const { bounds: b, paths } = r
        const gW = b.maxX - b.minX, gH = b.maxY - b.minY
        const s = Math.min((W - P * 2) / gW, (H - P * 2) / gH)
        const tx = P + (W - P * 2 - gW * s) / 2 - b.minX * s, ty = P + (H - P * 2 - gH * s) / 2 + b.maxY * s
        return (
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-full" role="img" aria-label={`Desenho ${nome}`}>
            <g transform={`translate(${tx}, ${ty}) scale(${s}, ${-s})`}>
              <rect x={b.minX} y={b.minY} width={gW} height={gH} fill="white" />
              {paths.folds && <path d={paths.folds} fill="none" stroke="#dc2626" strokeWidth={0.7} vectorEffect="non-scaling-stroke" strokeDasharray="4 2" />}
              {paths.cuts && <path d={paths.cuts} fill="none" stroke="#8456e8" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
            </g>
          </svg>
        )
      })() : (
        <div className="w-full h-full flex items-center justify-center text-[11.5px] text-[#898892]">
          {r === "erro" ? "Não deu para desenhar" : <Loader2 className="w-4 h-4 animate-spin" />}
        </div>
      )}
    </div>
  )
}

function NovaFaca({ d, fornecedores, onSalvar, onCancelar }: { d: Desenho; fornecedores: string[]; onSalvar: (f: Ferramental & { desenhoId: string }) => void; onCancelar: () => void }) {
  // "Com quem está": os fornecedores de corte e vinco (o padrão primeiro); "Outro" abre o campo livre
  const [cav, setCav] = useState("4"), [forn, setForn] = useState(fornecedores[0] ?? ""), [outro, setOutro] = useState(fornecedores.length === 0), [cli, setCli] = useState(""), [custo, setCusto] = useState("")
  const n = parseInt(cav) || 0
  return (
    <div className="mt-2 rounded-xl bg-[rgba(116,116,128,0.06)] p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-[#5e5c68]">Cavidades<input value={cav} onChange={e => setCav(e.target.value)} inputMode="numeric" className="mt-0.5 w-full h-8 rounded-lg bg-white px-2 text-[13px] ds-borda" /></label>
        <label className="text-[11px] text-[#5e5c68]">Custo (R$)<input value={custo} onChange={e => setCusto(e.target.value)} inputMode="decimal" className="mt-0.5 w-full h-8 rounded-lg bg-white px-2 text-[13px] ds-borda" /></label>
        <label className="text-[11px] text-[#5e5c68]">Com quem está
          {outro ? <input value={forn} onChange={e => setForn(e.target.value)} placeholder="fornecedor" autoFocus={fornecedores.length > 0} className="mt-0.5 w-full h-8 rounded-lg bg-white px-2 text-[13px] ds-borda" />
            : <select value={forn} onChange={e => { if (e.target.value === "__outro") { setOutro(true); setForn("") } else setForn(e.target.value) }} className="mt-0.5 w-full h-8 rounded-lg bg-white px-1.5 text-[13px] ds-borda">
                {fornecedores.map(n => <option key={n} value={n}>{n}</option>)}
                <option value="">Não sei / em casa</option>
                <option value="__outro">Outro…</option>
              </select>}
        </label>
        <label className="text-[11px] text-[#5e5c68]">Cliente<input value={cli} onChange={e => setCli(e.target.value)} placeholder="opcional" className="mt-0.5 w-full h-8 rounded-lg bg-white px-2 text-[13px] ds-borda" /></label>
      </div>
      <div className="flex gap-2">
        <Botao variante="primario" disabled={n < 1} onClick={() => onSalvar({
          id: `f-${Date.now().toString(36)}`, tipo: "faca", cliente: cli.trim(), produto: d.modelo || d.nome, blankLargura: d.blank.largura, blankAltura: d.blank.altura,
          cavidades: n, fornecedor: forn.trim() || undefined, custo: parseFloat(custo.replace(",", ".")) || 0, data: new Date().toISOString(), desenhoId: d.id,
        })}>Registrar faca</Botao>
        <Botao variante="fantasma" onClick={onCancelar}>Cancelar</Botao>
      </div>
    </div>
  )
}

// Seu nome e as palavras-chave do desenho: é por eles que você acha a faca no orçamento
function EditarNome({ d, sugestoes, onSalvar, onCancelar }: { d: Desenho; sugestoes: string[]; onSalvar: (apelido: string, tags: string[]) => Promise<void>; onCancelar: () => void }) {
  const [apelido, setApelido] = useState(d.apelido ?? nomeBonito(d.nome))
  const [tags, setTags] = useState((d.tags ?? []).join(", "))
  const [salvando, setSalvando] = useState(false)
  const atuais = lerTags(tags)
  const faltam = sugestoes.filter(t => !atuais.includes(t)).slice(0, 8)
  return (
    <div className="mt-2 rounded-xl bg-[rgba(116,116,128,0.06)] p-3 space-y-2">
      <label className="block text-[11px] text-[#5e5c68]">Nome
        <input value={apelido} onChange={e => setApelido(e.target.value)} autoFocus placeholder="Perfume 20ml fundo automático" className="mt-0.5 w-full h-8 rounded-lg bg-white px-2 text-[13px] ds-borda" /></label>
      <label className="block text-[11px] text-[#5e5c68]">Palavras-chave (separe por vírgula)
        <input value={tags} onChange={e => setTags(e.target.value)} placeholder="perfume, 20ml, villa" className="mt-0.5 w-full h-8 rounded-lg bg-white px-2 text-[13px] ds-borda" /></label>
      {faltam.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {faltam.map(t => <button key={t} type="button" onClick={() => setTags([...atuais, t].join(", "))} className="h-6 px-2 rounded-full bg-[#8456e8]/[0.08] text-[#8456e8] text-[11px] font-semibold">+ {t}</button>)}
        </div>
      )}
      <div className="flex gap-2">
        <Botao variante="primario" disabled={salvando} onClick={async () => { setSalvando(true); await onSalvar(apelido, atuais); setSalvando(false) }}>{salvando ? "Salvando…" : "Salvar"}</Botao>
        <Botao variante="fantasma" onClick={onCancelar}>Cancelar</Botao>
      </div>
    </div>
  )
}

function CardDesenho({ d, facas, usos, fornecedores, sugestoes, onUsar, onRegistrar, onApagar, onEditar, onTag }: {
  d: Desenho; facas: Ferramental[]; usos: Uso[]; fornecedores: string[]; sugestoes: string[]
  onUsar: () => void; onRegistrar: (f: Ferramental & { desenhoId: string }) => void; onApagar: () => void
  onEditar: (apelido: string, tags: string[]) => Promise<void>; onTag: (t: string) => void
}) {
  const [nova, setNova] = useState(false)
  const [editando, setEditando] = useState(false)
  const onde = ondeCabe(d)
  const frasco = frascoQueServe(d)
  const box = d.caixa ? `/box-preview?l=${d.caixa.largura / 10}&a=${d.caixa.altura / 10}&p=${d.caixa.profundidade / 10}` : null
  return (
    <Cartao className="min-w-0">
      <Previa id={d.id} nome={d.nome} />
      <div className="mt-3 flex items-start gap-2">
        <p className="flex-1 min-w-0 text-[13px] font-semibold text-[#191625] truncate" title={d.nome}>{nomeDoDesenho(d)}</p>
        {!editando && <button onClick={() => setEditando(true)} className="shrink-0 text-[11.5px] font-semibold text-[#8456e8] flex items-center gap-1" title="Nome e palavras-chave"><Pencil className="w-3 h-3" />Nomear</button>}
      </div>
      {d.apelido && <p className="text-[10.5px] text-[#898892] truncate" title={d.nome}>{nomeBonito(d.nome)}</p>}
      {!editando && (d.tags ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">{d.tags!.map(t => <button key={t} onClick={() => onTag(t)} className="h-5 px-2 rounded-full bg-[#8456e8]/[0.08] text-[#8456e8] text-[10.5px] font-semibold">{t}</button>)}</div>
      )}
      {editando && <EditarNome d={d} sugestoes={sugestoes} onSalvar={async (a, t) => { await onEditar(a, t); setEditando(false) }} onCancelar={() => setEditando(false)} />}
      <p className="text-[11.5px] text-[#898892] mt-1">{d.modelo ? `${d.modelo} · ` : ""}caixa {descricaoCaixa(d)} · peça {cm(d.blank.largura)} × {cm(d.blank.altura)} cm</p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <Selo tom={onde.digital ? "info" : "neutro"}>{onde.digital ? `Digital: ${onde.digital}` : "Maior que A3"}</Selo>
        {onde.offset[0]?.porFolha > 0 && <Selo tom="neutro">Offset: {onde.offset[0].porFolha} por folha {onde.offset[0].formato}</Selo>}
        {frasco && <Selo tom="neutro">Frasco até {frasco.altura.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} × {frasco.diametro.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm</Selo>}
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#898892] flex items-center gap-1.5"><Scissors className="w-3 h-3" />Facas ({facas.length})</p>
        {facas.length === 0 && !nova && <p className="text-[12px] text-[#898892] mt-1">Nenhuma faca física deste desenho ainda.</p>}
        {facas.map(f => (
          <p key={f.id} className="text-[12px] text-[#191625] mt-1"><b>{f.cavidades} cavidades</b>{f.fornecedor ? ` · com ${f.fornecedor}` : ""}{f.cliente ? ` · ${f.cliente}` : ""}{f.custo ? ` · R$ ${f.custo.toLocaleString("pt-BR")}` : ""}</p>
        ))}
        {nova ? <NovaFaca d={d} fornecedores={fornecedores} onSalvar={f => { onRegistrar(f); setNova(false) }} onCancelar={() => setNova(false)} />
          : <button onClick={() => setNova(true)} className="mt-1 text-[12px] font-semibold text-[#8456e8] flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Registrar faca deste desenho</button>}
      </div>

      {usos.length > 0 && (
        <p className="text-[11.5px] text-[#5e5c68] mt-2 flex items-start gap-1.5"><FileText className="w-3.5 h-3.5 mt-px shrink-0 text-[#898892]" />
          <span>Usado em {usos.slice(0, 4).map(u => `${u.numero} (${u.cliente})`).join(", ")}{usos.length > 4 ? ` e mais ${usos.length - 4}` : ""}</span></p>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        <Botao variante="primario" onClick={onUsar}>Usar no orçamento</Botao>
        {box && <a href={box} target="_blank" rel="noreferrer"><Botao icone={<Box className="w-3.5 h-3.5" />}>3D</Botao></a>}
        <a href={`/api/biblioteca/${d.id}?baixar=1&nome=${encodeURIComponent(d.nome)}`}><Botao variante="fantasma" icone={<Download className="w-3.5 h-3.5" />}>DXF</Botao></a>
        <Botao variante="fantasma" icone={<Trash2 className="w-3.5 h-3.5" />} onClick={() => { if (confirm(`Tirar "${d.nome}" da biblioteca?`)) onApagar() }} title="Tirar da biblioteca" />
      </div>
    </Cartao>
  )
}

export function BibliotecaFacasView({ ferramentais, fornecedores = [], usos, onUsar, onRegistrarFaca }: {
  ferramentais: Ferramental[]
  fornecedores?: string[]          // quem faz corte e vinco (o padrão primeiro)
  usos: Uso[]
  onUsar: (d: Desenho) => void
  onRegistrarFaca: (f: Ferramental) => void
}) {
  const [lista, setLista] = useState<Desenho[] | null>(null)
  const [busca, setBusca] = useState("")
  const [alt, setAlt] = useState(""), [dia, setDia] = useState("")
  const [subindo, setSubindo] = useState<string | null>(null)
  const carregar = () => fetch("/api/biblioteca").then(r => r.json()).then(d => setLista(d.desenhos ?? [])).catch(() => setLista([]))
  useEffect(() => { carregar() }, [])

  // Subir um ou vários DXF (os antigos do Pacdora)
  async function subir(files: FileList | null) {
    const arqs = Array.from(files ?? []).filter(f => /\.dxf$/i.test(f.name))
    let ok = 0, falhou = 0, naoLeu = 0
    for (const [i, f] of arqs.entries()) {
      setSubindo(`${i + 1} de ${arqs.length}`)
      const texto = await f.text()
      const r = parseDXF(texto)
      if (!r) { naoLeu++; continue }
      const c = caixaDoDxf(f.name, r)
      const fd = new globalThis.FormData()
      fd.set("arquivo", new Blob([texto], { type: "application/dxf" }), f.name)
      fd.set("meta", JSON.stringify({ nome: f.name, modelo: c?.modelo, caixa: c ? { largura: c.largura, altura: c.altura, profundidade: c.profundidade } : null, blank: { largura: r.largura, altura: r.altura } }))
      const res = await fetch("/api/biblioteca", { method: "POST", body: fd }).catch(() => null)
      if (res?.ok) ok++; else falhou++
    }
    const avisos = [naoLeu ? `${naoLeu} sem desenho legível` : "", falhou ? `${falhou} não subiram (tente de novo)` : ""].filter(Boolean)
    setSubindo(avisos.length ? `${ok} guardados, ${avisos.join(", ")}` : null)
    if (avisos.length) setTimeout(() => setSubindo(null), 8000)
    carregar()
  }

  const altura = parseFloat(alt.replace(",", ".")), diametro = parseFloat(dia.replace(",", "."))
  const visiveis = useMemo(() => {
    const todos = lista ?? []
    const porTexto = buscarDesenhos(todos, busca)
    if (altura > 0 && diametro > 0) return servemParaFrasco(porTexto, altura, diametro).map(x => x.d)
    return porTexto
  }, [lista, busca, altura, diametro])
  const atalhos = useMemo(() => tagsMaisUsadas(lista ?? [], 14), [lista])
  const usados = normalizarBusca(busca).split(" ")
  const alternarTag = (t: string) => setBusca(usados.includes(t) ? usados.filter(x => x !== t).join(" ") : `${busca.trim()} ${t}`.trim())
  async function editar(id: string, apelido: string, tags: string[]) {
    const r = await fetch("/api/biblioteca", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, apelido, tags }) }).catch(() => null)
    if (r?.ok) setLista(l => (l ?? []).map(d => d.id === id ? { ...d, apelido: apelido.trim() || undefined, tags: tags.length ? tags : undefined } : d))
  }
  const facasSemDesenho = useMemo(() => ferramentais.filter(f => f.tipo === "faca" && !(lista ?? []).some(d => facasDoDesenho(d, [f]).length)), [ferramentais, lista])

  return (
    <Pagina>
      <CabecalhoPagina titulo="Facas" sub="Os desenhos (DXF do Pacdora) e as facas físicas de cada um. Todo DXF importado no orçamento entra aqui sozinho."
        acoes={<label className="cursor-pointer"><span className="h-9 px-3.5 rounded-lg text-[12.5px] font-semibold inline-flex items-center gap-1.5 bg-[#8456e8] text-white">
          {subindo && !subindo.includes("guardados") ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}{subindo && !subindo.includes("guardados") ? `Subindo ${subindo}` : "Subir DXF"}</span>
          <input type="file" accept=".dxf" multiple className="hidden" onChange={e => { void subir(e.target.files); e.target.value = "" }} /></label>} />

      <Cartao className="mb-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[200px] text-[11.5px] text-[#5e5c68]">Buscar (nome, palavra-chave ou medida)
            <span className="mt-1 flex items-center gap-2 h-9 rounded-lg px-2.5 bg-[rgba(116,116,128,0.06)]"><Search className="w-3.5 h-3.5 text-[#898892]" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="perfume 20ml, fundo automático, 5x5x12…" className="flex-1 min-w-0 bg-transparent outline-none text-[13px]" /></span>
          </label>
          <div className="text-[11.5px] text-[#5e5c68]">Que sirva no frasco (cm)
            <div className="mt-1 flex items-center gap-1.5">
              <input value={alt} onChange={e => setAlt(e.target.value)} inputMode="decimal" placeholder="altura" className="w-20 h-9 rounded-lg px-2.5 bg-[rgba(116,116,128,0.06)] outline-none text-[13px]" />
              <span>×</span>
              <input value={dia} onChange={e => setDia(e.target.value)} inputMode="decimal" placeholder="diâmetro" className="w-24 h-9 rounded-lg px-2.5 bg-[rgba(116,116,128,0.06)] outline-none text-[13px]" />
            </div>
          </div>
        </div>
        {atalhos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {atalhos.map(t => <button key={t} onClick={() => alternarTag(t)} className={`h-6 px-2.5 rounded-full text-[11px] font-semibold ${usados.includes(t) ? "bg-[#8456e8] text-white" : "bg-[#8456e8]/[0.08] text-[#8456e8]"}`}>{t}</button>)}
          </div>
        )}
        {subindo?.includes("guardados") && <p className="text-[12px] text-[#c57800] mt-2">{subindo}</p>}
        {altura > 0 && diametro > 0 && <p className="text-[12px] text-[#5e5c68] mt-2">{visiveis.length ? `${visiveis.length} ${visiveis.length === 1 ? "desenho serve" : "desenhos servem"}, do mais justo para o mais folgado.` : "Nenhum desenho guardado serve nesse frasco: vai ser faca nova."}</p>}
      </Cartao>

      {lista === null ? <Cartao><p className="text-[12.5px] text-[#898892]">Carregando…</p></Cartao>
        : lista.length === 0 ? <Vazio icone={<Scissors className="w-5 h-5" />} titulo="Nenhum desenho ainda" sub="Importe um DXF no orçamento ou suba os seus DXF antigos aqui." />
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {visiveis.map(d => (
              <CardDesenho key={d.id} d={d} facas={facasDoDesenho(d, ferramentais)} usos={usos.filter(u => u.desenhoId === d.id)} fornecedores={fornecedores}
                sugestoes={atalhos} onEditar={(a, t) => editar(d.id, a, t)} onTag={alternarTag}
                onUsar={() => onUsar(d)} onRegistrar={onRegistrarFaca}
                onApagar={() => { void fetch(`/api/biblioteca?id=${d.id}`, { method: "DELETE" }).then(carregar) }} />
            ))}
          </div>
        )}

      {facasSemDesenho.length > 0 && (
        <Cartao className="mt-3">
          <p className="text-[13px] font-semibold text-[#191625]">Facas sem desenho ({facasSemDesenho.length})</p>
          <p className="text-[11.5px] text-[#898892] mb-2">Registradas antes da biblioteca. Suba o DXF delas e elas aparecem no card do desenho (pela medida da peça).</p>
          {facasSemDesenho.map(f => (
            <p key={f.id} className="text-[12px] text-[#5e5c68] py-1 border-t border-[rgba(60,60,67,0.07)] first:border-t-0">
              {f.produto || "Faca"} · peça {cm(f.blankLargura)} × {cm(f.blankAltura)} cm · {f.cavidades} cavidades{f.fornecedor ? ` · com ${f.fornecedor}` : ""}{f.cliente ? ` · ${f.cliente}` : ""}
            </p>
          ))}
        </Cartao>
      )}
    </Pagina>
  )
}
