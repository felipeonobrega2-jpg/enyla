// Porta externa, ações lancar_despesa e renomear_fornecedor (só as chaves do CTO e do CFO).
// lancar_despesa: UMA despesa (um total) rateada por lote. O livro (LancamentoFinanceiro) guarda um lançamento por lote, e cada
// linha leva só a FATIA do lote (nunca o valor cheio), com um id de grupo compartilhado (prefixo do id): somar as fatias dá o total
// uma vez em custoDireto, a pagar, caixa e DRE. Soma conferida em centavos inteiros; nada é "acertado" sozinho.
// Idempotência e auditoria ficam no AppConfig (chaves JSON novas, sem migração): despesasRateadas (por chaveIdempotencia, com quem,
// quando e o payload) e fornecedoresRenomeados (lista só de acréscimo). Status "pago" é só baixa no livro: não paga nada, não chama
// Asaas, Pluggy nem banco. Não envia mensagem e não apaga nada (sem delete).
import { createHash } from "crypto"
import type { Fornecedor } from "@/app/config"
import { lerCampos, mudarConfig } from "./configAtomica"
import { supabase } from "./supabase"

export type Pedido = Record<string, unknown>
type Falha = { ok: false; status: 400 | 403 | 404 | 409 | 500; erro: string }
export type ResultadoDespesa = { ok: true; resultado: string; despesa: Despesa; rateio: Fatia[]; registro: Registro } | Falha
export type ResultadoRenomear = { ok: true; resultado: string; fornecedor: { id: string; nome: string; nomeAnterior: string }; registro: Registro } | Falha
export type Despesa = { id: string; fornecedorId: string; descricao: string; total: number; status: "pago" | "pendente"; dataVencimento: string; dataPagamento?: string }
export type Fatia = { id: string; loteId?: string; loteNumero?: string; valor: number }
export type Registro = { por: string; em: string; emBrasilia: string; chaveIdempotencia?: string; payload: unknown }
type Guardada = { hash: string; estado: "gravando" | "gravado"; despesa: Despesa; rateio: Fatia[]; registro: Registro }

const PODEM = ["cto", "cfo"]
const DATA = /^\d{4}-\d{2}-\d{2}$/
const FORMAS = ["pix", "boleto", "cartao_credito", "cartao_debito", "dinheiro", "transferencia", "outro", "conta"]
const dataOk = (v: unknown): v is string => typeof v === "string" && DATA.test(v) && !Number.isNaN(Date.parse(v))
const texto = (v: unknown) => typeof v === "string" ? v.trim() : ""

// Reais → centavos inteiros. Recusa mais de 2 casas decimais (não arredonda em silêncio).
export function emCentavos(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null
  const c = Math.round(v * 100)
  return Math.abs(v * 100 - c) < 1e-6 && c > 0 ? c : null
}
const reais = (c: number) => c / 100

const agora = () => { const d = new Date(); return { em: d.toISOString(), emBrasilia: d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) } }
const hash = (o: unknown) => createHash("sha256").update(JSON.stringify(o)).digest("hex")

type LoteRef = { loteNumero?: string; loteId?: string }
type Entrada = { loteNumero?: string; loteId?: string; centavos: number }

