// Ação categoria da porta externa (só a chave do CFO): criar, editar e desativar categorias financeiras.
// Vivem em AppConfig.categoriasReceita / categoriasDespesa, gravadas via mudarConfig. Desativar só põe ativa:false.
import type { CategoriaFinanceira } from "@/app/config"
import { mudarConfig } from "./configAtomica"

export type Pedido = Record<string, unknown>
export type Resultado = { ok: true; resultado: string; categoria: CategoriaFinanceira } | { ok: false; status: 400 | 404; erro: string }
type Gravada = CategoriaFinanceira & { alteradoPor?: string; alteradoEm?: string }

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "categoria"

export async function categoria(b: Pedido): Promise<Resultado> {
  const op = b.operacao
  if (op !== "criar" && op !== "editar" && op !== "desativar") return { ok: false, status: 400, erro: "operacao: criar, editar ou desativar." }
  if (b.tipo !== "receita" && b.tipo !== "despesa") return { ok: false, status: 400, erro: "tipo: receita ou despesa." }
  const campo = b.tipo === "receita" ? "categoriasReceita" : "categoriasDespesa"
  const id = typeof b.id === "string" ? b.id.trim() : ""
  if (op !== "criar" && !id) return { ok: false, status: 400, erro: "id: obrigatório em editar e desativar." }
  let nome: string | undefined
  if (b.nome !== undefined) {
    if (typeof b.nome !== "string" || !b.nome.trim()) return { ok: false, status: 400, erro: "nome: texto não vazio." }
    nome = b.nome.trim().slice(0, 60)
  }
  let subs: string[] | undefined
  if (b.subcategorias !== undefined) {
    if (!Array.isArray(b.subcategorias) || b.subcategorias.some(s => typeof s !== "string" || !s.trim())) return { ok: false, status: 400, erro: "subcategorias: lista de textos não vazios." }
    subs = (b.subcategorias as string[]).map(s => s.trim().slice(0, 60))
  }
  let ativa: boolean | undefined
  if (b.ativa !== undefined) { if (typeof b.ativa !== "boolean") return { ok: false, status: 400, erro: "ativa: verdadeiro ou falso." }; ativa = b.ativa }
  if (op === "criar" && !nome) return { ok: false, status: 400, erro: "criar exige nome." }
  if (op === "editar" && nome === undefined && subs === undefined && ativa === undefined) return { ok: false, status: 400, erro: "editar: mande nome, subcategorias ou ativa." }

  const marca = { alteradoPor: "cfo", alteradoEm: new Date().toISOString() }
  let achada: Gravada | null = null
  let jaInativa = false
  await mudarConfig<Record<string, Gravada[] | undefined>>(cfg => {
    achada = null; jaInativa = false
    const lista = cfg[campo] ?? []
    if (op === "criar") {
      let novo = slug(nome!)
      for (let i = 2; lista.some(c => c.id === novo); i++) novo = `${slug(nome!)}-${i}`
      achada = { id: novo, nome: nome!, ...(subs ? { subcategorias: subs } : {}), ativa: true, ...marca }
      return { [campo]: [...lista, achada] }
    }
    const i = lista.findIndex(c => c.id === id)
    if (i < 0) return null
    if (op === "desativar") {
      if (lista[i].ativa === false) { achada = lista[i]; jaInativa = true; return null }
      achada = { ...lista[i], ativa: false, ...marca }
    } else achada = { ...lista[i], ...(nome !== undefined ? { nome } : {}), ...(subs !== undefined ? { subcategorias: subs } : {}), ...(ativa !== undefined ? { ativa } : {}), id: lista[i].id, ...marca }
    return { [campo]: lista.map((c, k) => k === i ? achada! : c), categoriasMudadasEm: marca.alteradoEm }
  })
  if (!achada) return { ok: false, status: 404, erro: `Categoria ${id} não encontrada em ${b.tipo}.` }
  const c = achada as Gravada
  const resultado = op === "criar" ? `Categoria "${c.nome}" criada em ${b.tipo}.` : op === "editar" ? `Categoria "${c.nome}" atualizada.`
    : jaInativa ? `Categoria "${c.nome}" já estava desativada.` : `Categoria "${c.nome}" desativada (continua na lista, inativa).`
  return { ok: true, resultado, categoria: c }
}
