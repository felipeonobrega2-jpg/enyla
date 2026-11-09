"use client"

// Caixaria · gaveta de um pedido pago: o que o cliente mandou (briefing), a arte de cada caixa, o envio e os avisos.
// A arte que sobe aqui aparece na hora para o cliente aprovar na página do pedido.

import { useEffect, useRef, useState } from "react"
import { Upload, FileText, MessageCircle, Truck, Undo2, Loader2 } from "lucide-react"
import { Botao, Selo, Segmentado, type Tom } from "@/app/components/ds"
import { estadoArte, ROTULO_ARTE, avisos, ehImagem, type Acompanhamento, type EstadoArte } from "../lib/acompanhamento"
import { linkWhats } from "../lib/recuperacao"

type PedidoArte = {
  id: string; numero: string
  cliente: { nome: string; telefone: string }
  itens: { nome: string; medida: string; prazo: string }[]
  acompanhamento?: Acompanhamento | null
}

export const TOM_ARTE: Record<EstadoArte, Tom> = {
  "esperando-briefing": "neutro", criando: "alerta", ajuste: "alerta", "para-aprovar": "info", aprovada: "sucesso",
}

// Resumo de um pedido pago para a lista
export function resumoArte(p: PedidoArte): { texto: string; tom: Tom; suaVez: boolean } {
  if (p.acompanhamento?.envio) return { texto: "Enviado", tom: "sucesso", suaVez: false }
  const es = p.itens.map((_, i) => estadoArte(p.acompanhamento, i))
  const ordem: EstadoArte[] = ["ajuste", "criando", "esperando-briefing", "para-aprovar", "aprovada"]
  const pior = ordem.find(e => es.includes(e)) ?? "esperando-briefing"
  if (pior === "aprovada") return { texto: "Em produção", tom: "sucesso", suaVez: false }
  return { texto: ROTULO_ARTE[pior], tom: TOM_ARTE[pior], suaVez: pior === "criando" || pior === "ajuste" }
}

const titulo = "text-[11px] uppercase tracking-wide font-bold text-[#8E8E93] mb-2"
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })

