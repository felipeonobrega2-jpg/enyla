// Escritório dos agentes: cada agente numa mesa, com o que está fazendo agora, o que fez hoje (hora a hora) e o que
// está travando. Puro: o servidor busca o registro do agente e o AppConfig e monta tudo aqui.
import type { Conhecimento } from "./agenteLeads"
import type { Registro } from "./registroAgente"

export type IdMesa = "atendente" | "coletor" | "followup" | "reativacao" | "digital" | "propostas" | "vigia" | "aprendiz"
export type EstadoMesa = "trabalhando" | "plantao" | "travado" | "descansando"
export type Mesa = {
  id: IdMesa; nome: string; papel: string
  estado: EstadoMesa; agora: string; ultimaEm: string | null
  hoje: number; hojeRotulo: string; extra?: string | null
  horas: number[]                 // atividade de hoje, das 8h às 21h (14 colunas)
}
export type EventoEscritorio = { em: string; mesa: IdMesa; texto: string; tom?: "ok" | "segurou" }
export type Escritorio = {
  mesas: Mesa[]; feed: EventoEscritorio[]
  cota: { usados: number; limite: number }
  ligado: boolean; noHorario: boolean; whatsapp: "conectado" | "desconectado" | null; semCredito: boolean
  em: string
}

export const LIMITE_HORA = 40
export const HORA_INICIO = 8, HORAS = 14
const ATIVO_MIN = 10

type Pedido = { id: string; em: string; nome?: string | null; quantidade: number; total: number; teste?: boolean; status: string }
type Proposta = { em: string; nome: string | null; quantidade: number; preco: number; status: string }
export type CfgEscritorio = {
  agenteAuto?: { ligado?: boolean } | null
  agenteEnviosHora?: string[]; agenteSemCreditoEm?: string
  whatsappConexao?: { estado?: string; em?: string }
  pedidosDigitais?: Pedido[]; propostasProntas?: Proposta[]
  vigiaRodouEm?: string; vigiaTentou?: string[]; respostasPendentes?: { em: string }[]
  fechadasPelaIA?: { jid: string; motivo: string; em: string }[]; rotinaEnviada?: Record<string, string>
  conhecimentoAgente?: Conhecimento[]; agenteAprendeuEm?: string; agenteRevisaoConhecimento?: number
}

const NOMES: Record<IdMesa, { nome: string; papel: string }> = {
  atendente: { nome: "Atendente", papel: "Responde quem chega pelo WhatsApp" },
  coletor: { nome: "Levantador de MQL", papel: "Conduz o lead bom até dar para orçar" },
  followup: { nome: "Follow-up", papel: "Retoma quem parou de responder" },
  reativacao: { nome: "Reativação", papel: "Volta a falar com conversas antigas" },
  digital: { nome: "Orçamentista digital", papel: "Cota e manda o link do digital" },
  propostas: { nome: "Propostas", papel: "Monta a proposta do offset para você aprovar" },
  vigia: { nome: "Vigia", papel: "Ninguém sem resposta, nada parado" },
  aprendiz: { nome: "Aprendiz", papel: "Aprende o seu jeito com as suas conversas" },
}

// Em que mesa cai cada linha do registro do agente
export function mesaDoRegistro(r: Pick<Registro, "passo">): IdMesa {
  const p = r.passo ?? ""
  if (p === "Levantando para orçar") return "coletor"
  if (/^F\d|^Sem resposta/.test(p)) return "followup"
  if (/Reativação|Classificou/.test(p)) return "reativacao"
  if (p === "Campanha digital" || p === "Sem tabela") return "digital"
  return "atendente"
}

const horaSP = (iso: string) => Number(new Date(iso).toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }))
const diaSP = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

function descrever(r: Registro, m: IdMesa): string {
  const quem = r.nome?.trim() || "contato"
  if (!r.enviou) return `Segurou ${quem}: ${r.motivo}`
  if (m === "coletor") return `Pediu mais detalhes para ${quem}`
  if (m === "followup") return r.passo === "Sem resposta" ? `Encerrou ${quem} (sem resposta)` : `Follow-up ${r.passo} para ${quem}`
  if (m === "reativacao") return r.passo === "Classificou" ? `Classificou ${quem}` : `Retomou conversa com ${quem}`
  if (r.passo === "Campanha digital") return `Campanha digital para ${quem}`
  if (r.passo === "Instagram") return `Mandou o Instagram para ${quem}`
  if (r.passo === "Pediu medida") return `Pediu a medida para ${quem}`
  return `Respondeu ${quem}`
}

