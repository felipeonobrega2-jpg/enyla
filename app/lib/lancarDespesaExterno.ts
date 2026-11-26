// Porta externa, ação lancar_despesa (só a chave do CTO): UMA despesa (um fato econômico, um total) rateada por lote.
// Modelo: uma linha de LancamentoFinanceiro por lote, com o valor da FATIA (nunca o total) e o mesmo rateioGrupoId.
// Assim custoDireto (negocio.ts) e a previsão de caixa (caixa.ts) somam as fatias e o total conta uma vez.
// Status 'pago' é só baixa no livro: não dispara pagamento, não chama Asaas, Pluggy nem banco. Nunca apaga nada.
// Auditoria e idempotência: AppConfig.despesasPorta[chaveIdempotencia] (chave JSON nova, aditiva) com quem, quando e payload.
import { randomUUID } from "crypto"
import { supabase } from "./supabase"
import { lerCampos, mudarConfig } from "./configAtomica"
import type { Fornecedor } from "@/app/config"

export type Pedido = Record<string, unknown>
export type Fatia = { lancamentoId: string; loteId: string; loteNumero: string | null; valor: number }
export type Registro = { autor: string; em: string; emIso: string; chaveIdempotencia: string }
export type Gravada = {
  estado: "gravando" | "gravada" | "falhou"
  hash: string
  autor: string; em: string; emIso: string
  payload: unknown
  despesa?: { id: string; descricao: string; fornecedorId: string; total: number; status: string; dataVencimento: string; dataPagamento?: string }
  rateio?: Fatia[]
}
export type Resultado =
  | { ok: true; resultado: string; despesa: NonNullable<Gravada["despesa"]>; rateio: Fatia[]; registro: Registro }
  | { ok: false; status: 400 | 404 | 409 | 500; erro: string }

const DATA = /^\d{4}-\d{2}-\d{2}$/
const dataOk = (v: unknown): v is string => typeof v === "string" && DATA.test(v) && !Number.isNaN(Date.parse(v))
export const brasilia = (d = new Date()) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })

// Reais → centavos inteiros; recusa mais de 2 casas decimais (não arredonda em silêncio)
export function centavos(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null
  const c = Math.round(v * 100)
  return Math.abs(v * 100 - c) < 1e-6 && c > 0 ? c : null
}
const reais = (c: number) => c / 100
const texto = (v: unknown) => typeof v === "string" ? v.trim() : ""

type Item = { loteId: string; loteNumero: string; centavos: number }

