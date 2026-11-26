// "Pendências do Felipe": lista única (no máximo 5) do que só o Felipe pode fazer, ordenada por valor × urgência.
// Esta parte é pura (testável): prioridade, corte, dispensa e a regra da conversa que o Felipe conduz.
// O servidor (pendenciasFelipeServidor.ts) junta as fontes e fala com o banco. Nada aqui manda mensagem a cliente.
import type { Dispensada } from "./pendenciaDispensada"
import { vigente } from "./pendenciaDispensada"

export const MAX_ITENS = 5
export const MAX_RESUMO = 3
export const LIMITE_ABERTAS_DIRETOR = 10

export type FontePendencia = "aprovo" | "espera" | "tarefa" | "diretor" | "fixa"
export type ItemFelipe = {
  chave: string                      // estável: é por ela que se dispensa
  fonte: FontePendencia
  nome: string                       // lead/cliente (ou título, quando não há lead)
  jid: string | null
  fim4: string | null                // 4 últimos dígitos do jid
  acao: string                       // uma linha com o que o Felipe faz
  valor: number | null               // R$; null = sem valor (nunca inventado)
  estimativa: boolean
  quantidade: number | null
  medida: string | null
  tipo: string | null
  desde: string | null               // ISO de quando espera
  prazo: string | null               // AAAA-MM-DD
  risco: string | null
  origem: string                     // ficha, ORC, conversa, diretor X
  link: string                       // onde resolver
  icp: boolean
  orc: string | null
  pedidoPor: string | null
  podeAssumir: boolean
}

export const fim4 = (jid: string | null | undefined) => { const d = (jid ?? "").split("@")[0].replace(/\D/g, ""); return d ? d.slice(-4) : null }

// Urgência (≥ 1): horas esperando (até 72 h pesam) × prazo (vencido ×2, em até 2 dias ×1,5) × ICP 5 mil+ (×1,5)
export function urgencia(i: Pick<ItemFelipe, "desde" | "prazo" | "icp">, agora = Date.now()): number {
  const horas = i.desde ? Math.max(0, (agora - new Date(i.desde).getTime()) / 3_600_000) : 0
  let u = 1 + Math.min(horas, 72) / 24
  if (i.prazo && /^\d{4}-\d{2}-\d{2}$/.test(i.prazo)) {
    const falta = new Date(`${i.prazo}T23:59:59.999-03:00`).getTime() - agora
    if (falta < 0) u *= 2; else if (falta < 2 * 86_400_000) u *= 1.5
  }
  if (i.icp) u *= 1.5
  return u
}
export const prioridade = (i: ItemFelipe, agora = Date.now()) => Math.max(0, i.valor ?? 0) * urgencia(i, agora)

// Ordem: prioridade (valor × urgência); empate (ex.: tudo "sem valor") pela urgência e depois por quem espera há mais tempo
export function ordenar(itens: ItemFelipe[], agora = Date.now()): ItemFelipe[] {
  return [...itens].sort((a, b) => prioridade(b, agora) - prioridade(a, agora) || urgencia(b, agora) - urgencia(a, agora)
    || (a.desde ?? "9").localeCompare(b.desde ?? "9") || a.chave.localeCompare(b.chave))
}
export const top = (itens: ItemFelipe[], agora = Date.now(), n = MAX_ITENS) => ordenar(itens, agora).slice(0, n)
// Resumo das 8h30: só os 3 de MAIOR VALOR (decisão do Felipe, 25/11)
export const topPorValor = (itens: ItemFelipe[], n = MAX_RESUMO) =>
  [...itens].sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0) || (a.desde ?? "9").localeCompare(b.desde ?? "9")).slice(0, n)

// Dispensado não volta, salvo mensagem nova do lead depois da dispensa (ultima_at do lead > dispensadoEm)
export function semDispensados(itens: ItemFelipe[], dispensas: Dispensada[], ultimaDoLead: Record<string, string | null | undefined>, agora = Date.now()): ItemFelipe[] {
  const por = new Map(dispensas.filter(d => vigente(d, agora)).map(d => [d.chave, d]))
  return itens.filter(i => {
    const d = por.get(i.chave)
    if (!d) return true
    const ultima = i.jid ? ultimaDoLead[i.jid] : null
    return !!ultima && new Date(ultima).getTime() > new Date(d.em).getTime()   // mensagem nova depois da dispensa: volta
  })
}

// Conversa que o Felipe conduz (trava da #150): só entra se o lead espera por ele, isto é, a última mensagem real é do lead.
// Quando a #150 entrar na main, `conduzida` passa a vir de conversaDoFelipe (um ponto só: pendenciasFelipeServidor).
export function entraConversa(c: { conduzida: boolean; ultimaRecebidaAt?: string | null; ultimaEnviadaAt?: string | null }): boolean {
  if (!c.conduzida) return true
  if (!c.ultimaRecebidaAt) return false
  return !c.ultimaEnviadaAt || c.ultimaRecebidaAt > c.ultimaEnviadaAt
}

// Itens que acabaram de entrar no top 5 (para o aviso ao Felipe)
export const novosNoTop = (antes: string[], depois: ItemFelipe[]) => depois.filter(i => !antes.includes(i.chave))

