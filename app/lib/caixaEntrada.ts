// Caixa de entrada do Painel: tudo o que pede o Felipe numa lista só, por prioridade (dinheiro e bom negócio
// primeiro). Puro: grupos, peso de cada tipo, ordenação e o que está resolvido/adiado.

import { etapaDoLead, perfilDoLead } from "./etapaLead"
import { efeitoDasRegras, type RegraCaixa } from "./aprendiz"

export type GrupoCaixa = "dinheiro" | "vendas" | "producao" | "sistema" | "relacionamento" | "digital"
// Perfil do lead do item: ICP e Oportunidade sobem dentro do grupo; digital/pequeno vai para o grupo "Digital" (é da IA)
export type PerfilCaixa = "icp" | "oportunidade" | "medio" | "digital"
export type NivelCaixa = "perigo" | "alerta" | "info" | "sucesso"
export const GRUPOS: { id: GrupoCaixa; nome: string }[] = [
  { id: "dinheiro", nome: "Dinheiro" }, { id: "vendas", nome: "Vendas" }, { id: "producao", nome: "Produção" },
  { id: "relacionamento", nome: "Relacionamento" }, { id: "digital", nome: "Digital" }, { id: "sistema", nome: "Sistema" },
]
export function perfilCaixa(c: { status_lead?: string | null; etiquetas?: string[] | null }): PerfilCaixa | undefined {
  const etapa = etapaDoLead(c)
  if (etapa === "digital" || etapa === "pequeno") return "digital"
  const p = perfilDoLead(c)
  return p === "icp" || p === "oportunidade" || p === "medio" ? p : undefined
}
// Dentro de vendas e relacionamento, o perfil manda antes do tipo: um ICP esperando resposta vem antes de qualquer
// coisa de um lead médio (a diferença entre perfis é maior que a entre tipos)
const BONUS_PERFIL: Record<PerfilCaixa, number> = { icp: 100, oportunidade: 50, medio: 0, digital: -50 }

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
  propostaPronta: "vendas", promessa: "vendas", orcar: "vendas", grande: "vendas", esperando: "vendas", responder: "vendas", travado: "vendas",
  orcamentoVencendo: "vendas", abriuProposta: "vendas", proposta: "vendas",
  atrasado: "producao", fornecedor: "producao", entregaProxima: "producao", semPrazo: "producao", conferir: "producao", digital: "producao",
  sistema: "sistema", whatsapp: "sistema", meta: "sistema", negociacao: "digital",
  retomar: "relacionamento", comoFicou: "relacionamento", reposicao: "relacionamento", avaliado: "relacionamento",
}
export const grupoDoTipo = (tipo: string): GrupoCaixa => TIPO_GRUPO[tipo] ?? "relacionamento"
export function grupoDoItem(a: { tipo: string; perfil?: PerfilCaixa }): GrupoCaixa {
  const g = grupoDoTipo(a.tipo)
  return a.perfil === "digital" && (g === "vendas" || g === "relacionamento") ? "digital" : g
}

export function prioridade(a: { tipo: string; nivel?: NivelCaixa; valor?: number | null; perfil?: PerfilCaixa }): number {
  const g = grupoDoItem(a)
  const perfil = g === "vendas" || g === "relacionamento" ? BONUS_PERFIL[a.perfil ?? "medio"] : 0
  const base = (a.tipo === "sistema" && a.nivel === "perigo" ? PESO["sistema-perigo"] : PESO[a.tipo] ?? 20) + perfil
  const nivel = a.nivel === "perigo" ? 6 : a.nivel === "alerta" ? 3 : 0
  const dinheiro = a.valor ? Math.min(8, Math.log10(Math.max(1, a.valor)) * 2) : 0   // R$ 1 mil ≈ +6, R$ 10 mil ≈ +8
  return base + nivel + dinheiro
}

// Escondido: resolvido ("sempre") ou adiado até uma data que ainda não chegou
export const escondido = (chave: string, ocultos: Record<string, string>, agora = Date.now()) => {
  const ate = ocultos[chave]
  return !!ate && (ate === "sempre" || new Date(ate).getTime() > agora)
}

type Ordenavel = { chave: string; tipo: string; nivel?: NivelCaixa; valor?: number | null; perfil?: PerfilCaixa; jid?: string | null; numero?: string | null; titulo?: string; sub?: string; valorTexto?: string }
// regras: o que o Felipe ensinou pelo Aprendiz (esconder, subir ou baixar o que bate)
export function ordenar<T extends Ordenavel>(itens: T[], ocultos: Record<string, string> = {}, agora = Date.now(), regras?: RegraCaixa[]): (T & { grupo: GrupoCaixa; peso: number; chaves: string[] })[] {
  const vistos = new Set<string>()
  const ordenados = itens
    .filter(i => { if (vistos.has(i.chave) || escondido(i.chave, ocultos, agora)) return false; vistos.add(i.chave); return true })
    .map(i => { const grupo = grupoDoItem(i); return { ...i, grupo, peso: prioridade(i), efeito: efeitoDasRegras(regras, { ...i, grupo }, agora) } })
    .filter(i => i.grupo === "sistema" || !i.efeito.esconder)      // alerta do sistema nunca some por regra
    .map(({ efeito, ...i }) => ({ ...i, peso: i.peso + efeito.ajuste }))
    .sort((a, b) => b.peso - a.peso) as (T & { grupo: GrupoCaixa; peso: number })[]
  return juntarMesmoAssunto(ordenados)
}