export async function lancarDespesaExterno(diretor: string, b: Pedido): Promise<Resultado> {
  const chave = texto(b.chaveIdempotencia)
  if (!chave) return { ok: false, status: 400, erro: "chaveIdempotencia: texto não vazio (obrigatório)." }
  if (chave.length > 120) return { ok: false, status: 400, erro: "chaveIdempotencia: no máximo 120 caracteres." }
  const fornecedorId = texto(b.fornecedorId)
  if (!fornecedorId) return { ok: false, status: 400, erro: "fornecedorId: obrigatório (id de um fornecedor cadastrado)." }
  const descricao = texto(b.descricao)
  if (!descricao) return { ok: false, status: 400, erro: "descricao: texto não vazio." }
  const total = centavos(b.valor)
  if (total === null) return { ok: false, status: 400, erro: "valor: total em reais, maior que zero, com no máximo 2 casas decimais." }
  if (!dataOk(b.dataVencimento)) return { ok: false, status: 400, erro: "dataVencimento: data AAAA-MM-DD." }
  if (b.status !== "pago" && b.status !== "pendente") return { ok: false, status: 400, erro: "status: pago ou pendente." }
  let dataPagamento: string | undefined
  if (b.dataPagamento !== undefined) {
    if (!dataOk(b.dataPagamento)) return { ok: false, status: 400, erro: "dataPagamento: data AAAA-MM-DD." }
    if (b.status !== "pago") return { ok: false, status: 400, erro: "dataPagamento só com status pago." }
    dataPagamento = b.dataPagamento
  }
  if (b.status === "pago" && !dataPagamento) dataPagamento = b.dataVencimento
  if (!Array.isArray(b.rateio) || !b.rateio.length) return { ok: false, status: 400, erro: "rateio: lista [{ loteNumero | loteId, valor }] com ao menos um lote." }

  const pedidos: { ref: string; porId: boolean; centavos: number }[] = []
  for (const r of b.rateio as unknown[]) {
    const it = (r && typeof r === "object" ? r : {}) as Pedido
    const c = centavos(it.valor)
    if (c === null) return { ok: false, status: 400, erro: "rateio: cada valor é um número maior que zero, em reais, com no máximo 2 casas decimais." }
    const id = texto(it.loteId), num = texto(it.loteNumero)
    if (!id && !num) return { ok: false, status: 400, erro: "rateio: cada item precisa de loteNumero ou loteId." }
    pedidos.push({ ref: id || num, porId: !!id, centavos: c })
  }
  if (new Set(pedidos.map(p => p.ref)).size !== pedidos.length) return { ok: false, status: 400, erro: "rateio: lote repetido." }
  const soma = pedidos.reduce((s, p) => s + p.centavos, 0)
  if (soma !== total) return { ok: false, status: 400, erro: `rateio: a soma (${soma} centavos) não é igual ao total (${total} centavos). Nada foi gravado; o residual não é acertado automaticamente.` }

  // O hash cobre só o que o chamador mandou (já normalizado), então reenvio idêntico dá o mesmo hash
  const payload = {
    fornecedorId, descricao, totalCentavos: total, dataVencimento: b.dataVencimento, status: b.status, dataPagamento: dataPagamento ?? null,
    rateio: pedidos.map(p => ({ [p.porId ? "loteId" : "loteNumero"]: p.ref, centavos: p.centavos })).sort((a, c) => JSON.stringify(a).localeCompare(JSON.stringify(c))),
  }
  const hash = JSON.stringify(payload)

  const { fornecedores, despesasPorta } = await lerCampos<{ fornecedores?: Fornecedor[]; despesasPorta?: Record<string, Gravada> }>(["fornecedores", "despesasPorta"])
  const anterior = despesasPorta?.[chave]
  const repetida = (g: Gravada): Resultado => g.hash !== hash
    ? { ok: false, status: 409, erro: "chaveIdempotencia já usada com outro payload. Nada foi gravado; use uma chave nova para outra despesa." }
    : g.estado === "gravada" ? { ok: true, resultado: `Despesa "${g.despesa!.descricao}" já registrada com esta chave (nada novo foi gravado).`, despesa: g.despesa!, rateio: g.rateio!, registro: { autor: g.autor, em: g.em, emIso: g.emIso, chaveIdempotencia: chave } }
    : { ok: false, status: 409, erro: "Esta chave está em gravação por outra chamada. Tente de novo em instantes." }
  if (anterior && !(anterior.estado === "falhou" && anterior.hash === hash)) return repetida(anterior)

  if (!(fornecedores ?? []).some(f => f.id === fornecedorId)) return { ok: false, status: 404, erro: `Fornecedor ${fornecedorId} não encontrado em AppConfig.fornecedores.` }
  const itens: Item[] = []
  for (const p of pedidos) {
    const { data } = await supabase.from("KanbanCard").select("id, loteId, loteNumero").eq(p.porId ? "loteId" : "loteNumero", p.ref)
    const card = ((data ?? []) as { loteId?: string | null; loteNumero?: string | null }[]).find(c => c.loteId)
    if (!card) return { ok: false, status: 404, erro: `Lote ${p.ref} não encontrado no kanban. Nada foi gravado.` }
    itens.push({ loteId: card.loteId!, loteNumero: card.loteNumero ?? "", centavos: p.centavos })
  }
  if (new Set(itens.map(i => i.loteId)).size !== itens.length) return { ok: false, status: 400, erro: "rateio: lote repetido (loteNumero e loteId apontam para o mesmo lote)." }

  // Reserva atômica da chave: se outra chamada entrou antes, devolve o resultado dela (ou 409)
  const agora = new Date(), em = brasilia(agora), emIso = agora.toISOString()
  let concorrente: Gravada | null = null
  await mudarConfig<{ despesasPorta?: Record<string, Gravada> }>(cfg => {
    concorrente = null
    const a = cfg.despesasPorta?.[chave]
    if (a && !(a.estado === "falhou" && a.hash === hash)) { concorrente = a; return null }
    return { despesasPorta: { ...(cfg.despesasPorta ?? {}), [chave]: { estado: "gravando", hash, autor: diretor, em, emIso, payload } } }
  })
  if (concorrente) return repetida(concorrente)

  const grupo = randomUUID()
  const marca = `[rateio ${grupo}; lançado por ${diretor} em ${em}]`
  const linhas = itens.map(i => ({
    id: randomUUID(), tipo: "despesa", descricao, valor: reais(i.centavos), dataVencimento: b.dataVencimento, status: b.status,
    ...(dataPagamento ? { dataPagamento } : {}), fornecedorId, loteId: i.loteId, loteNumero: i.loteNumero,
    criadoEm: agora.toLocaleString("pt-BR"), obs: marca,
  }))
  const falhar = async (erro: string): Promise<Resultado> => {
    await mudarConfig<{ despesasPorta?: Record<string, Gravada> }>(cfg => ({ despesasPorta: { ...(cfg.despesasPorta ?? {}), [chave]: { ...cfg.despesasPorta![chave], estado: "falhou" } } })).catch(() => null)
    return { ok: false, status: 500, erro: `Não gravou: ${erro}` }
  }
  // Colunas aditivas (migração 20261128_lancamento_rateio.sql); se ainda não existem, grava sem elas (o grupo fica em obs e no registro)
  let ins = await supabase.from("LancamentoFinanceiro").insert(linhas.map(l => ({ ...l, rateioGrupoId: grupo, criadoPor: diretor })))
  if (ins.error) ins = await supabase.from("LancamentoFinanceiro").insert(linhas)
  if (ins.error) return falhar(ins.error.message)

  const despesa = { id: grupo, descricao, fornecedorId, total: reais(total), status: b.status as string, dataVencimento: b.dataVencimento as string, ...(dataPagamento ? { dataPagamento } : {}) }
  const rateio: Fatia[] = linhas.map(l => ({ lancamentoId: l.id, loteId: l.loteId, loteNumero: l.loteNumero || null, valor: l.valor }))
  try {
    await mudarConfig<{ despesasPorta?: Record<string, Gravada> }>(cfg => ({ despesasPorta: { ...(cfg.despesasPorta ?? {}), [chave]: { estado: "gravada", hash, autor: diretor, em, emIso, payload, despesa, rateio } } }))
  } catch { /* as linhas já estão gravadas; a reserva continua "gravando" e uma repetição volta 409 em vez de duplicar */ }
  return { ok: true, resultado: `Despesa "${descricao}" (R$ ${reais(total)}) lançada e rateada em ${rateio.length} lote(s), uma fatia por lote.`, despesa, rateio, registro: { autor: diretor, em, emIso, chaveIdempotencia: chave } }
}