// Aviso ao próprio Felipe (ntfy): só o mínimo, sem nome nem telefone de cliente
export const textoAviso = (n: number) => n === 1 ? "1 item novo nas suas pendências." : `${n} itens novos nas suas pendências.`

// Valor: o do ORC; senão quantidade × referência calculada pelo sistema (estimativa); senão sem valor
export function valorDoItem(o: { orc?: number | null; quantidade?: number | null; referenciaUnit?: number | null }): { valor: number | null; estimativa: boolean } {
  if (typeof o.orc === "number" && o.orc > 0) return { valor: o.orc, estimativa: false }
  if (o.quantidade && o.quantidade > 0 && o.referenciaUnit && o.referenciaUnit > 0) return { valor: Math.round(o.quantidade * o.referenciaUnit * 100) / 100, estimativa: true }
  return { valor: null, estimativa: false }
}

// Referência por unidade a partir dos pedidos do próprio sistema com a mesma medida (mediana do preço ÷ quantidade)
const numeros = (s: string) => (s.replace(",", ".").match(/\d+(\.\d+)?/g) ?? []).map(x => Math.round(Number(x) * 10) / 10).join("x")
export function referenciaUnitaria(medida: string | null | undefined, cards: { dimensoes: string | null; preco: number | string | null; quantidade: number | string | null }[]): number | null {
  const alvo = medida ? numeros(medida) : ""
  if (!alvo) return null
  const us = cards.filter(c => c.dimensoes && numeros(c.dimensoes) === alvo).map(c => Number(c.preco) / Number(c.quantidade)).filter(u => isFinite(u) && u > 0).sort((a, b) => a - b)
  if (us.length < 3) return null   // amostra pequena demais para estimar
  const m = Math.floor(us.length / 2)
  return us.length % 2 ? us[m] : (us[m - 1] + us[m]) / 2
}

// Ações que só ele faz (lista fixa em código). Saem quando o Felipe dispensa com motivo.
export const FIXAS: Pick<ItemFelipe, "chave" | "nome" | "acao" | "origem" | "link">[] = [
  { chave: "fixa:resend-webhook", nome: "Resend: webhook de respostas", acao: "Criar o webhook email.received na conta da Resend e colar o segredo na Vercel", origem: "passo de conta (só o Felipe)", link: "https://resend.com/webhooks" },
  { chave: "fixa:pr-aprovo", nome: "PRs com Aprovo do Felipe", acao: "Revisar e aprovar os pull requests marcados \"Aprovo: sim\" na fila", origem: "docs/fila.md", link: "https://github.com/felipeonobrega2-jpg/enyla/pulls" },
]

// ── Pedido de diretor (porta externa, acao 'pendencia_felipe') ──────────────────
export type Registro = {
  id: string; titulo: string; acao: string; jid?: string | null; orc?: string | null; quantidade?: number | null; medida?: string | null; tipo?: string | null
  desde?: string | null; prazo?: string | null; origem: string; por: string; pedidoPor: string; em: string
  resolvidoEm?: string | null; resolvidoPor?: string | null; canceladaEm?: string | null
}
const txt = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : ""
const dataOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s

// Valida o pedido. titulo e origem são obrigatórios. `valor` e `estimativa` de diretor são ignorados de propósito:
// o valor vem do ORC existente (conferido no servidor) ou do cálculo do sistema; senão fica "sem valor".
export function validarPedido(b: Record<string, unknown>): { ok: true; r: Omit<Registro, "id" | "por" | "pedidoPor" | "em"> } | { ok: false; erro: string } {
  const titulo = txt(b.titulo, 140)
  if (!titulo) return { ok: false, erro: "titulo: obrigatório (até 140 caracteres)." }
  const origem = txt(b.origem, 200)
  if (!origem) return { ok: false, erro: "origem: obrigatória (de onde vem o dado: ficha, ORC, conversa...)." }
  if (typeof b.titulo === "string" && b.titulo.trim().length > 140) return { ok: false, erro: "titulo: no máximo 140 caracteres." }
  // O JSON já usa "acao" para o nome da ação da porta; a linha do que o Felipe faz vem em "oQueFazer"
  const acao = txt(b.oQueFazer, 300)
  let prazo: string | null = null
  if (b.prazo != null && b.prazo !== "") { if (typeof b.prazo !== "string" || !dataOk(b.prazo)) return { ok: false, erro: "prazo: data no formato AAAA-MM-DD." }; prazo = b.prazo }
  let desde: string | null = null
  if (b.desde != null && b.desde !== "") { if (typeof b.desde !== "string" || isNaN(new Date(b.desde).getTime())) return { ok: false, erro: "desde: data e hora ISO." }; desde = new Date(b.desde).toISOString() }
  let quantidade: number | null = null
  if (b.quantidade != null && b.quantidade !== "") { const q = Number(b.quantidade); if (!isFinite(q) || q <= 0) return { ok: false, erro: "quantidade: número maior que zero." }; quantidade = q }
  const jid = txt(b.jid, 80) || null
  return { ok: true, r: { titulo, acao: acao || titulo, jid, orc: txt(b.orc, 40) || null, quantidade, medida: txt(b.medida, 60) || null, tipo: txt(b.tipo, 60) || null, desde, prazo, origem } }
}
