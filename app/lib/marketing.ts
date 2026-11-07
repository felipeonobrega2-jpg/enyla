// Agente de marketing: o anúncio até o dinheiro, por campanha. Gasto e cliques vêm da Meta; leads, qualidade
// (MQL, descartado), orçamentos e pedidos vêm do sistema. A IA lê os números e escreve o que fazer.
// Aqui só as regras puras; marketingServidor busca, monta, pede a leitura e guarda.

export type LinhaCampanha = {
  id: string                  // id da campanha na Meta ("sem-campanha" = veio do anúncio, campanha ainda não identificada)
  nome: string
  gasto: number
  impressoes: number
  cliques: number
  conversasMeta: number       // conversas iniciadas, segundo a Meta
  leads: number               // conversas que chegaram do anúncio no período (pelo sistema)
  mql: number                 // bons negócios (ICP, lead médio, oportunidade)
  descartados: number         // lead pequeno
  sumiram?: number            // não respondeu nem aos follow-ups (etiqueta "Sem resposta"); relatórios antigos não têm
  semClassificar: number      // ainda em conversa, sem dizer o volume
  orcamentos: number
  pedidos: number
  faturamento: number         // valor dos pedidos fechados
  peloGasto?: number          // leads sem campanha no clique, atribuídos a esta por ser a única com gasto no período
}

export type Periodo = { de: string; ate: string }   // datas YYYY-MM-DD (São Paulo)

export type Relatorio = {
  dia: string                 // o dia analisado (ontem, quando gerado de manhã)
  geradoEm: string
  dia1: LinhaCampanha[]       // o dia
  semana: LinhaCampanha[]     // últimos 7 dias (até o dia)
  semanaAnterior: LinhaCampanha[]
  leitura?: { resumo: string; destaques: string[]; acao: string } | null
  erroLeitura?: string
}

export const SEM_CAMPANHA = "sem-campanha"

// Lead que veio do anúncio mas sem a campanha no clique (o WhatsApp quase nunca manda): se no período só uma
// campanha gastou, ele é dela. Com mais de uma campanha gastando, continua "a identificar" (não chuta).
export function campanhaPeloGasto(meta: { id: string; gasto: number }[]): string | null {
  const ativas = meta.filter(m => m.id !== SEM_CAMPANHA && m.gasto > 0)
  return ativas.length === 1 ? ativas[0].id : null
}

// Qualidade do lead pelo que o agente (ou você) marcou. "Sumiu" = não respondeu nem aos follow-ups: separado de
// "aberto" (ainda conversando) para o custo por MQL não esconder quem nunca ia responder.
export function qualidadeDoLead(c: { status_lead: string | null; etiquetas: string[] | null }): "mql" | "descartado" | "sumiu" | "aberto" {
  const et = c.etiquetas ?? []
  if (c.status_lead === "mql" || et.some(e => ["MQL", "ICP", "Lead médio", "Oportunidade"].includes(e))) return "mql"
  if (et.some(e => ["Descartado", "Lead pequeno"].includes(e))) return "descartado"
  if (et.includes("Sem resposta")) return "sumiu"
  if (c.status_lead === "descartado") return "descartado"
  return "aberto"
}

export const linhaVazia = (id: string, nome: string): LinhaCampanha =>
  ({ id, nome, gasto: 0, impressoes: 0, cliques: 0, conversasMeta: 0, leads: 0, mql: 0, descartados: 0, sumiram: 0, semClassificar: 0, orcamentos: 0, pedidos: 0, faturamento: 0 })

export function total(linhas: LinhaCampanha[]): LinhaCampanha {
  const t = linhaVazia("total", "Total")
  for (const l of linhas) for (const k of ["gasto", "impressoes", "cliques", "conversasMeta", "leads", "mql", "descartados", "sumiram", "semClassificar", "orcamentos", "pedidos", "faturamento"] as const) t[k] = (t[k] ?? 0) + (l[k] ?? 0)
  return t as Required<LinhaCampanha>
}

// Custo por algo (null quando não houve nenhum: "sem MQL" é diferente de custo zero)
export const custoPor = (gasto: number, n: number) => (n > 0 ? gasto / n : null)

// Variação em % (null sem base)
export const variacao = (agora: number, antes: number) => (antes > 0 ? (agora - antes) / antes : null)

// Datas em São Paulo
export const diaSP = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
export function somarDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const periodos = (dia: string) => ({
  dia1: { de: dia, ate: dia },
  semana: { de: somarDias(dia, -6), ate: dia },
  semanaAnterior: { de: somarDias(dia, -13), ate: somarDias(dia, -7) },
})
export const dentro = (iso: string | null | undefined, p: Periodo) => {
  if (!iso) return false
  const d = diaSP(new Date(iso))
  return d >= p.de && d <= p.ate
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: n < 100 ? 2 : 0 })
const dm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

