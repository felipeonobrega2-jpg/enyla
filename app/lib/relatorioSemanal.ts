// Relatório gerencial da semana (segunda a domingo), montado no servidor do mesmo jeito que a tela monta o PDF.
// O servidor da ENYLA (VPS) imprime em PDF toda segunda às 8h e manda de volta para ir por e-mail.
import { supabase } from "./supabase"
import { montarRelatorio, htmlRelatorio, periodoAnterior } from "./relatorioGerencial"
import { extrasDoRelatorio } from "./relatorioExtras"
import { unpackTerceirizado } from "./kanbanUnpack"
import { normalizarProducao } from "./producao"
import { LOGO_DARK_B64 } from "../pdf"
import type { KanbanCard, LancamentoFinanceiro } from "../types"

const iso = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
const meioDia = (s: string) => new Date(`${s}T12:00:00-03:00`)

// Semana passada (segunda a domingo) em relação a hoje, no horário de Brasília
export function semanaPassada(hoje = new Date()): { de: Date; ate: Date; nome: string } {
  const h = meioDia(iso(hoje))
  const dow = (h.getUTCDay() + 6) % 7               // 0 = segunda
  const seg = new Date(h.getTime() - (dow + 7) * 86_400_000)
  const dom = new Date(seg.getTime() + 6 * 86_400_000)
  const f = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })
  return { de: seg, ate: dom, nome: `Semana de ${f(seg)} a ${f(dom)}` }
}

async function todas<T>(tabela: string): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabase.from(tabela).select("*").range(i, i + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    out.push(...((data ?? []) as T[])); if (!data || data.length < 1000) break
  }
  return out
}

export async function htmlRelatorioSemanal(per = semanaPassada()): Promise<{ html: string; nome: string }> {
  const ant = periodoAnterior(per)
  const [kanban, lancamentos, { data: c }, extras] = await Promise.all([
    todas<KanbanCard>("KanbanCard"), todas<LancamentoFinanceiro>("LancamentoFinanceiro"),
    supabase.from("AppConfig").select("categoriasDespesa:data->categoriasDespesa, producao:data->producao").eq("id", 1).single(),
    extrasDoRelatorio(iso(per.de), iso(per.ate), iso(ant.de), iso(ant.ate)).catch(() => null),
  ])
  const cats = ((c as { categoriasDespesa?: { id: string; nome: string }[] } | null)?.categoriasDespesa ?? [])
  const nomeCategoria = (id: string) => cats.find(x => x.id === id)?.nome ?? (id.replace(/[-_]+/g, " ").trim().replace(/^./, m => m.toUpperCase()))
  const impostoPct = normalizarProducao((c as { producao?: never } | null)?.producao).impostoPct
  const dados = montarRelatorio({ kanban: kanban.map(unpackTerceirizado), lancamentos, periodo: per, periodoNome: per.nome, nomeCategoria, impostoPct, extras: extras as never })
  return { html: htmlRelatorio(dados, LOGO_DARK_B64), nome: per.nome }
}
