"use client"

// Aba Banco: o extrato que chega da Pluggy (Meu Pluggy), com a sugestão de cada transação.
// Já lançado à mão → vincula; pagamento da conta do fornecedor → abate a conta; o resto a IA sugere e você confere.
// Nada entra nos lançamentos sem o seu clique (enquanto o modo automático estiver desligado). Tudo dá para desfazer.

import { useCallback, useEffect, useRef, useState } from "react"
import { RefreshCw, Link2, Plus, EyeOff, Undo2, Settings2, Sparkles, Landmark, Check, X, Loader2, AlertCircle, ArrowDownLeft, ArrowUpRight } from "lucide-react"
import type { KanbanCard, LancamentoFinanceiro } from "../../types"
import type { Configuracoes } from "../../config"
import type { TxBanco, SugestaoBanco } from "../../lib/banco"
import { ModalLancamento } from "../FinanceiroView"
import { Botao, Selo, Segmentado, Vazio } from "../ds"

type Estado = "pendente" | "vinculada" | "criada" | "ignorada"
type Resposta = { configurada: boolean; tabela: boolean; erro: string | null; status: { em: string; contas: { id: string; nome: string; saldo: number | null }[]; novas: number; erro?: string | null } | null; pendentes: number; transacoes: TxBanco[] }

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const dataBR = (d: string) => d.split("-").reverse().slice(0, 2).join("/")
const campo = "h-8 rounded-lg px-2.5 text-[12px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] ds-borda"

