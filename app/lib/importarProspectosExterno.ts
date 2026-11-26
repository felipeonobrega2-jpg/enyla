// Porta externa: acao=importar_prospectos (só CCO e CMO). Grava direto em prospectos_parceiros (não existe tela de importar CSV:
// app/api/prospector/importar é o cron da Receita). Mesma normalização de telefone (chaveTelefone) e mesma deduplicação por
// CNPJ, telefone e e-mail; respeita a lista de exclusão (opt_out e descartado). Não envia mensagem de nenhum canal.
import { supabase } from "./supabase"
import { podeAcionarComercial } from "./ordemComercial"
import { cnpjValido } from "./documento"
import { chaveTelefone, termoForaDoRamo } from "./prospectorEnvio"
import type { IdDiretor } from "./diretoria"

const TABELA = "prospectos_parceiros"
export const MAX_ITENS_IMPORTAR = 200
const POR_PAGINA = 1000
const MAX_PAGINAS = 20
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type Pedido = Record<string, unknown>
export type Recusado = { indice: number; nome: string; motivo: string }
export type ResultadoImportar =
  | { ok: true; criados: { indice: number; id: number; nome: string }[]; duplicados: Recusado[]; recusados: Recusado[] }
  | { ok: false; status: 400 | 403 | 500; erro: string }

type Existente = { cnpj: string | null; telefone: string | null; email: string | null; etapa: string; opt_out: boolean }
const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "")

async function lerExistentes(): Promise<Existente[]> {
  const out: Existente[] = []
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = await supabase.from(TABELA).select("cnpj, telefone, email, etapa, opt_out").range(p * POR_PAGINA, (p + 1) * POR_PAGINA - 1)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as Existente[]))
    if (!data || data.length < POR_PAGINA) break
  }
  return out
}

export async function importarProspectosExterno(b: Pedido, diretor: IdDiretor, agora: () => Date = () => new Date()): Promise<ResultadoImportar> {
  if (!podeAcionarComercial(diretor)) return { ok: false, status: 403, erro: "importar_prospectos é só para as chaves do CCO e da CMO." }
  if (!Array.isArray(b.itens) || !b.itens.length) return { ok: false, status: 400, erro: "itens: lista não vazia de {nome, cnpj?, email?, celular?, cidade?, origem}." }
  if (b.itens.length > MAX_ITENS_IMPORTAR) return { ok: false, status: 400, erro: `itens: no máximo ${MAX_ITENS_IMPORTAR} por chamada.` }

  let existentes: Existente[]
  try { existentes = await lerExistentes() } catch (e) { return { ok: false, status: 500, erro: `Não consegui ler a base do Prospector: ${e instanceof Error ? e.message : String(e)}` } }
  const porCnpj = new Map<string, Existente>(), porTel = new Map<string, Existente>(), porEmail = new Map<string, Existente>()
  const indexar = (x: Existente) => {
    if (x.cnpj) porCnpj.set(x.cnpj, x)
    const k = chaveTelefone(x.telefone); if (k.length >= 10) porTel.set(k, x)
    if (x.email) porEmail.set(x.email.trim().toLowerCase(), x)
  }
  existentes.forEach(indexar)

  const criados: { indice: number; id: number; nome: string }[] = []
  const duplicados: Recusado[] = [], recusados: Recusado[] = []
  const em = agora().toISOString()

  for (let i = 0; i < b.itens.length; i++) {
    const it = (b.itens[i] && typeof b.itens[i] === "object" ? b.itens[i] : {}) as Pedido
    const nome = txt(it.nome)
    const recusa = (motivo: string) => recusados.push({ indice: i, nome, motivo })
    if (!nome) { recusa("sem nome"); continue }
    const origem = txt(it.origem)
    if (!origem) { recusa("sem origem"); continue }
    const cnpj = txt(it.cnpj).replace(/\D/g, "")
    // CNPJ é opcional; quando vem preenchido tem que ter 14 dígitos válidos.
    if (cnpj && !cnpjValido(cnpj)) { recusa("CNPJ inválido"); continue }
    const celular = txt(it.celular)
    const chaveTel = chaveTelefone(celular)
    if (celular && (chaveTel.length < 10 || chaveTel.length > 11)) { recusa("telefone inválido"); continue }
    const email = txt(it.email).toLowerCase()
    if (email && !EMAIL.test(email)) { recusa("e-mail inválido"); continue }
    // Sem CNPJ, a deduplicação depende do celular e do e-mail: sem nenhum dos três não há como evitar repetição.
    if (!cnpj && !chaveTel && !email) { recusa("sem CNPJ, celular nem e-mail (não há como deduplicar)"); continue }
    if (termoForaDoRamo(nome, null)) { recusa("fora do ramo"); continue }

    const achados = [cnpj ? porCnpj.get(cnpj) : undefined, chaveTel ? porTel.get(chaveTel) : undefined, email ? porEmail.get(email) : undefined].filter((x): x is Existente => !!x)
    const excluido = achados.find(x => x.opt_out || x.etapa === "descartado")
    if (excluido) { recusa(excluido.opt_out ? "lista de exclusão (pediu para não receber)" : "descartado antes (lista de exclusão)"); continue }
    if (achados.length) {
      const por = cnpj && achados[0] === porCnpj.get(cnpj) ? "CNPJ" : chaveTel && achados[0] === porTel.get(chaveTel) ? "telefone" : "e-mail"
      duplicados.push({ indice: i, nome, motivo: `já existe (mesmo ${por})` }); continue
    }

    const cidade = txt(it.cidade)
    const linha = {
      cnpj: cnpj || null, razao_social: nome, nome_fantasia: null, municipio: cidade || null, email: email || null, telefone: celular ? celular.replace(/\D/g, "") : null,
      fonte: `importação manual (${origem})`, coletado_em: em, etapa: "encontrado",
      historico_etapas: [{ etapa: "encontrado", em, motivo: `importado por ${diretor.toUpperCase()} pela porta externa (origem: ${origem})` }],
    }
    const { data, error } = cnpj
      ? await supabase.from(TABELA).upsert(linha, { onConflict: "cnpj", ignoreDuplicates: true }).select("id")
      : await supabase.from(TABELA).insert(linha).select("id")
    if (error) { recusa(`erro ao gravar: ${error.message}`); continue }
    if (!data?.length) { duplicados.push({ indice: i, nome, motivo: "já existe (mesmo CNPJ)" }); continue }
    criados.push({ indice: i, id: (data[0] as { id: number }).id, nome })
    indexar({ cnpj: cnpj || null, telefone: linha.telefone, email: linha.email, etapa: "encontrado", opt_out: false })
  }
  return { ok: true, criados, duplicados, recusados }
}
