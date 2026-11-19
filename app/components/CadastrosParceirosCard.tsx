"use client"

// Fornecedores → Parceiros ENYLA: o link do formulário para mandar aos parceiros e os cadastros que chegaram.
// Aprovar cria o fornecedor de produção (prazo e contato do cadastro; preços você confere no Cadastro).

import React from "react"
import { Handshake, Copy, Check, ChevronDown, Paperclip, MessageCircle, Mail, X } from "lucide-react"
import { nomeServico, textoCobranca, textoPrazo, textoTecnico, textoEndereco, paraFornecedor, type CadastroParceiro } from "../lib/parceiros"
import type { FornecedorProducao } from "../lib/producao"

const LINK = "https://app.enyla.com.br/parceiros"
const doc = (c: CadastroParceiro) => c.tipoDocumento === "cnpj"
  ? c.documento.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
  : c.documento.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")

export function CadastrosParceirosCard({ onAprovar }: { onAprovar: (f: FornecedorProducao) => void }) {
  const [lista, setLista] = React.useState<CadastroParceiro[] | null>(null)
  const [aberto, setAberto] = React.useState<string | null>(null)
  const [copiado, setCopiado] = React.useState(false)
  const [verTodos, setVerTodos] = React.useState(false)
  React.useEffect(() => { fetch("/api/parceiros").then(r => r.ok ? r.json() : null).then(d => setLista(d?.cadastros ?? [])).catch(() => setLista([])) }, [])

  const status = (id: string, s: CadastroParceiro["status"], fornecedorId?: string) => {
    setLista(l => l?.map(x => x.id === id ? { ...x, status: s, ...(fornecedorId ? { fornecedorId } : {}) } : x) ?? null)
    fetch("/api/parceiros", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: s, fornecedorId }) }).catch(() => {})
  }
  const aprovar = (c: CadastroParceiro) => {
    const id = `f-${Date.now().toString(36)}`
    onAprovar(paraFornecedor(c, id))
    status(c.id, "aprovado", id)
  }
  const copiar = () => { navigator.clipboard?.writeText(LINK).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800) }).catch(() => {}) }

  const novos = (lista ?? []).filter(c => c.status === "novo")
  const mostrar = verTodos ? (lista ?? []) : novos

  return (
    <div className="bg-white rounded-2xl ds-borda p-5 mb-4 ds-entrada">
      <div className="flex items-start gap-3 flex-wrap">
        <span className="w-9 h-9 rounded-xl grid place-items-center bg-[#8456e8]/10 text-[#8456e8] shrink-0"><Handshake className="w-4.5 h-4.5" /></span>
        <div className="flex-1 min-w-[200px]">
          <p className="text-[13.5px] font-semibold text-[#191625]">Parceiros ENYLA{novos.length ? <span className="ml-2 text-[11px] font-bold rounded-full px-2 py-0.5 bg-[#8456e8] text-white">{novos.length} novo{novos.length > 1 ? "s" : ""}</span> : null}</p>
          <p className="text-[12px] text-[#898892] mt-0.5">Mande o link para gráficas e acabamentos se cadastrarem com serviços, prazos e preços.</p>
        </div>
        <button onClick={copiar} className="ds-toque h-9 px-3 rounded-lg text-[12.5px] font-semibold flex items-center gap-1.5 bg-[#8456e8]/10 text-[#8456e8]">
          {copiado ? <><Check className="w-4 h-4" />Copiado</> : <><Copy className="w-4 h-4" />Copiar link</>}
        </button>
      </div>

      {lista && lista.length > 0 && (
        <div className="mt-4 space-y-2">
          {mostrar.map(c => {
            const ab = aberto === c.id
            return (
              <div key={c.id} className="rounded-xl border border-[rgba(60,60,67,0.10)] overflow-hidden">
                <button onClick={() => setAberto(ab ? null : c.id)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[rgba(116,116,128,0.04)]">
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-semibold text-[#191625]">{c.nomeFantasia}</span>
                      <span className={`text-[10.5px] font-semibold rounded-full px-1.5 py-0.5 ${c.status === "novo" ? "bg-[#8456e8]/10 text-[#8456e8]" : c.status === "aprovado" ? "bg-[#009351]/10 text-[#009351]" : "bg-[rgba(116,116,128,0.1)] text-[#898892]"}`}>{c.status === "novo" ? "Novo" : c.status === "aprovado" ? "Aprovado" : "Recusado"}</span>
                    </span>
                    <span className="block text-[12px] text-[#898892] truncate">{c.cidade}/{c.uf} · {c.servicos.map(nomeServico).join(", ")}</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-[#898892] transition-transform ${ab ? "rotate-180" : ""}`} />
                </button>
                {ab && (
                  <div className="px-4 pb-4 ds-entrada">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[12.5px] text-[#5e5c68]">
                      <p><b className="text-[#191625] font-medium">{c.tipoDocumento.toUpperCase()}:</b> {doc(c)}{c.razaoSocial ? ` · ${c.razaoSocial}` : ""}</p>
                      <p><b className="text-[#191625] font-medium">Responsável:</b> {c.responsavel}</p>
                      <p className="sm:col-span-2"><b className="text-[#191625] font-medium">Base:</b> {textoEndereco(c)}{c.referencia ? ` · ${c.referencia}` : ""}{c.base ? <> · <a className="text-[#8456e8] font-medium" href={`https://www.google.com/maps?q=${c.base.lat},${c.base.lng}`} target="_blank" rel="noreferrer">ver no mapa</a></> : <span className="text-[#c26a0a]"> · não achei no mapa</span>}</p>
                      {c.contatoProducao && <p><b className="text-[#191625] font-medium">Recebe material:</b> {c.contatoProducao}</p>}
                      {c.maquinas && <p className="sm:col-span-2"><b className="text-[#191625] font-medium">Máquinas:</b> {c.maquinas}</p>}
                      {c.capacidade && <p><b className="text-[#191625] font-medium">Capacidade:</b> {c.capacidade}</p>}
                      {c.horario && <p><b className="text-[#191625] font-medium">Horário:</b> {c.horario}</p>}
                      {c.comoConheceu && <p><b className="text-[#191625] font-medium">Conheceu por:</b> {c.comoConheceu}</p>}
                    </div>
                    <div className="mt-3 rounded-lg bg-[rgba(116,116,128,0.05)] divide-y divide-[rgba(60,60,67,0.08)]">
                      {c.servicos.map(s => (
                        <div key={s.id} className="px-3 py-2 text-[12.5px]">
                          <p className="font-semibold text-[#191625]">{nomeServico(s)}</p>
                          <p className="text-[#5e5c68]">{textoCobranca(s)} · {textoPrazo(s)}{s.minimo ? ` · mínimo ${s.minimo}` : ""}</p>
                          {textoTecnico(s) && <p className="text-[#5e5c68] mt-0.5">{textoTecnico(s)}</p>}
                          {s.obs && <p className="text-[#898892] mt-0.5">{s.obs}</p>}
                        </div>
                      ))}
                    </div>
                    {c.arquivos.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{c.arquivos.map(a => (
                      <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="h-8 px-2.5 rounded-lg bg-[rgba(116,116,128,0.08)] text-[12px] text-[#191625] flex items-center gap-1.5 max-w-full"><Paperclip className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{a.nome}</span></a>
                    ))}</div>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a href={`https://wa.me/55${c.whatsapp.replace(/^55/, "")}`} target="_blank" rel="noreferrer" className="ds-toque h-9 px-3 rounded-lg text-[12.5px] font-semibold flex items-center gap-1.5 bg-[#25d366]/12 text-[#128c4a]"><MessageCircle className="w-4 h-4" />WhatsApp</a>
                      <a href={`mailto:${c.email}`} className="ds-toque h-9 px-3 rounded-lg text-[12.5px] font-semibold flex items-center gap-1.5 bg-[rgba(116,116,128,0.08)] text-[#191625]"><Mail className="w-4 h-4" />{c.email}</a>
                      {c.status === "novo" && <>
                        <button onClick={() => aprovar(c)} className="ds-toque h-9 px-3.5 rounded-lg text-[12.5px] font-semibold flex items-center gap-1.5 bg-[#8456e8] text-white"><Check className="w-4 h-4" />Aprovar e cadastrar</button>
                        <button onClick={() => status(c.id, "recusado")} className="ds-toque h-9 px-3 rounded-lg text-[12.5px] font-semibold flex items-center gap-1.5 text-[#898892]"><X className="w-4 h-4" />Recusar</button>
                      </>}
                    </div>
                    {c.status === "aprovado" && <p className="mt-2 text-[11.5px] text-[#898892]">Já é fornecedor: confira os preços na aba Cadastro.</p>}
                    {(c.emails ?? []).length > 0 && <p className="mt-1.5 text-[11.5px] text-[#898892]">{(c.emails ?? []).map(e => `E-mail ${e.tipo === "recebido" ? "de cadastro recebido" : "de boas-vindas"}: ${e.ok ? "enviado" : `não saiu (${e.erro})`}`).join(" · ")}</p>}
                  </div>
                )}
              </div>
            )
          })}
          {lista.length > novos.length && <button onClick={() => setVerTodos(v => !v)} className="text-[12px] font-semibold text-[#8456e8]">{verTodos ? "Só os novos" : `Ver todos (${lista.length})`}</button>}
          {!mostrar.length && !verTodos && <p className="text-[12px] text-[#898892]">Nenhum cadastro novo.</p>}
        </div>
      )}
    </div>
  )
}
