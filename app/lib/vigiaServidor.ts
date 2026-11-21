// Vigia do sistema (chamado pelo servidor a cada 5 min): o que faz a operação não parar sem ninguém perceber.
//  1. Recuperação: quem ficou sem resposta (IA fora, cota cheia) é respondido assim que der, bons negócios primeiro.
//  2. Rotina: checagem das 13h e fechamento das 18h no seu WhatsApp (a manhã já vai pelo resumo do marketing).
//  3. WhatsApp desconectado há 5+ min: aviso no celular (pelo ntfy, já que o WhatsApp está fora).
import { lerConfigLinha } from "./configAtomica"
import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { notificar, LINK_SISTEMA } from "./notificar"

type Pendente = { msgId: string; jid: string; em: string; segurou?: boolean }
type Cfg = Record<string, unknown> & {
  respostasPendentes?: Pendente[]; rotinaEnviada?: Record<string, string>; whatsappConexao?: { estado?: string; em?: string }
  whatsappForaAvisadoEm?: string; agenteAuto?: { avisoNumero?: string; horario?: { dias?: number[] } }
}
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const lerCfg = async () => ((await lerConfigLinha()).data?.data ?? {}) as Cfg

export async function vigiar(agora = new Date()): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  const cfg = await lerCfg()

  // Lições novas da base de conhecimento valem antes de responder a fila (barato: só grava quando a versão muda)
  await import("./agenteAprende").then(m => m.revisarConhecimento()).catch(() => null)
  // 0. Lead rebaixado para digital/pequeno que ficou com o status MQL antigo: sai de MQL (o que você marcou à mão fica)
  out.mqlCorrigidos = await corrigirMqlRebaixado(cfg).catch(e => String(e))
  // 1. Recuperação de quem ficou sem resposta (IA fora, cota cheia), bons negócios primeiro
  const vagas = { n: vagasDaRodada(cfg, agora) }
  const despachadas = new Set<string>()
  out.pendentes = await recuperarFila(cfg, agora, vagas, despachadas).catch(e => String(e))

  // 1b. Ninguém sem resposta: quem escreveu por último há 20+ min. O agente tenta uma vez por mensagem (se a conversa
  //     não for sua, as travas dele seguram); o que sobra vira aviso no seu WhatsApp (cada conversa no máximo a cada 3 h)
  out.fechadas = await fecharOObvio(agora).catch(e => String(e))
  out.esperando = await cuidarDeQuemEspera(cfg, agora, vagas, despachadas).catch(e => String(e))
  // 1d. E-mails para o cliente (pedido aprovado, sinal, arte, arte aprovada, enviado): cada um uma vez só
  out.emailsCliente = await import("./emailsClienteServidor").then(m => m.talvezEmailsDoCliente(cfg as never)).catch(e => String(e))
  // 1c. Orçamento prometido e não enviado: cobra você (2 h, depois a cada 4 h) até sair
  out.promessas = await cobrarPromessas(cfg, agora).catch(e => String(e))

  // 2. Rotina (dias de trabalho do agente): 13h checagem, 18h fechamento
  const sp = new Date(agora.getTime() - 3 * 3600_000)
  const hora = sp.getUTCHours(), dia = sp.toISOString().slice(0, 10), semana = sp.getUTCDay()
  const dias = cfg.agenteAuto?.horario?.dias ?? [1, 2, 3, 4, 5, 6]
  const slot = hora === 8 ? "8" : hora === 13 ? "13" : hora === 18 ? "18" : null
  if (slot && dias.includes(semana) && !cfg.rotinaEnviada?.[`${dia}-${slot}`]) {
    let marcou = false
    await mudarConfig((d: Cfg) => {
      if (d.rotinaEnviada?.[`${dia}-${slot}`]) return null
      marcou = true
      const r = Object.fromEntries(Object.entries(d.rotinaEnviada ?? {}).filter(([k]) => k >= new Date(agora.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)))
      return { rotinaEnviada: { ...r, [`${dia}-${slot}`]: agora.toISOString() } }
    })
    if (marcou) out.rotina = await mandarRotina(slot, cfg).catch(e => String(e))
  }

  // 3. WhatsApp fora há 5+ min: avisa uma vez por queda
  const con = cfg.whatsappConexao
  if (con?.estado && con.estado !== "open" && con.em && agora.getTime() - new Date(con.em).getTime() > 5 * 60_000
    && (!cfg.whatsappForaAvisadoEm || cfg.whatsappForaAvisadoEm < con.em)) {
    await mudarConfig(() => ({ whatsappForaAvisadoEm: agora.toISOString() }))
    await notificar("WhatsApp da Enyla desconectado", "Os leads não estão recebendo resposta. Abra Configurações → WhatsApp e leia o QR.", { prioridade: "alta", tags: ["rotating_light"], link: `${LINK_SISTEMA}/?aba=config` }).catch(() => null)
    out.whatsapp = "avisado"
  }
  // Auditor de dados: conferência completa no máximo uma vez por hora
  const { talvezAuditar } = await import("./auditoriaServidor")
  out.auditoria = await talvezAuditar(cfg as never).catch(e => String(e))
  // Captador de parceiros: convites aprovados por você saem aos poucos
  // Carimbo da ronda: o Escritório mostra se o vigia está de pé
  await mudarConfig(() => ({ vigiaRodouEm: agora.toISOString() })).catch(() => null)
  return out
}