export async function lancarDespesa(diretor: string, b: Pedido): Promise<ResultadoDespesa> {
  if (!PODEM.includes(diretor)) return { ok: false, status: 403, erro: "lancar_despesa é só para as chaves do CTO e do CFO." }
  const chave = texto(b.chaveIdempotencia)
  if (!chave || chave.length > 120) return { ok: false, status: 400, erro: "chaveIdempotencia: texto não vazio (até 120 caracteres)." }
  const fornecedorId = texto(b.fornecedorId)
  if (!fornecedorId) return { ok: false, status: 400, erro: "fornecedorId: obrigatório." }
  const descricao = texto(b.descricao)
  if (!descricao) return { ok: false, status: 400, erro: "descricao: texto não vazio." }
  const total = emCentavos(b.valor)
  if (total === null) return { ok: false, status: 400, erro: "valor: total em reais, maior que zero e com no máximo 2 casas decimais." }
  if (b.status !== "pago" && b.status !== "pendente") return { ok: false, status: 400, erro: "status: pago ou pendente." }
  if (!dataOk(b.dataVencimento)) return { ok: false, status: 400, erro: "dataVencimento: data AAAA-MM-DD." }
  if (b.dataPagamento !== undefined && !dataOk(b.dataPagamento)) return { ok: false, status: 400, erro: "dataPagamento: data AAAA-MM-DD." }
  if (b.status === "pendente" && b.dataPagamento !== undefined) return { ok: false, status: 400, erro: "dataPagamento só vale com status pago." }
  if (b.formaPagamento !== undefined && !FORMAS.includes(b.formaPagamento as string)) return { ok: false, status: 400, erro: `formaPagamento: ${FORMAS.join(", ")}.` }
  for (const k of ["categoria", "subcategoria", "contaId", "obs"]) if (b[k] !== undefined && typeof b[k] !== "string") return { ok: false, status: 400, erro: `${k}: texto.` }
  if (!Array.isArray(b.rateio) || !b.rateio.length) return { ok: false, status: 400, erro: "rateio: lista [{ loteNumero | loteId, valor }] com ao menos um lote." }

  const entradas: Entrada[] = []
  for (const [i, r] of (b.rateio as unknown[]).entries()) {
    const x = (r && typeof r === "object" ? r : {}) as Record<string, unknown>
    const loteNumero = texto(x.loteNumero), loteId = texto(x.loteId)
    if (!loteNumero && !loteId) return { ok: false, status: 400, erro: `rateio[${i}]: informe loteNumero ou loteId.` }
    const centavos = emCentavos(x.valor)
    if (centavos === null) return { ok: false, status: 400, erro: `rateio[${i}].valor: maior que zero, em reais, com no máximo 2 casas decimais.` }
    entradas.push({ ...(loteNumero ? { loteNumero } : {}), ...(loteId ? { loteId } : {}), centavos })
  }
  const soma = entradas.reduce((s, e) => s + e.centavos, 0)
  if (soma !== total) return { ok: false, status: 400, erro: `A soma do rateio (${soma} centavos) não é igual ao total (${total} centavos). Nada foi gravado; corrija o rateio.` }

  const payload = {
    fornecedorId, descricao, total, status: b.status, dataVencimento: b.dataVencimento, dataPagamento: b.dataPagamento ?? null,
    formaPagamento: b.formaPagamento ?? null, categoria: b.categoria ?? null, subcategoria: b.subcategoria ?? null, contaId: b.contaId ?? null, obs: b.obs ?? null,
    rateio: entradas.map(e => ({ loteNumero: e.loteNumero ?? null, loteId: e.loteId ?? null, centavos: e.centavos })).sort((a, c) => JSON.stringify(a).localeCompare(JSON.stringify(c))),
  }
  const h = hash(payload)

  // Idempotência: mesma chave + mesmo payload devolve o original; payload diferente é 409.
  const { despesasRateadas } = await lerCampos<{ despesasRateadas?: Record<string, Guardada> }>(["despesasRateadas"])
  const previa = despesasRateadas?.[chave]
  if (previa) {
    if (previa.hash !== h) return { ok: false, status: 409, erro: "Essa chaveIdempotencia já foi usada com outro conteúdo. Nada foi gravado; use uma chave nova." }
    if (previa.estado === "gravado") return { ok: true, resultado: `Despesa "${descricao}" já registrada com essa chave (nada novo foi gravado).`, despesa: previa.despesa, rateio: previa.rateio, registro: previa.registro }
  }

  const { fornecedores } = await lerCampos<{ fornecedores?: Fornecedor[] }>(["fornecedores"])
  if (!(fornecedores ?? []).some(f => f.id === fornecedorId)) return { ok: false, status: 404, erro: `Fornecedor ${fornecedorId} não encontrado.` }

  // Resolve cada lote no kanban (nenhum lote inexistente: 404 e nada gravado) e recusa lote repetido (mesmo lote por número e por id).
  const lotes: LoteRef[] = []
  for (const e of entradas) {
    const { data } = await supabase.from("KanbanCard").select("loteId, loteNumero").eq(e.loteNumero ? "loteNumero" : "loteId", e.loteNumero ?? e.loteId!)
    const card = ((data ?? []) as { loteId?: string | null; loteNumero?: string | null }[]).find(c => (!e.loteId || c.loteId === e.loteId) && (!e.loteNumero || c.loteNumero === e.loteNumero))
    if (!card) return { ok: false, status: 404, erro: `Lote ${e.loteNumero ?? e.loteId} não encontrado.` }
    lotes.push({ ...(card.loteId ? { loteId: card.loteId } : {}), ...(card.loteNumero ? { loteNumero: card.loteNumero } : {}) })
  }
  const vistos = new Set<string>()
  for (const l of lotes) {
    const k = l.loteId ?? `n:${l.loteNumero}`
    if (vistos.has(k)) return { ok: false, status: 400, erro: `Lote ${l.loteNumero ?? l.loteId} repetido no rateio. Junte numa fatia só.` }
    vistos.add(k)
  }

  const grupo = `desp-${h.slice(0, 8)}-${createHash("sha256").update(chave).digest("hex").slice(0, 12)}`
  const por = diretor, { em, emBrasilia } = agora()
  const despesa: Despesa = { id: grupo, fornecedorId, descricao, total: reais(total), status: b.status, dataVencimento: b.dataVencimento as string, ...(b.status === "pago" ? { dataPagamento: (b.dataPagamento as string | undefined) ?? (b.dataVencimento as string) } : {}) }
  const rateio: Fatia[] = lotes.map((l, i) => ({ id: `${grupo}-${i + 1}`, ...l, valor: reais(entradas[i].centavos) }))
  const registro: Registro = { por, em, emBrasilia, chaveIdempotencia: chave, payload: b }

  // Reserva a chave de forma atômica antes de gravar (duas chamadas iguais ao mesmo tempo não criam duas despesas).
  const box: { r?: Guardada } = {}
  await mudarConfig<{ despesasRateadas?: Record<string, Guardada> }>(cfg => {
    box.r = cfg.despesasRateadas?.[chave]
    if (box.r) return null
    return { despesasRateadas: { ...(cfg.despesasRateadas ?? {}), [chave]: { hash: h, estado: "gravando", despesa, rateio, registro } } }
  })
  const reservada = box.r
  if (reservada) {
    if (reservada.hash !== h) return { ok: false, status: 409, erro: "Essa chaveIdempotencia já foi usada com outro conteúdo. Nada foi gravado; use uma chave nova." }
    if (reservada.estado === "gravado") return { ok: true, resultado: `Despesa "${descricao}" já registrada com essa chave (nada novo foi gravado).`, despesa: reservada.despesa, rateio: reservada.rateio, registro: reservada.registro }
  }
  const final = reservada ?? { despesa, rateio, registro }   // se a reserva é de uma tentativa anterior interrompida, reaproveita os mesmos ids

  const criadoEm = new Date().toLocaleString("pt-BR")
  const linhas = final.rateio.map((f, i) => ({
    id: f.id, tipo: "despesa", descricao, valor: f.valor, status: b.status, dataVencimento: final.despesa.dataVencimento,
    ...(final.despesa.dataPagamento ? { dataPagamento: final.despesa.dataPagamento } : {}),
    fornecedorId, ...(f.loteId ? { loteId: f.loteId } : {}), ...(f.loteNumero ? { loteNumero: f.loteNumero } : {}),
    ...(b.formaPagamento ? { formaPagamento: b.formaPagamento } : {}), ...(b.categoria ? { categoria: b.categoria } : {}), ...(b.subcategoria ? { subcategoria: b.subcategoria } : {}), ...(b.contaId ? { contaId: b.contaId } : {}),
    obs: `${texto(b.obs)} [rateio ${final.despesa.id}: fatia ${i + 1}/${final.rateio.length} de R$ ${final.despesa.total.toFixed(2)}; por ${por} em ${final.registro.emBrasilia}]`.trim(),
    criadoEm,
  }))
  const { error } = await supabase.from("LancamentoFinanceiro").insert(linhas)
  if (error && (error as { code?: string }).code !== "23505") return { ok: false, status: 500, erro: `Não gravou: ${error.message}. Pode repetir com a mesma chave.` }
  await mudarConfig<{ despesasRateadas?: Record<string, Guardada> }>(cfg => {
    const g = cfg.despesasRateadas?.[chave]
    return g ? { despesasRateadas: { ...cfg.despesasRateadas, [chave]: { ...g, estado: "gravado" } } } : null
  })
  return { ok: true, resultado: `Despesa "${descricao}" (R$ ${final.despesa.total.toFixed(2)}) lançada e rateada em ${final.rateio.length} lote(s).`, ...final }
}

