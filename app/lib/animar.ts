// Dar vida ao que entra: cada venda vem com "+R$ X rumo ao <marco>", e às 19h chega o resumo do dia (o que entrou,
// o que o agente fez, o placar dele nos últimos 30 dias e o que fica para amanhã). Aqui só as regras puras.
import type { Marco } from "./metas"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

export type Progresso = { total: number; proximo: Marco | null; falta: number; vendidoMes: number; metaMes: number }

export function progresso(total: number, marcos: Marco[], vendidoMes: number, metaMes: number): Progresso {
  const proximo = [...marcos].sort((a, b) => a.valor - b.valor).find(m => m.valor > total) ?? null
  return { total, proximo, falta: proximo ? proximo.valor - total : 0, vendidoMes, metaMes }
}

// "+R$ 1.110 rumo ao Meio Milhão · faltam R$ 201.890 · mês em 62% da meta"
export function linhaRumo(valor: number, p: Progresso) {
  const partes = [p.proximo ? `+${brl(valor)} rumo ao ${p.proximo.nome}` : `+${brl(valor)}`]
  if (p.proximo) partes.push(`faltam ${brl(p.falta)}`)
  if (p.metaMes > 0) partes.push(p.vendidoMes >= p.metaMes ? `meta do mês batida (${brl(p.vendidoMes)})` : `mês em ${Math.round(p.vendidoMes / p.metaMes * 100)}% da meta`)
  return partes.join(" · ")
}

export type ResumoDia = {
  offset: { n: number; valor: number }            // pedidos fechados hoje
  digital: { n: number; valor: number }           // sinais pagos hoje (valor do pedido)
  caixa: number                                    // dinheiro que entrou hoje (receitas pagas)
  agente: { conversas: number; orcamentosDigitais: number; propostas: number; medidas: number }
  placar: { orcamentos: number; pagos: number; vendido: number; custoIA: number }   // 30 dias
  amanha: { responder: number; orcar: number; retomar: number }
  progresso: Progresso | null
  link: string
}

export function textoResumoDia(r: ResumoDia) {
  const vendeu = r.offset.valor + r.digital.valor
  const l: string[] = [vendeu > 0 ? `*Fechamento do dia: ${brl(vendeu)} vendidos*` : "*Fechamento do dia*"]
  if (r.offset.n) l.push(`Offset: ${r.offset.n} ${r.offset.n === 1 ? "pedido" : "pedidos"} · ${brl(r.offset.valor)}`)
  if (r.digital.n) l.push(`Digital: ${r.digital.n} ${r.digital.n === 1 ? "sinal pago" : "sinais pagos"} · ${brl(r.digital.valor)}`)
  if (!vendeu) l.push("Nenhuma venda fechada hoje.")
  if (r.caixa > 0) l.push(`Entrou no caixa: ${brl(r.caixa)}`)
  const a = r.agente
  l.push("", `*O agente hoje:* ${a.conversas} ${a.conversas === 1 ? "conversa atendida" : "conversas atendidas"}` +
    [a.orcamentosDigitais ? `${a.orcamentosDigitais} ${a.orcamentosDigitais === 1 ? "orçamento digital" : "orçamentos digitais"}` : "",
     a.propostas ? `${a.propostas} ${a.propostas === 1 ? "proposta pronta" : "propostas prontas"} para você` : "",
     a.medidas ? `${a.medidas} ${a.medidas === 1 ? "medida pedida" : "medidas pedidas"}` : ""].filter(Boolean).map(x => `, ${x}`).join(""))
  const p = r.placar
  const paga = p.custoIA > 0 ? ` · custou ${brl(p.custoIA)} de IA (${p.vendido >= p.custoIA ? `${Math.round(p.vendido / p.custoIA)}× o custo` : "ainda não se pagou"})` : ""
  l.push(`Placar de 30 dias: ${p.orcamentos} orçamentos → ${p.pagos} ${p.pagos === 1 ? "pago" : "pagos"} · ${brl(p.vendido)} vendidos${paga}`)
  const m = r.amanha
  const fica = [m.responder ? `${m.responder} para responder` : "", m.orcar ? `${m.orcar} para orçar` : "", m.retomar ? `${m.retomar} para retomar` : ""].filter(Boolean)
  l.push("", fica.length ? `*Para amanhã:* ${fica.join(" · ")}` : "*Para amanhã:* nada pendente nos bons negócios.")
  if (r.progresso?.proximo) l.push("", `${r.progresso.proximo.nome}: faltam ${brl(r.progresso.falta)}` + (r.progresso.metaMes > 0 ? ` · mês em ${Math.round(r.progresso.vendidoMes / r.progresso.metaMes * 100)}% da meta` : ""))
  l.push(r.link)
  return l.join("\n")
}