export function BancoTab({ config, lancamentos, kanban, onUpdateConfig, onAdd, onUpdate, onDelete }: {
  config: Configuracoes
  lancamentos: LancamentoFinanceiro[]
  kanban: KanbanCard[]
  onUpdateConfig: (c: Configuracoes) => void
  onAdd: (l: LancamentoFinanceiro) => void
  onUpdate: (id: string, campos: Partial<LancamentoFinanceiro>) => void
  onDelete: (id: string) => void
}) {
  const [estado, setEstado] = useState<Estado>("pendente")
  const [dados, setDados] = useState<Resposta | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [verConfig, setVerConfig] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [corrigindo, setCorrigindo] = useState<{ tx: TxBanco; inicial: Partial<LancamentoFinanceiro> } | null>(null)
  const salvos = useRef<LancamentoFinanceiro[]>([])

  const carregar = useCallback(() => {
    fetch(`/api/banco/transacoes?estado=${estado}`).then(r => r.json()).then(setDados).catch(() => {})
  }, [estado])
  useEffect(() => { carregar() }, [carregar])

  const pluggy = config.pluggy ?? {}
  const nomeCat = (id?: string) => [...(config.categoriasDespesa ?? []), ...(config.categoriasReceita ?? [])].find(c => c.id === id)?.nome ?? id
  const nomeForn = (id?: string) => (config.fornecedores ?? []).find(f => f.id === id)?.nome
  const lancPorId = (id: string) => lancamentos.find(l => l.id === id)

  async function sincronizar() {
    setSincronizando(true); setMsg(null)
    const r = await fetch("/api/banco/sincronizar", { method: "POST" }).then(x => x.json()).catch(() => null)
    setSincronizando(false)
    setMsg(r ? (r.erro ? r.erro : `${r.novas} transações novas · ${r.sugeridas} com sugestão`) : "Sem conexão.")
    carregar()
  }

  // Envia a decisão e reflete na tela os lançamentos criados/atualizados/removidos pelo servidor
  async function decidir(tx: TxBanco, decisao: Record<string, unknown>) {
    setOcupado(tx.id)
    const r = await fetch("/api/banco/aplicar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: tx.id, decisao }) }).then(x => x.json()).catch(() => null)
    setOcupado(null)
    if (!r?.ok) { alert(r?.erro ?? "Não aplicou."); return }
    for (const l of r.criados ?? []) onAdd(l)
    for (const u of r.atualizados ?? []) onUpdate(u.id, u.campos)
    for (const id of r.removidos ?? []) onDelete(id)
    setDados(d => d ? { ...d, transacoes: d.transacoes.filter(t => t.id !== tx.id), pendentes: d.pendentes + (decisao.acao === "desfazer" ? 1 : estado === "pendente" ? -1 : 0) } : d)
  }

  const aceitar = (tx: TxBanco, s: SugestaoBanco) => {
    if (s.acao === "vincular") return decidir(tx, { acao: "vincular", lancamentoId: s.lancamentoId })
    if (s.acao === "atualizar") return decidir(tx, { acao: "atualizar", lancamentoId: s.lancamentoId, campos: s.campos })
    if (s.acao === "criar") return decidir(tx, { acao: "criar", lancamentos: s.lancamentos })
    if (s.acao === "ignorar") return decidir(tx, { acao: "ignorar" })
  }
  const abrirCorrecao = (tx: TxBanco, s: SugestaoBanco | null) => {
    salvos.current = []
    const base = s?.acao === "criar" ? s.lancamentos[0] : {}
    setCorrigindo({ tx, inicial: { tipo: tx.tipo === "entrada" ? "receita" : "despesa", descricao: tx.contraparte_nome ?? tx.descricao, valor: tx.valor, dataVencimento: tx.data, dataPagamento: tx.data, status: "pago", ...base } })
  }

  const exatos = (dados?.transacoes ?? []).filter(t => t.sugestao?.acao === "vincular" || t.sugestao?.acao === "atualizar")
  async function aceitarExatos() {
    if (!confirm(`Vincular ${exatos.length} transações aos lançamentos que você já tinha feito?`)) return
    for (const t of exatos) await aceitar(t, t.sugestao!)
  }

  const salvarPluggy = (p: typeof pluggy) => onUpdateConfig({ ...config, pluggy: p })

  return (
    <div className="space-y-4">
      {/* Situação da conexão */}
      <div className="rounded-xl p-4 bg-white ds-cartao">
        <div className="flex items-start gap-3 flex-wrap">
          <Landmark className="w-5 h-5 text-[#8456e8] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-semibold text-[#191625]">Banco (Pluggy · Open Finance)</p>
            {!dados ? <p className="text-[12px] text-[#898892]">Carregando…</p>
              : !dados.configurada ? <p className="text-[12px] text-[#b26b00]">Faltam as chaves PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET na Vercel (depois, um novo deploy).</p>
              : !dados.tabela ? <p className="text-[12px] text-[#b26b00]">Falta rodar o SQL da tabela do extrato no Supabase (supabase/migrations/20261104_banco.sql).</p>
              : !(pluggy.itens ?? []).length ? <p className="text-[12px] text-[#b26b00]">Cole o Item ID de cada banco conectado (em Configurar).</p>
              : <p className="text-[12px] text-[#5e5c68]">
                  {dados.status ? `Última sincronização ${new Date(dados.status.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "Ainda não sincronizado"}
                  {" · "}a partir de {dataBR(pluggy.dataCorte ?? new Date().toLocaleDateString("sv-SE"))}
                  {" · "}{pluggy.automatico ? "automático para o que não tem dúvida" : "só sugerindo (você aprova tudo)"}
                </p>}
            {!!dados?.status?.contas?.length && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {dados.status.contas.map(c => <span key={c.id} className="text-[11px] px-2 py-0.5 rounded-md bg-[rgba(116,116,128,0.08)] text-[#5e5c68]">{c.nome}{c.saldo != null ? ` · ${brl(c.saldo)}` : ""}</span>)}
              </div>
            )}
            {(dados?.status?.erro || msg) && <p className={`text-[11.5px] mt-1.5 ${dados?.status?.erro || msg?.includes("Pluggy") ? "text-[#d33a3c]" : "text-[#009351]"}`}>{msg ?? dados?.status?.erro}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Botao variante="fantasma" icone={<Settings2 className="w-4 h-4" />} onClick={() => setVerConfig(v => !v)}>Configurar</Botao>
            <Botao variante="primario" disabled={sincronizando || !dados?.configurada} icone={sincronizando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} onClick={sincronizar}>
              {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
            </Botao>
          </div>
        </div>
        {verConfig && <ConfigBanco valor={pluggy} onSalvar={p => { salvarPluggy(p); setVerConfig(false) }} />}
      </div>

      {/* Estados */}
      <div className="flex items-center gap-3 flex-wrap">
        <Segmentado<Estado> valor={estado} onChange={setEstado} opcoes={[
          { v: "pendente", nome: dados?.pendentes ? `Para conferir · ${dados.pendentes}` : "Para conferir" },
          { v: "vinculada", nome: "Vinculadas" }, { v: "criada", nome: "Lançadas" }, { v: "ignorada", nome: "Ignoradas" },
        ]} />
        {estado === "pendente" && exatos.length > 1 && (
          <Botao icone={<Link2 className="w-4 h-4" />} onClick={aceitarExatos}>Vincular os {exatos.length} que já estavam lançados</Botao>
        )}
      </div>

      {/* Transações */}
      <div className="rounded-xl bg-white ds-cartao overflow-hidden">
        {!dados?.transacoes.length ? (
          <Vazio icone={<Landmark className="w-7 h-7" />} titulo={estado === "pendente" ? "Nada para conferir" : "Nenhuma transação aqui"}
            sub={estado === "pendente" ? "As transações novas aparecem aqui todo dia (ou ao sincronizar)." : undefined} />
        ) : dados.transacoes.map((tx, k) => {
          const s = tx.sugestao, entrada = tx.tipo === "entrada"
          return (
            <div key={tx.id} className="px-4 py-3 flex gap-3" style={{ borderTop: k ? "1px solid rgba(60,60,67,0.08)" : undefined, opacity: ocupado === tx.id ? 0.5 : 1 }}>
              <span className="w-8 h-8 rounded-full grid place-items-center shrink-0" style={{ background: entrada ? "rgba(0,147,81,0.1)" : "rgba(211,58,60,0.08)" }}>
                {entrada ? <ArrowDownLeft className="w-4 h-4 text-[#009351]" /> : <ArrowUpRight className="w-4 h-4 text-[#d33a3c]" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold text-[#191625] truncate">{tx.contraparte_nome ?? tx.descricao}</span>
                  <span className="ml-auto text-[13.5px] font-bold ds-num shrink-0" style={{ color: entrada ? "#009351" : "#d33a3c" }}>{entrada ? "+" : "−"}{brl(tx.valor)}</span>
                </div>
                <p className="text-[11px] text-[#898892] truncate">{dataBR(tx.data)} · {tx.conta_nome ?? "conta"} · {tx.descricao}{tx.contraparte_doc ? ` · ${tx.contraparte_doc}` : ""}</p>

                {estado === "pendente" ? (
                  <div className="mt-2 rounded-lg px-3 py-2 bg-[rgba(132,86,232,0.05)] border border-[rgba(132,86,232,0.14)]">
                    <Sugestao s={s} nomeCat={nomeCat} nomeForn={nomeForn} lancPorId={lancPorId} />
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {s && s.acao !== "revisar" && s.acao !== "escolher" && (
                        <button onClick={() => aceitar(tx, s)} className="h-7 px-3 rounded-lg text-[11.5px] font-semibold text-white bg-[#8456e8] inline-flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />{s.acao === "vincular" ? "Vincular" : s.acao === "atualizar" ? "Dar baixa" : s.acao === "ignorar" ? "Ignorar" : "Lançar"}
                        </button>
                      )}
                      {s?.acao === "escolher" && s.candidatos.map(id => (
                        <button key={id} onClick={() => decidir(tx, { acao: "vincular", lancamentoId: id })} className="h-7 px-2.5 rounded-lg text-[11.5px] font-semibold bg-white ds-borda text-[#191625]">
                          Vincular a: {lancPorId(id)?.descricao ?? id} ({lancPorId(id) ? dataBR((lancPorId(id)!.dataPagamento ?? lancPorId(id)!.dataVencimento).slice(0, 10)) : ""})
                        </button>
                      ))}
                      <button onClick={() => abrirCorrecao(tx, s)} className="h-7 px-2.5 rounded-lg text-[11.5px] font-semibold bg-white ds-borda text-[#191625] inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" />{s?.acao === "criar" ? "Corrigir e lançar" : "Lançar"}</button>
                      {s?.acao !== "ignorar" && <button onClick={() => decidir(tx, { acao: "ignorar" })} className="h-7 px-2.5 rounded-lg text-[11.5px] font-semibold text-[#5e5c68] hover:bg-black/5 inline-flex items-center gap-1"><EyeOff className="w-3.5 h-3.5" />Ignorar</button>}
                      <button onClick={() => decidir(tx, { acao: "ignorar", sempre: true })} className="h-7 px-2.5 rounded-lg text-[11.5px] text-[#898892] hover:bg-black/5" title="Da próxima vez, quem está do outro lado já vem ignorado">Sempre ignorar este</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    {tx.lancamento_ids.map(id => <Selo key={id} tom={estado === "criada" ? "sucesso" : "info"}>{lancPorId(id)?.descricao ?? "lançamento"}{lancPorId(id)?.categoria ? ` · ${nomeCat(lancPorId(id)!.categoria)}` : ""}</Selo>)}
                    <span className="text-[10.5px] text-[#898892]">{tx.historico?.[tx.historico.length - 1]?.acao}</span>
                    <button onClick={() => { if (confirm(estado === "criada" ? "Desfazer? O lançamento criado a partir do banco é apagado e a transação volta para conferir." : "Desfazer? A transação volta para conferir.")) decidir(tx, { acao: "desfazer" }) }}
                      className="ml-auto h-7 px-2.5 rounded-lg text-[11.5px] font-semibold text-[#5e5c68] hover:bg-black/5 inline-flex items-center gap-1"><Undo2 className="w-3.5 h-3.5" />Desfazer</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {corrigindo && (
        <ModalLancamento inicial={corrigindo.inicial} kanban={kanban}
          categoriasReceita={config.categoriasReceita} categoriasDespesa={config.categoriasDespesa} contas={config.contas} fornecedores={config.fornecedores}
          // A divisão por etapa chama onSave várias vezes: junta tudo e grava de uma vez ao fechar
          onSave={l => { salvos.current.push(l) }}
          onClose={() => {
            const tx = corrigindo.tx, ls = salvos.current
            setCorrigindo(null)
            if (ls.length) decidir(tx, { acao: "criar", lancamentos: ls })
          }} />
      )}
    </div>
  )
}

function Sugestao({ s, nomeCat, nomeForn, lancPorId }: { s: SugestaoBanco | null; nomeCat: (id?: string) => string | undefined; nomeForn: (id?: string) => string | undefined; lancPorId: (id: string) => LancamentoFinanceiro | undefined }) {
  if (!s) return <p className="text-[11.5px] text-[#898892] flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Preparando sugestão…</p>
  const icone = s.acao === "criar" && s.origem === "ia" ? <Sparkles className="w-3.5 h-3.5 text-[#8456e8] shrink-0" /> : s.acao === "revisar" ? <AlertCircle className="w-3.5 h-3.5 text-[#b26b00] shrink-0" /> : s.acao === "ignorar" ? <X className="w-3.5 h-3.5 text-[#898892] shrink-0" /> : <Link2 className="w-3.5 h-3.5 text-[#8456e8] shrink-0" />
  return (
    <div className="text-[12px] text-[#191625]">
      <p className="flex items-start gap-1.5">{icone}<span>
        {s.acao === "vincular" && <>Já está lançado: <b>{lancPorId(s.lancamentoId)?.descricao ?? "lançamento"}</b>. Só vincula, não cria nada.</>}
        {s.acao === "atualizar" && <>Dá baixa em <b>{lancPorId(s.lancamentoId)?.descricao ?? "lançamento"}</b> (estava pendente).</>}
        {s.acao === "escolher" && <>Há mais de um lançamento com esse valor e data. Qual é?</>}
        {s.acao === "ignorar" && <>Ignorar: {s.motivo}.</>}
        {s.acao === "revisar" && <>Sem pista para sugerir. Lance ou ignore.</>}
        {s.acao === "criar" && <>{s.origem === "conta" ? "Pagamento da conta do fornecedor: abate o saldo devedor (não é custo novo)." : s.origem === "conciliacao" ? "Recebimento de cliente:" : s.origem === "regra" ? "Pela sua regra:" : "Sugestão da IA:"}</>}
      </span></p>
      {s.acao === "criar" && (
        <div className="mt-1 space-y-0.5 pl-5">
          {s.lancamentos.map((l, i) => (
            <p key={i} className="text-[11.5px] text-[#5e5c68]">
              <b className="text-[#191625]">{l.descricao}</b>{l.categoria ? ` · ${nomeCat(l.categoria)}` : ""}{l.fornecedorId ? ` · ${nomeForn(l.fornecedorId) ?? "fornecedor"}` : ""}{l.loteNumero || l.cardNumero ? ` · ${l.loteNumero ?? l.cardNumero}` : ""} · <b className="ds-num">{brl(Number(l.valor))}</b>
            </p>
          ))}
        </div>
      )}
      {s.acao !== "vincular" && s.acao !== "atualizar" && s.acao !== "escolher" && <p className="text-[10.5px] text-[#898892] pl-5 mt-0.5">{s.motivo}</p>}
    </div>
  )
}

// Bancos conectados (Item ID do painel da Pluggy), data de corte e o que é seu (para não contar transferências entre contas)
function ConfigBanco({ valor, onSalvar }: { valor: NonNullable<Configuracoes["pluggy"]>; onSalvar: (v: NonNullable<Configuracoes["pluggy"]>) => void }) {
  const [itens, setItens] = useState(valor.itens ?? [])
  const [corte, setCorte] = useState(valor.dataCorte ?? new Date().toLocaleDateString("sv-SE"))
  const [docs, setDocs] = useState((valor.documentosProprios ?? []).join(", "))
  const [auto, setAuto] = useState(!!valor.automatico)
  const [novo, setNovo] = useState({ id: "", nome: "" })
  return (
    <div className="mt-4 pt-4 border-t border-[rgba(60,60,67,0.08)] space-y-3">
      <div>
        <p className="text-[11.5px] font-semibold text-[#5e5c68] mb-1">Bancos conectados (Item ID de cada um, no painel da Pluggy)</p>
        {itens.map(it => (
          <div key={it.id} className="flex items-center gap-2 text-[12px] py-1">
            <span className="font-semibold text-[#191625]">{it.nome || "Banco"}</span><span className="font-mono text-[11px] text-[#898892] truncate">{it.id}</span>
            <button onClick={() => setItens(l => l.filter(x => x.id !== it.id))} className="ml-auto text-[#898892] hover:text-[#d33a3c]" aria-label="Remover"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        <div className="flex gap-2 mt-1">
          <input value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} placeholder="Nome (ex.: Santander)" className={`${campo} w-40`} />
          <input value={novo.id} onChange={e => setNovo({ ...novo, id: e.target.value.trim() })} placeholder="Item ID" className={`${campo} flex-1 font-mono`} />
          <Botao disabled={!/^[\w-]{10,}$/.test(novo.id)} onClick={() => { setItens(l => [...l.filter(x => x.id !== novo.id), novo]); setNovo({ id: "", nome: "" }) }}>Adicionar</Botao>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11.5px] font-semibold text-[#5e5c68]">Data de corte</span>
          <input type="date" value={corte} onChange={e => setCorte(e.target.value)} className={`${campo} w-full mt-1`} />
          <span className="text-[10.5px] text-[#898892]">Antes dessa data nada é mexido: o que você lançou à mão fica como está.</span>
        </label>
        <label className="block">
          <span className="text-[11.5px] font-semibold text-[#5e5c68]">Seus CPF/CNPJ (separados por vírgula)</span>
          <input value={docs} onChange={e => setDocs(e.target.value)} placeholder="Para reconhecer transferências entre as suas contas" className={`${campo} w-full mt-1`} />
        </label>
      </div>
      <label className="flex items-start gap-2 text-[12px] cursor-pointer">
        <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} className="mt-0.5" />
        <span><b>Modo automático</b> <span className="text-[#898892]">· vincula o que já estava lançado, abate conta de fornecedor e aplica as suas regras sem perguntar. Sugestões da IA continuam esperando você. Recomendo ligar depois de umas duas semanas conferindo.</span></span>
      </label>
      <div className="flex justify-end"><Botao variante="primario" onClick={() => onSalvar({ itens, dataCorte: corte, automatico: auto, documentosProprios: docs.split(",").map(d => d.trim()).filter(Boolean) })}>Salvar</Botao></div>
    </div>
  )
}