export function montarEscritorio(a: { registros: Registro[]; cfg: CfgEscritorio; nomes?: Record<string, string>; noHorario: boolean; agora?: number }): Escritorio {
  const agora = a.agora ?? Date.now()
  const hoje = diaSP(new Date(agora))
  const ehHoje = (iso?: string | null) => !!iso && diaSP(new Date(iso)) === hoje
  const cfg = a.cfg
  const feed: EventoEscritorio[] = []
  const add = (mesa: IdMesa, em: string | null | undefined, texto: string, tom?: EventoEscritorio["tom"]) => { if (em && ehHoje(em)) feed.push({ em, mesa, texto, tom }) }

  for (const r of a.registros) { const m = mesaDoRegistro(r); add(m, r.em, descrever(r, m), r.enviou ? "ok" : "segurou") }
  for (const p of cfg.pedidosDigitais ?? []) if (!p.teste) add("digital", p.em, `Orçou ${p.id} para ${p.nome?.trim() || "cliente"}: ${p.quantidade.toLocaleString("pt-BR")} un · ${brl(p.total)}`, "ok")
  for (const p of cfg.propostasProntas ?? []) add("propostas", p.em, `Montou proposta para ${p.nome?.trim() || "cliente"}: ${p.quantidade.toLocaleString("pt-BR")} caixas · ${brl(p.preco)}`, "ok")
  for (const f of cfg.fechadasPelaIA ?? []) add("vigia", f.em, `Fechou a conversa de ${a.nomes?.[f.jid]?.trim() || "um contato"}: ${f.motivo}`)
  for (const [slot, em] of Object.entries(cfg.rotinaEnviada ?? {})) add("vigia", em, `Mandou a checagem das ${slot.replace(/\D/g, "").slice(-2) || slot}h no seu WhatsApp`)
  for (const k of cfg.conhecimentoAgente ?? []) add("aprendiz", k.em, `Aprendeu: ${k.texto.length > 90 ? k.texto.slice(0, 88).trimEnd() + "…" : k.texto}`)
  feed.sort((x, y) => y.em.localeCompare(x.em))

  const usados = (cfg.agenteEnviosHora ?? []).filter(t => agora - new Date(t).getTime() < 3_600_000).length
  const semCredito = !!cfg.agenteSemCreditoEm && agora - new Date(cfg.agenteSemCreditoEm).getTime() < 3 * 3_600_000
  const est = cfg.whatsappConexao?.estado
  const whatsapp = !est ? null : /open|conectad/i.test(est) ? "conectado" : "desconectado"
  const ligado = !!cfg.agenteAuto?.ligado

  const mesas: Mesa[] = (Object.keys(NOMES) as IdMesa[]).map(id => {
    const ev = feed.filter(e => e.mesa === id)
    const feitos = ev.filter(e => e.tom !== "segurou")
    const horas = Array.from({ length: HORAS }, (_, i) => ev.filter(e => horaSP(e.em) === HORA_INICIO + i).length)
    const ultima = ev[0] ?? null
    const ativo = !!ultima && agora - new Date(ultima.em).getTime() < ATIVO_MIN * 60_000
    // O que trava quem fala com o cliente: WhatsApp fora, IA sem crédito, cota da hora cheia
    const fala = id !== "aprendiz" && id !== "propostas"
    let estado: EstadoMesa = ativo ? "trabalhando" : "plantao"
    let agoraTxt = ultima ? ultima.texto : "Ainda nada hoje"
    let extra: string | null = null
    if (fala && (!ligado || !a.noHorario)) { estado = "descansando"; agoraTxt = !ligado ? "Agente desligado" : "Fora do horário de atendimento" }
    if (fala && whatsapp === "desconectado") { estado = "travado"; agoraTxt = "WhatsApp desconectado" }
    else if (id !== "propostas" && semCredito) { estado = "travado"; agoraTxt = "IA sem crédito" }
    else if (fala && id !== "vigia" && usados >= LIMITE_HORA && a.noHorario && ligado) { estado = "travado"; agoraTxt = `Esperando a cota da hora (${usados}/${LIMITE_HORA})` }
    if (id === "vigia") {
      const fila = (cfg.respostasPendentes ?? []).length
      extra = fila ? `${fila} na fila para responder` : cfg.vigiaRodouEm ? `Ronda a cada 5 min` : null
      if (cfg.vigiaRodouEm && agora - new Date(cfg.vigiaRodouEm).getTime() < ATIVO_MIN * 60_000 && estado === "plantao") estado = "trabalhando"
      if (cfg.vigiaRodouEm && agora - new Date(cfg.vigiaRodouEm).getTime() > 30 * 60_000) { estado = "travado"; agoraTxt = "Sem ronda há mais de 30 min" }
    }
    if (id === "aprendiz") extra = `${(cfg.conhecimentoAgente ?? []).length} coisas na base de conhecimento`
    if (id === "propostas") { const ag = (cfg.propostasProntas ?? []).filter(p => p.status === "aguardando").length; extra = ag ? `${ag} esperando você aprovar` : null }
    if (id === "digital") { const ag = (cfg.pedidosDigitais ?? []).filter(p => !p.teste && p.status === "aguardando_sinal" && ehHoje(p.em)).length; extra = ag ? `${ag} esperando o sinal` : null }
    const rotulo = id === "atendente" ? "respostas" : id === "coletor" ? "perguntas" : id === "digital" || id === "propostas" ? "orçamentos" : id === "aprendiz" ? "lições" : id === "vigia" ? "ações" : "mensagens"
    return { id, ...NOMES[id], estado, agora: agoraTxt, ultimaEm: ultima?.em ?? (id === "vigia" ? cfg.vigiaRodouEm ?? null : null), hoje: feitos.length, hojeRotulo: rotulo, extra, horas }
  })

  return { mesas, feed: feed.slice(0, 60), cota: { usados, limite: LIMITE_HORA }, ligado, noHorario: a.noHorario, whatsapp, semCredito, em: new Date(agora).toISOString() }
}
