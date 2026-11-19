// Auditor de dados no servidor: busca tudo (paginado, sem limite de 1.000 linhas) e roda as regras.
// Guarda o resumo no AppConfig para o Escritório, o vigia e a rotina das 18h.
import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { auditar, type Auditoria, type TxAuditoria, type PedidoAuditoria, type ConversaAuditoria } from "./auditoria"
import type { KanbanCard, LancamentoFinanceiro } from "../types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todos<T>(tabela: string, colunas: string, filtro?: (q: any) => any): Promise<T[]> {
  const out: T[] = []
  for (let de = 0; de < 50_000; de += 1000) {
    let q = supabase.from(tabela).select(colunas).range(de, de + 999)
    if (filtro) q = filtro(q)
    const { data, error } = await q
    if (error) throw new Error(`${tabela}: ${error.message}`)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

export type ResumoAuditoria = { em: string; confianca: number; total: number; graves: number; valorEmJogo: number; conferidos: number; porRegra: Record<string, number> }
type Cfg = { pedidosDigitais?: PedidoAuditoria[]; auditoriaIgnorados?: string[]; auditoriaDados?: ResumoAuditoria & { historico?: ResumoAuditoria[] } }

export async function rodarAuditoria(opts: { guardar?: boolean } = {}): Promise<Auditoria> {
  const [cards, lancamentos, transacoes, conversas, cfgRow] = await Promise.all([
    todos<KanbanCard>("KanbanCard", "*"),
    todos<LancamentoFinanceiro>("LancamentoFinanceiro", "*"),
    todos<TxAuditoria>("banco_transacoes", "id, data, valor, tipo, estado, descricao, lancamento_ids").catch(() => [] as TxAuditoria[]),
    todos<ConversaAuditoria>("whatsapp_conversas", "jid, nome, kanban_card_id", q => q.not("kanban_card_id", "is", null)),
    supabase.from("AppConfig").select("data").eq("id", 1).single(),
  ])
  const cfg = (cfgRow.data?.data ?? {}) as Cfg
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)
  const r = auditar({ cards, lancamentos, transacoes, pedidosDigitais: cfg.pedidosDigitais ?? [], conversas, hoje, ignorados: cfg.auditoriaIgnorados })
  if (opts.guardar) {
    const resumo: ResumoAuditoria = { em: r.em, confianca: r.confianca, total: r.total, graves: r.graves, valorEmJogo: r.valorEmJogo, conferidos: r.conferidos,
      porRegra: Object.fromEntries(r.regras.filter(x => x.problemas.length).map(x => [x.id, x.problemas.length])) }
    await mudarConfig((d: Cfg) => ({ auditoriaDados: { ...resumo, historico: [resumo, ...(d.auditoriaDados?.historico ?? [])].slice(0, 60) } }))
  }
  return r
}

// "Está certo": o problema sai da conta (e volta se você desfizer)
export async function ignorarProblema(id: string, voltar = false) {
  await mudarConfig((d: Cfg) => {
    const atual = new Set(d.auditoriaIgnorados ?? [])
    if (voltar) atual.delete(id); else atual.add(id)
    return { auditoriaIgnorados: [...atual].slice(-3000) }
  })
}

// O vigia roda a cada 5 min; a auditoria completa, no máximo uma vez por hora
export async function talvezAuditar(cfg: { auditoriaDados?: { em?: string } }) {
  const ult = cfg.auditoriaDados?.em
  // Varredura completa só de madrugada (2h às 6h, uma vez): de dia ela pesava no banco junto com o atendimento (19/11)
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false })) % 24
  if (h < 2 || h >= 6) return null
  if (ult && Date.now() - new Date(ult).getTime() < 20 * 3_600_000) return null
  // Marca o início antes de varrer: se a rodada cair no meio (tempo da Vercel), não tenta de novo a cada 2 min
  // (19/11: a varredura completa repetindo a cada rodada do vigia engasgou o banco)
  let minha = false
  await mudarConfig((d: Record<string, unknown> & { auditoriaComecouEm?: string }) => {
    if (d.auditoriaComecouEm && Date.now() - new Date(d.auditoriaComecouEm).getTime() < 20 * 3_600_000) return null
    minha = true
    return { auditoriaComecouEm: new Date().toISOString() }
  })
  if (!minha) return null
  const r = await rodarAuditoria({ guardar: true })
  return { confianca: r.confianca, problemas: r.total }
}
