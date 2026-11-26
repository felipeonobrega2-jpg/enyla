// Porta externa, ação cadastrar_fornecedor (só a chave do COO): cria UM fornecedor novo, ativo, em
// AppConfig.producao.fornecedores (o mesmo lugar onde a aprovação de /parceiros grava). Não edita nem apaga fornecedor
// existente e não envia mensagem a ninguém. Mesmo celular de um fornecedor existente: devolve o existente e não altera nada.
// Auditoria: AppConfig.fornecedoresCadastradosPorta (chave JSON aditiva) com quem e quando.
import { mudarConfig } from "./configAtomica"
import { brasilia } from "./lancarDespesaExterno"
import { celularWhatsapp } from "./prospectorEnvio"
import type { FornecedorProducao, RegraCobranca, Servico, TipoRegra } from "./producao"

export type RegistroCadastroFornecedor = { autor: string; em: string; emIso: string; id: string; nome: string }
export type Resultado =
  | { ok: true; resultado: string; criado: boolean; id: string; fornecedor: FornecedorProducao; registro?: RegistroCadastroFornecedor }
  | { ok: false; status: 400 | 403; erro: string }

const SERVICOS_ACEITOS: Record<string, Servico> = {
  impressao: "impressao", verniz: "verniz", corte_vinco: "corteVinco", corteVinco: "corteVinco", colagem: "colagem",
  hot_stamping: "hotStamping", hotStamping: "hotStamping", laminacao: "laminacao",
}
const TIPOS: TipoRegra[] = ["acerto_milheiro", "fixo_chapa", "por_folha", "por_m2", "por_unidade", "por_trabalho"]
const chave = (t: string) => { const d = t.replace(/\D/g, ""); return (d.startsWith("55") && d.length >= 12 ? d.slice(2) : d).slice(-10) }   // DDD + 8 finais (ignora o 9)
const positivo = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0

function regra(nome: string, v: unknown): RegraCobranca | string {
  if (!v || typeof v !== "object" || Array.isArray(v)) return `servicos.${nome}: objeto { tipo, valor?, acerto?, milheiro?, precosPorTipo?, orcarPorPedido? }.`
  const r = v as Record<string, unknown>
  if (!TIPOS.includes(r.tipo as TipoRegra)) return `servicos.${nome}.tipo: ${TIPOS.join(" | ")}.`
  const out: RegraCobranca = { tipo: r.tipo as TipoRegra }
  for (const k of ["acerto", "milheiro", "valor"] as const) {
    if (r[k] === undefined || r[k] === null) continue
    if (!positivo(r[k])) return `servicos.${nome}.${k}: número maior que zero (reais).`
    out[k] = r[k] as number
  }
  if (r.precosPorTipo !== undefined) {
    const p = r.precosPorTipo
    if (!p || typeof p !== "object" || Array.isArray(p) || !Object.values(p).every(positivo)) return `servicos.${nome}.precosPorTipo: { tipo: valor > 0 }.`
    out.precosPorTipo = { ...(p as Record<string, number>) }
  }
  if (r.orcarPorPedido === true) out.orcarPorPedido = true
  return out
}