// A IA fecha o que acabou (ver podeFecharSozinha); fica anotado em config.fechadasPelaIA para você ver e reabrir
async function fecharOObvio(agora: Date) {
  const { podeFecharSozinha } = await import("./esperando")
  const { data } = await supabase.from("whatsapp_conversas").select("jid, nome, etiquetas, status_lead, ultima_msg, ultima_recebida_at, ultima_enviada_at, proxima_acao, fechada_em, kanban_card_id")
    .not("jid", "like", "%@g.us").gte("ultima_at", new Date(agora.getTime() - 7 * 86_400_000).toISOString()).limit(800)
  const fechar: { jid: string; motivo: string }[] = []
  for (const c of (data ?? []) as never as import("./esperando").ConvFechar[]) {
    // Só lê a nossa última mensagem para quem pode ser fim de conversa
    const rapido = podeFecharSozinha({ ...c, penultimaNossa: "" }, agora.getTime())
    if (!rapido) continue
    let motivo: string | null = rapido
    if (rapido === "o cliente encerrou a conversa") {
      const { data: nossa } = await supabase.from("whatsapp_mensagens").select("corpo").eq("jid", c.jid).eq("from_me", true).order("criado_em", { ascending: false }).limit(1).maybeSingle()
      motivo = podeFecharSozinha({ ...c, penultimaNossa: nossa?.corpo ?? "" }, agora.getTime())
    }
    if (motivo) fechar.push({ jid: c.jid, motivo })
    if (fechar.length >= 40) break
  }
  if (!fechar.length) return 0
  const em = agora.toISOString()
  await supabase.from("whatsapp_conversas").update({ fechada_em: em }).in("jid", fechar.map(f => f.jid))
  await mudarConfig((d: Cfg & { fechadasPelaIA?: { jid: string; motivo: string; em: string }[] }) => ({ fechadasPelaIA: [...fechar.map(f => ({ ...f, em })), ...(d.fechadasPelaIA ?? [])].slice(0, 300) }))
  return fechar.length
}

