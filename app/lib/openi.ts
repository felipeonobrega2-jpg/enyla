// Cliente da Openi (Open Finance, https://of.openi.com.br/v1). Só roda no servidor.
// Chave na Vercel: OPENI_API_KEY (nunca no código). Webhook protegido por OPENI_WEBHOOK_SECRET.
// Quais itens/contas valem, e de que data a que data, vêm de OPENI_CONTAS (JSON), preenchida fora do código:
//   [{"item":"<id>","conta":"<id>","antesDe":"2026-12-01"},{"item":"<id>","conta":"<id>","aPartirDe":"2026-12-01"}]
// "antesDe" = vale para movimentos com data anterior à data; "aPartirDe" = vale da data em diante (inclusive).

import { timingSafeEqual } from "crypto"
import type { TxBanco } from "./banco"

const BASE = "https://of.openi.com.br/v1"

export type FonteExtrato = "pluggy" | "openi"
export const fonteDoExtrato = (v: unknown): FonteExtrato => (v === "openi" ? "openi" : "pluggy")   // padrão: pluggy

export const openiConfigurada = () => !!process.env.OPENI_API_KEY

// mista: conta/cartão de pessoa física usado também para a empresa. Tudo é importado, mas só entra na fila
// (caixa e conciliação) o que for da empresa: pela regra de termos (descrição/favorecido) ou marcado à mão.
export type ContaOpeni = { item: string; conta: string; antesDe?: string; aPartirDe?: string; mista?: boolean }

export function lerContasOpeni(bruto = process.env.OPENI_CONTAS): ContaOpeni[] {
  if (!bruto) return []
  try {
    const j = JSON.parse(bruto)
    if (!Array.isArray(j)) return []
    const dia = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)
    return j.filter(c => c && typeof c.item === "string" && typeof c.conta === "string" && c.item && c.conta)
      .map(c => ({ item: c.item, conta: c.conta, antesDe: dia(c.antesDe), aPartirDe: dia(c.aPartirDe), mista: c.mista === true }))
  } catch { return [] }
}

// A conta vale para esta data? (por conta e por período)
export const contaValeNaData = (c: Pick<ContaOpeni, "antesDe" | "aPartirDe">, data: string) =>
  (!c.antesDe || data < c.antesDe) && (!c.aPartirDe || data >= c.aPartirDe)

export function segredoValido(recebido: string | null) {
  const esperado = process.env.OPENI_WEBHOOK_SECRET
  if (!esperado || !recebido) return false
  const a = Buffer.from(recebido), b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function openi<T>(caminho: string): Promise<{ ok: boolean; dados: T | null; erro?: string }> {
  const chave = process.env.OPENI_API_KEY
  if (!chave) return { ok: false, dados: null, erro: "Openi não configurada (OPENI_API_KEY na Vercel)." }
  const r = await fetch(BASE + caminho, { headers: { Authorization: `Bearer ${chave}`, "X-API-KEY": chave, Accept: "application/json" } }).catch(() => null)
  if (!r) return { ok: false, dados: null, erro: "Sem conexão com a Openi." }
  const j = await r.json().catch(() => null) as (T & { message?: string }) | null
  if (!r.ok) return { ok: false, dados: null, erro: j?.message ?? `Openi respondeu ${r.status}.` }
  return { ok: true, dados: j }
}

const seg = (s: string) => encodeURIComponent(s)
export const itemOpeni = (id: string) => openi<{ data?: Record<string, unknown> }>(`/items/${seg(id)}`)
export const contasOpeni = (id: string) => openi<{ data?: unknown }>(`/items/${seg(id)}/accounts`)
export const cartoesOpeni = (id: string) => openi<{ data?: unknown }>(`/items/${seg(id)}/credit-cards`)

export type TxOpeni = {
  id?: string; date?: string; postedAt?: string; transactionDate?: string; amount?: number | string
  type?: string; description?: string; descriptionRaw?: string | null; category?: string | null
  counterpartyName?: string | null; counterpartyDocument?: string | null
}

// Todas as páginas de movimentos de uma conta (data.pagination.totalPages)
export async function transacoesOpeni(item: string, conta: string, maxPaginas = 50): Promise<{ ok: boolean; lista: TxOpeni[]; erro?: string }> {
  const lista: TxOpeni[] = []
  let total = 1
  for (let p = 1; p <= Math.min(total, maxPaginas); p++) {
    const r = await openi<{ data?: { transactions?: TxOpeni[]; items?: TxOpeni[]; results?: TxOpeni[]; pagination?: { totalPages?: number } } }>(`/items/${seg(item)}/accounts/${seg(conta)}/transactions?page=${p}`)
    if (!r.ok) return { ok: false, lista, erro: r.erro }
    const d = r.dados?.data
    lista.push(...(d?.transactions ?? d?.items ?? d?.results ?? (Array.isArray(d) ? (d as TxOpeni[]) : [])))
    total = Number(d?.pagination?.totalPages) || 1
  }
  return { ok: true, lista }
}

// Mesmo formato dos movimentos da Pluggy. O id leva o prefixo da fonte: a chave (fonte, id externo) não colide com a Pluggy.
export function daOpeni(t: TxOpeni, conta: string, contaNome: string | null): Omit<TxBanco, "estado" | "lancamento_ids" | "sugestao" | "historico"> | null {
  const bruto = Number(t.amount)
  const data = (t.date ?? t.postedAt ?? t.transactionDate ?? "").slice(0, 10)
  if (!t.id || !Number.isFinite(bruto) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null
  const tipo = String(t.type ?? "").toUpperCase()
  const saida = tipo ? /DEBIT|DEBITO|SAIDA/.test(tipo) : bruto < 0
  return {
    id: `openi:${t.id}`, conta_id: conta, conta_nome: contaNome, data, valor: Math.abs(bruto),
    tipo: saida ? "saida" : "entrada", descricao: (t.description || t.descriptionRaw || "").trim(),
    contraparte_nome: t.counterpartyName ?? null, contraparte_doc: (t.counterpartyDocument ?? "").replace(/\D/g, "") || null,
    categoria_pluggy: t.category ?? null,
  }
}

// ── Conta mista ──────────────────────────────────────────────────────────────
export const ACAO_PESSOAL = "conta mista: pessoal"
export const ACAO_EMPRESA_REGRA = "conta mista: da empresa (regra)"

const limpar = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim()

// Termos (fornecedores, ferramentas) que marcam um movimento da conta mista como da empresa.
// Vêm da config (termosEmpresaContaMista) ou, se vazia, da env OPENI_TERMOS_EMPRESA (JSON: ["termo", ...]).
export function lerTermosEmpresa(daConfig?: unknown, bruto = process.env.OPENI_TERMOS_EMPRESA): string[] {
  let l: unknown = daConfig
  if (!Array.isArray(l) || !l.length) { try { l = bruto ? JSON.parse(bruto) : [] } catch { l = [] } }
  return Array.isArray(l) ? l.filter((t): t is string => typeof t === "string").map(limpar).filter(t => t.length >= 3) : []
}

export const ehDaEmpresa = (tx: { descricao?: string | null; contraparte_nome?: string | null }, termos: string[]) => {
  const texto = limpar(`${tx.descricao ?? ""} ${tx.contraparte_nome ?? ""}`)
  return termos.some(t => texto.includes(t))
}
