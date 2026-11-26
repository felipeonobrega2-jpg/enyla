import type { Calculo, FormData, KanbanCard, PropostaCustom } from "../types"
import { parseData } from "./negocio"

// Filtro de exibição da lista de orçamentos. Não altera status nem dados.
export const DIAS_ANTIGA_SEM_CARD = 60
const DIA_MS = 24 * 60 * 60 * 1000

export function precoHist(item: { form: FormData; calculo: Calculo }) {
  const ideal = item.calculo.tabela.find(l => l.quantidade === item.calculo.sweetSpotIdealQtd) ?? item.calculo.tabela[0]
  return { preco: item.form.comFaca ? (ideal?.precoComFaca ?? 0) : (ideal?.precoSemFaca ?? 0), qtd: ideal?.quantidade ?? 0 }
}

export function precoProposta(p: PropostaCustom) {
  const ativas = p.linhas.filter(l => l.ativa && l.quantidade > 0)
  const ideal = ativas.find(l => l.isIdeal) ?? ativas[ativas.length - 1]
  return { preco: ideal ? ideal.unitario * ideal.quantidade : 0, qtd: ideal?.quantidade ?? 0 }
}

// Antiga sem card: sem card vinculado E sem valor E criada há mais de 60 dias.
// Data ilegível não conta como antiga (na dúvida, continua visível em "Em aberto").
export function antigaSemCard(
  e: { card?: KanbanCard | null; preco: number; data: string },
  hoje: Date = new Date(),
): boolean {
  if (e.card || e.preco > 0) return false
  const d = parseData(e.data)
  if (!d) return false
  return hoje.getTime() - d.getTime() > DIAS_ANTIGA_SEM_CARD * DIA_MS
}