async function corrigirMqlRebaixado(cfg: Cfg) {
  const { data } = await supabase.from("whatsapp_conversas").select("jid").eq("status_lead", "mql").overlaps("etiquetas", ["Lead pequeno", "Digital"]).limit(200)
  const manual = (cfg as { leadManual?: Record<string, string> }).leadManual ?? {}
  const jids = (data ?? []).map(c => c.jid as string).filter(j => !manual[j])
  if (jids.length) await supabase.from("whatsapp_conversas").update({ status_lead: null }).in("jid", jids)
  // Etapa num lugar só: etiqueta MQL/Descartado sem o status correspondente (ou o contrário) fica coerente,
  // aos poucos (sincroniza as etiquetas no WhatsApp Business)
  const [a, b, c, d] = await Promise.all([
    supabase.from("whatsapp_conversas").select("jid").contains("etiquetas", ["MQL"]).or("status_lead.is.null,status_lead.neq.mql").limit(40),
    supabase.from("whatsapp_conversas").select("jid").contains("etiquetas", ["Descartado"]).or("status_lead.is.null,status_lead.neq.descartado").limit(40),
    supabase.from("whatsapp_conversas").select("jid").eq("status_lead", "mql").not("etiquetas", "cs", "{MQL}").limit(40),
    supabase.from("whatsapp_conversas").select("jid").eq("status_lead", "descartado").not("etiquetas", "cs", "{Descartado}").limit(40),
  ])
  const incoerentes = [...new Set([a, b, c, d].flatMap(r => (r.data ?? []).map(x => x.jid as string)))].slice(0, 40)
  if (incoerentes.length) {
    const { lerConversa, aplicarStatus } = await import("./agenteAuto")
    for (const j of incoerentes) { const conv = await lerConversa(j); if (conv) await aplicarStatus(conv, conv.etiquetas ?? [], undefined).catch(() => null) }
  }
  return { rebaixados: jids.length, etiquetasAcertadas: incoerentes.length }
}

// ── Recuperação (lógica de atendimento quando a IA volta) ───────────────────
// O vigia não responde aqui dentro: a IA leva até ~20 s por lead e 5 seguidas estouravam o minuto da Vercel (nada
// era gravado e a fila nunca andava). Cada resposta vai para /responder, uma função para cada, em escada (10 s).
// Ordem: lead quente (MQL/ICP/Oportunidade/médio, pedido digital, proposta enviada), digital, quem espera há mais
// tempo. Quem já foi respondido sai. O que falhar de novo (IA fora, cota cheia) volta para a fila sozinho.
// O "já te respondo" automático não conta como resposta (ehMensagemAutomaticaDoWhatsapp).
const POR_RODADA = 3   // 8 em paralelo engasgou o banco (19/11); 3 a cada 3 min é ~60 por hora
const HORAS_FILA = 48
const vagasDaRodada = (cfg: Cfg, agora: Date) => {
  const enviosHora = ((cfg as { agenteEnviosHora?: string[] }).agenteEnviosHora ?? []).filter(t => agora.getTime() - new Date(t).getTime() < 3_600_000).length
  void enviosHora
  return POR_RODADA   // sem teto por hora para responder: o espaçamento entre mensagens é o ritmo
}

