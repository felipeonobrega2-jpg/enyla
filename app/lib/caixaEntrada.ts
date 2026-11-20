// Caixa de entrada do Painel: tudo o que pede o Felipe numa lista só, por prioridade (dinheiro e bom negócio
// primeiro). Puro: grupos, peso de cada tipo, ordenação e o que está resolvido/adiado.

export type GrupoCaixa = "dinheiro" | "vendas" | "producao" | "sistema" | "relacionamento"
export type NivelCaixa = "perigo" | "alerta" | "info" | "sucesso"
export const GRUPOS: { id: GrupoCaixa; nome: string }[] = [
  { id: "dinheiro", nome: "Dinheiro" }, { id: "vendas", nome: "Vendas" }, { id: "producao", nome: "Produção" },
  { id: "sistema", nome: "Sistema" }, { id: "relacionamento", nome: "Relacionamento" },
]

// Peso base por tipo de item (quanto maior, mais em cima)
export const PESO: Record<string, number> = {
  "sistema-perigo": 100,                          // IA sem crédito, WhatsApp fora: a operação para
  aprovado: 92, cobrancaVencida: 88, pagamento: 86, semCobranca: 80,          // dinheiro
  propostaPronta: 84, promessa: 83, negociacao: 82, orcar: 78, grande: 74, esperando: 72, responder: 70, travado: 62,   // vendas
  orcamentoVencendo: 58, abriuProposta: 56, proposta: 54,
  atrasado: 60, fornecedor: 58, entregaProxima: 50, semPrazo: 30, conferir: 28, digital: 46,   // produção
  sistema: 60, whatsapp: 100, meta: 52,
  retomar: 36, comoFicou: 26, reposicao: 24, avaliado: 20,                    // relacionamento
}
const TIPO_GRUPO: Record<string, GrupoCaixa> = {
  aprovado: "dinheiro", cobrancaVencida: "dinheiro", pagamento: "dinheiro", semCobranca: "dinheiro",
  propostaPronta: "vendas", promessa: "vendas", negociacao: "vendas", orcar: "vendas", grande: "vendas", esperando: "vendas", responder: "vendas", travado: "vendas",
  orcamentoVencendo: "vendas", abriuProposta: "vendas", proposta: "vendas",
  atrasado: "producao", fornecedor: "producao", entregaProxima: "producao", semPrazo: "producao", conferir: "producao", digital: "producao",
  sistema: "sistema", whatsapp: "sistema", meta: "sistema",
  retomar: "relacionamento", comoFicou: "relacionamento", reposicao: "relacionamento", avaliado: "relacionamento",
}
export const grupoDoTipo = (tipo: string): GrupoCaixa => TIPO_GRUPO[tipo] ?? "relacionamento"

export function prioridade(a: { tipo: string; nivel?: NivelCaixa; valor?: number | null }): number {
  const base = a.tipo === "sistema" && a.nivel === "perigo" ? PESO["sistema-perigo"] : PESO[a.tipo] ?? 20
  const nivel = a.nivel === "perigo" ? 6 : a.nivel === "alerta" ? 3 : 0
  const dinheiro = a.valor ? Math.min(8, Math.log10(Math.max(1, a.valor)) * 2) : 0   // R$ 1 mil ≈ +6, R$ 10 mil ≈ +8
  return base + nivel + dinheiro
}

// Escondido: resolvido ("sempre") ou adiado até uma data que ainda não chegou
export const escondido = (chave: string, ocultos: Record<string, string>, agora = Date.now()) => {
  const ate = ocultos[chave]
  return !!ate && (ate === "sempre" || new Date(ate).getTime() > agora)
}

export function ordenar<T extends { chave: string; tipo: string; nivel?: NivelCaixa; valor?: number | null }>(itens: T[], ocultos: Record<string, string> = {}, agora = Date.now()): (T & { grupo: GrupoCaixa; peso: number })[] {
  const vistos = new Set<string>()
  return itens
    .filter(i => { if (vistos.has(i.chave) || escondido(i.chave, ocultos, agora)) return false; vistos.add(i.chave); return true })
    .map(i => ({ ...i, grupo: grupoDoTipo(i.tipo), peso: prioridade(i) }))
    .sort((a, b) => b.peso - a.peso)
}

// "Lembrar depois": daqui a 3 h, ou amanhã às 8 h (horário de Brasília)
export function adiarAte(quando: "3h" | "amanha", agora = new Date()): string {
  if (quando === "3h") return new Date(agora.getTime() + 3 * 3_600_000).toISOString()
  const dia = new Date(agora.getTime() - 3 * 3_600_000)   // data em Brasília
  const amanha = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate() + 1, 11, 0, 0))   // 8 h BRT
  return amanha.toISOString()
}

// Resumo da caixa no WhatsApp (8h, 13h, 18h): os mais importantes de cada grupo, na ordem do Painel
export type ItemResumo = { chave: string; tipo: string; nivel?: NivelCaixa; titulo: string; sub?: string; valor?: number | null }
const ICONE_GRUPO: Record<GrupoCaixa, string> = { dinheiro: "💰", vendas: "🤝", producao: "🏭", sistema: "⚠️", relacionamento: "💬" }
export function textoResumo(itens: (ItemResumo & { grupo: GrupoCaixa })[], slot: "8" | "13" | "18", link: string, porGrupo = 4): string {
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
  const cab = slot === "8" ? "☀️ *Bom dia! Sua caixa de entrada*" : slot === "13" ? "🕐 *Caixa de entrada · 13h*" : "🌙 *Fechamento do dia · caixa de entrada*"
  if (!itens.length) return [cab, "Tudo em dia: nenhum bom negócio esperando, nenhuma cobrança vencida e nada atrasado. 👏", link].join("\n")
  const emJogo = itens.reduce((t, i) => t + (i.grupo === "dinheiro" || i.grupo === "vendas" ? i.valor ?? 0 : 0), 0)
  const linhas = [`${cab} (${itens.length})${emJogo ? ` · ${brl(emJogo)} em jogo` : ""}`]
  for (const g of GRUPOS) {
    const doGrupo = itens.filter(i => i.grupo === g.id)
    if (!doGrupo.length) continue
    linhas.push("", `${ICONE_GRUPO[g.id]} *${g.nome}* (${doGrupo.length})`)
    for (const i of doGrupo.slice(0, porGrupo)) linhas.push(`• *${i.titulo}*${i.valor ? ` · ${brl(i.valor)}` : ""}${i.sub ? `: ${i.sub.length > 90 ? `${i.sub.slice(0, 88)}…` : i.sub}` : ""}`)
    if (doGrupo.length > porGrupo) linhas.push(`  … e mais ${doGrupo.length - porGrupo}`)
  }
  if (slot === "18") linhas.push("", "O que ficar vira a primeira coisa da manhã.")
  linhas.push("", link)
  return linhas.join("\n")
}