// O que diz cada tipo quando ele aparece junto de outro da mesma pessoa
const MOTIVO: Record<string, string> = {
  responder: "esperando resposta", orcar: "esperando orçamento", promessa: "orçamento prometido", propostaPronta: "proposta pronta",
  abriuProposta: "abriu a proposta", travado: "MQL sem orçamento", retomar: "sem resposta", esperando: "esperando você", grande: "grande negócio",
  orcamentoVencendo: "orçamento vencendo",
}
// A mesma pessoa (conversa) ou o mesmo pedido em vários itens do mesmo grupo vira uma linha só: fica o mais
// importante, os outros motivos entram no texto ("também: esperando resposta"), o valor soma no dinheiro, e
// "resolvido" tira todos
function juntarMesmoAssunto<T extends Ordenavel & { grupo: GrupoCaixa; peso: number }>(itens: T[]): (T & { chaves: string[] })[] {
  const saida: (T & { chaves: string[]; _motivos?: string[] })[] = []
  const porAssunto = new Map<string, T & { chaves: string[]; _motivos?: string[] }>()
  for (const i of itens) {
    const k = i.jid ? `${i.grupo}|j|${i.jid}` : i.numero ? `${i.grupo}|n|${i.numero}` : null
    const ja = k ? porAssunto.get(k) : undefined
    if (!ja) { const novo = { ...i, chaves: [i.chave] }; if (k) porAssunto.set(k, novo); saida.push(novo); continue }
    ja.chaves.push(i.chave)
    if (i.grupo === "dinheiro") {
      if (!i.valor) continue
      ja.valor = (ja.valor ?? 0) + i.valor; ja.valorTexto = undefined
      // Junta a explicação só se ela já não estiver dita ("mais R$ 4.470,00 sem cobrança")
      const inteiro = Math.round(i.valor).toLocaleString("pt-BR")
      if (i.sub && !(ja.sub ?? "").includes(inteiro)) ja.sub = [ja.sub, i.sub].filter(Boolean).join(" · ")
      continue
    }
    const motivo = MOTIVO[i.tipo]
    if (motivo && motivo !== MOTIVO[ja.tipo] && !(ja._motivos ?? []).includes(motivo)) ja._motivos = [...(ja._motivos ?? []), motivo]
    if (!ja.valor && i.valor) ja.valor = i.valor
  }
  return saida.map(({ _motivos, ...i }) => (_motivos?.length ? { ...i, sub: `${i.sub ? `${i.sub} · ` : ""}também: ${_motivos.join(", ")}` } : i) as T & { chaves: string[] })
}

// "Lembrar depois": daqui a 3 h, ou amanhã às 8 h (horário de Brasília)
export function adiarAte(quando: "3h" | "amanha", agora = new Date()): string {
  if (quando === "3h") return new Date(agora.getTime() + 3 * 3_600_000).toISOString()
  const dia = new Date(agora.getTime() - 3 * 3_600_000)   // data em Brasília
  const amanha = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate() + 1, 11, 0, 0))   // 8 h BRT
  return amanha.toISOString()
}

// Resumo da caixa no WhatsApp (8h, 13h, 18h): os mais importantes de cada grupo, na ordem do Painel
export type ItemResumo = { chave: string; tipo: string; nivel?: NivelCaixa; titulo: string; sub?: string; valor?: number | null; jid?: string | null; numero?: string | null; perfil?: PerfilCaixa }
const ICONE_GRUPO: Record<GrupoCaixa, string> = { dinheiro: "💰", vendas: "🤝", producao: "🏭", sistema: "⚠️", relacionamento: "💬", digital: "🤖" }
export function textoResumo(itens: (ItemResumo & { grupo: GrupoCaixa })[], slot: "8" | "13" | "18", link: string, porGrupo = 4): string {
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
  const cab = slot === "8" ? "☀️ *Bom dia! Sua caixa de entrada*" : slot === "13" ? "🕐 *Caixa de entrada · 13h*" : "🌙 *Fechamento do dia · caixa de entrada*"
  if (!itens.length) return [cab, "Tudo em dia: nenhum bom negócio esperando, nenhuma cobrança vencida e nada atrasado. 👏", link].join("\n")
  const emJogo = itens.reduce((t, i) => t + (i.grupo === "dinheiro" || i.grupo === "vendas" ? i.valor ?? 0 : 0), 0)
  const linhas = [`${cab} (${itens.length})${emJogo ? ` · ${brl(emJogo)} em jogo` : ""}`]
  for (const g of GRUPOS) {
    const doGrupo = itens.filter(i => i.grupo === g.id)
    if (!doGrupo.length) continue
    if (g.id === "digital") { linhas.push("", `🤖 *Digital* (${doGrupo.length}): a IA está cuidando`); continue }
    linhas.push("", `${ICONE_GRUPO[g.id]} *${g.nome}* (${doGrupo.length})`)
    for (const i of doGrupo.slice(0, porGrupo)) linhas.push(`• *${i.titulo}*${i.valor ? ` · ${brl(i.valor)}` : ""}${i.sub ? `: ${i.sub.length > 90 ? `${i.sub.slice(0, 88)}…` : i.sub}` : ""}`)
    if (doGrupo.length > porGrupo) linhas.push(`  … e mais ${doGrupo.length - porGrupo}`)
  }
  if (slot === "18") linhas.push("", "O que ficar vira a primeira coisa da manhã.")
  linhas.push("", link)
  return linhas.join("\n")
}