async function despachar(msgId: string, ordem: number) {
  const r = await fetch(`${LINK_SISTEMA}/api/whatsapp/webhook/responder?token=${encodeURIComponent(process.env.WHATSAPP_WEBHOOK_SECRET ?? "")}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msgId, atrasada: true, atrasoSeg: ordem * 12 }), signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  return !!r?.ok
}

// A última mensagem de verdade da conversa (sem o "já te respondo" e as automáticas do WhatsApp Business)
async function ultimaReal(jid: string) {
  const { ehMensagemAutomaticaDoWhatsapp } = await import("./agenteLeads")
  const { data } = await supabase.from("whatsapp_mensagens").select("id, from_me, corpo, tipo").eq("jid", jid).order("ts", { ascending: false }).limit(8)
  return (data ?? []).find(m => !(m.from_me && ehMensagemAutomaticaDoWhatsapp(m.corpo, m.tipo))) as { id: string; from_me: boolean } | undefined
}

async function recuperarFila(cfg: Cfg, agora: Date, vagas: { n: number }, despachadas: Set<string>) {
  const fila = (cfg.respostasPendentes ?? []).filter(p => agora.getTime() - new Date(p.em).getTime() < HORAS_FILA * 3600_000)
  if (!fila.length) return null
  const { dentroDoHorario } = await import("./agenteLeads")
  const h = (cfg.agenteAuto as { horario?: unknown } | undefined)?.horario
  if (h && !dentroDoHorario(h as never)) return { fila: fila.length, despachadas: 0, motivo: "fora do horário" }
  const { leadQuente } = await import("./agenteAuto")
  const { data: convs } = await supabase.from("whatsapp_conversas").select("jid, etiquetas, status_lead").in("jid", fila.map(p => p.jid))
  const info = new Map((convs ?? []).map(c => [c.jid as string, c as { etiquetas: string[] | null; status_lead: string | null }]))
  const { rankQualificacao } = await import("./esperando")
  const peso = (jid: string) => {
    const c = info.get(jid)
    const quente = leadQuente({ etiquetas: c?.etiquetas, status_lead: c?.status_lead, jid, pedidosDigitais: cfg.pedidosDigitais as never, propostas: cfg.propostasProntas as never })
    return Math.max(rankQualificacao(c?.etiquetas, c?.status_lead), quente ? 3 : 0)
  }
  const ordem = [...fila].sort((a, b) => peso(b.jid) - peso(a.jid) || a.em.localeCompare(b.em))
  const sair = new Set<string>()
  const vez: { p: Pendente; msgId: string }[] = []
  for (const p of ordem.slice(0, 30)) {
    if (vez.length >= vagas.n) break
    const ult = await ultimaReal(p.jid)
    if (!ult || ult.from_me) { sair.add(p.msgId); continue }   // já respondida (você ou o agente)
    sair.add(p.msgId); vez.push({ p, msgId: ult.id })           // a resposta é para a última dele
  }
  // Sai da fila antes de despachar: se falhar, quem falhou devolve (sem corrida com esta gravação)
  const fora = (p: Pendente) => sair.has(p.msgId) || agora.getTime() - new Date(p.em).getTime() >= HORAS_FILA * 3600_000
  await mudarConfig((d: Cfg) => ({ respostasPendentes: (d.respostasPendentes ?? []).filter(p => !fora(p)) }))
  let ok = 0
  for (const [i, v] of vez.entries()) {
    if (await despachar(v.msgId, i)) { ok++; despachadas.add(v.p.jid); continue }
    await mudarConfig((d: Cfg) => ({ respostasPendentes: [...(d.respostasPendentes ?? []).filter(p => p.jid !== v.p.jid), v.p] }))
  }
  vagas.n -= ok
  return { fila: fila.length, despachadas: ok, quentes: vez.filter(v => peso(v.p.jid) >= 3).length, jaRespondidas: sair.size - vez.length }
}

// ── Cobrador de promessas ───────────────────────────────────────────────────
// "Vou preparar o orçamento e te mando" e o orçamento não saiu: o lead agradece, fica quieto e fecha em outro lugar.
// A cada 15 min, nas conversas dos últimos 3 dias, acha a promessa em aberto e cobra você no WhatsApp e no celular.
async function cobrarPromessas(cfg: Cfg & { promessasEm?: string; promessasCobradas?: Record<string, string> }, agora: Date) {
  if (cfg.promessasEm && agora.getTime() - new Date(cfg.promessasEm).getTime() < 15 * 60_000) return null
  const { dentroDoHorario } = await import("./agenteLeads")
  const h = (cfg.agenteAuto as { horario?: unknown } | undefined)?.horario
  await mudarConfig(() => ({ promessasEm: agora.toISOString() }))
  if (h && !dentroDoHorario(h as never)) return "fora do horário"
  const { promessaAberta, deveCobrar } = await import("./promessas")
  const { data: convs } = await supabase.from("whatsapp_conversas").select("jid, nome, etiquetas, status_lead").not("jid", "like", "%@g.us")
    .gte("ultima_enviada_at", new Date(agora.getTime() - 3 * 86_400_000).toISOString()).order("ultima_enviada_at", { ascending: false }).limit(200)
  const cobradas = cfg.promessasCobradas ?? {}
  const cobrar: { jid: string; nome: string; horas: number; texto: string; bom: boolean; chave: string }[] = []
  const alvo = (convs ?? []).filter(c => !((c.etiquetas ?? []) as string[]).some(e => /fornecedor|descartado/i.test(e)) && !["descartado", "perdido"].includes(c.status_lead ?? ""))
  // Em lotes paralelos (uma a uma, 200 conversas estouravam o minuto da Vercel)
  const msgs = new Map<string, unknown[]>()
  for (let i = 0; i < alvo.length; i += 25) {
    await Promise.all(alvo.slice(i, i + 25).map(async c => {
      const { data } = await supabase.from("whatsapp_mensagens").select("id, from_me, ts, corpo, tipo").eq("jid", c.jid).order("ts", { ascending: false }).limit(25)
      msgs.set(c.jid, data ?? [])
    }))
  }
  for (const c of alvo) {
    const et = (c.etiquetas ?? []) as string[]
    const p = promessaAberta((msgs.get(c.jid) ?? []) as never, agora.getTime())
    if (!p) continue
    const chave = `${c.jid}|${p.msgId}`
    if (!deveCobrar(p, cobradas[chave], agora.getTime())) continue
    const bom = c.status_lead === "mql" || et.some(e => /^(MQL|ICP|Oportunidade|Lead médio)$/.test(e))
    cobrar.push({ jid: c.jid, nome: (c.nome as string | null) ?? c.jid.split("@")[0], horas: p.horas, texto: p.texto, bom, chave })
  }
  if (!cobrar.length) return { cobradas: 0 }
  cobrar.sort((a, b) => Number(b.bom) - Number(a.bom) || b.horas - a.horas)
  // Vira item da caixa de entrada (Painel e resumo das 8h/13h/18h), não mensagem solta
  await mudarConfig(() => ({ promessasAbertas: cobrar.map(x => ({ jid: x.jid, nome: x.nome, horas: x.horas, texto: x.texto.replace(/\s+/g, " ").slice(0, 140), bom: x.bom, chave: x.chave })) }))
  const em = agora.toISOString()
  await mudarConfig((d: typeof cfg) => {
    const m = { ...(d.promessasCobradas ?? {}) }
    for (const x of cobrar) m[x.chave] = em
    for (const [k, v] of Object.entries(m)) if (agora.getTime() - new Date(v).getTime() > 4 * 86_400_000) delete m[k]
    return { promessasCobradas: m }
  })
  return { cobradas: cobrar.length }
}

async function cuidarDeQuemEspera(cfg: Cfg & { vigiaTentou?: string[]; esperaAvisada?: Record<string, string>; esperaAvisoEm?: string; agenteAuto?: { horario?: { dias?: number[]; inicio?: string; fim?: string }; avisoNumero?: string } }, agora: Date, vagas: { n: number }, despachadas: Set<string>) {
  const { dentroDoHorario } = await import("./agenteLeads")
  if (cfg.agenteAuto?.horario && !dentroDoHorario(cfg.agenteAuto.horario as never)) return "fora do horário"
  const { quemEspera, tempoEspera, paraOFelipe } = await import("./esperando")
  const { data } = await supabase.from("whatsapp_conversas").select("jid, nome, etiquetas, status_lead, ultima_msg, ultima_recebida_at, ultima_enviada_at, proxima_acao, fechada_em")
    .not("jid", "like", "%@g.us").gte("ultima_recebida_at", new Date(agora.getTime() - 7 * 86_400_000).toISOString()).limit(1000)
  // O "já te respondo" automático não é resposta: a conversa segue esperando (com o peso dela)
  const { ehSeguraSemIA } = await import("./agenteLeads")
  const convs = (data ?? []).map(c => ehSeguraSemIA(c.ultima_msg as string | null) ? { ...c, ultima_enviada_at: null, ultima_msg: "" } : c)
  // Lead quente primeiro (bom negócio, digital com pedido), depois quem espera há mais tempo
  const lista = quemEspera(convs as never, agora.getTime()).sort((a, b) => (b.peso ?? 0) - (a.peso ?? 0) || b.minutos - a.minutos)
  if (!lista.length) return "ninguém"
  // O agente tenta uma vez por mensagem, nas vagas que a fila de recuperação deixou (cada uma numa função própria)
  // vigiaTentouV3 (19/11, "ninguém sem resposta"): cada mensagem esperando ganha uma tentativa com as regras novas,
  // em que só segura o que nunca pode sair (preço fora da tabela, fala de robô, não é lead)
  const tentou = new Set((cfg as { vigiaTentouV3?: string[] }).vigiaTentouV3 ?? [])
  const novasTentativas: string[] = []
  const respondidas = despachadas
  let ordem = despachadas.size
  for (const e of lista) {
    if (vagas.n <= 0) break
    if (despachadas.has(e.jid)) continue
    const ult = await ultimaReal(e.jid)
    if (!ult || ult.from_me || tentou.has(ult.id)) continue
    novasTentativas.push(ult.id)
    if (await despachar(ult.id, ordem)) { despachadas.add(e.jid); vagas.n--; ordem++ }
  }
  if (novasTentativas.length) await mudarConfig((d: typeof cfg & { vigiaTentouV3?: string[] }) => ({ vigiaTentouV3: [...novasTentativas, ...(d.vigiaTentouV3 ?? [])].slice(0, 600) }))
  // O resto é seu: aviso no WhatsApp (no máximo uma mensagem a cada 30 min; cada conversa a cada 3 h)
  const avisadas = cfg.esperaAvisada ?? {}
  const paraAvisar = lista.filter(e => !respondidas.has(e.jid) && (!avisadas[e.jid] || agora.getTime() - new Date(avisadas[e.jid]).getTime() > 3 * 3600_000) && paraOFelipe(e))   // só bom negócio com o checklist completo vira aviso seu
  if (!paraAvisar.length || (cfg.esperaAvisoEm && agora.getTime() - new Date(cfg.esperaAvisoEm).getTime() < 30 * 60_000)) return { esperando: lista.length, despachadas: respondidas.size }
  // (o aviso no WhatsApp virou item da caixa de entrada e sai no resumo das 8h, 13h e 18h)
  const em = agora.toISOString()
  await mudarConfig((d: typeof cfg) => {
    const m = { ...(d.esperaAvisada ?? {}) }
    for (const e of paraAvisar) m[e.jid] = em
    for (const [k, v] of Object.entries(m)) if (agora.getTime() - new Date(v).getTime() > 4 * 86_400_000) delete m[k]
    return { esperaAvisada: m, esperaAvisoEm: em }
  })
  return { esperando: lista.length, despachadas: respondidas.size, avisadas: paraAvisar.length }
}

// Fechamento das 18h: como estão os dados (do auditor), em uma linha
async function linhaDosDados() {
  const a = (await lerCfg() as { auditoriaDados?: { confianca: number; graves: number; total: number } }).auditoriaDados
  if (!a) return ""
  const pct = a.confianca.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
  return `\n📊 *Dados:* ${pct}% conferem${a.graves ? ` · ${a.graves} problema${a.graves > 1 ? "s" : ""} grave${a.graves > 1 ? "s" : ""}` : ""}${a.total ? ` · ${a.total} para acertar` : ""} (${LINK_SISTEMA}/?aba=dados)`
}

// Texto da checagem/fechamento: o "Para resolver agora" e o que o Hoje pede, em poucas linhas
// Resumo da caixa de entrada (8h, 13h e 18h): o mesmo que está no Painel, no lugar dos avisos soltos
export async function textoDaRotina(slot: "8" | "13" | "18"): Promise<string> {
  const { montarCaixaServidor } = await import("./caixaServidor")
  const { textoResumo } = await import("./caixaEntrada")
  const itens = await montarCaixaServidor()
  const texto = textoResumo(itens, slot, `${LINK_SISTEMA}/?aba=painel`)
  return slot === "18" ? `${texto}${await linhaDosDados()}` : texto
}

async function mandarRotina(slot: "8" | "13" | "18", cfg: Cfg) {
  const { evo } = await import("./evolution")
  const { seuNumero } = await import("./agenteAuto")
  const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
  if (!destino) return "sem número"
  const text = await textoDaRotina(slot)
  await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text }) })
  return "enviada"
}