export async function renomearFornecedor(diretor: string, b: Pedido): Promise<ResultadoRenomear> {
  if (!PODEM.includes(diretor)) return { ok: false, status: 403, erro: "renomear_fornecedor é só para as chaves do CTO e do CFO." }
  const id = texto(b.id), nome = texto(b.nome)
  if (!id) return { ok: false, status: 400, erro: "id: obrigatório." }
  if (!nome || nome.length > 80) return { ok: false, status: 400, erro: "nome: texto não vazio (até 80 caracteres)." }
  const { em, emBrasilia } = agora()
  const box: { anterior: string | null } = { anterior: null }
  const registro: Registro = { por: diretor, em, emBrasilia, payload: { id, nomeAnterior: "", nomeNovo: nome } }
  await mudarConfig<{ fornecedores?: Fornecedor[]; fornecedoresRenomeados?: Registro[] }>(cfg => {
    box.anterior = null
    const lista = cfg.fornecedores ?? []
    const i = lista.findIndex(f => f.id === id)
    if (i < 0) return null
    box.anterior = lista[i].nome
    ;(registro.payload as { nomeAnterior: string }).nomeAnterior = box.anterior
    // só o nome exibido muda: id e vínculos (fornecedorId em lançamentos, movimentos, contas) ficam como estão
    return { fornecedores: lista.map((f, j) => j === i ? { ...f, nome } : f), fornecedoresRenomeados: [...(cfg.fornecedoresRenomeados ?? []), registro] }
  })
  const anterior = box.anterior
  if (anterior === null) return { ok: false, status: 404, erro: `Fornecedor ${id} não encontrado.` }
  return { ok: true, resultado: `Fornecedor ${id} renomeado de "${anterior}" para "${nome}".`, fornecedor: { id, nome, nomeAnterior: anterior }, registro }
}
