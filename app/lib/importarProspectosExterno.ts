// Porta externa: `acao=importar_prospectos` (só CCO e CMO). Grava direto em prospectos_parceiros, sem enviar nada.
// Mesma normalização de telefone (chaveTelefone) e mesma deduplicação do Prospector: CNPJ, telefone e e-mail.
// Quem já está na lista de exclusão (opt_out ou descartado) é recusado e nunca é reaberto.
import { supabase } from "./supabase"
import { podeAcionarComercial } from "./ordemComercial"
import { chaveTelefone, emailValido } from "./prospectorEnvio"
import type { IdDiretor } from "./diretoria"

export const MAX_ITENS_IMPORTACAO = 200
const POR_PAGINA = 1000
const MAX_PAGINAS = 20

type Existente = { id: number; cnpj: string; telefone: string | null; email: string | null; opt_out: boolean; etapa: string }
type Criado = { id: number | null; nome: string; cnpj: string }
type Duplicado = { nome: string; motivo: string; id: number }
type Recusado = { nome: string; motivo: string }
export type ResultadoImportacao =
  | { ok: true; resultado: string; criados: Criado[]; duplicados: Duplicado[]; recusados: Recusado[] }
  | { ok: false; status: number; erro: string }

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

async function existentes(): Promise<Existente[]> {
  const todos: Existente[] = []
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = await supabase.from("prospectos_parceiros").select("id, cnpj, telefone, email, opt_out, etapa").range(p * POR_PAGINA, (p + 1) * POR_PAGINA - 1)
    if (error) throw new Error(error.message)
    todos.push(...((data ?? []) as Existente[]))
    if (!data || data.length < POR_PAGINA) break
  }
  return todos
}

export async function importarProspectos(diretor: IdDiretor, b: Record<string, unknown>, agora: Date = new Date()): Promise<ResultadoImportacao> {
  if (!podeAcionarComercial(diretor)) return { ok: false, status: 403, erro: "importar_prospectos é só para as chaves do CCO e da CMO." }
  if (!Array.isArray(b.itens) || b.itens.length === 0) return { ok: false, status: 400, erro: "Mande itens: [{ nome, cnpj, email?, celular?, cidade?, origem }]." }
  if (b.itens.length > MAX_ITENS_IMPORTACAO) return { ok: false, status: 400, erro: `No máximo ${MAX_ITENS_IMPORTACAO} itens por chamada.` }

  let base: Existente[]
  try { base = await existentes() } catch (e) { return { ok: false, status: 503, erro: `Não consegui ler os prospectos: ${e instanceof Error ? e.message : String(e)}. Nada foi gravado.` } }
  const porCnpj = new Map<string, Existente>(), porTel = new Map<string, Existente>(), porEmail = new Map<string, Existente>()
  for (const x of base) {
    porCnpj.set(x.cnpj, x)
    const t = chaveTelefone(x.telefone); if (t.length >= 10) porTel.set(t, x)
    const m = emailValido(x.email); if (m) porEmail.set(m, x)
  }

  const criados: Criado[] = [], duplicados: Duplicado[] = [], recusados: Recusado[] = []
  const novos: { linha: Record<string, unknown>; nome: string }[] = []
  const vistoCnpj = new Set<string>(), vistoTel = new Set<string>(), vistoEmail = new Set<string>()

  for (const it of b.itens as unknown[]) {
    const x = (it && typeof it === "object" ? it : {}) as Record<string, unknown>
    const nome = texto(x.nome, 200)
    const recusa = (motivo: string) => recusados.push({ nome: nome || "(sem nome)", motivo })
    if (nome.length < 2) { recusa("nome obrigatório"); continue }
    const origem = texto(x.origem, 60)
    if (!origem) { recusa("origem obrigatória"); continue }
    const cnpj = String(x.cnpj ?? "").replace(/\D/g, "")
    if (cnpj.length !== 14) { recusa("CNPJ obrigatório, com 14 dígitos"); continue }
    const emailBruto = texto(x.email, 200), email = emailBruto ? emailValido(emailBruto) : null
    if (emailBruto && !email) { recusa("e-mail inválido"); continue }
    const celBruto = String(x.celular ?? "").replace(/\D/g, "")
    const tel = celBruto ? chaveTelefone(celBruto.length <= 11 ? `55${celBruto}` : celBruto) : ""
    if (celBruto && (tel.length < 10 || tel.length > 11)) { recusa("celular inválido (DDD + número)"); continue }
    const telefone = celBruto ? (celBruto.length >= 12 && celBruto.startsWith("55") ? celBruto.slice(2) : celBruto) : null

    const achados = [porCnpj.get(cnpj), tel ? porTel.get(tel) : undefined, email ? porEmail.get(email) : undefined].filter((e): e is Existente => !!e)
    const excluido = achados.find(e => e.opt_out || e.etapa === "descartado")
    if (excluido) { recusa("na lista de exclusão (descartado ou pediu para não receber)"); continue }
    if (achados.length) {
      const e = achados[0]
      const por = e === porCnpj.get(cnpj) ? "CNPJ" : tel && e === porTel.get(tel) ? "telefone" : "e-mail"
      duplicados.push({ nome, motivo: `já existe (mesmo ${por})`, id: e.id }); continue
    }
    if (vistoCnpj.has(cnpj) || (tel && vistoTel.has(tel)) || (email && vistoEmail.has(email))) { duplicados.push({ nome, motivo: "repetido na própria chamada", id: 0 }); continue }
    vistoCnpj.add(cnpj); if (tel) vistoTel.add(tel); if (email) vistoEmail.add(email)

    const em = agora.toISOString()
    novos.push({
      nome, linha: {
        cnpj, razao_social: nome, nome_fantasia: nome, email, telefone, municipio: texto(x.cidade, 100) || null,
        fonte: `porta externa (${diretor}): ${origem}`, coletado_em: em, nota: null, etapa: "encontrado",
        historico_etapas: [{ etapa: "encontrado", em, motivo: `importado por ${diretor.toUpperCase()} pela porta externa (origem: ${origem})` }],
      },
    })
  }

  if (novos.length) {
    // ignoreDuplicates: se outro processo gravou o mesmo CNPJ no meio, não sobrescreve nada.
    const { data, error } = await supabase.from("prospectos_parceiros").upsert(novos.map(n => n.linha), { onConflict: "cnpj", ignoreDuplicates: true }).select("id, cnpj")
    if (error) return { ok: false, status: 503, erro: `Não gravou: ${error.message}` }
    const gravados = new Map((data ?? []).map((r: { id: number; cnpj: string }) => [r.cnpj, r.id]))
    for (const n of novos) {
      const id = gravados.get(n.linha.cnpj as string)
      if (id != null) criados.push({ id, nome: n.nome, cnpj: n.linha.cnpj as string })
      else duplicados.push({ nome: n.nome, motivo: "já existe (mesmo CNPJ, gravado agora por outro processo)", id: 0 })
    }
  }
  return { ok: true, resultado: `Importação: ${criados.length} criados, ${duplicados.length} duplicados, ${recusados.length} recusados.`, criados, duplicados, recusados }
}
