"use client"

// Página do pedido digital: a caixa em 3D, as quantidades com o preço, o Pix do sinal (50%) e o briefing da arte.
// Depois do sinal, a mesma página mostra o andamento.

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import QRCode from "qrcode"
import { Check, Copy, Loader2, Upload, FileText, AlertCircle, Sparkles, Palette, Truck, Send } from "lucide-react"
import { Caixa3D } from "@/app/components/Caixa3D"
import { gerarPixPayload } from "@/app/lib/pix"

type Opcao = { quantidade: number; total: number; unit: number }
type Pedido = {
  id: string; nome: string | null; ml: number | null; produto: string | null; medidas: { a: number; l: number; p: number }; padrao: boolean; folha: string
  quantidade: number; total: number; sinal: number; status: string; sinalPagoEm: string | null
  briefing: { marca: string; cores: string; referencias: string; laminacao: "fosca" | "brilho"; arquivos: { nome: string; url: string }[] }
  opcoes: Opcao[]
  arte: { url: string; nome: string; em: string } | null; aprovar: boolean; arteAprovadaEm: string | null; arteEnviadaEm: string | null
  ajustes: { texto: string; em: string }[]
  restante: number | null; frete: number | null; restantePagoEm: string | null
  entrega: { cep: string; endereco: string } | null
  designer: boolean
  asaas: boolean; documento: string | null
  cobranca: { parte: "sinal" | "restante"; payload: string; imagem: string; fatura: string } | null
}
const ehPdf = (u: string) => /\.pdf($|\?)/i.test(u)

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const cm = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
const ETAPAS = [["sinal_pago", "Sinal pago"], ["arte", "Arte"], ["producao", "Produção"], ["enviado", "Enviado"]] as const