export async function cadastrarFornecedorExterno(diretor: string, b: Record<string, unknown>, agora = new Date()): Promise<Resultado> {
  if (diretor !== "coo") return { ok: false, status: 403, erro: "cadastrar_fornecedor é só para a chave do COO." }
  const nome = typeof b.nome === "string" ? b.nome.trim() : ""
  if (!nome) return { ok: false, status: 400, erro: "nome: obrigatório." }
  if (nome.length > 120) return { ok: false, status: 400, erro: "nome: no máximo 120 caracteres." }
  if (typeof b.celular !== "string" || !b.celular.trim()) return { ok: false, status: 400, erro: "celular: obrigatório (celular brasileiro com DDD)." }
  const numero = celularWhatsapp(b.celular)
  if (!numero) return { ok: false, status: 400, erro: "celular: use um celular brasileiro válido, com DDD e o 9 (ex.: 11 9XXXX-XXXX)." }
  const texto = (k: "contato" | "obs", max: number): string | undefined | { erro: string } => {
    const v = b[k]
    if (v === undefined || v === null || v === "") return undefined
    if (typeof v !== "string") return { erro: `${k}: texto.` }
    return v.trim().length > max ? { erro: `${k}: no máximo ${max} caracteres.` } : v.trim() || undefined
  }
  const contato = texto("contato", 120), obs = texto("obs", 2000)
  if (typeof contato === "object") return { ok: false, status: 400, erro: contato.erro }
  if (typeof obs === "object") return { ok: false, status: 400, erro: obs.erro }
  let prazoDias = 5
  if (b.prazo !== undefined && b.prazo !== null && b.prazo !== "") {
    if (typeof b.prazo !== "number" || !Number.isInteger(b.prazo) || b.prazo < 1 || b.prazo > 365) return { ok: false, status: 400, erro: "prazo: dias (inteiro de 1 a 365)." }
    prazoDias = b.prazo
  }
  const servicos: Partial<Record<Servico, RegraCobranca>> = {}
  if (b.servicos !== undefined && b.servicos !== null) {
    if (typeof b.servicos !== "object" || Array.isArray(b.servicos)) return { ok: false, status: 400, erro: "servicos: objeto { impressao, verniz, corte_vinco, colagem, hot_stamping, laminacao }." }
    for (const [k, v] of Object.entries(b.servicos)) {
      const s = SERVICOS_ACEITOS[k]
      if (!s) return { ok: false, status: 400, erro: `servicos.${k}: serviço desconhecido. Use ${Object.keys(SERVICOS_ACEITOS).filter(x => !/[A-Z]/.test(x)).join(", ")}.` }
      const r = regra(k, v)
      if (typeof r === "string") return { ok: false, status: 400, erro: r }
      servicos[s] = r
    }
  }

  const emIso = agora.toISOString()
  let existente: FornecedorProducao | null = null
  let criado: FornecedorProducao | null = null
  let registro: RegistroCadastroFornecedor | null = null
  await mudarConfig<{ producao?: { fornecedores?: FornecedorProducao[] }; fornecedoresCadastradosPorta?: RegistroCadastroFornecedor[] }>(cfg => {
    existente = null; criado = null; registro = null
    const lista = cfg.producao?.fornecedores ?? []
    const k = chave(numero)
    existente = lista.find(f => f.telefone && chave(f.telefone) === k) ?? null
    if (existente) return null   // mesmo celular: não duplica e não altera nada
    let id = `f-${agora.getTime().toString(36)}`
    for (let n = 2; lista.some(f => f.id === id); n++) id = `f-${agora.getTime().toString(36)}-${n}`
    criado = { id, nome, ativo: true, servicos, frete: 0, prazoDias, telefone: `+${numero}`, ...(contato ? { contato } : {}), ...(obs ? { obs } : {}) }
    registro = { autor: diretor, em: brasilia(agora), emIso, id, nome }
    return { producao: { ...(cfg.producao ?? {}), fornecedores: [...lista, criado] }, fornecedoresCadastradosPorta: [...(cfg.fornecedoresCadastradosPorta ?? []), registro] }
  })
  if (existente) {
    const e = existente as FornecedorProducao
    return { ok: true, criado: false, id: e.id, fornecedor: e, resultado: `Já existe fornecedor com esse celular: ${e.nome} (${e.id}). Nada foi alterado.` }
  }
  const c = criado as unknown as FornecedorProducao, r = registro as unknown as RegistroCadastroFornecedor
  return { ok: true, criado: true, id: c.id, fornecedor: c, registro: r, resultado: `Fornecedor ${c.nome} cadastrado (${c.id}), ativo. Nenhuma mensagem foi enviada.` }
}