export default function ArtePedido({ p, onPedidos }: { p: PedidoArte; onPedidos: (lista: unknown[]) => void }) {
  const a = p.acompanhamento ?? null
  const [subindo, setSubindo] = useState<number | null>(null)
  const [erro, setErro] = useState("")
  const [transp, setTransp] = useState("")
  const [rastreio, setRastreio] = useState("")
  const lista = avisos(p, a)
  const [aviso, setAviso] = useState(lista.at(-1)?.id ?? "")
  const [texto, setTexto] = useState("")
  const arquivo = useRef<HTMLInputElement>(null)
  const alvo = useRef(0)

  // Mensagem sugerida = a etapa mais recente
  useEffect(() => { const l = avisos(p, p.acompanhamento); const ult = l.at(-1); setAviso(ult?.id ?? ""); setTexto(ult?.texto ?? "") }, [p])

  async function post(corpo: object) {
    const j = await fetch("/api/caixaria/pedidos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).then(r => r.json())
    if (j.erro) throw new Error(j.erro)
    return j
  }

  async function subirArte(f: File) {
    const item = alvo.current
    setSubindo(item); setErro("")
    try {
      const l = await post({ acao: "arte-link", pedido: p.id, nome: f.name })
      const fd = new FormData(); fd.append("cacheControl", "3600"); fd.append("", f)
      const r = await fetch(l.signedUrl, { method: "PUT", body: fd, headers: { "x-upsert": "false" } })
      if (!r.ok) throw new Error("Não consegui enviar o arquivo")
      const j = await post({ acao: "arte", pedido: p.id, item, url: l.url, nome: f.name })
      onPedidos(j.pedidos)
    } catch (e) { setErro((e as Error).message) } finally { setSubindo(null) }
  }

  async function envio(desfazer = false) {
    setErro("")
    try { onPedidos((await post(desfazer ? { acao: "envio-desfazer", pedido: p.id } : { acao: "envio", pedido: p.id, transportadora: transp, rastreio })).pedidos) }
    catch (e) { setErro((e as Error).message) }
  }

  const todasAprovadas = p.itens.every((_, i) => estadoArte(a, i) === "aprovada")

  return (
    <div className="space-y-5">
      {erro && <p className="text-[12.5px] text-[#d33a3c]">{erro}</p>}

      <div>
        <p className={titulo}>O que o cliente mandou</p>
        <div className="ds-borda rounded-lg p-3 space-y-1.5 text-[12.5px]">
          {!a?.briefing ? <p className="text-[#8E8E93]">Ainda nada. O cliente manda o logo pela página do pedido, ou peça pelo WhatsApp (aviso abaixo).</p> : <>
            <p><b className="font-semibold">{a.briefing.marca || "Sem nome de marca"}</b>{a.briefing.cores ? ` · ${a.briefing.cores}` : ""}</p>
            {a.briefing.texto && <p className="whitespace-pre-wrap text-[#3a3a40]">{a.briefing.texto}</p>}
            {a.briefing.arquivos.length > 0 && <div className="flex flex-wrap gap-2 pt-1">
              {a.briefing.arquivos.map(x => (
                <a key={x.url} href={x.url} target="_blank" rel="noopener" className="flex items-center gap-1.5 ds-borda rounded-md px-2 py-1 hover:bg-[rgba(116,116,128,0.06)]">
                  {ehImagem(x.url) ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={x.url} alt="" className="w-6 h-6 object-contain rounded" /> : <FileText className="w-3.5 h-3.5" />}
                  <span className="max-w-[160px] truncate">{x.nome}</span>
                </a>
              ))}
            </div>}
            <p className="text-[11px] text-[#8E8E93]">Recebido em {quando(a.briefing.em)}</p>
          </>}
        </div>
      </div>

      <div>
        <p className={titulo}>Arte</p>
        <input ref={arquivo} type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) subirArte(f); e.target.value = "" }} />
        <div className="space-y-2">
          {p.itens.map((it, i) => {
            const x = a?.artes?.[i], est = estadoArte(a, i), atual = x?.versoes.at(-1)
            return (
              <div key={i} className="ds-borda rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12.5px] font-medium">{it.nome} <span className="text-[#8E8E93] font-normal">({it.medida})</span></p>
                  <Selo tom={TOM_ARTE[est]}>{ROTULO_ARTE[est]}</Selo>
                </div>
                {atual && (
                  <a href={atual.url} target="_blank" rel="noopener" className="mt-2 flex items-center gap-2 text-[12px] text-[#5b37b8]">
                    {ehImagem(atual.url) ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={atual.url} alt="" className="w-14 h-14 object-cover rounded-md ds-borda" /> : <FileText className="w-4 h-4" />}
                    <span>Versão {x!.versoes.length} · {quando(atual.em)}{x?.aprovadaEm ? ` · aprovada ${quando(x.aprovadaEm)}` : ""}</span>
                  </a>
                )}
                {x?.ajustes.length ? (
                  <div className="mt-2 space-y-1">
                    {x.ajustes.map(j => <p key={j.em} className="text-[12px] bg-[#fff6e5] text-[#7a4b00] rounded-md px-2 py-1.5"><b className="font-semibold">Ajuste {quando(j.em)}:</b> {j.texto}</p>)}
                  </div>
                ) : null}
                {est !== "aprovada" && (
                  <div className="mt-2">
                    <Botao variante={est === "criando" || est === "ajuste" ? "primario" : "secundario"} disabled={subindo !== null}
                      icone={subindo === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      onClick={() => { alvo.current = i; arquivo.current?.click() }}>
                      {subindo === i ? "Enviando" : atual ? "Subir nova versão" : "Subir a arte"}
                    </Botao>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-[11.5px] text-[#8E8E93] mt-1.5">A arte aparece na hora na página do pedido para o cliente aprovar. A aprovação marca a chapa sozinha.</p>
      </div>

      <div>
        <p className={titulo}>Envio</p>
        <div className="ds-borda rounded-lg p-3 text-[12.5px]">
          {a?.envio ? (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5"><Truck className="w-4 h-4 text-[#009351]" />Enviado {quando(a.envio.em)} · {a.envio.transportadora}{a.envio.rastreio ? ` · ${a.envio.rastreio}` : ""}</span>
              <button type="button" onClick={() => envio(true)} className="text-[#8E8E93] hover:text-[#191625] inline-flex items-center gap-1"><Undo2 className="w-3 h-3" />desfazer</button>
            </div>
          ) : !todasAprovadas ? <p className="text-[#8E8E93]">Depois da arte aprovada e das caixas prontas.</p> : (
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input value={transp} onChange={e => setTransp(e.target.value)} placeholder="Transportadora" className="h-9 rounded-lg ds-borda px-2.5 text-[12.5px] min-w-0" />
              <input value={rastreio} onChange={e => setRastreio(e.target.value)} placeholder="Rastreio" className="h-9 rounded-lg ds-borda px-2.5 text-[12.5px] min-w-0" />
              <Botao disabled={!transp.trim()} onClick={() => envio()}>Enviado</Botao>
            </div>
          )}
        </div>
      </div>

      {lista.length > 0 && (
        <div>
          <p className={titulo}>Avisar o cliente</p>
          <div className="ds-borda rounded-lg p-3 space-y-2.5">
            {lista.length > 1 && <div className="overflow-x-auto"><Segmentado<string> valor={aviso} onChange={id => { setAviso(id); setTexto(lista.find(x => x.id === id)?.texto ?? "") }} opcoes={lista.map(x => ({ v: x.id, nome: x.nome }))} /></div>}
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={4} className="w-full rounded-lg ds-borda px-2.5 py-2 text-[12.5px] leading-relaxed" aria-label="Mensagem" />
            <a href={linkWhats(p.cliente.telefone ?? "", texto)} target="_blank" rel="noopener">
              <Botao variante="primario" icone={<MessageCircle className="w-3.5 h-3.5" />}>Mandar no WhatsApp</Botao>
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
