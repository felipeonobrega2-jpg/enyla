// Cobertura do prédio: a Diretoria. Cada diretor (COO, CCO, CMO, CFO, CTO) com o placar da área e as decisões que precisam do
// CEO (o Felipe), montados com os dados de hoje. Os agentes de IA dos diretores vêm depois e ocupam essas cadeiras;
// por enquanto o placar já funciona. Puro.
import { estaSegurado, type MapaSegurados } from "./pedidoSegurado"
import type { FinanceiroAndar } from "./financeiroAndar"
import type { KanbanCard } from "../types"
import { chaveDecisao, slug } from "./pendenciaDispensada"

type Item = { texto: string; chave: string }

export type Tom = "ok" | "atencao" | "problema"
export type IdDiretor = "coo" | "cco" | "cmo" | "cfo" | "cto"
export type Diretor = { id: IdDiretor; cargo: string; area: string; placar: { rotulo: string; valor: string; tom: Tom }[]; decisoes: string[]; decisoesChaves?: string[]; tom: Tom; conhecimento: number }
export type LicaoDiretor = { id: string; texto: string; em: string }
// Nomes fictícios: os diretores são agentes de IA com personalidade própria (o Felipe conversa com cada um)
export const DIRETORES: { id: IdDiretor; nome: string; cargo: string; area: string; faz: string; jeito: string }[] = [
  { id: "coo", nome: "Rafael Moura", jeito: "Pragmático, pensa em processo e prazo; fala de gargalo e fluxo; desconfia de promessa sem data.", cargo: "COO", area: "Operação", faz: "Produção, entregas, fornecedores e os agentes funcionando" },
  { id: "cco", nome: "Bianca Torres", jeito: "Energia de vendas, pensa em funil e fechamento; obcecada por resposta rápida ao lead; fala de conversão.", cargo: "CCO", area: "Comercial", faz: "Leads, orçamentos, propostas e fechamento" },
  { id: "cmo", nome: "Lívia Andrade", jeito: "Analítica e criativa; pensa em custo por MQL, posicionamento e teste; propõe experimentos com prazo e métrica.", cargo: "CMO", area: "Marketing", faz: "Anúncios, campanhas, custo por lead e posicionamento" },
  { id: "cfo", nome: "Otávio Brandão", jeito: "Conservador e preciso; pensa em caixa, margem e risco; sempre pergunta quanto custa e quando volta.", cargo: "CFO", area: "Dinheiro", faz: "Caixa, cobranças, margem do Offset e do Digital" },
  { id: "cto", nome: "Diego Sato", jeito: "Calmo e sistemático; pensa em automação, confiabilidade e o que conectar; separa o que já existe do que precisa construir.", cargo: "CTO", area: "Sistema", faz: "Sistema no ar, WhatsApp, IA e as rotinas automáticas" },
]

// Diretor gere resultado e decide; quem executa é sempre um funcionário qualificado (quadro do RH, lib/rh). Aqui ficam
// só os agentes do Escritório que trabalham sozinhos, cada um sob um diretor.
export const EQUIPE: Record<IdDiretor, string[]> = {
  coo: ["Vigia"],
  cco: ["Atendente", "Levantador de MQL", "Follow-up", "Reativação", "Propostas", "Orçamentista digital"],
  cmo: [],
  cfo: ["Auditor de dados"],
  cto: ["Aprendiz"],
}
// Metas e cultura da companhia: base que todo diretor (e todo funcionário que fala com cliente) lê
export type IdBase = IdDiretor | "metas" | "cultura"

type HojeResumo = {
  responder?: unknown[]; orcar?: { nome?: string | null }[]
  anuncio?: { leads: number; mql: number; semClassificar: number; descartados: number }
  marketing?: { acao: string; custoMql: number | null } | null
  gastos?: { alertas: { tipo: string; nivel: string; texto: string }[] }
  resolver?: { tipo: string; titulo: string; detalhe: string; valor: number | null }[]
  meta?: { resumo?: { total: number; orcados: number } }
}
type Rotina = { nome: string; situacao: { tom: string; texto: string } }

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const pior = (ts: Tom[]): Tom => ts.includes("problema") ? "problema" : ts.includes("atencao") ? "atencao" : "ok"

