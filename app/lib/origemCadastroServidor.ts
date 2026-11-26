// Origem do cadastro em /parceiros: quem veio da prospecção (Prospector) é marcado `origem: "prospector"`, ligado ao
// prospecto (`prospectoId`) e o funil anda para "cadastrou" (e "respondeu", se ainda estava antes). O casamento é pelo
// telefone (sem 55 e sem o 9 extra) ou pelo CNPJ. O id que vem no link (?o=prospector&p=) só vale se o prospecto existe.
// Nunca apaga nem sobrescreve cadastro: só acrescenta origem e prospectoId. Não envia mensagem.
import { supabase } from "./supabase"
import { mudarConfig, lerCampos } from "./configAtomica"
import { chaveTelefone } from "./prospectorEnvio"
import type { CadastroParceiro } from "./parceiros"

export type ProspectoChave = { id: number | string; telefone: string | null; cnpj: string | null }

const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "")

/** O prospecto do mesmo telefone ou CNPJ. Telefone curto demais não casa. Puro. */
export function casarProspecto(c: Pick<CadastroParceiro, "whatsapp" | "documento" | "tipoDocumento">, prospectos: ProspectoChave[]): ProspectoChave | null {
  const chave = chaveTelefone(c.whatsapp)
  const cnpj = c.tipoDocumento === "cnpj" ? soDigitos(c.documento) : ""
  return prospectos.find(p => cnpj.length === 14 && soDigitos(p.cnpj) === cnpj)
    ?? (chave.length >= 10 ? prospectos.find(p => chaveTelefone(p.telefone) === chave) : undefined)
    ?? null
}

const POR_PAGINA = 1000
const MAX_PAGINAS = 20
export async function listarProspectosParaCasar(): Promise<ProspectoChave[]> {
  const todos: ProspectoChave[] = []
  try {
    for (let p = 0; p < MAX_PAGINAS; p++) {
      const { data, error } = await supabase.from("prospectos_parceiros").select("id, telefone, cnpj").range(p * POR_PAGINA, (p + 1) * POR_PAGINA - 1)
      if (error || !data) break
      todos.push(...(data as ProspectoChave[]))
      if (data.length < POR_PAGINA) break
    }
  } catch { /* sem tabela: sem prospectos */ }
  return todos
}

/** Decide a origem de um cadastro. Casou por telefone/CNPJ: prospector, ligado e com avanço de etapa. Só o id do link
 *  (que existe): prospector e ligado, sem avançar a etapa. Senão: nada (fica direto). Puro. */
export function origemDoCadastro(c: Pick<CadastroParceiro, "whatsapp" | "documento" | "tipoDocumento">, prospectos: ProspectoChave[], dica?: { origem?: string; prospectoId?: string }): { prospecto: ProspectoChave; avanca: boolean } | null {
  const achou = casarProspecto(c, prospectos)
  if (achou) return { prospecto: achou, avanca: true }
  if (dica?.origem === "prospector" && dica.prospectoId) {
    const p = prospectos.find(x => String(x.id) === dica.prospectoId)
    if (p) return { prospecto: p, avanca: false }
  }
  return null
}

export type ResultadoCorrecao = { examinados: number; corrigidos: number; etapasAvancadas: number; simulado: boolean; ids: { cadastro: string; prospecto: number | string }[] }

/** Correção retroativa: cadastros sem origem "prospector" cujo telefone ou CNPJ bate com um prospecto ganham origem e
 *  prospectoId, e o funil anda. Só acrescenta (nunca apaga nem troca dado); cadastro já ligado fica como está. */
export async function corrigirOrigemRetroativa(opcoes: { simular?: boolean } = {}): Promise<ResultadoCorrecao> {
  const simulado = opcoes.simular === true
  const cfg = await lerCampos<{ cadastrosParceiros?: CadastroParceiro[] }>(["cadastrosParceiros"])
  const lista = cfg.cadastrosParceiros ?? []
  const prospectos = await listarProspectosParaCasar()
  const achados = lista.filter(c => c.origem !== "prospector" || c.prospectoId == null).flatMap(c => {
    const p = casarProspecto(c, prospectos)
    return p ? [{ cadastro: c.id, prospecto: p.id }] : []
  })
  let etapasAvancadas = 0
  if (!simulado && achados.length) {
    const statusDe = new Map(lista.map(c => [c.id, c.status]))
    const porId = new Map(achados.map(a => [a.cadastro, a.prospecto]))
    await mudarConfig((d: { cadastrosParceiros?: CadastroParceiro[] }) => ({
      cadastrosParceiros: (d.cadastrosParceiros ?? []).map(c => porId.has(c.id) && (c.origem !== "prospector" || c.prospectoId == null) ? { ...c, origem: "prospector" as const, prospectoId: porId.get(c.id) } : c),
    }))
    const { avancarProspectoPeloCadastro } = await import("./prospectorServidor")
    for (const a of achados) if (statusDe.get(a.cadastro) !== "recusado" && await avancarProspectoPeloCadastro(a.prospecto, a.cadastro)) etapasAvancadas++
  }
  return { examinados: lista.length, corrigidos: simulado ? 0 : achados.length, etapasAvancadas, simulado, ids: achados }
}
