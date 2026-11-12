"use client"

// Registrar o que você ganhou fora da caixa, em duas perguntas:
//   1. Como o dinheiro passou? Ganho em cima (o cliente te pagou e você pagou o parceiro) ou comissão
//      (o cliente pagou direto o parceiro e ele te repassa uma parte).
//   2. Quanto? O ganho sai calculado e é o que entra no Financeiro como receita de parceria quando recebido.

import { useState } from "react"
import { Repeat, Percent, X, Trash2 } from "lucide-react"
import type { NegocioParceiro, Parceiro, Lote, TipoNegocio, StatusNegocio } from "../../types"
import { brl } from "../../utils"
import { Botao } from "../ds"

export const PRODUTOS = ["Frasco", "Essência", "Válvula", "Envase", "Adesivo / rótulo", "Sacola", "Outro"]
const CATEGORIA_DO_PRODUTO: Record<string, string> = { Frasco: "Vidros", Essência: "Essências", Válvula: "Embalagens", Envase: "Outro", "Adesivo / rótulo": "Impressão", Sacola: "Embalagens", Outro: "Outro" }

const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
const num = (s: string) => { const n = parseFloat(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0 }
const campo = "w-full h-9 rounded-lg px-3 text-[12.5px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] ds-borda"

const Rotulo = ({ children }: { children: React.ReactNode }) => <p className="text-[11px] font-semibold text-[#5e5c68] mb-1">{children}</p>

export function ModalVenda({ inicial, tipoInicial, parceiros, clientes, lotes, onSalvar, onNovoParceiro, onExcluir, onFechar }: {
  inicial?: NegocioParceiro
  tipoInicial?: TipoNegocio
  parceiros: Parceiro[]
  clientes: string[]
  lotes?: Lote[]
  onSalvar: (n: NegocioParceiro) => void
  onNovoParceiro: (p: Parceiro) => void
  onExcluir?: (id: string) => void
  onFechar: () => void
}) {
  const [tipo, setTipo] = useState<TipoNegocio | null>(inicial?.tipo ?? tipoInicial ?? null)
  const [cliente, setCliente] = useState(inicial?.nomeCliente ?? "")
  const [produto, setProduto] = useState(inicial?.produto ?? "")
  const [detalhe, setDetalhe] = useState(inicial ? (inicial.descricao === inicial.produto ? "" : inicial.descricao) : "")
  const [parceiroNome, setParceiroNome] = useState(inicial?.parceiroNome ?? "")
  const [quantidade, setQuantidade] = useState(inicial?.quantidade ? String(inicial.quantidade) : "")
  const [venda, setVenda] = useState(inicial?.valorVenda ? String(inicial.valorVenda).replace(".", ",") : "")
  const [custo, setCusto] = useState(inicial?.valorCusto ? String(inicial.valorCusto).replace(".", ",") : "")
  const parceiroAtual = parceiros.find(p => p.nome.toLowerCase() === parceiroNome.trim().toLowerCase())
  const [modoComissao, setModoComissao] = useState<"perc" | "valor">("perc")
  const [perc, setPerc] = useState(inicial?.tipo === "comissao" && inicial.comissaoPerc ? String(inicial.comissaoPerc).replace(".", ",") : "")
  const [valorFixo, setValorFixo] = useState(inicial?.tipo === "comissao" ? String(inicial.comissaoValor).replace(".", ",") : "")
  const [data, setData] = useState(inicial?.dataOrcamento ?? hoje())
  const [recebido, setRecebido] = useState(inicial ? inicial.status === "pago" : false)
  const [loteId, setLoteId] = useState(inicial?.loteId ?? "")
  const [obs, setObs] = useState(inicial?.obs ?? "")

  const v = num(venda), c = num(custo), q = num(quantidade)
  const ganho = tipo === "ganho" ? v - c : modoComissao === "perc" ? v * num(perc) / 100 : num(valorFixo)
  const percFinal = tipo === "ganho" ? (c > 0 ? (v - c) / c * 100 : 0) : modoComissao === "perc" ? num(perc) : (v > 0 ? num(valorFixo) / v * 100 : 0)
  const pronto = !!tipo && !!produto && !!parceiroNome.trim() && v > 0 && (tipo === "comissao" || c > 0)

  // Ao escolher o parceiro, sugere a comissão padrão dele
  function escolherParceiro(nome: string) {
    setParceiroNome(nome)
    const p = parceiros.find(x => x.nome.toLowerCase() === nome.trim().toLowerCase())
    if (p && tipo === "comissao" && !perc && p.comissaoDefault) setPerc(String(p.comissaoDefault).replace(".", ","))
  }

  function salvar() {
    if (!pronto || !tipo) return
    let parceiro = parceiroAtual
    if (!parceiro) {
      parceiro = { id: Date.now().toString(36), nome: parceiroNome.trim(), categoria: CATEGORIA_DO_PRODUTO[produto] ?? "Outro", comissaoDefault: tipo === "comissao" ? num(perc) : 0, criadoEm: new Date().toLocaleString("pt-BR") }
      onNovoParceiro(parceiro)
    }
    const lote = lotes?.find(l => l.id === loteId)
    onSalvar({
      id: inicial?.id ?? Date.now().toString(),
      parceiroId: parceiro.id,
      parceiroNome: parceiro.nome,
      descricao: detalhe.trim() || produto,
      tipo,
      valorVenda: v,
      valorCusto: tipo === "ganho" ? c : undefined,
      comissaoPerc: Math.round(percFinal * 10) / 10,
      comissaoValor: Math.round(ganho * 100) / 100,
      dataOrcamento: data,
      status: inicial?.status === "cancelado" ? "cancelado" : recebido ? "pago" : "pendente" as StatusNegocio,
      obs: obs.trim() || undefined,
      criadoEm: inicial?.criadoEm ?? new Date().toLocaleString("pt-BR"),
      loteId: lote?.id, loteNumero: lote?.numero, statusLote: inicial?.statusLote,
      nomeCliente: cliente.trim() || lote?.nomeCliente || undefined,
      produto,
      quantidade: q || undefined,
    })
    onFechar()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(25,22,37,0.38)] backdrop-blur-[6px] apple-backdrop-enter"
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col overflow-hidden apple-modal-enter" style={{ maxHeight: "92vh" }}>
        <div className="px-6 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] flex items-center justify-between shrink-0">
          <p className="font-semibold text-[#191625] text-[15px]">{inicial ? "Editar" : "Registrar venda ou comissão"}</p>
          <button onClick={onFechar} className="text-[#898892] hover:text-[#5e5c68]" aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* 1. Como o dinheiro passou */}
          <div>
            <Rotulo>Como o dinheiro passou?</Rotulo>
            <div className="grid grid-cols-2 gap-2">
              {([
                { t: "ganho" as const, icone: <Repeat className="w-4 h-4" />, nome: "Ganho em cima", sub: "O cliente me pagou e eu paguei o parceiro" },
                { t: "comissao" as const, icone: <Percent className="w-4 h-4" />, nome: "Comissão", sub: "O cliente pagou direto o parceiro e ele me repassa uma parte" },
              ]).map(o => (
                <button key={o.t} onClick={() => setTipo(o.t)}
                  className={`text-left rounded-xl px-3 py-2.5 border transition-colors ${tipo === o.t ? "border-[#8456e8] bg-[rgba(132,86,232,0.06)]" : "border-[rgba(60,60,67,0.12)] hover:border-[rgba(60,60,67,0.25)]"}`}>
                  <span className={`flex items-center gap-1.5 text-[12.5px] font-semibold ${tipo === o.t ? "text-[#5b36c4]" : "text-[#191625]"}`}>{o.icone}{o.nome}</span>
                  <span className="block text-[11px] text-[#898892] mt-0.5 leading-snug">{o.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {tipo && (<>
            {/* 2. O quê, para quem, de quem */}
            <div>
              <Rotulo>O que foi vendido</Rotulo>
              <div className="flex flex-wrap gap-1.5">
                {PRODUTOS.map(p => (
                  <button key={p} onClick={() => setProduto(p)}
                    className={`h-7 px-3 rounded-full text-[11.5px] font-semibold border transition-colors ${produto === p ? "bg-[#8456e8] text-white border-[#8456e8]" : "text-[#5e5c68] border-[rgba(60,60,67,0.15)] hover:bg-black/[0.03]"}`}>{p}</button>
                ))}
              </div>
              <input value={detalhe} onChange={e => setDetalhe(e.target.value)} placeholder="Detalhe (opcional): ex. frasco 100ml cristal com válvula dourada" className={`${campo} mt-2`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Rotulo>Cliente</Rotulo>
                <input value={cliente} onChange={e => setCliente(e.target.value)} list="venda-clientes" placeholder="Para quem você vendeu" className={campo} />
                <datalist id="venda-clientes">{clientes.map(n => <option key={n} value={n} />)}</datalist>
              </div>
              <div>
                <Rotulo>Parceiro / fornecedor</Rotulo>
                <input value={parceiroNome} onChange={e => escolherParceiro(e.target.value)} list="venda-parceiros" placeholder="Quem forneceu" className={campo} />
                <datalist id="venda-parceiros">{parceiros.map(p => <option key={p.id} value={p.nome} />)}</datalist>
                {parceiroNome.trim() && !parceiroAtual && <p className="text-[10.5px] text-[#898892] mt-1">Novo parceiro: será cadastrado ao salvar.</p>}
              </div>
            </div>

            {/* 3. Quanto */}
            {tipo === "ganho" ? (
              <div className="grid grid-cols-3 gap-3">
                <div><Rotulo>Quantidade</Rotulo><input value={quantidade} onChange={e => setQuantidade(e.target.value)} inputMode="numeric" placeholder="Opcional" className={campo} /></div>
                <div><Rotulo>Cliente me pagou (R$)</Rotulo><input value={venda} onChange={e => setVenda(e.target.value)} inputMode="decimal" placeholder="0,00" className={campo} /></div>
                <div><Rotulo>Paguei ao parceiro (R$)</Rotulo><input value={custo} onChange={e => setCusto(e.target.value)} inputMode="decimal" placeholder="0,00" className={campo} /></div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div><Rotulo>Venda do parceiro (R$)</Rotulo><input value={venda} onChange={e => setVenda(e.target.value)} inputMode="decimal" placeholder="0,00" className={campo} /></div>
                <div>
                  <Rotulo>Comissão</Rotulo>
                  <div className="flex gap-1">
                    {modoComissao === "perc"
                      ? <input value={perc} onChange={e => setPerc(e.target.value)} inputMode="decimal" placeholder="%" className={campo} />
                      : <input value={valorFixo} onChange={e => setValorFixo(e.target.value)} inputMode="decimal" placeholder="R$" className={campo} />}
                  </div>
                </div>
                <div>
                  <Rotulo>Cobrada em</Rotulo>
                  <div className="flex h-9 rounded-lg ds-borda overflow-hidden text-[11.5px] font-semibold">
                    {(["perc", "valor"] as const).map(m => (
                      <button key={m} onClick={() => setModoComissao(m)} className={`flex-1 ${modoComissao === m ? "bg-[#8456e8] text-white" : "text-[#5e5c68]"}`}>{m === "perc" ? "%" : "R$ fixo"}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Resultado */}
            {v > 0 && (
              <div className={`rounded-xl px-4 py-3 ${ganho > 0 ? "bg-[rgba(0,147,81,0.07)]" : "bg-[rgba(211,58,60,0.07)]"}`}>
                <p className="text-[12px] text-[#5e5c68]">
                  Você ganha <span className={`text-[15px] font-semibold ${ganho > 0 ? "text-[#009351]" : "text-[#d33a3c]"}`}>{brl(ganho)}</span>
                  {tipo === "ganho" && c > 0 && <> · {Math.round(percFinal)}% em cima do custo</>}
                  {tipo === "ganho" && q > 0 && v > 0 && <> · {brl(v / q)} vendido, {brl(c / q)} pago por unidade</>}
                  {tipo === "comissao" && modoComissao === "valor" && v > 0 && <> · {percFinal.toFixed(1).replace(".", ",")}% da venda</>}
                </p>
                <p className="text-[11px] text-[#898892] mt-1">Entra no Financeiro como receita de parceria{recebido ? "" : " quando você marcar como recebido"} (Visão geral, Resultado e DRE).</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div><Rotulo>Data</Rotulo><input type="date" value={data} onChange={e => setData(e.target.value)} className={campo} /></div>
              {lotes && lotes.length > 0 && (
                <div>
                  <Rotulo>Junto de qual pedido (opcional)</Rotulo>
                  <select value={loteId} onChange={e => setLoteId(e.target.value)} className={campo}>
                    <option value="">Nenhum</option>
                    {lotes.slice(0, 200).map(l => <option key={l.id} value={l.id}>{l.numero} · {l.nomeCliente}</option>)}
                  </select>
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-[12.5px] text-[#191625] cursor-pointer">
              <input type="checkbox" checked={recebido} onChange={e => setRecebido(e.target.checked)} />
              {tipo === "ganho" ? "O cliente já me pagou" : "Já recebi a comissão"}
            </label>
            <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação (opcional)" className={campo} />
          </>)}
        </div>

        <div className="px-6 pb-5 pt-4 flex items-center gap-2 shrink-0 border-t border-[rgba(60,60,67,0.08)]">
          {inicial && onExcluir && (
            <button onClick={() => { if (confirm("Excluir este registro?")) { onExcluir(inicial.id); onFechar() } }}
              className="h-9 px-3 rounded-lg text-[12px] text-[#d33a3c] hover:bg-[#d33a3c]/[0.06] inline-flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />Excluir</button>
          )}
          <span className="flex-1" />
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" disabled={!pronto} onClick={salvar}>{inicial ? "Salvar" : "Registrar"}</Botao>
        </div>
      </div>
    </div>
  )
}