// Números que a IA lê (texto curto e exato; ela não inventa nada além disso)
export function numerosParaIA(r: Pick<Relatorio, "dia" | "dia1" | "semana" | "semanaAnterior">) {
  const bloco = (titulo: string, linhas: LinhaCampanha[]) => {
    const t = total(linhas)
    return [`${titulo}: gasto ${brl(t.gasto)}, ${t.cliques} cliques, ${t.conversasMeta} conversas (Meta), ${t.leads} leads no WhatsApp, ${t.mql} MQL, ${t.descartados} descartados, ${t.sumiram} sumiram (não responderam nem aos follow-ups), ${t.semClassificar} ainda conversando sem dizer o volume, ${t.orcamentos} orçamentos, ${t.pedidos} pedidos (${brl(t.faturamento)}).`,
      ...linhas.filter(l => l.gasto || l.leads).map(l => `- ${l.nome}: gasto ${brl(l.gasto)}, ${l.cliques} cliques, ${l.conversasMeta} conversas (Meta), ${l.leads} leads, ${l.mql} MQL, ${l.descartados} descartados, ${l.orcamentos} orçamentos, ${l.pedidos} pedidos (${brl(l.faturamento)})${custoPor(l.gasto, l.mql) != null ? `, custo por MQL ${brl(custoPor(l.gasto, l.mql)!)}` : ""}${l.peloGasto ? ` (${l.peloGasto} destes leads chegaram sem a campanha no clique e foram atribuídos a ela por ser a única campanha com gasto no período: a atribuição está certa, não é problema de rastreio)` : ""}`)].join("\n")
  }
  return [bloco(`Dia ${dm(r.dia)}`, r.dia1), bloco(`Últimos 7 dias`, r.semana), bloco(`7 dias anteriores`, r.semanaAnterior)].join("\n\n")
}

// O que pede você hoje (vem do Hoje): entra no topo do resumo da manhã
export type DiaNoResumo = {
  esperando: { nome: string | null; jid: string; rotulo: string; quantidade?: number | null }[]
  orcamentosSemResposta: number
  retomar?: number                 // lembretes que venceram e bons negócios sem resposta há 3+ dias
  orcar?: { nome: string | null; jid: string; quantidade?: number | null }[]   // passaram tudo e esperam o seu orçamento
  linkHoje: string
}
const MOSTRAR_NO_RESUMO = 5

// Resumo da manhã no seu WhatsApp: primeiro os bons negócios esperando você, depois o marketing de ontem
// (o relatório completo fica na página Campanhas)
export function textoResumoWhatsapp(r: Relatorio, link: string, dia?: DiaNoResumo) {
  const t = total(r.dia1), s = total(r.semana)
  const cpm = custoPor(t.gasto, t.mql), cpmS = custoPor(s.gasto, s.mql)
  const n = dia?.esperando.length ?? 0
  const orc = dia?.orcar ?? []
  const bloco = dia ? [
    orc.length ? `📄 *${orc.length} ${orc.length === 1 ? "orçamento para fazer" : "orçamentos para fazer"}* (já passaram tudo)` : null,
    ...orc.slice(0, MOSTRAR_NO_RESUMO).map(x => `• ${x.nome || x.jid.split("@")[0]}${x.quantidade ? ` · ${x.quantidade.toLocaleString("pt-BR")} un` : ""}`),
    n ? `☀️ *${n} ${n === 1 ? "bom negócio esperando" : "bons negócios esperando"} sua resposta*` : "☀️ *Nenhum bom negócio esperando resposta*",
    ...dia.esperando.slice(0, MOSTRAR_NO_RESUMO).map(x => `• ${x.nome || x.jid.split("@")[0]} · ${x.rotulo}${x.quantidade ? ` · ${x.quantidade.toLocaleString("pt-BR")} un` : ""}`),
    n > MOSTRAR_NO_RESUMO ? `• e mais ${n - MOSTRAR_NO_RESUMO}` : null,
    dia.orcamentosSemResposta ? `📄 ${dia.orcamentosSemResposta} ${dia.orcamentosSemResposta === 1 ? "orçamento sem resposta" : "orçamentos sem resposta"} há 2 dias ou mais (retomada pronta em Reativação)` : null,
    dia.retomar ? `🔁 ${dia.retomar} para retomar hoje (lembretes e sem resposta há 3+ dias)` : null,
    n || orc.length || dia.orcamentosSemResposta || dia.retomar ? `👉 ${dia.linkHoje}` : null,
    "",
  ] : []
  return [
    ...bloco,
    `📊 *Marketing de ontem (${dm(r.dia)})*`,
    `Gasto ${brl(t.gasto)} · ${t.leads} leads · *${t.mql} MQL*${cpm != null ? ` (${brl(cpm)} cada)` : ""}`,
    t.pedidos ? `${t.pedidos} pedido${t.pedidos > 1 ? "s" : ""} · ${brl(t.faturamento)}` : null,
    `7 dias: ${brl(s.gasto)} · ${s.leads} leads · ${s.mql} MQL${cpmS != null ? ` (${brl(cpmS)} cada)` : ""}`,
    r.leitura?.resumo ? `\n${r.leitura.resumo}` : null,
    r.leitura?.acao ? `👉 ${r.leitura.acao}` : null,
    `\n${link}`,
  ].filter(x => x != null).join("\n")
}

// Gera de manhã (depois das 9h15, quando a verificação diária já identificou a campanha de cada conversa)
export function horaDoRelatorio(d = new Date()) {
  const [h, m] = d.toLocaleTimeString("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).split(":").map(Number)
  return h * 60 + m >= 9 * 60 + 15
}