export default function DigitalClient({ id, t, dz = "" }: { id: string; t: string; dz?: string }) {
  const [p, setP] = useState<Pedido | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [mudando, setMudando] = useState<number | null>(null)
  const [conferindo, setConferindo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [br, setBr] = useState<{ marca: string; cores: string; referencias: string; laminacao: "fosca" | "brilho" }>({ marca: "", cores: "", referencias: "", laminacao: "fosca" })
  const [ajuste, setAjuste] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [ent, setEnt] = useState({ cep: "", endereco: "" })
  const [salvo, setSalvo] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    fetch(`/api/d/${encodeURIComponent(id)}?t=${encodeURIComponent(t)}${dz ? `&dz=${encodeURIComponent(dz)}` : ""}`).then(async r => {
      const d = await r.json().catch(() => null)
      if (!r.ok) return setErro(d?.erro ?? "Não consegui abrir o orçamento.")
      setP(d); setBr({ marca: d.briefing.marca, cores: d.briefing.cores, referencias: d.briefing.referencias, laminacao: d.briefing.laminacao ?? "fosca" })
    }).catch(() => setErro("Sem conexão. Tente de novo."))
  }, [id, t, dz])


  const post = async (corpo: Record<string, unknown>) => {
    const r = await fetch(`/api/d/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t, dz: dz || undefined, ...corpo }) })
    const d = await r.json().catch(() => null)
    if (!r.ok) throw new Error(d?.erro ?? "Não deu certo. Tente de novo.")
    return d as Pedido
  }
  async function escolher(q: number) {
    if (!p || q === p.quantidade || p.status !== "aguardando_sinal") return
    setMudando(q); setAviso(null)
    try { setP(await post({ acao: "quantidade", quantidade: q })) } catch (e) { setAviso((e as Error).message) }
    setMudando(null)
  }
  async function conferir() {
    setConferindo(true); setAviso(null)
    try {
      const d = await post({ acao: "conferir" })
      setP(d)
      if (d.status === "aguardando_sinal") setAviso("Ainda não apareceu no nosso extrato. O banco pode levar alguns minutos; assim que cair, a gente te avisa no WhatsApp.")
    } catch (e) { setAviso((e as Error).message) }
    setConferindo(false)
  }
  async function salvarBriefing() {
    try { setP(await post({ acao: "briefing", ...br })); setSalvo(true); setTimeout(() => setSalvo(false), 2500) } catch (e) { setAviso((e as Error).message) }
  }
  async function anexar(f: File | undefined) {
    if (!f || !p) return
    setEnviando(true); setAviso(null)
    const fd = new FormData(); fd.append("t", t); fd.append("file", f)
    const r = await fetch(`/api/d/${encodeURIComponent(id)}/arquivo`, { method: "POST", body: fd }).catch(() => null)
    const d = await r?.json().catch(() => null)
    if (r?.ok) setP({ ...p, briefing: { ...p.briefing, arquivos: d.arquivos } }); else setAviso(d?.erro ?? "Não consegui mandar o arquivo.")
    setEnviando(false)
  }

  async function acao(nome: string, corpo: Record<string, unknown>, depois?: () => void) {
    setOcupado(nome); setAviso(null)
    try { setP(await post(corpo)); depois?.() } catch (e) { setAviso((e as Error).message) }
    setOcupado(null)
  }
  async function subirArte(f: File | undefined) {
    if (!f || !p) return
    setOcupado("arte"); setAviso(null)
    const fd = new FormData(); fd.append("t", t); fd.append("dz", dz); fd.append("file", f)
    const r = await fetch(`/api/d/${encodeURIComponent(id)}/arte`, { method: "POST", body: fd }).catch(() => null)
    const d = await r?.json().catch(() => null)
    if (r?.ok) setP({ ...p, arte: d.arte, arteEnviadaEm: null, aprovar: false }); else setAviso(d?.erro ?? "Não consegui subir a arte.")
    setOcupado(null)
  }

  if (erro) return <Tela><div className="flex items-start gap-3 bg-white rounded-2xl p-5 ds-borda"><AlertCircle className="w-5 h-5 text-[#d33a3c] shrink-0" /><p className="text-[14px] text-[#191625]">{erro}</p></div></Tela>
  if (!p) return <Tela><div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#8456e8]" /></div></Tela>

  // Link do Leandro (arte e produção): só o que ele precisa para trabalhar. Nada de cliente, preço ou pagamento.
  if (p.designer) {
    const b = p.briefing
    const Linha = ({ rotulo, valor }: { rotulo: string; valor?: string | null }) => valor ? (
      <div className="py-2.5 border-t border-[rgba(60,60,67,0.07)] first:border-t-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#898892]">{rotulo}</p>
        <p className="text-[14px] text-[#191625] mt-0.5 whitespace-pre-wrap break-words">{valor}</p>
      </div>
    ) : null
    const situacao = p.arteAprovadaEm ? "Arte aprovada pelo cliente: pode imprimir" : p.arteEnviadaEm ? "Arte com o cliente, esperando aprovar" : p.ajustes.length && !p.arteEnviadaEm && p.arte ? "Cliente pediu ajuste" : p.arte ? "Arte ainda não foi para o cliente" : "Arte a fazer"
    return (
      <Tela rodape="Enyla · pedido de produção">
        <div className="text-center">
          <p className="text-[12px] font-semibold text-[#898892]">{p.id}</p>
          <h1 className="text-[22px] font-bold text-[#191625] mt-1 leading-tight">Pedido de arte e produção</h1>
          <p className="text-[13px] text-[#5e5c68] mt-1">{situacao}</p>
        </div>

        <div className="bg-white rounded-2xl ds-borda py-6 flex flex-col items-center">
          <Caixa3D largura={p.medidas.l} altura={p.medidas.a} profundidade={p.medidas.p} material="Triplex 300g" laminacao={b.laminacao === "brilho" ? "brilho" : "fosca"} tamanho={150} />
          <p className="text-[13px] font-semibold text-[#191625] mt-4">{cm(p.medidas.a)} × {cm(p.medidas.l)} × {cm(p.medidas.p)} cm <span className="font-normal text-[#898892]">(A × L × P)</span></p>
          <p className="text-[12.5px] text-[#5e5c68] mt-2 text-center px-6">
            {p.quantidade.toLocaleString("pt-BR")} caixas · folha {p.folha} · triplex 300g · laminação {b.laminacao === "brilho" ? "brilho" : "fosca"}
            {p.ml ? ` · frasco de ${p.ml} ml` : ""}
          </p>
        </div>

        <div className="bg-white rounded-2xl ds-borda p-5">
          <p className="text-[15px] font-bold text-[#191625] mb-1">Briefing do cliente</p>
          {!(b.marca || b.cores || b.referencias || b.arquivos.length) && <p className="text-[13px] text-[#c57800] mt-1">O cliente ainda não preencheu. Assim que ele mandar, você recebe no WhatsApp.</p>}
          <Linha rotulo="Marca" valor={b.marca} />
          <Linha rotulo="Cores" valor={b.cores} />
          <Linha rotulo="O que vai na caixa e referências" valor={b.referencias} />
          {b.arquivos.length > 0 && (
            <div className="pt-2.5 border-t border-[rgba(60,60,67,0.07)]">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#898892]">Arquivos do cliente ({b.arquivos.length})</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {b.arquivos.map((a, i) => (
                  <a key={a.url} href={a.url} target="_blank" rel="noreferrer" download className="block rounded-xl overflow-hidden ds-borda bg-[#f5f5f7] aspect-square">
                    {ehPdf(a.url)
                      ? <span className="w-full h-full flex flex-col items-center justify-center gap-1 text-[11px] text-[#5e5c68]"><FileText className="w-5 h-5 text-[#8456e8]" />PDF {i + 1}</span>
                      /* eslint-disable-next-line @next/next/no-img-element */
                      : <img src={a.url} alt={`Arquivo ${i + 1}`} className="w-full h-full object-cover" />}
                  </a>
                ))}
              </div>
              <p className="text-[11px] text-[#898892] mt-1.5">Toque para abrir em tamanho real e baixar.</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl ds-borda p-5">
          <p className="text-[15px] font-bold text-[#191625] flex items-center gap-2"><Palette className="w-4 h-4 text-[#8456e8]" />Arte</p>
          {p.ajustes.length > 0 && (
            <div className="mt-3 rounded-xl bg-[#c57800]/[0.08] px-3.5 py-2.5 space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#c57800]">Ajustes que o cliente pediu</p>
              {p.ajustes.map(a => <p key={a.em} className="text-[12.5px] text-[#191625] whitespace-pre-wrap">{a.texto}</p>)}
            </div>
          )}
          {p.arte ? <ArtePreview arte={p.arte} /> : <p className="text-[12.5px] text-[#5e5c68] mt-1">Suba a arte aqui. Depois é só tocar em mandar: ela vai para o cliente aprovar.</p>}
          {!p.arteAprovadaEm && (<>
            <label className={`mt-3 flex items-center justify-center gap-2 h-11 rounded-xl border border-dashed border-[rgba(60,60,67,0.25)] text-[13px] font-semibold text-[#5e5c68] cursor-pointer hover:bg-[rgba(116,116,128,0.04)] ${ocupado ? "opacity-60 pointer-events-none" : ""}`}>
              {ocupado === "arte" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{p.arte ? "Subir nova versão (JPG, PNG ou PDF)" : "Subir a arte (JPG, PNG ou PDF)"}
              <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={e => subirArte(e.target.files?.[0])} />
            </label>
            {p.arte && !p.arteEnviadaEm && (
              <button onClick={() => acao("mandar", { acao: "mandarArte" })} disabled={!!ocupado}
                className="mt-2 w-full h-11 rounded-xl bg-[#8456e8] text-white text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {ocupado === "mandar" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Mandar para o cliente aprovar
              </button>
            )}
          </>)}
        </div>
        {aviso && <p className="text-[12.5px] text-[#5e5c68] bg-white rounded-xl ds-borda px-4 py-3">{aviso}</p>}
      </Tela>
    )
  }

  const pago = p.status !== "aguardando_sinal"
  const etapa = ETAPAS.findIndex(([s]) => s === p.status)
  const oque = p.ml ? `para frasco de ${p.ml} ml` : p.produto ? `para ${p.produto}` : ""

  return (
    <Tela>
      <div className="text-center">
        <p className="text-[12px] font-semibold text-[#898892]">{p.id}{p.nome ? ` · ${p.nome}` : ""}</p>
        <h1 className="text-[22px] font-bold text-[#191625] mt-1 leading-tight">Suas caixinhas personalizadas</h1>
        <p className="text-[13px] text-[#5e5c68] mt-1">Impressão digital {oque}, arte inclusa</p>
      </div>

      <div className="bg-white rounded-2xl ds-borda py-6 flex flex-col items-center">
        <Caixa3D largura={p.medidas.l} altura={p.medidas.a} profundidade={p.medidas.p} material="Triplex 300g" laminacao="fosca" tamanho={150} />
        <p className="text-[13px] font-semibold text-[#191625] mt-4">{cm(p.medidas.a)} × {cm(p.medidas.l)} × {cm(p.medidas.p)} cm <span className="font-normal text-[#898892]">(A × L × P)</span></p>
        <ul className="mt-3 space-y-1 text-[12.5px] text-[#5e5c68] text-center px-6">
          <li>Triplex 300g com laminação fosca ou brilhante</li>
          <li>{p.designer ? "Arte criada a partir do briefing abaixo; o cliente aprova antes de imprimir" : "Arte criada pela nossa equipe, você aprova antes de imprimir"}</li>
          {p.padrao && <li className="text-[#c57800]">Medida padrão para o seu frasco. Se for diferente, mande as medidas no WhatsApp que a gente ajusta.</li>}
        </ul>
      </div>

      {pago ? (
        <div className="bg-white rounded-2xl ds-borda p-5">
          <p className="text-[15px] font-bold text-[#191625]">{p.quantidade.toLocaleString("pt-BR")} caixinhas{p.designer ? "" : ` · ${brl(p.total)}`}</p>
          {!p.designer && <p className="text-[12.5px] text-[#009351] font-semibold mt-1 flex items-center gap-1.5"><Check className="w-4 h-4" />Sinal de {brl(p.sinal)} recebido</p>}
          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {ETAPAS.map(([s, nome], i) => (
              <div key={s} className="text-center">
                <div className={`h-1.5 rounded-full ${i <= etapa ? "bg-[#009351]" : "bg-[rgba(116,116,128,0.15)]"}`} />
                <p className={`text-[11px] mt-1.5 ${i <= etapa ? "font-semibold text-[#191625]" : "text-[#898892]"}`}>{nome}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (<>
        <div className="bg-white rounded-2xl ds-borda overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-[#898892]">Quantidade</p>
          {p.opcoes.map(o => {
            const sel = o.quantidade === p.quantidade
            const rec = o.quantidade === 100
            return (
              <button key={o.quantidade} onClick={() => escolher(o.quantidade)} disabled={mudando != null}
                className={`w-full flex items-center gap-3 px-5 py-3.5 border-t border-[rgba(60,60,67,0.07)] text-left transition-colors ${sel ? "bg-[#8456e8]/[0.06]" : "hover:bg-[rgba(116,116,128,0.04)]"}`}>
                <span className={`w-5 h-5 rounded-full border-2 grid place-items-center shrink-0 ${sel ? "border-[#8456e8] bg-[#8456e8]" : "border-[rgba(60,60,67,0.25)]"}`}>
                  {mudando === o.quantidade ? <Loader2 className="w-3 h-3 animate-spin text-white" /> : sel && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-bold text-[#191625]">{o.quantidade.toLocaleString("pt-BR")} caixinhas</span>
                  {rec && <span className="block text-[10.5px] font-bold uppercase tracking-wider text-[#8456e8]">Mais escolhida</span>}
                </span>
                <span className="text-right">
                  <span className="block text-[15px] font-bold text-[#191625] ds-num">{brl(o.total)}</span>
                  <span className="block text-[11.5px] text-[#898892] ds-num">{brl(o.unit)} a unidade</span>
                </span>
              </button>
            )
          })}
        </div>

        <Pagamento p={p} titulo="Sinal de 50%" valor={p.sinal} txid={p.id} descricao={`Sinal ${p.id}`} sub={`O restante (${brl(p.total - p.sinal)}) no final, antes do envio`}
          post={post} setP={setP} onConferir={conferir} conferindo={conferindo} />
      </>)}


      {p.designer && (
        <div className="bg-white rounded-2xl ds-borda p-5">
          <p className="text-[15px] font-bold text-[#191625] flex items-center gap-2"><Palette className="w-4 h-4 text-[#8456e8]" />Arte</p>
          <p className="text-[12.5px] text-[#5e5c68] mt-1">Folha {p.folha} · {cm(p.medidas.a)} × {cm(p.medidas.l)} × {cm(p.medidas.p)} cm · laminação {p.briefing.laminacao === "brilho" ? "brilho" : "fosca"}. O briefing do cliente está logo abaixo.</p>
          {p.ajustes.length > 0 && (
            <div className="mt-3 rounded-xl bg-[#c57800]/[0.08] px-3.5 py-2.5 space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#c57800]">Ajustes pedidos</p>
              {p.ajustes.map(a => <p key={a.em} className="text-[12.5px] text-[#191625] whitespace-pre-wrap">{a.texto}</p>)}
            </div>
          )}
          {p.arte && <ArtePreview arte={p.arte} />}
          {p.arte && <p className="text-[12px] mt-2 text-center text-[#5e5c68]">{p.arteAprovadaEm ? "Aprovada pelo cliente" : p.arteEnviadaEm ? "Enviada, esperando o cliente aprovar" : "Ainda não foi para o cliente"}</p>}
          {!p.arteAprovadaEm && (<>
            <label className={`mt-3 flex items-center justify-center gap-2 h-11 rounded-xl border border-dashed border-[rgba(60,60,67,0.25)] text-[13px] font-semibold text-[#5e5c68] cursor-pointer hover:bg-[rgba(116,116,128,0.04)] ${ocupado ? "opacity-60 pointer-events-none" : ""}`}>
              {ocupado === "arte" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{p.arte ? "Subir nova versão (JPG, PNG ou PDF)" : "Subir a arte (JPG, PNG ou PDF)"}
              <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={e => subirArte(e.target.files?.[0])} />
            </label>
            {p.arte && !p.arteEnviadaEm && (
              <button onClick={() => acao("mandar", { acao: "mandarArte" })} disabled={!!ocupado}
                className="mt-2 w-full h-11 rounded-xl bg-[#8456e8] text-white text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {ocupado === "mandar" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Mandar para o cliente aprovar
              </button>
            )}
          </>)}
        </div>
      )}

      {!p.designer && p.arte && (p.aprovar || p.arteAprovadaEm) && (
        <div className="bg-white rounded-2xl ds-borda p-5">
          <p className="text-[15px] font-bold text-[#191625] flex items-center gap-2"><Palette className="w-4 h-4 text-[#8456e8]" />{p.arteAprovadaEm ? "Sua arte (aprovada)" : "Sua arte ficou pronta"}</p>
          <ArtePreview arte={p.arte} />
          {p.aprovar && (ajuste == null ? (
            <div className="mt-3 space-y-2">
              <button onClick={() => acao("aprovar", { acao: "aprovar" })} disabled={!!ocupado}
                className="w-full h-12 rounded-xl bg-[#009351] text-white font-semibold text-[15px] flex items-center justify-center gap-2 disabled:opacity-60">
                {ocupado === "aprovar" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}Aprovar a arte
              </button>
              <button onClick={() => setAjuste("")} className="w-full h-11 rounded-xl text-[14px] font-semibold text-[#5e5c68] bg-[rgba(116,116,128,0.08)]">Quero mudar alguma coisa</button>
              <p className="text-[11.5px] text-[#898892] text-center">Confira nomes, textos e cores: depois de aprovada, vai direto para a impressão.</p>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <textarea value={ajuste} onChange={e => setAjuste(e.target.value)} rows={3} maxLength={1000} placeholder="O que você quer mudar? Ex.: aumentar o nome, trocar o dourado por prata…"
                className="w-full rounded-xl px-3.5 py-2.5 text-[14px] text-[#191625] bg-[rgba(116,116,128,0.06)] outline-none focus:ring-2 focus:ring-[#8456e8]/20 resize-y" />
              <button onClick={() => acao("ajuste", { acao: "ajuste", texto: ajuste }, () => { setAjuste(null); setAviso("Recebido. A gente ajusta e te manda a nova versão no WhatsApp.") })} disabled={!!ocupado || !ajuste.trim()}
                className="w-full h-11 rounded-xl bg-[#191625] text-white text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {ocupado === "ajuste" && <Loader2 className="w-4 h-4 animate-spin" />}Mandar o pedido de ajuste
              </button>
              <button onClick={() => setAjuste(null)} className="w-full text-[12.5px] text-[#898892]">Voltar</button>
            </div>
          ))}
        </div>
      )}

      {!p.designer && p.restante != null && (
        p.restantePagoEm
          ? <div className="bg-white rounded-2xl ds-borda p-5"><p className="text-[13px] text-[#009351] font-semibold flex items-center gap-1.5"><Check className="w-4 h-4" />Restante de {brl(p.restante)} recebido. Pedido quitado.</p></div>
          : <Pagamento p={p} titulo="Restante" valor={p.restante} txid={`${p.id}F`} descricao={`Restante ${p.id}`}
              sub={p.frete ? `${brl(p.restante - p.frete)} + frete ${brl(p.frete)}` : "Pague quando quiser: o envio sai depois que o restante cair"}
              post={post} setP={setP} onConferir={() => acao("conferir", { acao: "conferir" })} conferindo={ocupado === "conferir"} />
      )}

      {!p.designer && p.arteAprovadaEm && !p.restantePagoEm && (
        <div className="bg-white rounded-2xl ds-borda p-5">
          <p className="text-[15px] font-bold text-[#191625] flex items-center gap-2"><Truck className="w-4 h-4 text-[#8456e8]" />Entrega</p>
          {p.entrega ? (
            <p className="text-[13px] text-[#5e5c68] mt-1">{p.entrega.endereco} · CEP {p.entrega.cep.replace(/(\d{5})(\d{3})/, "$1-$2")}</p>
          ) : (<>
            <p className="text-[12.5px] text-[#5e5c68] mt-1">Para onde a gente manda as suas caixinhas?</p>
            <input value={ent.cep} onChange={e => setEnt({ ...ent, cep: e.target.value })} inputMode="numeric" maxLength={9} placeholder="CEP"
              className="mt-3 w-full h-11 rounded-xl px-3.5 text-[14px] text-[#191625] bg-[rgba(116,116,128,0.06)] outline-none focus:ring-2 focus:ring-[#8456e8]/20" />
            <textarea value={ent.endereco} onChange={e => setEnt({ ...ent, endereco: e.target.value })} rows={2} maxLength={300} placeholder="Rua, número, complemento, bairro e cidade"
              className="mt-2 w-full rounded-xl px-3.5 py-2.5 text-[14px] text-[#191625] bg-[rgba(116,116,128,0.06)] outline-none focus:ring-2 focus:ring-[#8456e8]/20 resize-y" />
            <button onClick={() => acao("entrega", { acao: "entrega", ...ent })} disabled={!!ocupado}
              className="mt-2 w-full h-11 rounded-xl bg-[#191625] text-white text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {ocupado === "entrega" && <Loader2 className="w-4 h-4 animate-spin" />}Salvar endereço
            </button>
          </>)}
        </div>
      )}
      {aviso && <p className="text-[12.5px] text-[#5e5c68] bg-white rounded-xl ds-borda px-4 py-3">{aviso}</p>}

      {!p.arteAprovadaEm && <div className="bg-white rounded-2xl ds-borda p-5">
        <p className="text-[15px] font-bold text-[#191625] flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#8456e8]" />Como você quer a sua arte</p>
        <p className="text-[12.5px] text-[#5e5c68] mt-1">A arte começa assim que o sinal cair. Quanto mais você contar, mais rápido fica do seu jeito.</p>
        <label className="block mt-4 text-[12px] font-semibold text-[#191625]">Nome da marca</label>
        <input value={br.marca} onChange={e => setBr({ ...br, marca: e.target.value })} maxLength={80} placeholder="Ex.: Essência Rara"
          className="mt-1 w-full h-11 rounded-xl px-3.5 text-[14px] text-[#191625] bg-[rgba(116,116,128,0.06)] outline-none focus:ring-2 focus:ring-[#8456e8]/20" />
        <label className="block mt-3 text-[12px] font-semibold text-[#191625]">Cores</label>
        <input value={br.cores} onChange={e => setBr({ ...br, cores: e.target.value })} maxLength={200} placeholder="Ex.: preto e dourado"
          className="mt-1 w-full h-11 rounded-xl px-3.5 text-[14px] text-[#191625] bg-[rgba(116,116,128,0.06)] outline-none focus:ring-2 focus:ring-[#8456e8]/20" />
        <label className="block mt-3 text-[12px] font-semibold text-[#191625]">O que vai na caixa e referências</label>
        <textarea value={br.referencias} onChange={e => setBr({ ...br, referencias: e.target.value })} maxLength={1000} rows={3} placeholder="Nome do perfume, frases, estilo que você gosta, link do seu Instagram…"
          className="mt-1 w-full rounded-xl px-3.5 py-2.5 text-[14px] text-[#191625] bg-[rgba(116,116,128,0.06)] outline-none focus:ring-2 focus:ring-[#8456e8]/20 resize-y" />
        <label className="block mt-3 text-[12px] font-semibold text-[#191625]">Acabamento</label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(["fosca", "brilho"] as const).map(l => (
            <button key={l} onClick={() => setBr({ ...br, laminacao: l })}
              className={`h-10 rounded-xl text-[13px] font-semibold ${br.laminacao === l ? "bg-[#8456e8] text-white" : "bg-[rgba(116,116,128,0.06)] text-[#5e5c68]"}`}>
              {l === "fosca" ? "Laminação fosca" : "Laminação brilho"}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-1.5">
          {p.briefing.arquivos.map(a => (
            <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[12.5px] text-[#191625] bg-[rgba(116,116,128,0.06)] rounded-lg px-3 py-2">
              <FileText className="w-4 h-4 text-[#8456e8] shrink-0" /><span className="truncate">{a.nome}</span>
            </a>
          ))}
          <label className={`flex items-center justify-center gap-2 h-11 rounded-xl border border-dashed border-[rgba(60,60,67,0.25)] text-[13px] font-semibold text-[#5e5c68] cursor-pointer hover:bg-[rgba(116,116,128,0.04)] ${enviando ? "opacity-60 pointer-events-none" : ""}`}>
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{enviando ? "Enviando…" : "Mandar logo ou referência (imagem ou PDF)"}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => anexar(e.target.files?.[0])} />
          </label>
        </div>
        <button onClick={salvarBriefing} className="mt-4 w-full h-11 rounded-xl bg-[#191625] text-white text-[14px] font-semibold flex items-center justify-center gap-2">
          {salvo ? <><Check className="w-4 h-4" />Salvo</> : "Salvar"}
        </button>
      </div>}
    </Tela>
  )
}

function Tela({ children, rodape = "Enyla Embalagens · dúvidas, é só responder no WhatsApp" }: { children: React.ReactNode; rodape?: string }) {
  return (
    <div className="min-h-[100dvh] bg-[#f5f5f7]">
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        <div className="flex justify-center"><Image src="/brand/enyla-wordmark-dark.png" alt="Enyla" width={1335} height={328} className="h-5 w-auto" priority /></div>
        {children}
        <p className="text-center text-[11px] text-[#898892] pt-2">{rodape}</p>
      </div>
    </div>
  )
}

function ArtePreview({ arte }: { arte: { url: string; nome: string } }) {
  return ehPdf(arte.url) ? (
    <a href={arte.url} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-[#191625] bg-[rgba(116,116,128,0.06)] rounded-xl px-3.5 py-3">
      <FileText className="w-5 h-5 text-[#8456e8] shrink-0" /><span className="truncate">Abrir a arte ({arte.nome})</span>
    </a>
  ) : (
    <a href={arte.url} target="_blank" rel="noreferrer" className="block mt-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={arte.url} alt="Arte da caixa" className="w-full rounded-xl ds-borda bg-[#f5f5f7]" />
    </a>
  )
}

// Pagamento: com o Asaas ligado, pede o CPF/CNPJ e mostra o Pix da cobrança (confirma na hora) e o cartão;
// sem Asaas ou se ele falhar, o Pix de sempre (conferido pelo extrato)
function Pagamento({ p, titulo, valor, txid, descricao, sub, post, setP, onConferir, conferindo }: {
  p: Pedido; titulo: string; valor: number; txid: string; descricao: string; sub: string
  post: (c: Record<string, unknown>) => Promise<Pedido>; setP: (p: Pedido) => void; onConferir: () => void; conferindo: boolean
}) {
  const [doc, setDoc] = useState("")
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [semAsaas, setSemAsaas] = useState(false)
  const gerar = async (d?: string) => {
    setGerando(true); setErro(null)
    try { setP(await post({ acao: "cobrar", documento: d })) }
    catch (e) { const m = (e as Error).message; setErro(m); if (/indispon|Asaas/i.test(m)) setSemAsaas(true) }
    setGerando(false)
  }
  const precisa = p.asaas && !semAsaas && !p.cobranca

  if (p.asaas && !semAsaas && p.cobranca)
    return <PixBloco titulo={`${titulo} pelo Pix`} valor={valor} txid={txid} descricao={descricao} sub={sub} pronto={{ payload: p.cobranca.payload, imagem: p.cobranca.imagem }} cartao={p.cobranca.fatura}
      aviso="Assim que o Pix cair, a confirmação chega no seu WhatsApp." onConferir={onConferir} conferindo={conferindo} />
  if (precisa)
    return (
      <div className="bg-white rounded-2xl ds-borda p-5 flex flex-col items-center text-center">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#898892]">{titulo}</p>
        <p className="text-[28px] font-bold text-[#191625] ds-num mt-1">{brl(valor)}</p>
        <p className="text-[12px] text-[#898892]">{sub}</p>
        {p.documento && !doc ? <p className="self-stretch text-left mt-4 text-[12.5px] text-[#5e5c68]">No nome do CPF/CNPJ {p.documento}. <button className="text-[#8456e8] font-semibold" onClick={() => setDoc(" ")}>Trocar</button></p> : <>
        <label className="self-stretch text-left mt-4 text-[12px] font-semibold text-[#191625]">CPF ou CNPJ de quem vai pagar</label>
        <input value={doc.trim() ? doc : ""} autoFocus={!!p.documento} onChange={e => setDoc(e.target.value)} inputMode="numeric" maxLength={18} placeholder="000.000.000-00"
          className="self-stretch mt-1 h-12 rounded-xl px-3.5 text-[15px] text-[#191625] bg-[rgba(116,116,128,0.06)] outline-none focus:ring-2 focus:ring-[#8456e8]/20" /></>}
        <button onClick={() => void gerar(doc.trim() ? doc : undefined)} disabled={gerando || (!(p.documento && !doc.trim()) && doc.replace(/\D/g, "").length < 11)}
          className="mt-3 w-full h-12 rounded-xl bg-[#8456e8] hover:bg-[#7445d4] text-white font-semibold text-[15px] flex items-center justify-center gap-2 disabled:opacity-60">
          {gerando ? <Loader2 className="w-5 h-5 animate-spin" /> : null}Gerar Pix (ou pagar no cartão)
        </button>
        <p className="text-[11.5px] text-[#898892] mt-2">É para a cobrança sair no seu nome. A confirmação do pagamento é na hora.</p>
        {erro && <p className="text-[12px] text-[#d33a3c] mt-2">{erro}</p>}
      </div>
    )
  return <PixBloco titulo={`${titulo} pelo Pix`} valor={valor} txid={txid} descricao={descricao} sub={sub} onConferir={onConferir} conferindo={conferindo} />
}

function PixBloco({ titulo, valor, txid, descricao, sub, onConferir, conferindo, pronto, cartao, aviso }: { titulo: string; valor: number; txid: string; descricao: string; sub: string; onConferir: () => void; conferindo: boolean; pronto?: { payload: string; imagem: string }; cartao?: string; aviso?: string }) {
  const payload = useMemo(() => pronto?.payload ?? gerarPixPayload({ chave: "financeiro@enyla.com.br", nome: "Enyla", cidade: "Natal", valor, txid: txid.replace(/\W/g, ""), descricao }), [valor, txid, descricao, pronto?.payload])
  const [qrGerado, setQr] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  useEffect(() => { if (!pronto?.imagem) QRCode.toDataURL(payload, { width: 220, margin: 1, color: { dark: "#191625", light: "#ffffff" } }).then(setQr).catch(() => setQr(null)) }, [payload, pronto?.imagem])
  const qr = pronto?.imagem ? `data:image/png;base64,${pronto.imagem}` : qrGerado
  return (
    <div className="bg-white rounded-2xl ds-borda p-5 flex flex-col items-center text-center">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#898892]">{titulo}</p>
      <p className="text-[28px] font-bold text-[#191625] ds-num mt-1">{brl(valor)}</p>
      <p className="text-[12px] text-[#898892]">{sub}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qr && <img src={qr} alt="QR Code do Pix" width={200} height={200} className="mt-4 rounded-xl" />}
      <button onClick={() => navigator.clipboard.writeText(payload).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000) })}
        className="mt-4 w-full h-12 rounded-xl bg-[#8456e8] hover:bg-[#7445d4] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors">
        {copiado ? <><Check className="w-5 h-5" />Código copiado</> : <><Copy className="w-5 h-5" />Copiar Pix copia e cola</>}
      </button>
      {cartao && <a href={cartao} target="_blank" rel="noreferrer" className="mt-2 w-full h-11 rounded-xl text-[14px] font-semibold text-[#191625] bg-[rgba(116,116,128,0.08)] flex items-center justify-center">Prefiro pagar no cartão</a>}
      <p className="text-[11.5px] text-[#898892] mt-2">{aviso ?? `Pague exatamente ${brl(valor)}: é por esse valor que o sistema reconhece o seu pedido.`}</p>
      <button onClick={onConferir} disabled={conferindo}
        className="mt-3 w-full h-11 rounded-xl text-[14px] font-semibold text-[#8456e8] bg-[#8456e8]/[0.08] hover:bg-[#8456e8]/[0.14] disabled:opacity-60 flex items-center justify-center gap-2 transition-colors">
        {conferindo ? <><Loader2 className="w-4 h-4 animate-spin" />Conferindo…</> : "Já paguei"}
      </button>
    </div>
  )
}
