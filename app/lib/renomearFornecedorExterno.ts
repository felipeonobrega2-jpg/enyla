// Porta externa, ação renomear_fornecedor (só a chave do CTO): troca só Fornecedor.nome em AppConfig.fornecedores.
// O id e os vínculos (fornecedorId em lançamentos, produção, contas) não mudam. Não cria, não desativa, não apaga.
// Auditoria: AppConfig.renomeacoesFornecedor (chave JSON nova, aditiva) com quem, quando (Brasília) e id, nome anterior e novo.
import type { Fornecedor } from "@/app/config"
import { mudarConfig } from "./configAtomica"
import { brasilia } from "./lancarDespesaExterno"

export type RegistroRenomeacao = { autor: string; em: string; emIso: string; id: string; nomeAnterior: string; nomeNovo: string }
export type Resultado =
  | { ok: true; resultado: string; fornecedor: Fornecedor; registro: RegistroRenomeacao }
  | { ok: false; status: 400 | 404; erro: string }

export async function renomearFornecedorExterno(diretor: string, b: Record<string, unknown>): Promise<Resultado> {
  const id = typeof b.id === "string" ? b.id.trim() : ""
  if (!id) return { ok: false, status: 400, erro: "id: obrigatório (id do fornecedor)." }
  const nome = typeof b.nome === "string" ? b.nome.trim() : ""
  if (!nome) return { ok: false, status: 400, erro: "nome: texto não vazio." }
  if (nome.length > 120) return { ok: false, status: 400, erro: "nome: no máximo 120 caracteres." }
  const agora = new Date()
  let achado: Fornecedor | null = null
  let registro: RegistroRenomeacao | null = null
  await mudarConfig<{ fornecedores?: Fornecedor[]; renomeacoesFornecedor?: RegistroRenomeacao[] }>(cfg => {
    achado = null; registro = null
    const lista = cfg.fornecedores ?? []
    const i = lista.findIndex(f => f.id === id)
    if (i < 0) return null
    registro = { autor: diretor, em: brasilia(agora), emIso: agora.toISOString(), id, nomeAnterior: lista[i].nome, nomeNovo: nome }
    achado = { ...lista[i], nome }
    if (lista[i].nome === nome) return null   // já está com esse nome: nada a gravar
    return { fornecedores: lista.map((f, k) => k === i ? achado! : f), renomeacoesFornecedor: [...(cfg.renomeacoesFornecedor ?? []), registro] }
  })
  if (!achado || !registro) return { ok: false, status: 404, erro: `Fornecedor ${id} não encontrado.` }
  const r = registro as RegistroRenomeacao
  return { ok: true, resultado: r.nomeAnterior === nome ? `Fornecedor ${id} já se chama "${nome}" (nada mudou).` : `Fornecedor ${id} renomeado de "${r.nomeAnterior}" para "${nome}". O id e os vínculos continuam.`, fornecedor: achado, registro: r }
}