export function montarDiretoria(e: {
  hoje?: HojeResumo | null; fin?: FinanceiroAndar | null; kanban: KanbanCard[]
  agentesTravados: string[]; rotinas?: Rotina[] | null; whatsapp: "conectado" | "desconectado" | null; semCredito: boolean
  cota?: { usados: number; limite: number }
  conhecimento?: Partial<Record<IdDiretor, number>>
  dispensadas?: Set<string>     // chaves de decisão dispensadas com motivo: somem daqui (nada é apagado)
  segurados?: MapaSegurados   // aguardando pagamento do cliente: fora das entregas atrasadas
}, hojeIso = new Date().toLocaleDateString("sv-SE")): Diretor[] {
  // Cada decisão tem chave estável (tipo + pedido/jid/título), igual de um dia para o outro: é por ela que se dispensa
  const D = (texto: string, chave: string): Item => ({ texto, chave: chaveDecisao(chave) })
  const fim = (d: Omit<Diretor, "decisoes"> & { decisoes: Item[] }): Diretor => {
    const ficam = d.decisoes.filter(x => !e.dispensadas?.has(x.chave))
    return { ...d, decisoes: ficam.map(x => x.texto), decisoesChaves: ficam.map(x => x.chave) }
  }
  // COO: operação (produção, entregas, agentes)
  const esperando = e.hoje?.responder?.length ?? 0, orcar = e.hoje?.orcar?.length ?? 0
  const promessas = (e.hoje?.resolver ?? []).filter(x => x.tipo === "promessa")
  const naProducao = e.kanban.filter(c => c.coluna >= 2 && c.coluna <= 8)
  const atrasados = naProducao.filter(c => !!c.dataEntregaPrevista && c.dataEntregaPrevista.slice(0, 10) < hojeIso && !estaSegurado(e.segurados, c.numero))
  const meta = e.hoje?.meta?.resumo
  const coo0: Omit<Diretor, "decisoes"> & { decisoes: Item[] } = {
    id: "coo", cargo: "COO", area: "Operação", conhecimento: e.conhecimento?.coo ?? 0,
    placar: [
      { rotulo: "Pedidos na produção", valor: String(naProducao.length), tom: "ok" },
      { rotulo: "Entregas atrasadas", valor: String(atrasados.length), tom: atrasados.length ? "problema" : "ok" },
      { rotulo: "Agentes travados", valor: String(e.agentesTravados.length), tom: e.agentesTravados.length ? "problema" : "ok" },
    ],
    decisoes: [
      ...atrasados.slice(0, 3).map(c => D(`Avisar ${c.nomeCliente} do atraso (${c.numero}) e ajustar a data`, `atraso:${c.numero}`)),
      ...(e.agentesTravados.length ? [D(`Destravar: ${e.agentesTravados.join(", ")}`, "agentes-travados")] : []),
    ],
    tom: "ok",
  }
  coo0.tom = pior(coo0.placar.map(p => p.tom))
  const coo = fim(coo0)

  // CCO: comercial (lead não espera, orçamento sai, promessa se cumpre)
  const cco0: Omit<Diretor, "decisoes"> & { decisoes: Item[] } = {
    id: "cco", cargo: "CCO", area: "Comercial", conhecimento: e.conhecimento?.cco ?? 0,
    placar: [
      { rotulo: "Leads esperando", valor: String(esperando), tom: esperando > 10 ? "problema" : esperando > 3 ? "atencao" : "ok" },
      { rotulo: "Orçamentos para fazer", valor: String(orcar), tom: orcar > 3 ? "problema" : orcar ? "atencao" : "ok" },
      { rotulo: "Promessas abertas", valor: String(promessas.length), tom: promessas.length ? "problema" : "ok" },
      ...(meta && meta.total ? [{ rotulo: "MQL orçado em 24 h", valor: `${meta.orcados} de ${meta.total}`, tom: (meta.orcados / meta.total >= 0.8 ? "ok" : meta.orcados / meta.total >= 0.5 ? "atencao" : "problema") as Tom }] : []),
    ],
    decisoes: [
      ...promessas.slice(0, 3).map(p => D(`Mandar o orçamento prometido para ${p.titulo.split(" · ")[0]}`, `promessa:${p.titulo}`)),
      ...(orcar ? [D(`Orçar ${orcar} ${orcar === 1 ? "lead que já passou tudo" : "leads que já passaram tudo"}`, "orcar-leads")] : []),
    ],
    tom: "ok",
  }
  cco0.tom = pior(cco0.placar.map(p => p.tom))
  const cco = fim(cco0)

  // CMO: marketing (o que o anúncio trouxe nas últimas 24 h e o saldo)
  const an = e.hoje?.anuncio, mk = e.hoje?.marketing, saldoMeta = (e.hoje?.gastos?.alertas ?? []).find(a => a.tipo === "meta")
  const cmo0: Omit<Diretor, "decisoes"> & { decisoes: Item[] } = {
    id: "cmo", cargo: "CMO", area: "Marketing", conhecimento: e.conhecimento?.cmo ?? 0,
    placar: [
      { rotulo: "Leads do anúncio (24 h)", valor: String(an?.leads ?? 0), tom: an && an.leads === 0 ? "atencao" : "ok" },
      { rotulo: "Viraram MQL", valor: String(an?.mql ?? 0), tom: "ok" },
      ...(mk?.custoMql != null ? [{ rotulo: "Custo por MQL", valor: brl(mk.custoMql), tom: "ok" as Tom }] : []),
      { rotulo: "Saldo da Meta", valor: saldoMeta ? (saldoMeta.nivel === "perigo" ? "acabando" : "baixo") : "ok", tom: saldoMeta ? (saldoMeta.nivel === "perigo" ? "problema" : "atencao") : "ok" },
    ],
    decisoes: [
      ...(saldoMeta ? [D("Recarregar a Meta: os anúncios param sem saldo", "meta-saldo")] : []),
      ...(mk?.acao ? [D(mk.acao, `mk-acao:${slug(mk.acao)}`)] : []),
    ],
    tom: "ok",
  }
  cmo0.tom = pior(cmo0.placar.map(p => p.tom))
  const cmo = fim(cmo0)

  // CFO: dinheiro
  const f = e.fin
  const sinal = (e.hoje?.resolver ?? []).filter(x => x.tipo === "pagamento")
  const cfo0: Omit<Diretor, "decisoes"> & { decisoes: Item[] } = {
    id: "cfo", cargo: "CFO", area: "Dinheiro", conhecimento: e.conhecimento?.cfo ?? 0,
    placar: f ? [
      { rotulo: "Recebido no mês", valor: brl(f.recebidoMes), tom: "ok" },
      { rotulo: "Resultado do mês", valor: brl(f.resultadoMes), tom: f.resultadoMes < 0 ? "problema" : "ok" },
      { rotulo: "Cobrança vencida", valor: brl(f.vencido), tom: f.vencido > 5000 ? "problema" : f.vencido > 0.5 ? "atencao" : "ok" },
      { rotulo: "A receber", valor: brl(f.aReceber), tom: "ok" },
      { rotulo: "Sinal que não caiu", valor: String(sinal.length), tom: sinal.length ? "atencao" : "ok" },
    ] : [],
    decisoes: [
      ...(f?.vencidos ?? []).slice(0, 3).map(v => D(`Cobrar ${v.cliente} (${v.numero}): ${brl(v.valor)} vencido`, `cobrar:${v.numero}`)),
      ...sinal.slice(0, 2).map(s => D(`Sinal não caiu: ${s.titulo.split(" · ")[0]}${s.valor ? ` (${brl(s.valor)})` : ""}`, `sinal:${s.titulo}`)),
      ...(f && f.resultadoMes < 0 ? [D("O mês está no vermelho: rever as despesas da semana", "mes-vermelho")] : []),
    ],
    tom: "ok",
  }
  cfo0.tom = pior(cfo0.placar.map(p => p.tom))
  const cfo = fim(cfo0)

  // CTO: sistema
  const problemas = (e.rotinas ?? []).filter(r => r.situacao.tom === "erro" || r.situacao.tom === "atrasada")
  const cota = e.cota ? e.cota.usados / Math.max(1, e.cota.limite) : 0
  const cto0: Omit<Diretor, "decisoes"> & { decisoes: Item[] } = {
    id: "cto", cargo: "CTO", area: "Sistema", conhecimento: e.conhecimento?.cto ?? 0,
    placar: [
      { rotulo: "WhatsApp", valor: e.whatsapp === "desconectado" ? "fora do ar" : e.whatsapp ? "conectado" : "sem sinal", tom: e.whatsapp === "desconectado" ? "problema" : "ok" },
      { rotulo: "Crédito da IA", valor: e.semCredito ? "acabou" : "ok", tom: e.semCredito ? "problema" : "ok" },
      { rotulo: "Rotinas com problema", valor: String(problemas.length), tom: problemas.length ? "problema" : "ok" },
      ...(e.cota ? [{ rotulo: "Envios usados na última hora", valor: `${e.cota.usados} de ${e.cota.limite} permitidos`, tom: (cota >= 1 ? "problema" : cota >= 0.8 ? "atencao" : "ok") as Tom }] : []),
    ],
    decisoes: [
      ...(e.whatsapp === "desconectado" ? [D("Ler o QR do WhatsApp: os leads estão sem resposta", "whatsapp-qr")] : []),
      ...(e.semCredito ? [D("Recarregar a IA: o agente parou de responder", "ia-credito")] : []),
      ...problemas.slice(0, 3).map(r => D(`${r.nome}: ${r.situacao.texto}`, `rotina:${slug(r.nome)}`)),
    ],
    tom: "ok",
  }
  cto0.tom = pior(cto0.placar.map(p => p.tom))
  const cto = fim(cto0)
  return [coo, cco, cmo, cfo, cto]
}
