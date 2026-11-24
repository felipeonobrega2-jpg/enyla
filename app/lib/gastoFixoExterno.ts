// Ação gasto_fixo da porta externa (só a chave do CFO): cadastrar, editar e desativar gastos fixos.
// Os gastos moram em AppConfig.gastosFixos; a gravação é só nesse campo, via mudarConfig. Desativar nunca remove o item.
import type { GastoFixo } from "@/app/config"
import { mudarConfig } from "./configAtomica"

export type Pedido = Record<string, unknown>
export type Resultado = { ok: true; resultado: string; gasto: GastoFixo } | { ok: false; status: 400 | 404; erro: string }
type Gravado = GastoFixo & { alteradoPor?: string; alteradoEm?: string }

const texto = (v: unknown) => typeof v === "string"

// Valida só os campos enviados; devolve o que vale ou a mensagem de erro
function campos(b: Pedido): { ok: true; v: Partial<Gravado> } | { ok: false; erro: string } {
  const v: Partial<Gravado> = {}
  if (b.nome !== undefined) {
    if (!texto(b.nome) || !(b.nome as string).trim()) return { ok: false, erro: "nome: texto não vazio." }
    v.nome = (b.nome as string).trim()
  }
  if (b.valor !== undefined) {
    if (typeof b.valor !== "number" || !Number.isFinite(b.valor) || b.valor <= 0) return { ok: false, erro: "valor: número maior que zero, em reais." }
    v.valor = b.valor
  }
  if (b.diaVencimento !== undefined) {
    if (typeof b.diaVencimento !== "number" || !Number.isInteger(b.diaVencimento) || b.diaVencimento < 1 || b.diaVencimento > 31) return { ok: false, erro: "diaVencimento: inteiro de 1 a 31." }
    v.diaVencimento = b.diaVencimento
  }
  for (const k of ["categoriaId", "contaId", "obs"] as const) {
    if (b[k] === undefined) continue
    if (!texto(b[k])) return { ok: false, erro: `${k}: texto.` }
    v[k] = b[k] as string
  }
  if (b.ativa !== undefined) {
    if (typeof b.ativa !== "boolean") return { ok: false, erro: "ativa: verdadeiro ou falso." }
    v.ativa = b.ativa
  }
  return { ok: true, v }
}

export async function gastoFixo(b: Pedido): Promise<Resultado> {
  const op = b.operacao
  if (op !== "criar" && op !== "editar" && op !== "desativar") return { ok: false, status: 400, erro: "operacao: criar, editar ou desativar." }
  const id = typeof b.id === "string" ? b.id.trim() : ""
  if (op !== "criar" && !id) return { ok: false, status: 400, erro: "id: obrigatório em editar e desativar." }
  const c = op === "desativar" ? { ok: true as const, v: {} } : campos(b)
  if (!c.ok) return { ok: false, status: 400, erro: c.erro }
  if (op === "criar" && (c.v.nome === undefined || c.v.valor === undefined)) return { ok: false, status: 400, erro: "criar exige nome e valor." }

  const em = new Date().toISOString()
  const marca = { alteradoPor: "cfo", alteradoEm: em }
  let achado: Gravado | null = null
  let jaInativo = false
  await mudarConfig<{ gastosFixos?: Gravado[] }>(cfg => {
    achado = null; jaInativo = false
    const lista = cfg.gastosFixos ?? []
    if (op === "criar") {
      achado = { categoriaId: "", diaVencimento: 1, ativa: true, ...c.v, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ...marca } as Gravado
      return { gastosFixos: [...lista, achado] }
    }
    const i = lista.findIndex(g => g.id === id)
    if (i < 0) return null
    if (op === "desativar") {
      if (lista[i].ativa === false) { achado = lista[i]; jaInativo = true; return null }
      achado = { ...lista[i], ativa: false, ...marca }
    } else achado = { ...lista[i], ...c.v, id: lista[i].id, ...marca }
    return { gastosFixos: lista.map((g, k) => k === i ? achado! : g) }
  })
  if (!achado) return { ok: false, status: 404, erro: `Gasto fixo ${id} não encontrado.` }
  const g = achado as Gravado
  const resultado = op === "criar" ? `Gasto fixo "${g.nome}" cadastrado (R$ ${g.valor}, dia ${g.diaVencimento}).`
    : op === "editar" ? `Gasto fixo "${g.nome}" atualizado.`
    : jaInativo ? `Gasto fixo "${g.nome}" já estava desativado.` : `Gasto fixo "${g.nome}" desativado (continua na lista, inativo).`
  return { ok: true, resultado, gasto: g }
}
